import { MediaType } from '../../types'
import type { ParsedVideoInfo, VideoParseResponse } from '../../types'
import { extractFirstUrlFromText } from '../url/extract'
import { findFirstUsableParserResult, type ParserRaceAttempt } from '../parser-race'
import { DEFAULT_UPSTREAM_RESPONSE_LIMIT_BYTES, readResponseTextLimited } from './parser-security'

export const DEFAULT_DOUYIN_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const DEFAULT_DOUYIN_UPSTREAMS = [
  'jxcxin|GET https://apis.jxcxin.cn/api/douyin?url={url}',
  'douyin_wtf|GET https://api.douyin.wtf/api/hybrid/video_data?url={url}',
  'mmp_dyhome|GET https://api.mmp.cc/api/dyhome?url={url}',
  'yujn|GET https://api.yujn.cn/api/dy_jx.php?msg={url}',
  'xzdx|GET https://xzdx.top/api/duan?url={url}',
  'oick|GET https://api.oick.cn/douyin/?url={url}',
  'pearktrue|GET https://api.pearktrue.cn/api/video/douyin/?url={url}',
]

type Upstream = {
  name: string
  method: 'GET' | 'POST'
  target: string
}

type ParseTaskResult = {
  parsedInfo: ParsedVideoInfo
  raw: unknown
  upstreamName: string
}

export type DouyinParseServiceResult = {
  status: number
  body: VideoParseResponse | {
    success: false
    error: string
    rawData?: Record<string, unknown>
  }
}

type ParseDouyinVideoOptions = {
  fetchImpl?: typeof fetch
  timeoutMs?: number
  concurrency?: number
  upstreamEntries?: string[]
  responseLimitBytes?: number
}

export async function parseDouyinVideo(
  input: string,
  options: ParseDouyinVideoOptions = {}
): Promise<DouyinParseServiceResult> {
  const extractedUrl = extractFirstUrlFromText(input)
  if (!extractedUrl) {
    return {
      status: 400,
      body: { success: false, error: '未识别到有效链接' },
    }
  }

  const timeoutMs = options.timeoutMs ?? getDouyinParserTimeoutMs()
  const fetchImpl = options.fetchImpl ?? fetch
  const responseLimitBytes = options.responseLimitBytes ?? DEFAULT_UPSTREAM_RESPONSE_LIMIT_BYTES
  const initialNormalizedUrl = normalizeDouyinInputUrl(extractedUrl)
  const resolvedUrl = await resolveShareUrlIfNeeded(initialNormalizedUrl, timeoutMs, fetchImpl)
  const normalizedUrl = normalizeDouyinInputUrl(resolvedUrl)
  const upstreams = getDouyinUpstreams(options.upstreamEntries)

  if (upstreams.length === 0) {
    return {
      status: 500,
      body: { success: false, error: '未配置可用的抖音解析上游' },
    }
  }

  const race = await findFirstUsableParserResult(
    upstreams.map(upstream => async (signal: AbortSignal): Promise<ParseTaskResult> => {
      const raw = await callDouyinUpstream(upstream, normalizedUrl, timeoutMs, fetchImpl, signal, responseLimitBytes)
      return {
        parsedInfo: adaptDouyinPayload(raw),
        raw,
        upstreamName: upstream.name,
      }
    }),
    result => isUsableParsedInfo(result.parsedInfo),
    'douyin',
    options.concurrency ?? getDouyinParserConcurrency()
  )

  const attempts = normalizeAttempts(race.attempts, upstreams)
  if (race.result) {
    return {
      status: 200,
      body: {
        success: true,
        data: race.result.parsedInfo,
        rawData: {
          source: race.result.upstreamName,
          extractedUrl,
          resolvedUrl,
          normalizedUrl,
          attempts,
          upstream: race.result.raw,
        },
      },
    }
  }

  const failures = attempts
    .filter(item => !item.success)
    .map(item => `${item.label}: ${item.errorMessage || 'returned no usable media'}`)

  return {
    status: 502,
    body: {
      success: false,
      error: failures[0] || '解析失败',
      rawData: {
        failures: failures.slice(0, 3),
        attempts,
        extractedUrl,
        resolvedUrl,
        normalizedUrl,
        lastRaw: race.lastRaw ?? undefined,
      },
    },
  }
}

export function getDouyinParserTimeoutMs(): number {
  const value = Number(process.env.DOUYIN_PARSER_TIMEOUT_MS)
  if (!Number.isFinite(value)) {
    return 10000
  }
  return Math.min(Math.max(Math.trunc(value), 3000), 30000)
}

export function getDouyinParserConcurrency(): number {
  const value = Number(process.env.DOUYIN_PARSER_CONCURRENCY)
  if (!Number.isFinite(value)) {
    return 3
  }
  return Math.min(Math.max(Math.trunc(value), 1), 5)
}

export function getDouyinUpstreams(rawEntries?: string[]): Upstream[] {
  let entries: string[] = []
  if (Array.isArray(rawEntries)) {
    entries = rawEntries
  } else {
    const rawConfig = typeof process.env.DOUYIN_PARSER_UPSTREAMS === 'string'
      ? process.env.DOUYIN_PARSER_UPSTREAMS.trim()
      : ''

    if (!rawConfig) {
      entries = [...DEFAULT_DOUYIN_UPSTREAMS]
    } else if (rawConfig.startsWith('[')) {
      try {
        const parsed = JSON.parse(rawConfig)
        if (Array.isArray(parsed)) {
          entries = parsed.filter((item): item is string => typeof item === 'string')
        }
      } catch {
        entries = []
      }
    } else {
      entries = rawConfig
        .split(/[\n,]/)
        .map((item: string) => item.trim())
        .filter(Boolean)
    }
  }

  if (entries.length === 0 && !Array.isArray(rawEntries)) {
    entries = [...DEFAULT_DOUYIN_UPSTREAMS]
  }

  return entries
    .map((entry, index) => parseUpstreamEntry(entry, index))
    .filter((item): item is Upstream => Boolean(item))
}

export function normalizeDouyinInputUrl(input: string): string {
  const url = String(input || '').trim()
  if (!url) return ''

  if (/^[0-9]{10,25}$/.test(url)) {
    return `https://www.iesdouyin.com/share/video/${url}`
  }

  if (!/douyin\.com|iesdouyin\.com|v\.douyin\.com/i.test(url)) {
    return url
  }

  const awemeMatch = url.match(/\/video\/([0-9]{10,25})/i)
  if (awemeMatch?.[1]) {
    return `https://www.iesdouyin.com/share/video/${awemeMatch[1]}`
  }

  return url
}

export async function resolveShareUrlIfNeeded(
  url: string,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  if (!shouldResolveShareUrl(url)) {
    return url
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': DEFAULT_DOUYIN_USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: controller.signal,
    })
    return response.url || url
  } catch {
    return url
  } finally {
    clearTimeout(timeout)
  }
}

export function safeParseJsonBody(body: string): any | null {
  if (!body || !body.trim()) {
    return null
  }

  try {
    return JSON.parse(body)
  } catch {
    // Continue below and try to recover embedded JSON.
  }

  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start !== -1 && end !== -1 && end > start) {
    try {
      return JSON.parse(body.substring(start, end + 1))
    } catch {
      return null
    }
  }

  return null
}

export function extractErrorMessageFromObject(payload: any): string {
  if (!payload || typeof payload !== 'object') {
    return ''
  }

  for (const key of ['error', 'message', 'msg', 'detail', 'reason']) {
    const value = payload?.[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return ''
}

export function sanitizeTextSnippet(text: string, maxLength = 200): string {
  if (!text) return ''
  const condensed = text.replace(/\s+/g, ' ').trim()
  if (!condensed) return ''
  return condensed.length > maxLength ? `${condensed.substring(0, maxLength)}…` : condensed
}

function normalizeAttempts(attempts: ParserRaceAttempt[], upstreams: Upstream[]): ParserRaceAttempt[] {
  return attempts.map(item => ({
    ...item,
    label: upstreams[item.index]?.name || item.label,
  }))
}

function shouldResolveShareUrl(url: string): boolean {
  const source = String(url || '').trim()
  if (!source) return false
  if (!/^https?:\/\//i.test(source)) return false
  return /^https?:\/\/v\.douyin\.com\//i.test(source)
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

async function callDouyinUpstream(
  upstream: Upstream,
  url: string,
  timeoutMs: number,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
  responseLimitBytes: number
): Promise<any> {
  const response = await fetchImpl(
    upstream.method === 'POST' ? upstream.target : buildGetUrl(upstream.target, url),
    {
      method: upstream.method,
      headers: {
        'User-Agent': DEFAULT_DOUYIN_USER_AGENT,
        ...(upstream.method === 'POST'
          ? {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            }
          : {
              'Accept': 'application/json,text/plain,*/*',
            }),
      },
      ...(upstream.method === 'POST'
        ? { body: JSON.stringify({ url, videoUrl: url }) }
        : {}),
      signal: linkAbortSignals(signal, timeoutMs),
    }
  )

  const text = await readResponseTextLimited(response, responseLimitBytes).catch(error => {
    throw new Error(error instanceof Error ? error.message : '读取上游响应失败')
  })

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

function buildGetUrl(target: string, url: string): string {
  if (target.includes('{url}')) {
    return target.replace('{url}', encodeURIComponent(url))
  }

  const parsed = new URL(target)
  if (!parsed.searchParams.has('url')) {
    parsed.searchParams.set('url', url)
  }
  return parsed.toString()
}

function linkAbortSignals(parentSignal: AbortSignal, timeoutMs: number): AbortSignal {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  const abort = () => {
    clearTimeout(timeout)
    if (!controller.signal.aborted) {
      controller.abort(parentSignal.reason)
    }
  }

  if (parentSignal.aborted) {
    abort()
    return controller.signal
  }

  parentSignal.addEventListener('abort', abort, { once: true })
  controller.signal.addEventListener(
    'abort',
    () => {
      clearTimeout(timeout)
      parentSignal.removeEventListener('abort', abort)
    },
    { once: true }
  )
  return controller.signal
}

function extractErrorMessage(text: string): string {
  const parsed = safeParseJsonBody(text)
  return extractErrorMessageFromObject(parsed) || sanitizeTextSnippet(text)
}

function isUsableParsedInfo(parsedInfo: ParsedVideoInfo): boolean {
  if (parsedInfo.mediaType === MediaType.VIDEO) {
    return typeof parsedInfo.url === 'string' && /^https?:\/\//i.test(parsedInfo.url)
  }
  return Array.isArray(parsedInfo.images) && parsedInfo.images.length > 0
}

function adaptDouyinPayload(rawResponse: any): ParsedVideoInfo {
  if (rawResponse?.success === true && rawResponse?.data && typeof rawResponse.data === 'object') {
    const data = rawResponse.data
    const hasVideo = typeof data.url === 'string' && data.url.startsWith('http')
    const hasImages = Array.isArray(data.images) && data.images.length > 0
    if (typeof data.mediaType === 'string' && (hasVideo || hasImages)) {
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
    '未命名作品',
  ])

  const author = pickAuthor(dataSource)
  const description = pickFirstNonEmpty([
    dataSource?.description,
    dataSource?.desc,
    dataSource?.content,
    title,
  ])

  const thumbnail = pickFirstNonEmpty([
    dataSource?.thumbnail,
    dataSource?.cover,
    getByPath(dataSource, 'video.cover.url_list.0'),
    getByPath(dataSource, 'video.dynamic_cover.url_list.0'),
    images[0],
  ])

  if (videoUrl) {
    const duration = toDurationSeconds(
      pickFirstNonEmpty([
        dataSource?.duration,
        getByPath(dataSource, 'video.duration'),
        getByPath(dataSource, 'video_info.duration'),
      ])
    )

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
      filename: `image_${(index + 1).toString().padStart(3, '0')}.jpg`,
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
          item.href,
        ])
        if (url) {
          results.push(url)
        }
      }
    }
  }

  const unique: string[] = []
  const seen: Record<string, true> = Object.create(null)
  for (const url of results) {
    if (!url || seen[url]) continue
    seen[url] = true
    unique.push(url)
  }
  return unique
}

function detectVideoUrl(dataSource: any): string {
  const directCandidates = [
    dataSource?.video_url,
    dataSource?.videoUrl,
    dataSource?.play_url,
    getByPath(dataSource, 'video_urls.0'),
    dataSource?.download_url,
    dataSource?.downloadUrl,
    dataSource?.playAddr,
    getByPath(dataSource, 'video.play_addr.url_list.0'),
    getByPath(dataSource, 'video.play_addr_h264.url_list.0'),
    getByPath(dataSource, 'video.bit_rate.0.play_addr.url_list.0'),
    getByPath(dataSource, 'video_info.url'),
    dataSource?.url,
  ]

  const urls: string[] = []
  for (const item of directCandidates) {
    if (typeof item === 'string' && /^https?:\/\//i.test(item)) {
      urls.push(item)
    }
  }

  for (const url of urls) {
    if (!isLikelyUpstreamParserUrl(url)) {
      return url
    }
  }

  if (urls.length > 0) {
    return urls[0]
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

function isLikelyUpstreamParserUrl(value: string): boolean {
  if (!value) return false
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()
    return (
      host.endsWith('jxcxin.cn') ||
      host === 'api.oick.cn' ||
      host.endsWith('.oick.cn') ||
      host.endsWith('pearktrue.cn') ||
      host.endsWith('yujn.cn') ||
      host.endsWith('xzdx.top') ||
      host.endsWith('douyin.wtf') ||
      host === 'api.mmp.cc' ||
      host.endsWith('.mmp.cc')
    )
  } catch {
    return false
  }
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
    const found = deepFindHttpUrl(node[key], depth + 1, visited)
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
    if (current == null) return undefined

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
  return num > 10_000 ? Math.round(num / 1000) : Math.round(num)
}

function inferFormat(url: string): string | undefined {
  const lower = String(url || '').toLowerCase()
  const match = lower.match(/\.([a-z0-9]{2,5})(?:\?|#|$)/)
  return match?.[1]
}

function pickFirstNonEmpty(values: Array<unknown>): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return ''
}
