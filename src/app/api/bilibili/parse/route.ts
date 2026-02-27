import { NextRequest, NextResponse } from 'next/server'
import { MediaType, ParsedVideoInfo, VideoParseResponse } from '@/types'

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

// Upstream format:
// - "name|GET https://example.com/api?url={url}"
// - "name|GET https://example.com/api?bv={bvid}"
// - "POST https://example.com/api" (body: { url, videoUrl })
//
// NOTE: These are third-party / public nodes. Stability may change with platform anti-crawling.
const DEFAULT_UPSTREAMS = [
  'mir6|GET https://api.mir6.com/api/bzjiexi?url={url}&type=json',
  'injahow|GET https://api.injahow.cn/bparse/?bv={bvid}',
  'xzdx|GET https://xzdx.top/api/duan?url={url}',
  'douyin_wtf|GET https://api.douyin.wtf/api/hybrid/video_data?url={url}',
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
  const extractedUrlOrId = extractFirstUrlFromText(input) || String(input || '').trim()
  if (!extractedUrlOrId) {
    return NextResponse.json({ success: false, error: '未识别到有效链接' }, { status: 400 })
  }

  const normalizedInput = normalizeBilibiliInput(extractedUrlOrId)
  const timeoutMs = getTimeoutMs()
  const resolvedUrl = await resolveShareUrlIfNeeded(normalizedInput.url || extractedUrlOrId, timeoutMs)
  const normalizedAfterResolve = normalizeBilibiliInput(resolvedUrl)
  const upstreams = getUpstreams()

  const failures: string[] = []
  for (const upstream of upstreams) {
    try {
      const raw = await callUpstream(upstream, normalizedAfterResolve, timeoutMs)
      const parsedInfo = adaptToParsedVideoInfo(raw, normalizedAfterResolve)
      const result: VideoParseResponse = {
        success: true,
        data: parsedInfo,
        rawData: {
          source: upstream.name,
          extracted: extractedUrlOrId,
          resolvedUrl,
          normalized: normalizedAfterResolve,
          upstream: raw
        }
      }
      return NextResponse.json(result)
    } catch (error) {
      failures.push(`${upstream.name}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // Fallback: Try official Bilibili public APIs (view + playurl).
  try {
    const official = await parseViaBilibiliOfficial(normalizedAfterResolve, timeoutMs)
    return NextResponse.json({
      success: true,
      data: official,
      rawData: {
        source: 'bilibili_official',
        extracted: extractedUrlOrId,
        resolvedUrl,
        normalized: normalizedAfterResolve,
      }
    } satisfies VideoParseResponse)
  } catch (error) {
    failures.push(`bilibili_official: ${error instanceof Error ? error.message : String(error)}`)
  }

  return NextResponse.json(
    {
      success: false,
      error: failures.length ? failures[0] : '解析失败',
      rawData: { failures: failures.slice(0, 3), extracted: extractedUrlOrId, resolvedUrl, normalized: normalizedAfterResolve }
    },
    { status: 502 }
  )
}

type Upstream = {
  name: string
  method: 'GET' | 'POST'
  target: string
}

type NormalizedBilibiliInput = {
  url: string
  bvid: string
  aid: string
}

function getTimeoutMs(): number {
  const value = Number(process.env.BILIBILI_PARSER_TIMEOUT_MS)
  if (!Number.isFinite(value)) {
    return 10000
  }
  return Math.min(Math.max(Math.trunc(value), 3000), 30000)
}

function getUpstreams(): Upstream[] {
  const rawConfig = typeof process.env.BILIBILI_PARSER_UPSTREAMS === 'string'
    ? process.env.BILIBILI_PARSER_UPSTREAMS.trim()
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
    new URL(target
      .replace('{url}', encodeURIComponent('https://www.bilibili.com/video/BV1xx411c7mD/'))
      .replace('{bvid}', 'BV1xx411c7mD')
      .replace('{aid}', '1')
    )
  } catch {
    return null
  }

  return { name, method, target }
}

async function callUpstream(upstream: Upstream, normalized: NormalizedBilibiliInput, timeoutMs: number): Promise<any> {
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
        body: JSON.stringify({ url: normalized.url, videoUrl: normalized.url }),
        signal: controller.signal
      })
      return await unwrapUpstreamResponse(response)
    }

    const finalUrl = buildGetUrl(upstream.target, normalized)
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

function buildGetUrl(target: string, normalized: NormalizedBilibiliInput): string {
  const hasTemplate = target.includes('{url}') || target.includes('{bvid}') || target.includes('{aid}')
  if (hasTemplate) {
    return target
      .replaceAll('{url}', encodeURIComponent(normalized.url))
      .replaceAll('{bvid}', encodeURIComponent(normalized.bvid || ''))
      .replaceAll('{aid}', encodeURIComponent(normalized.aid || ''))
  }

  const u = new URL(target)
  if (!u.searchParams.has('url')) {
    u.searchParams.set('url', normalized.url)
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

function adaptToParsedVideoInfo(rawResponse: any, normalized: NormalizedBilibiliInput): ParsedVideoInfo {
  // Pass-through if already standard.
  if (rawResponse?.success === true && rawResponse?.data && typeof rawResponse.data === 'object') {
    const data = rawResponse.data
    if (typeof data.mediaType === 'string' && typeof data.url === 'string' && data.url.startsWith('http')) {
      return data as ParsedVideoInfo
    }
  }

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

  const videoUrl = detectVideoUrl(dataSource)
  if (!videoUrl) {
    const error = extractErrorMessageFromObject(rawResponse)
    throw new Error(error || '响应中未找到视频链接')
  }

  const title = pickFirstNonEmpty([
    dataSource?.title,
    dataSource?.name,
    dataSource?.video_title,
    '未命名视频'
  ])

  const author = pickFirstNonEmpty([
    dataSource?.author,
    dataSource?.owner?.name,
    dataSource?.owner,
    dataSource?.uploader,
    dataSource?.nickname
  ])

  const thumbnail = pickFirstNonEmpty([
    dataSource?.pic,
    dataSource?.cover,
    dataSource?.thumbnail,
  ])

  const description = pickFirstNonEmpty([
    dataSource?.desc,
    dataSource?.description,
    dataSource?.intro,
    title
  ])

  return {
    title,
    author,
    description,
    mediaType: MediaType.VIDEO,
    url: videoUrl,
    format: inferFormat(videoUrl),
    thumbnail,
    cover: thumbnail,
    time: dataSource?.time ?? dataSource?.pubdate ?? dataSource?.created_at,
  }
}

function detectVideoUrl(dataSource: any): string {
  const directCandidates = [
    dataSource?.video_url,
    dataSource?.videoUrl,
    dataSource?.play_url,
    dataSource?.download_url,
    dataSource?.downloadUrl,
    dataSource?.mp4,
    dataSource?.url,
    getByPath(dataSource, 'video_url'),
    getByPath(dataSource, 'data.video_url'),
    getByPath(dataSource, 'durl.0.url'),
    getByPath(dataSource, 'video.0.url'),
  ]

  const firstDirect = pickFirstHttpUrl(directCandidates)
  if (firstDirect) return firstDirect

  return deepFindHttpUrl(dataSource)
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
  const preferredKeys = keys.filter(key => /(video|play|download|addr|mp4|url|durl)/i.test(key))
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

function inferFormat(url: string): string | undefined {
  const lower = String(url || '').toLowerCase()
  const match = lower.match(/\.([a-z0-9]{2,5})(?:\?|#|$)/)
  if (!match) return undefined
  return match[1]
}

function extractFirstUrlFromText(text: string): string {
  const source = String(text || '')
  const match = source.match(/https?:\/\/[^\s]+/i)
  return match ? match[0].trim() : ''
}

function normalizeBilibiliInput(input: string): NormalizedBilibiliInput {
  const source = String(input || '').trim()
  if (!source) return { url: '', bvid: '', aid: '' }

  // Accept raw BV / AV ids.
  const bvMatch = source.match(/^(BV[0-9A-Za-z]{10,})$/)
  if (bvMatch) {
    const bvid = bvMatch[1]
    return { url: `https://www.bilibili.com/video/${bvid}/`, bvid, aid: '' }
  }

  const avMatch = source.match(/^(?:av)?([0-9]{1,12})$/i)
  if (avMatch && /^(av)?[0-9]{1,12}$/i.test(source)) {
    const aid = avMatch[1]
    return { url: `https://www.bilibili.com/video/av${aid}/`, bvid: '', aid }
  }

  // Parse from URL.
  if (/^https?:\/\//i.test(source)) {
    try {
      const u = new URL(source)
      const path = u.pathname

      const bvidFromPath = path.match(/\/video\/(BV[0-9A-Za-z]{10,})/i)?.[1] || ''
      const aidFromPath = path.match(/\/video\/av([0-9]{1,12})/i)?.[1] || ''
      const bvidFromQuery = u.searchParams.get('bvid') || ''
      const aidFromQuery = u.searchParams.get('aid') || ''

      const bvid = (bvidFromPath || bvidFromQuery).trim()
      const aid = (aidFromPath || aidFromQuery).trim()

      return {
        url: source,
        bvid,
        aid
      }
    } catch {
      return { url: source, bvid: '', aid: '' }
    }
  }

  return { url: source, bvid: '', aid: '' }
}

function shouldResolveShareUrl(url: string): boolean {
  const source = String(url || '').trim()
  if (!source) return false
  if (!/^https?:\/\//i.test(source)) return false
  return /^https?:\/\/b23\.tv\//i.test(source)
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

async function parseViaBilibiliOfficial(normalized: NormalizedBilibiliInput, timeoutMs: number): Promise<ParsedVideoInfo> {
  const bvid = normalized.bvid
  const aid = normalized.aid

  if (!bvid && !aid) {
    throw new Error('无法从链接中识别 BV/AV 号')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const viewUrl = new URL('https://api.bilibili.com/x/web-interface/view')
    if (bvid) {
      viewUrl.searchParams.set('bvid', bvid)
    } else if (aid) {
      viewUrl.searchParams.set('aid', aid)
    }

    const viewResp = await fetch(viewUrl.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': DEFAULT_USER_AGENT,
        'Accept': 'application/json',
        'Referer': 'https://www.bilibili.com/',
      },
      signal: controller.signal
    })

    const viewText = await viewResp.text()
    const viewJson = safeParseJsonBody(viewText)
    if (!viewResp.ok || !viewJson) {
      throw new Error(`获取视频信息失败 (HTTP ${viewResp.status})`)
    }

    if (typeof viewJson?.code === 'number' && viewJson.code !== 0) {
      throw new Error(viewJson?.message || viewJson?.msg || `B站接口错误码: ${viewJson.code}`)
    }

    const viewData = viewJson?.data || null
    if (!viewData || typeof viewData !== 'object') {
      throw new Error('B站接口未返回 data')
    }

    const finalBvid = String(viewData.bvid || bvid || '').trim()
    const cid = viewData.cid || (Array.isArray(viewData.pages) ? viewData.pages[0]?.cid : null)
    if (!finalBvid || !cid) {
      throw new Error('B站接口未返回 bvid/cid')
    }

    const qn = String(process.env.BILIBILI_PARSER_QN || '80')
    const playUrl = new URL('https://api.bilibili.com/x/player/playurl')
    playUrl.searchParams.set('bvid', finalBvid)
    playUrl.searchParams.set('cid', String(cid))
    playUrl.searchParams.set('qn', qn)
    playUrl.searchParams.set('fnval', '0')
    playUrl.searchParams.set('fourk', '1')

    const playResp = await fetch(playUrl.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': DEFAULT_USER_AGENT,
        'Accept': 'application/json',
        'Referer': 'https://www.bilibili.com/',
      },
      signal: controller.signal
    })

    const playText = await playResp.text()
    const playJson = safeParseJsonBody(playText)
    if (!playResp.ok || !playJson) {
      throw new Error(`获取播放地址失败 (HTTP ${playResp.status})`)
    }

    if (typeof playJson?.code === 'number' && playJson.code !== 0) {
      throw new Error(playJson?.message || playJson?.msg || `B站接口错误码: ${playJson.code}`)
    }

    const playData = playJson?.data || null
    const durl = Array.isArray(playData?.durl) ? playData.durl : []
    const playDirect = durl[0]?.url
    if (!playDirect || typeof playDirect !== 'string' || !/^https?:\/\//i.test(playDirect)) {
      throw new Error('未获取到可用的直链播放地址（可能需要登录或接口变更）')
    }

    const title = String(viewData.title || '未命名视频')
    const author = String(viewData.owner?.name || '')
    const thumbnail = String(viewData.pic || '')
    const description = String(viewData.desc || title)

    return {
      title,
      author: author || undefined,
      description,
      mediaType: MediaType.VIDEO,
      url: playDirect,
      duration: typeof viewData.duration === 'number' ? viewData.duration : undefined,
      format: inferFormat(playDirect),
      thumbnail: thumbnail || undefined,
      cover: thumbnail || undefined,
      time: viewData.pubdate ?? undefined,
    }
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

