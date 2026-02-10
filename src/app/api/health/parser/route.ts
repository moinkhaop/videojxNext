import { NextRequest, NextResponse } from 'next/server'
import { VideoParserConfig } from '@/types'

const DEFAULT_HEALTH_SAMPLE_URL = 'https://www.douyin.com/video/0'

type HealthResponseData = {
  parserName: string
  parserUrl: string
  method: 'GET' | 'POST'
  reachable: boolean
  healthy: boolean
  logicalSuccess: boolean
  status: number
  latencyMs: number
  message: string
  checkedAt: string
  responsePreview: string
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parserConfig = (body?.parserConfig || null) as Partial<VideoParserConfig> | null

    if (!parserConfig || !parserConfig.apiUrl || typeof parserConfig.apiUrl !== 'string' || !parserConfig.apiUrl.trim()) {
      return NextResponse.json({
        success: false,
        error: '缺少解析器配置或API地址无效'
      }, { status: 400 })
    }

    const parserName = typeof parserConfig.name === 'string' && parserConfig.name.trim()
      ? parserConfig.name.trim()
      : '未命名解析器'

    const sampleUrl = typeof body?.sampleUrl === 'string' && body.sampleUrl.trim()
      ? body.sampleUrl.trim()
      : DEFAULT_HEALTH_SAMPLE_URL

    const { finalApiUrl, method, requestOptions } = buildHealthRequest(parserConfig, sampleUrl)

    const startedAt = Date.now()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    let response: Response
    try {
      response = await fetch(finalApiUrl, {
        ...requestOptions,
        signal: controller.signal
      })
    } catch (error) {
      clearTimeout(timeout)
      return NextResponse.json({
        success: false,
        error: `解析器不可达: ${error instanceof Error ? error.message : '网络错误'}`
      }, { status: 502 })
    }

    clearTimeout(timeout)
    const latencyMs = Date.now() - startedAt

    const rawBody = await response.text()
    const parsedBody = safeParseJsonBody(rawBody)
    const logicalSuccess = evaluateLogicalSuccess(parsedBody)
    const healthy = response.ok && (logicalSuccess || parsedBody !== null)

    const data: HealthResponseData = {
      parserName,
      parserUrl: finalApiUrl,
      method,
      reachable: true,
      healthy,
      logicalSuccess,
      status: response.status,
      latencyMs,
      message: buildHealthMessage(response.status, healthy, logicalSuccess),
      checkedAt: new Date().toISOString(),
      responsePreview: buildResponsePreview(parsedBody, rawBody)
    }

    return NextResponse.json({
      success: true,
      data
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '健康检查接口执行失败'
    }, { status: 500 })
  }
}

function buildHealthRequest(parserConfig: Partial<VideoParserConfig>, sampleUrl: string): {
  finalApiUrl: string
  method: 'GET' | 'POST'
  requestOptions: RequestInit
} {
  const urlParamName = parserConfig.urlParamName?.trim() || 'url'
  const parserName = parserConfig.name?.trim() || ''

  const upstreamUrl = new URL(parserConfig.apiUrl!)

  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  }

  if (parserConfig.customHeaders) {
    for (const [key, value] of Object.entries(parserConfig.customHeaders)) {
      if (typeof key === 'string' && typeof value === 'string' && key.trim()) {
        headers[key] = value
      }
    }
  }

  if (parserConfig.apiKey) {
    const headerKeys = Object.keys(headers).map(key => key.toLowerCase())
    if (!headerKeys.includes('authorization')) {
      headers['Authorization'] = `Bearer ${parserConfig.apiKey}`
    }
    if (!headerKeys.includes('x-api-key')) {
      headers['X-API-Key'] = parserConfig.apiKey
    }
  }

  const configuredMethod = parserConfig.requestMethod?.toUpperCase()
  const shouldUseGet = configuredMethod === 'GET'
    || (!configuredMethod && (
      parserConfig.useGetMethod === true
      || upstreamUrl.searchParams.has(urlParamName)
      || parserConfig.apiUrl?.includes(`?${urlParamName}=`)
      || parserName.toLowerCase().includes('get')
    ))

  const method: 'GET' | 'POST' = shouldUseGet ? 'GET' : 'POST'

  if (method === 'GET') {
    if (parserConfig.customQueryParams) {
      Object.entries(parserConfig.customQueryParams).forEach(([key, value]) => {
        if (typeof key === 'string' && value !== undefined && value !== null) {
          upstreamUrl.searchParams.set(key, String(value))
        }
      })
    }
    upstreamUrl.searchParams.set(urlParamName, sampleUrl)

    return {
      finalApiUrl: upstreamUrl.toString(),
      method,
      requestOptions: {
        method,
        headers
      }
    }
  }

  const headerKeys = Object.keys(headers).map(key => key.toLowerCase())
  if (!headerKeys.includes('content-type')) {
    headers['Content-Type'] = 'application/json'
  }

  const bodyPayload: Record<string, unknown> = {
    ...(parserConfig.customBodyParams || {}),
    [urlParamName]: sampleUrl
  }

  return {
    finalApiUrl: upstreamUrl.toString(),
    method,
    requestOptions: {
      method,
      headers,
      body: JSON.stringify(bodyPayload)
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

function evaluateLogicalSuccess(payload: any): boolean {
  if (!payload || typeof payload !== 'object') {
    return false
  }

  if (payload.success === true || payload.code === 0 || payload.code === 200) {
    return true
  }

  const source = payload.data && typeof payload.data === 'object'
    ? payload.data
    : payload.result && typeof payload.result === 'object'
      ? payload.result
      : payload

  const candidateUrls = [
    source.url,
    source.video_url,
    source.play_url,
    source.download_url,
    source.videoUrl,
    source.downloadUrl
  ]

  return candidateUrls.some((value: unknown) => typeof value === 'string' && /^https?:\/\//i.test(value))
}

function buildHealthMessage(status: number, healthy: boolean, logicalSuccess: boolean): string {
  if (healthy && logicalSuccess) {
    return '连通正常，且返回结构符合预期'
  }

  if (healthy) {
    return '连通正常，但返回结构较弱（可能为风控页或简化响应）'
  }

  if (status >= 500) {
    return `上游服务异常（HTTP ${status}）`
  }

  if (status === 401 || status === 403) {
    return `上游拒绝访问（HTTP ${status}），请检查鉴权或防护策略`
  }

  if (status === 404) {
    return '上游地址不存在（HTTP 404）'
  }

  return `连通异常（HTTP ${status}）`
}

function buildResponsePreview(parsedBody: any, rawBody: string): string {
  if (parsedBody && typeof parsedBody === 'object') {
    try {
      const serialized = JSON.stringify(parsedBody)
      return serialized.length > 280 ? `${serialized.substring(0, 280)}…` : serialized
    } catch {
    }
  }

  const condensed = (rawBody || '').replace(/\s+/g, ' ').trim()
  if (!condensed) {
    return ''
  }
  return condensed.length > 280 ? `${condensed.substring(0, 280)}…` : condensed
}
