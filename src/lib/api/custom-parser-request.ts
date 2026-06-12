import type { VideoParserConfig } from '../../types'
import { extractFirstUrlFromText } from '../url/extract'
import {
  resolveAndValidateHttpUrl,
  sanitizeCustomHeaders,
} from './parser-security'
import {
  normalizeDouyinInputUrl,
  resolveShareUrlIfNeeded,
} from './douyin-parser'

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

export interface PreparedCustomParserRequest {
  cleanedVideoUrl: string
  extractedUrl: string
  resolvedUrl: string
  normalizedVideoUrl: string
  parserName: string
  urlParamName: string
  upstreamUrl: URL
  finalApiUrl: string
  requestOptions: RequestInit
  method: 'GET' | 'POST'
}

type PreparedCustomParserRequestResult =
  | { ok: true; value: PreparedCustomParserRequest }
  | { ok: false; error: string }

interface PrepareCustomParserRequestArgs {
  requestUrl: string
  videoUrl: string
  parserConfig: VideoParserConfig
  resolveShareTimeoutMs?: number
}

/**
 * 统一构建自定义解析器请求，确保 preview/proxy 两条链路使用完全一致的
 * URL 清洗、短链展开、Header 过滤和 GET/POST 参数拼装规则，避免同一解析器
 * 在不同入口出现“一个能用，一个失效”的分叉行为。
 */
export async function prepareCustomParserRequest(
  args: PrepareCustomParserRequestArgs
): Promise<PreparedCustomParserRequestResult> {
  const { requestUrl, videoUrl, parserConfig, resolveShareTimeoutMs = 10_000 } = args

  if (!parserConfig.apiUrl || typeof parserConfig.apiUrl !== 'string' || !parserConfig.apiUrl.trim()) {
    return {
      ok: false,
      error: '解析API地址无效或未配置',
    }
  }

  const cleanedVideoUrl = String(videoUrl || '').trim()
  const extractedUrl = extractFirstUrlFromText(cleanedVideoUrl) || cleanedVideoUrl
  const initialNormalizedUrl = normalizeDouyinInputUrl(extractedUrl)
  const resolvedUrl = await resolveShareUrlIfNeeded(initialNormalizedUrl, resolveShareTimeoutMs)
  const normalizedVideoUrl = normalizeDouyinInputUrl(resolvedUrl)
  const parserName = parserConfig.name?.trim() || '自定义解析器'
  const urlParamName = parserConfig.urlParamName?.trim() || 'url'

  const validatedApiUrl = resolveAndValidateHttpUrl(String(parserConfig.apiUrl).trim(), requestUrl, {
    allowRelativeApi: true,
  })
  if (!validatedApiUrl.ok) {
    return {
      ok: false,
      error: validatedApiUrl.error,
    }
  }

  const upstreamUrl = validatedApiUrl.url
  const headers = sanitizeCustomHeaders(parserConfig.customHeaders, {
    'User-Agent': DEFAULT_USER_AGENT,
  })

  const headerKeys = Object.keys(headers)
  const hasContentTypeHeader = headerKeys.some(key => key.toLowerCase() === 'content-type')
  const hasAuthorizationHeader = headerKeys.some(key => key.toLowerCase() === 'authorization')
  const hasApiKeyHeader = headerKeys.some(key => key.toLowerCase() === 'x-api-key')

  if (parserConfig.apiKey) {
    if (!hasAuthorizationHeader) {
      headers.Authorization = `Bearer ${parserConfig.apiKey}`
    }
    if (!hasApiKeyHeader) {
      headers['X-API-Key'] = parserConfig.apiKey
    }
  }

  const configuredMethod = typeof parserConfig.requestMethod === 'string'
    ? parserConfig.requestMethod.toUpperCase()
    : undefined
  const shouldUseGet = configuredMethod === 'GET'
    || (!configuredMethod && (
      parserConfig.useGetMethod === true
      || upstreamUrl.searchParams.has(urlParamName)
      || parserConfig.apiUrl.includes(`?${urlParamName}=`)
      || parserName.toLowerCase().includes('get')
    ))

  const method: 'GET' | 'POST' = shouldUseGet ? 'GET' : 'POST'
  let requestBody: string | undefined

  if (method === 'GET') {
    const customQueryParams =
      parserConfig.customQueryParams && typeof parserConfig.customQueryParams === 'object'
        ? parserConfig.customQueryParams
        : {}

    Object.entries(customQueryParams).forEach(([key, value]) => {
      if (typeof key === 'string' && value !== undefined && value !== null) {
        upstreamUrl.searchParams.set(key, String(value))
      }
    })
    upstreamUrl.searchParams.set(urlParamName, normalizedVideoUrl)
  } else {
    if (!hasContentTypeHeader) {
      headers['Content-Type'] = 'application/json'
    }

    const customBodyParams =
      parserConfig.customBodyParams && typeof parserConfig.customBodyParams === 'object'
        ? parserConfig.customBodyParams
        : {}

    requestBody = JSON.stringify({
      ...customBodyParams,
      [urlParamName]: normalizedVideoUrl,
    })
  }

  return {
    ok: true,
    value: {
      cleanedVideoUrl,
      extractedUrl,
      resolvedUrl,
      normalizedVideoUrl,
      parserName,
      urlParamName,
      upstreamUrl,
      finalApiUrl: upstreamUrl.toString(),
      requestOptions: {
        method,
        headers,
        ...(method === 'POST' && requestBody ? { body: requestBody } : {}),
      },
      method,
    },
  }
}
