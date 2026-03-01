import { NextRequest, NextResponse } from 'next/server'
import {
  DouyinUserParseRequest,
  DouyinVideoItem,
  ParsedVideoInfo,
  MediaType
} from '@/types'
import { extractFirstUrlFromText } from '@/lib/url/extract'

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const USER_PARSE_TIMEOUT_MS = 30_000
const MAX_LIMIT = 5000

type UserParseResult = {
  videos: ParsedVideoInfo[]
  totalCount: number
  userInfo?: {
    nickname?: string
    avatar?: string
  }
}

type UserUpstream = {
  name: string
  target: string
  adapt: (payload: any) => UserParseResult
}

const USER_UPSTREAMS: UserUpstream[] = [
  {
    name: 'mmp_dyhome',
    target: 'https://api.mmp.cc/api/dyhome?url={url}',
    adapt: adaptMmpDyhomeResponse
  },
  {
    name: 'cenguigui_user',
    target: 'https://api.cenguigui.cn/api/douyin/user.php?url={url}',
    adapt: adaptCenguiguiResponse
  }
]

export async function POST(request: NextRequest) {
  try {
    const body: DouyinUserParseRequest = await request.json().catch(() => ({} as DouyinUserParseRequest))
    const requestedLimit = typeof body.limit === 'number' ? body.limit : Number(body.limit ?? 20)
    let limit = Number.isFinite(requestedLimit) ? Math.trunc(requestedLimit) : 20
    if (limit < 0) {
      limit = 20
    }
    limit = Math.max(0, Math.min(MAX_LIMIT, limit))

    const input = extractFirstUrlFromText(String(body.url || '')) || String(body.url || '').trim()
    if (!input) {
      return NextResponse.json(
        { success: false, error: '缺少用户主页URL参数' },
        { status: 400 }
      )
    }

    const resolvedUrl = await resolveShareUrlIfNeeded(input, USER_PARSE_TIMEOUT_MS)
    const normalizedUrl = resolvedUrl || input

    const failures: string[] = []
    for (const upstream of USER_UPSTREAMS) {
      try {
        const parsed = await callUserUpstream(upstream, normalizedUrl, USER_PARSE_TIMEOUT_MS)
        const limitedVideos = limit === 0 ? parsed.videos : parsed.videos.slice(0, limit)

        if (limitedVideos.length === 0) {
          throw new Error('未找到该用户的视频内容')
        }

        return NextResponse.json({
          success: true,
          data: {
            videos: limitedVideos,
            totalCount: parsed.totalCount,
            limitApplied: limit,
            actualCount: limitedVideos.length,
            maxLimit: MAX_LIMIT,
            userInfo: parsed.userInfo || {}
          },
          rawData: {
            source: upstream.name,
            inputUrl: input,
            resolvedUrl: normalizedUrl
          }
        })
      } catch (error) {
        failures.push(`${upstream.name}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: failures[0] || '抖音用户解析失败',
        rawData: {
          inputUrl: input,
          resolvedUrl: normalizedUrl,
          failures: failures.slice(0, 3)
        }
      },
      { status: 502 }
    )
  } catch (error) {
    console.error('[douyin/user] 解析失败:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '服务器错误，请稍后重试' },
      { status: 500 }
    )
  }
}

async function resolveShareUrlIfNeeded(url: string, timeoutMs: number): Promise<string> {
  if (!/^https?:\/\/v\.douyin\.com\//i.test(String(url || '').trim())) {
    return url
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': DEFAULT_USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      signal: controller.signal
    })
    return response.url || url
  } catch {
    return url
  } finally {
    clearTimeout(timeout)
  }
}

async function callUserUpstream(upstream: UserUpstream, url: string, timeoutMs: number): Promise<UserParseResult> {
  const target = buildGetUrl(upstream.target, url)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(target, {
      method: 'GET',
      headers: {
        'User-Agent': DEFAULT_USER_AGENT,
        'Accept': 'application/json,text/plain,*/*'
      },
      signal: controller.signal
    })

    const text = await response.text().catch(() => '')
    const parsed = safeParseJsonBody(text)

    if (!response.ok) {
      const message = extractErrorMessage(parsed) || `${response.status} ${response.statusText}`.trim()
      throw new Error(message || '上游请求失败')
    }

    if (parsed == null || typeof parsed !== 'object') {
      throw new Error('上游返回非JSON响应')
    }

    return upstream.adapt(parsed)
  } finally {
    clearTimeout(timeout)
  }
}

function buildGetUrl(target: string, url: string): string {
  if (target.includes('{url}')) {
    return target.replace('{url}', encodeURIComponent(url))
  }

  const u = new URL(target)
  if (!u.searchParams.has('url')) {
    u.searchParams.set('url', url)
  }
  return u.toString()
}

function adaptMmpDyhomeResponse(payload: any): UserParseResult {
  if (payload?.success === false) {
    throw new Error(extractErrorMessage(payload) || 'MMP接口返回失败状态')
  }

  const videoUrls = Array.isArray(payload?.video_urls)
    ? payload.video_urls.filter((item: unknown) =>
      typeof item === 'string' &&
      /^https?:\/\//i.test(item) &&
      !isLikelyAudioOnlyUrl(item)
    )
    : []

  if (videoUrls.length === 0) {
    throw new Error(extractErrorMessage(payload) || 'MMP接口未返回有效视频链接')
  }

  const nickname = pickFirstNonEmpty([
    payload?.nickname,
    payload?.owner_handle,
    payload?.request_params?.resolved_sec_user_id,
    '抖音用户'
  ])

  const avatar = pickFirstNonEmpty([
    payload?.avatar,
    payload?.author?.avatar,
    payload?.user?.avatar
  ])

  const videos = videoUrls.map((url: string, index: number): ParsedVideoInfo => {
    const videoId = extractVideoId(url)
    return {
      title: `${nickname} 的视频 #${index + 1}${videoId ? ` (${videoId})` : ''}`,
      author: nickname,
      avatar,
      description: `来自 ${nickname} 的抖音用户主页视频`,
      mediaType: MediaType.VIDEO,
      url,
      format: 'mp4'
    }
  })

  const totalCount = Number(payload?.video_count)
  return {
    videos,
    totalCount: Number.isFinite(totalCount) && totalCount > 0 ? Math.floor(totalCount) : videos.length,
    userInfo: {
      nickname,
      avatar
    }
  }
}

function adaptCenguiguiResponse(payload: any): UserParseResult {
  if (payload?.code !== 200 || !Array.isArray(payload?.data)) {
    throw new Error(extractErrorMessage(payload) || payload?.msg || '曾贵贵接口返回异常')
  }

  const rawItems = payload.data as DouyinVideoItem[]
  const videos = rawItems
    .map((item): ParsedVideoInfo | null => {
      const mediaUrl = pickFirstNonEmpty([
        item?.video_info?.download,
        item?.video_info?.url
      ])
      if (!/^https?:\/\//i.test(mediaUrl)) {
        return null
      }
      return {
        title: item.title || `${item.author || item.nickname || '抖音用户'}的视频`,
        author: item.author || item.nickname,
        avatar: item.avatar,
        signature: item.nickname,
        time: item.time,
        description: item.title,
        mediaType: MediaType.VIDEO,
        viewCount: item.play?.toString() || '0',
        uploadDate: item.time,
        url: mediaUrl,
        format: 'mp4',
        thumbnail: item.pic
      }
    })
    .filter((item): item is ParsedVideoInfo => Boolean(item))

  if (videos.length === 0) {
    throw new Error('曾贵贵接口未返回有效视频链接')
  }

  return {
    videos,
    totalCount: rawItems.length,
    userInfo: {
      nickname: rawItems[0]?.nickname || rawItems[0]?.author,
      avatar: rawItems[0]?.avatar
    }
  }
}

function safeParseJsonBody(body: string): any | null {
  if (!body || !body.trim()) {
    return null
  }

  try {
    return JSON.parse(body)
  } catch {
  }

  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start !== -1 && end !== -1 && end > start) {
    try {
      return JSON.parse(body.substring(start, end + 1))
    } catch {
    }
  }

  return null
}

function extractErrorMessage(payload: any): string {
  if (!payload || typeof payload !== 'object') {
    return ''
  }

  const keys = ['error', 'message', 'msg', 'detail', 'reason']
  for (const key of keys) {
    const value = payload?.[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return ''
}

function pickFirstNonEmpty(values: Array<unknown>): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return ''
}

function extractVideoId(url: string): string {
  if (!url) return ''
  try {
    const u = new URL(url)
    const videoId = u.searchParams.get('video_id')
    if (!videoId) return ''
    const decoded = decodeURIComponent(videoId)
    if (decoded.length <= 24) return decoded
    return decoded.slice(0, 24)
  } catch {
    return ''
  }
}

function isLikelyAudioOnlyUrl(url: string): boolean {
  if (!url) return false
  try {
    const u = new URL(url)
    const videoId = decodeURIComponent(u.searchParams.get('video_id') || '')
    if (!videoId) return false
    return /\.mp3(?:\?|#|$)/i.test(videoId)
  } catch {
    return false
  }
}
