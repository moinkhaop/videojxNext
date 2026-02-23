import { NextRequest } from 'next/server'
import { extensionJson, extensionOptionsResponse } from '../_shared'

export const runtime = 'nodejs'

export async function OPTIONS() {
  return extensionOptionsResponse()
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()
    const upstreamUrl = new URL('/api/proxy/webdav', request.url)

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
      payload = { success: false, error: text || '上传接口返回非JSON内容' }
    }

    return extensionJson(payload, { status: response.status })
  } catch (error) {
    return extensionJson(
      { success: false, error: error instanceof Error ? error.message : '扩展上传接口调用失败' },
      { status: 500 }
    )
  }
}
