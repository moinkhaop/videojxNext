import { NextRequest, NextResponse } from 'next/server'
import { MediaType, ParsedVideoInfo, VideoParseResponse } from '@/types'

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

// Upstream format:
// - "name|GET https://example.com/api?url={url}"
// - "POST https://example.com/api" (body: { url, videoUrl })
//
// NOTE: These are third-party / public nodes. Stability may change with platform anti-crawling.
const DEFAULT_UPSTREAMS = [
  'jxcxin|GET https://apis.jxcxin.cn/api/douyin?url={url}',
  'douyin_wtf|GET https://api.douyin.wtf/api/hybrid/video_data?url={url}',
  'yujn|GET https://api.yujn.cn/api/dy_jx.php?msg={url}',
  'xzdx|GET https://xzdx.top/api/duan?url={url}',
  'oick|GET https://api.oick.cn/douyin/?url={url}',
  'pearktrue|GET https://api.pearktrue.cn/api/video/douyin/?url={url}',
]

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const input = pickFirstNonEmpty([
    searchParams.get('url'),
    searchParams.get('videoUrl'),
    searchParams.get('text'),
    searchParams.get('content')
  ])

  if (!input) {
    return NextResponse.json({ success: false, error: '缺少 url 参数' }, { status: 400 })
  }

  return await handleParse(input)
}

export async function POST(request: NextRequest) {
  let body: any = null
  try {
    body = await request.json()
  } catch {
    body = null
  }

  const input = pickFirstNonEmpty([
    body?.url,
    body?.videoUrl,
    body?.text,
    body?.content
  ])

  if (!input) {
    return NextResponse.json({ success: false, error: '缺少 url 或 videoUrl 参数' }, { status: 400 })
  }

  return await handleParse(String(input))
}

async function handleParse(input: string) {
  const extractedUrl = extractFirstUrlFromText(input)
  if (!extractedUrl) {
    return NextResponse.json({ success: false, error: '未识别到有效链接' }, { status: 400 })
  }

  const initialNormalizedUrl = normalizeDouyinInputUrl(extractedUrl)
  const timeoutMs = getTimeoutMs()
  const resolvedUrl = await resolveShareUrlIfNeeded(initialNormalizedUrl, timeoutMs)
  const normalizedUrl = normalizeDouyinInputUrl(resolvedUrl)
  const upstreams = getUpstreams()

  const failures: string[] = []
  for (const upstream of upstreams) {
    try {
      const raw = await callUpstream(upstream, normalizedUrl, timeoutMs)
      const parsedInfo = adaptToParsedVideoInfo(raw)
      const result: VideoParseResponse = {
        success: true,
        data: parsedInfo,
        rawData: {
          source: upstream.name,
          extractedUrl,
          resolvedUrl,
          normalizedUrl,
          upstream: raw
        }
      }
      return NextResponse.json(result)
    } catch (error) {
      failures.push(`${upstream.name}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return NextResponse.json(
    {
      success: false,
      error: failures.length ? failures[0] : '解析失败',
      rawData: { failures: failures.slice(0, 3), extractedUrl, resolvedUrl, normalizedUrl }
    },
    { status: 502 }
  )
}

type Upstream = {
  name: string
  method: 'GET' | 'POST'
  target: string
}

function getTimeoutMs(): number {
  const value = Number(process.env.DOUYIN_PARSER_TIMEOUT_MS)
  if (!Number.isFinite(value)) {
    return 10000
  }
  return Math.min(Math.max(Math.trunc(value), 3000), 30000)
}

function getUpstreams(): Upstream[] {
  const rawConfig = typeof process.env.DOUYIN_PARSER_UPSTREAMS === 'string'
    ? process.env.DOUYIN_PARSER_UPSTREAMS.trim()
    : ''

  let entries: string[] = []
  if (!rawConfig) {
    entries = [...DEFAULT_UPSTREAMS]
  } else if (rawConfig.startsWith('[')) {
    try {
      const parsed = JSON.parse(rawConfig)
      if (Array.isArray(parsed)) {
        entries = parsed.filter(item => typeof item === 'string')
      }
    } catch {
      entries = []
    }
  } else {
    entries = rawConfig
      .split(/[\n,]/)
      .map(item => item.trim())
      .filter(Boolean)
  }

  return entries
    .map((entry, index) => parseUpstreamEntry(entry, index))
    .filter((item): item is Upstream => Boolean(item))
}

function parseUpstreamEntry(entry: string, index: number): Upstream | null {
  let name = `upstream_${index + 1}`
  let target = entry

  if (entry.includes('|')) {
    const splitIndex = entry.indexOf('|')
    name = entry.slice(0, splitIndex).trim() || name
    target = entry.slice(splitIndex + 1).trim()
  }

  let method: 'GET' | 'POST' = 'GET'
  const methodMatch = target.match(/^(GET|POST)\s+(.+)$/i)
  if (methodMatch) {
    method = methodMatch[1].toUpperCase() as 'GET' | 'POST'
    target = methodMatch[2].trim()
  }

  try {
    new URL(target.replace('{url}', encodeURIComponent('https://www.douyin.com/video/1')))
  } catch {
    return null
  }

  return { name, method, target }
}

async function callUpstream(upstream: Upstream, url: string, timeoutMs: number): Promise<any> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    if (upstream.method === 'POST') {
      const response = await fetch(upstream.target, {
        method: 'POST',
        headers: {
          'User-Agent': DEFAULT_USER_AGENT,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ url, videoUrl: url }),
        signal: controller.signal
      })
      return await unwrapUpstreamResponse(response)
    }

    const finalUrl = buildGetUrl(upstream.target, url)
    const response = await fetch(finalUrl, {
      method: 'GET',
      headers: {
        'User-Agent': DEFAULT_USER_AGENT,
        'Accept': 'application/json,text/plain,*/*'
      },
      signal: controller.signal
    })
    return await unwrapUpstreamResponse(response)
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

async function unwrapUpstreamResponse(response: Response): Promise<any> {
  const text = await response.text().catch(() => '')
  if (!response.ok) {
    const message = extractErrorMessage(text) || `${response.status} ${response.statusText}`.trim()
    throw new Error(message || '上游解析失败')
  }

  const parsed = safeParseJsonBody(text)
  if (parsed == null) {
    throw new Error('上游返回非JSON响应')
  }
  return parsed
}

function adaptToParsedVideoInfo(rawResponse: any): ParsedVideoInfo {
  // Pass-through if already standard.
  if (rawResponse?.success === true && rawResponse?.data && typeof rawResponse.data === 'object') {
    const data = rawResponse.data
    const hasVideo = typeof data.url === 'string' && data.url.startsWith('http')
    const hasImages = Array.isArray(data.images) && data.images.length > 0
    if (typeof data.mediaType === 'string' && (hasVideo || hasImages)) {
      return data as ParsedVideoInfo
    }
  }

  // Normalize common upstream schemas into a loose dataSource object.
  // Many upstreams use: { code, msg, data }, { success, data }, { data }, { result }...
  if (rawResponse?.success === false) {
    throw new Error(extractErrorMessageFromObject(rawResponse) || '上游返回失败状态')
  }

  if (typeof rawResponse?.code === 'number' && ![0, 200].includes(rawResponse.code)) {
    throw new Error(extractErrorMessageFromObject(rawResponse) || `上游错误码: ${rawResponse.code}`)
  }

  let dataSource: any = rawResponse
  if (rawResponse?.data && typeof rawResponse.data === 'object') {
    dataSource = rawResponse.data
  } else if (rawResponse?.result && typeof rawResponse.result === 'object') {
    dataSource = rawResponse.result
  }

  if (dataSource?.aweme_detail && typeof dataSource.aweme_detail === 'object') {
    dataSource = dataSource.aweme_detail
  }

  if (dataSource?.item_info?.item_struct && typeof dataSource.item_info.item_struct === 'object') {
    dataSource = dataSource.item_info.item_struct
  }

  const images = collectImageUrls(dataSource)
  const videoUrl = detectVideoUrl(dataSource)

  if (!videoUrl && images.length === 0) {
    const error = extractErrorMessageFromObject(rawResponse)
    throw new Error(error || '响应中未找到视频或图集链接')
  }

  const title = pickFirstNonEmpty([
    dataSource?.title,
    dataSource?.desc,
    dataSource?.name,
    dataSource?.video_title,
    '未命名作品'
  ])

  const author = pickAuthor(dataSource)
  const description = pickFirstNonEmpty([
    dataSource?.description,
    dataSource?.desc,
    dataSource?.content,
    title
  ])

  const thumbnail = pickFirstNonEmpty([
    dataSource?.thumbnail,
    dataSource?.cover,
    getByPath(dataSource, 'video.cover.url_list.0'),
    getByPath(dataSource, 'video.dynamic_cover.url_list.0'),
    images[0]
  ])

  if (videoUrl) {
    const duration = toDurationSeconds(pickFirstNonEmpty([
      dataSource?.duration,
      getByPath(dataSource, 'video.duration'),
      getByPath(dataSource, 'video_info.duration')
    ]))

    return {
      title,
      author,
      description,
      mediaType: MediaType.VIDEO,
      url: videoUrl,
      duration,
      format: inferFormat(videoUrl),
      thumbnail,
      avatar: pickFirstNonEmpty([
        dataSource?.avatar,
        dataSource?.author_avatar,
        dataSource?.user?.avatar,
        dataSource?.author?.avatar,
      ]),
      signature: pickFirstNonEmpty([
        dataSource?.signature,
        dataSource?.user?.signature,
        dataSource?.author?.signature,
      ]),
      time: dataSource?.time ?? dataSource?.create_time ?? dataSource?.createTime,
      cover: pickFirstNonEmpty([dataSource?.cover, thumbnail]),
    }
  }

  return {
    title,
    author,
    description,
    mediaType: MediaType.IMAGE_ALBUM,
    images: images.map((url, index) => ({
      url,
      filename: `image_${(index + 1).toString().padStart(3, '0')}.jpg`
    })),
    imageCount: images.length,
    thumbnail,
    avatar: pickFirstNonEmpty([
      dataSource?.avatar,
      dataSource?.author_avatar,
      dataSource?.user?.avatar,
      dataSource?.author?.avatar,
    ]),
    signature: pickFirstNonEmpty([
      dataSource?.signature,
      dataSource?.user?.signature,
      dataSource?.author?.signature,
    ]),
    time: dataSource?.time ?? dataSource?.create_time ?? dataSource?.createTime,
    cover: pickFirstNonEmpty([dataSource?.cover, thumbnail]),
  }
}

function extractFirstUrlFromText(text: string): string {
  const source = String(text || '')
  const match = source.match(/https?:\/\/[^\s]+/i)
  return match ? match[0].trim() : ''
}

function normalizeDouyinInputUrl(input: string): string {
  const url = String(input || '').trim()
  if (!url) return ''

  if (/^[0-9]{10,25}$/.test(url)) {
    return `https://www.iesdouyin.com/share/video/${url}`
  }

  if (!/douyin\.com|iesdouyin\.com|v\.douyin\.com/i.test(url)) {
    return url
  }

  const awemeMatch = url.match(/\/video\/([0-9]{10,25})/i)
  if (awemeMatch && awemeMatch[1]) {
    return `https://www.iesdouyin.com/share/video/${awemeMatch[1]}`
  }

  return url
}

function shouldResolveShareUrl(url: string): boolean {
  const source = String(url || '').trim()
  if (!source) return false
  if (!/^https?:\/\//i.test(source)) return false
  return /^https?:\/\/v\.douyin\.com\//i.test(source)
}

async function resolveShareUrlIfNeeded(url: string, timeoutMs: number): Promise<string> {
  if (!shouldResolveShareUrl(url)) {
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

function extractErrorMessage(text: string): string {
  const parsed = safeParseJsonBody(text)
  return extractErrorMessageFromObject(parsed) || sanitizeTextSnippet(text)
}

function extractErrorMessageFromObject(payload: any): string {
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

function collectImageUrls(dataSource: any): string[] {
  const arrayCandidates: any[] = [
    dataSource?.images,
    dataSource?.pics,
    dataSource?.pic_list,
    dataSource?.image_list,
    dataSource?.photo_list,
    dataSource?.photos,
    Array.isArray(dataSource?.url) ? dataSource.url : null,
  ].filter(Array.isArray)

  const results: string[] = []
  for (const list of arrayCandidates) {
    for (const item of list) {
      if (typeof item === 'string' && /^https?:\/\//i.test(item)) {
        results.push(item)
      } else if (item && typeof item === 'object') {
        const url = pickFirstHttpUrl([
          item.url,
          item.src,
          item.image_url,
          item.pic_url,
          item.photo_url,
          item.href
        ])
        if (url) {
          results.push(url)
        }
      }
    }
  }

  return [...new Set(results)]
}

function detectVideoUrl(dataSource: any): string {
  const directCandidates = [
    dataSource?.video_url,
    dataSource?.videoUrl,
    dataSource?.play_url,
    dataSource?.download_url,
    dataSource?.downloadUrl,
    dataSource?.playAddr,
    getByPath(dataSource, 'video.play_addr.url_list.0'),
    getByPath(dataSource, 'video.play_addr_h264.url_list.0'),
    getByPath(dataSource, 'video.bit_rate.0.play_addr.url_list.0'),
    getByPath(dataSource, 'video_info.url'),
    dataSource?.url,
  ]

  const firstDirect = pickFirstHttpUrl(directCandidates)
  if (firstDirect) {
    return firstDirect
  }

  return deepFindHttpUrl(dataSource)
}

function pickAuthor(dataSource: any): string {
  return pickFirstNonEmpty([
    dataSource?.author,
    dataSource?.nickname,
    dataSource?.user_name,
    dataSource?.author_name,
    dataSource?.user?.nickname,
    dataSource?.author?.nickname,
    dataSource?.author?.name,
  ])
}

function pickFirstHttpUrl(values: any[]): string {
  for (const value of values) {
    if (typeof value === 'string' && /^https?:\/\//i.test(value)) {
      return value
    }
  }
  return ''
}

function deepFindHttpUrl(node: any, depth = 0, visited = new Set<any>()): string {
  if (!node || depth > 5 || visited.has(node)) {
    return ''
  }

  if (typeof node === 'string') {
    return /^https?:\/\//i.test(node) ? node : ''
  }

  if (typeof node !== 'object') {
    return ''
  }

  visited.add(node)

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = deepFindHttpUrl(item, depth + 1, visited)
      if (found) return found
    }
    return ''
  }

  const keys = Object.keys(node)
  const preferredKeys = keys.filter(key => /(video|play|download|addr|mp4|url)/i.test(key))
  const otherKeys = keys.filter(key => !preferredKeys.includes(key))

  for (const key of [...preferredKeys, ...otherKeys]) {
    const found = deepFindHttpUrl((node as any)[key], depth + 1, visited)
    if (found) return found
  }

  return ''
}

function getByPath(source: any, path: string): any {
  if (!source || typeof source !== 'object') {
    return undefined
  }

  const segments = path.split('.')
  let current: any = source

  for (const segment of segments) {
    if (current == null) {
      return undefined
    }

    const index = Number(segment)
    if (Number.isInteger(index) && Array.isArray(current)) {
      current = current[index]
      continue
    }

    if (typeof current === 'object' && segment in current) {
      current = current[segment]
      continue
    }

    return undefined
  }

  return current
}

function toDurationSeconds(value: string): number | undefined {
  if (!value) return undefined
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return undefined
  // Some APIs use ms (Douyin) while others use seconds. Heuristic: large => ms.
  return num > 10_000 ? Math.round(num / 1000) : Math.round(num)
}

function inferFormat(url: string): string | undefined {
  const lower = String(url || '').toLowerCase()
  const match = lower.match(/\.([a-z0-9]{2,5})(?:\?|#|$)/)
  if (!match) return undefined
  return match[1]
}

function sanitizeTextSnippet(text: string, maxLength = 200): string {
  if (!text) return ''
  const condensed = text.replace(/\s+/g, ' ').trim()
  if (!condensed) return ''
  return condensed.length > maxLength ? `${condensed.substring(0, maxLength)}…` : condensed
}

function pickFirstNonEmpty(values: Array<unknown>): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return ''
}
