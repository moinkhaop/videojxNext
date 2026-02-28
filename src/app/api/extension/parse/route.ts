import { NextRequest } from 'next/server'
import { extensionJson, extensionOptionsResponse } from '../_shared'

export const runtime = 'nodejs'

export async function OPTIONS() {
  return extensionOptionsResponse()
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()
    let body: any = null
    try {
      body = rawBody ? JSON.parse(rawBody) : null
    } catch {
      body = null
    }

    const parserConfig = body?.parserConfig
    const parserApiUrl = parserConfig && typeof parserConfig.apiUrl === 'string' ? String(parserConfig.apiUrl).trim() : ''
    const videoUrl = body && typeof body.videoUrl === 'string' ? String(body.videoUrl).trim() : ''

    // If parser points to an internal API route, call it directly instead of going through
    // /api/proxy/parser (which can be more fragile on some platforms).
    if (parserApiUrl && /^\/api\//.test(parserApiUrl)) {
      const urlParamName = parserConfig && typeof parserConfig.urlParamName === 'string' && parserConfig.urlParamName.trim()
        ? parserConfig.urlParamName.trim()
        : 'url'
      const method = String(parserConfig?.requestMethod || '').toUpperCase() === 'GET' ? 'GET' : 'POST'

      const target = new URL(parserApiUrl, request.url)

      let resp: Response
      if (method === 'GET') {
        const query = new URLSearchParams(target.searchParams)
        if (parserConfig?.customQueryParams && typeof parserConfig.customQueryParams === 'object') {
          Object.entries(parserConfig.customQueryParams).forEach(([k, v]) => {
            if (!k) return
            if (v === undefined || v === null) return
            query.set(String(k), String(v))
          })
        }
        query.set(urlParamName, videoUrl)
        target.search = query.toString()

        resp = await fetch(target.toString(), {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
        })
      } else {
        const payload = {
          ...(parserConfig?.customBodyParams && typeof parserConfig.customBodyParams === 'object' ? parserConfig.customBodyParams : {}),
          [urlParamName]: videoUrl,
        }
        resp = await fetch(target.toString(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(payload),
        })
      }

      const text = await resp.text()
      let payload: any = null
      try {
        payload = text ? JSON.parse(text) : {}
      } catch {
        payload = { success: false, error: text || '解析接口返回非JSON内容' }
      }

      return extensionJson(payload, { status: resp.status })
    }

    const upstreamUrl = new URL('/api/proxy/parser', request.url)

    const response = await fetch(upstreamUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: rawBody,
    })

    const text = await response.text()
    let payload: any = null
    try {
      payload = text ? JSON.parse(text) : {}
    } catch {
      payload = { success: false, error: text || '解析接口返回非JSON内容' }
    }

    return extensionJson(payload, { status: response.status })
  } catch (error) {
    return extensionJson(
      { success: false, error: error instanceof Error ? error.message : '扩展解析接口调用失败' },
      { status: 500 }
    )
  }
}
