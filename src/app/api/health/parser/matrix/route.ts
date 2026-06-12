import { NextRequest, NextResponse } from 'next/server'
import { ParserErrorClass, VideoParserConfig } from '@/types'
import { classifyParserFailure } from '@/lib/parser-health'
import { requireRouteAuth } from '@/lib/api/route-auth'

const DEFAULT_HEALTH_SAMPLE_URL = 'https://www.douyin.com/video/0'

type MatrixItem = {
  parserId: string
  parserName: string
  parserUrl: string
  healthy: boolean
  logicalSuccess: boolean
  status: number
  latencyMs: number
  message: string
  normalizedMessage: string
  errorClass?: ParserErrorClass
  traceId: string
  checkedAt: string
}

export async function POST(request: NextRequest) {
  const auth = await requireRouteAuth(request)
  if (!auth.ok) {
    return auth.response
  }

  try {
    const body = await request.json()
    const parserConfigs = Array.isArray(body?.parserConfigs) ? body.parserConfigs : []
    const sampleUrl = typeof body?.sampleUrl === 'string' && body.sampleUrl.trim()
      ? body.sampleUrl.trim()
      : DEFAULT_HEALTH_SAMPLE_URL

    if (!parserConfigs.length) {
      return NextResponse.json({
        success: false,
        error: '缺少 parserConfigs 参数',
      }, { status: 400 })
    }

    const endpoint = new URL('/api/health/parser', request.url).toString()
    const forwardedHeaders: Record<string, string> = {}
    const authHeader = request.headers.get('authorization')
    const cookieHeader = request.headers.get('cookie')
    if (authHeader) {
      forwardedHeaders['authorization'] = authHeader
    }
    if (cookieHeader) {
      forwardedHeaders['cookie'] = cookieHeader
    }

    const tasks = parserConfigs.map((parserConfig: Partial<VideoParserConfig>) =>
      runSingleCheck(endpoint, parserConfig, sampleUrl, forwardedHeaders)
    )
    const items = await Promise.all(tasks)

    const sortedItems = [...items].sort((a, b) => {
      if (a.healthy !== b.healthy) return a.healthy ? -1 : 1
      if (a.logicalSuccess !== b.logicalSuccess) return a.logicalSuccess ? -1 : 1
      return a.latencyMs - b.latencyMs
    })

    return NextResponse.json({
      success: true,
      data: {
        checkedAt: new Date().toISOString(),
        items: sortedItems,
        recommendedParserIds: sortedItems.map(item => item.parserId),
      },
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '批量健康检测执行失败',
    }, { status: 500 })
  }
}

async function runSingleCheck(
  endpoint: string,
  parserConfig: Partial<VideoParserConfig>,
  sampleUrl: string,
  forwardedHeaders: Record<string, string>
): Promise<MatrixItem> {
  const parserId = parserConfig.id || `parser_${Math.random().toString(36).slice(2, 8)}`
  const parserName = parserConfig.name || '未命名解析器'
  const parserUrl = parserConfig.apiUrl || ''
  const started = Date.now()

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...forwardedHeaders,
      },
      body: JSON.stringify({
        parserConfig,
        sampleUrl,
      }),
    })
    const payload = await response.json()
    const data = payload?.data || {}
    const healthy = Boolean(data.healthy)
    const logicalSuccess = Boolean(data.logicalSuccess)
    const status = Number(data.status ?? response.status ?? 0)
    const latencyMs = Number(data.latencyMs ?? (Date.now() - started))
    const normalizedMessage = data.normalizedMessage || payload?.normalizedMessage || data.message || payload?.error || ''
    const errorClass = data.errorClass
      || payload?.errorClass
      || (healthy ? undefined : classifyParserFailure({ status, message: normalizedMessage }))

    return {
      parserId,
      parserName: data.parserName || parserName,
      parserUrl: data.parserUrl || parserUrl,
      healthy,
      logicalSuccess,
      status,
      latencyMs,
      message: data.message || payload?.error || normalizedMessage || '检测完成',
      normalizedMessage: normalizedMessage || data.message || payload?.error || '检测完成',
      errorClass,
      traceId: data.traceId || payload?.traceId || createTraceId(),
      checkedAt: data.checkedAt || new Date().toISOString(),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      parserId,
      parserName,
      parserUrl,
      healthy: false,
      logicalSuccess: false,
      status: 0,
      latencyMs: Date.now() - started,
      message,
      normalizedMessage: message,
      errorClass: classifyParserFailure({ error, message }),
      traceId: createTraceId(),
      checkedAt: new Date().toISOString(),
    }
  }
}

function createTraceId() {
  try {
    return crypto.randomUUID()
  } catch {
    return `trace_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  }
}
