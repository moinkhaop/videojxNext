import {
  MediaType,
  ParsedVideoInfo,
  ParseExecutionTrace,
  ParserAttemptResult,
  ParserCapability,
  SupportedPlatform,
  VideoParseResponse,
  VideoParserConfig,
} from '../types'
import { extractFirstUrlFromText } from './url/extract'
import { extractErrorMessageFromResponse } from './conversion-upload'

export function isValidVideoInputUrl(input: string): boolean {
  try {
    const extractedUrl = extractRealVideoUrl(input)
    new URL(extractedUrl)
    return true
  } catch {
    return false
  }
}

export function extractRealVideoUrl(input: string): string {
  const source = String(input || '').trim()
  if (!source) {
    return ''
  }

  const extracted = extractFirstUrlFromText(source)
  if (extracted) {
    return extracted
  }

  try {
    new URL(source)
    return source
  } catch {
    return source
  }
}

export async function parseVideoWithFallback(
  sourceInput: string,
  parserConfig: VideoParserConfig,
  capability: ParserCapability = ParserCapability.SINGLE_VIDEO
): Promise<{
  parsedInfo: ParsedVideoInfo
  usedParser: VideoParserConfig
  trace: ParseExecutionTrace
}> {
  const extractedUrl = extractRealVideoUrl(sourceInput)
  const parserHealth = await loadParserHealthModule()
  const parserChain = await buildParserFallbackChain(parserConfig, extractedUrl, capability)
  const traceId = createTraceId()
  const trace: ParseExecutionTrace = {
    traceId,
    input: sourceInput,
    capability,
    selectedParserId: parserConfig.id,
    attempts: [],
    startedAt: new Date().toISOString(),
    success: false,
  }

  for (const parser of parserChain) {
    if (parser.id !== parserConfig.id && parserHealth.isParserCoolingDown(parser.id)) {
      continue
    }

    const started = Date.now()
    try {
      const { parsedInfo, status } = await requestParseWithParser(sourceInput, extractedUrl, parser)
      const attempt: ParserAttemptResult = {
        parserId: parser.id,
        parserName: parser.name,
        parserUrl: parser.apiUrl,
        success: true,
        latencyMs: Date.now() - started,
        status,
        checkedAt: new Date().toISOString(),
        traceId,
      }
      trace.attempts.push(attempt)
      parserHealth.recordParserAttempt(attempt)
      trace.success = true
      trace.finishedAt = new Date().toISOString()
      return { parsedInfo, usedParser: parser, trace }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const attempt: ParserAttemptResult = {
        parserId: parser.id,
        parserName: parser.name,
        parserUrl: parser.apiUrl,
        success: false,
        latencyMs: Date.now() - started,
        errorClass: parserHealth.classifyParserFailure({ error, message }),
        errorMessage: message,
        checkedAt: new Date().toISOString(),
        traceId,
      }
      trace.attempts.push(attempt)
      parserHealth.recordParserAttempt(attempt)
      console.error(`[转存] 解析器失败: ${parser.name} -> ${message}`)
    }
  }

  trace.finishedAt = new Date().toISOString()
  throw new Error(buildFallbackFailureMessage(trace.attempts))
}

export function parseVideoResponseText(responseText: string): ParsedVideoInfo {
  let result: VideoParseResponse
  try {
    result = JSON.parse(responseText)
  } catch (parseError) {
    console.error('[转存] 无法解析解析API响应JSON:', parseError)
    const snippet = responseText.substring(0, 300)
    throw new Error(`解析服务返回了无法解析的内容: ${snippet}`)
  }

  if (!result.success) {
    throw new Error(result.error || '视频解析失败')
  }

  if (!result.data) {
    throw new Error('API返回的数据为空')
  }

  if (result.data.mediaType === MediaType.VIDEO && !result.data.url) {
    throw new Error('视频解析成功但未返回有效的视频URL')
  }

  if (result.data.mediaType === MediaType.VIDEO && result.data.url) {
    try {
      new URL(result.data.url)
    } catch {
      throw new Error(`返回的URL无效: ${result.data.url}`)
    }
  }

  if (result.data.mediaType === MediaType.IMAGE_ALBUM) {
    if (!result.data.images || result.data.images.length === 0) {
      throw new Error('图集解析成功但没有找到任何图片')
    }
    console.log(`[转存] 图集解析成功，包含 ${result.data.images.length} 张图片`)
  }

  return result.data
}

async function buildParserFallbackChain(
  selectedParser: VideoParserConfig,
  extractedUrl: string,
  capability: ParserCapability
): Promise<VideoParserConfig[]> {
  const chain: VideoParserConfig[] = []
  const seen = new Set<string>()
  const push = (parser: VideoParserConfig | null | undefined) => {
    if (!parser || !parser.id || seen.has(parser.id)) return
    seen.add(parser.id)
    chain.push(parser)
  }

  push(selectedParser)

  if (typeof window === 'undefined') {
    return chain
  }

  const { ConfigManager } = await import('./storage')
  const parserHealth = await loadParserHealthModule()
  const platform = inferPlatformFromUrl(extractedUrl)
  const allParsers = ConfigManager.getParsers()
    .filter(parser => parser?.id && parser.apiUrl && !parser.disabled)
    .filter(parser => {
      if (capability === ParserCapability.USER_PAGE) {
        return parser.capabilities?.includes(ParserCapability.USER_PAGE)
      }
      const capabilityOk = !parser.capabilities
        || parser.capabilities.length === 0
        || parser.capabilities.includes(ParserCapability.SINGLE_VIDEO)
      const platformOk = !parser.supportedPlatforms
        || parser.supportedPlatforms.length === 0
        || parser.supportedPlatforms.includes(SupportedPlatform.UNIVERSAL)
        || parser.supportedPlatforms.includes(platform)
      return capabilityOk && platformOk
    })
    .sort((a, b) => {
      const snapshotA = parserHealth.getParserHealthSnapshot(a.id)
      const snapshotB = parserHealth.getParserHealthSnapshot(b.id)
      const scoreA = parserHealth.scoreParserHealth(snapshotA) + (a.isDefault ? 15 : 0)
      const scoreB = parserHealth.scoreParserHealth(snapshotB) + (b.isDefault ? 15 : 0)
      return scoreB - scoreA
    })

  for (const parser of allParsers) {
    push(parser)
  }

  return chain
}

function inferPlatformFromUrl(url: string): SupportedPlatform {
  const source = String(url || '').toLowerCase()
  if (/bilibili\.com|b23\.tv|\/bv[0-9a-z]+/i.test(source)) {
    return SupportedPlatform.BILIBILI
  }
  if (/douyin\.com|iesdouyin\.com|v\.douyin\.com/i.test(source)) {
    return SupportedPlatform.DOUYIN
  }
  return SupportedPlatform.UNIVERSAL
}

async function requestParseWithParser(
  sourceInput: string,
  extractedUrl: string,
  parserConfig: VideoParserConfig
): Promise<{ parsedInfo: ParsedVideoInfo; status: number }> {
  console.log(`[转存] 使用解析器尝试: ${parserConfig.name} (${parserConfig.apiUrl})`)

  const apiUrl = String(parserConfig.apiUrl || '').trim()
  const isLocalParserEndpoint = /^\/api\//i.test(apiUrl)
  const endpoint = isLocalParserEndpoint ? apiUrl : '/api/proxy/parser'
  const payload = isLocalParserEndpoint
    ? { url: extractedUrl, videoUrl: extractedUrl, text: sourceInput }
    : { videoUrl: extractedUrl, parserConfig }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const responseText = await response.text()
  if (!responseText.trim()) {
    throw new Error(`解析服务器返回空响应 (HTTP ${response.status})`)
  }

  if (!response.ok) {
    const upstreamError = extractErrorMessageFromResponse(responseText)
    throw new Error(
      upstreamError
        ? `解析接口调用失败 (${response.status}): ${upstreamError}`
        : `解析接口调用失败 (HTTP ${response.status})`
    )
  }

  const parsedInfo = parseVideoResponseText(responseText)
  return {
    parsedInfo,
    status: response.status,
  }
}

export function buildFallbackFailureMessage(attempts: ParserAttemptResult[]): string {
  if (!attempts.length) {
    return '解析失败：没有可用解析器'
  }

  const details = attempts
    .filter(item => !item.success)
    .slice(0, 3)
    .map(item => {
      const cls = item.errorClass ? `/${item.errorClass}` : ''
      return `${item.parserName || item.parserId}${cls}: ${item.errorMessage || '未知错误'}`
    })

  if (!details.length) {
    return '解析失败：所有解析器不可用'
  }

  return `解析失败，已尝试 ${attempts.length} 个解析器。${details.join(' | ')}`
}

function createTraceId(): string {
  const uuid = (globalThis as any)?.crypto?.randomUUID
  if (typeof uuid === 'function') {
    return uuid.call((globalThis as any).crypto)
  }

  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.map(b => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

async function loadParserHealthModule() {
  return await import('./parser-health')
}
