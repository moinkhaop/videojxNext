import { NextRequest } from 'next/server'
import {
  ensureSupabaseEnabled,
  extensionJson,
  extensionOptionsResponse,
  requireExtensionAuth,
} from '../_shared'

export const runtime = 'nodejs'

export async function OPTIONS() {
  return extensionOptionsResponse()
}

export async function POST(request: NextRequest) {
  const unavailable = ensureSupabaseEnabled()
  if (unavailable) {
    return unavailable
  }

  const auth = await requireExtensionAuth(request)
  if (!auth.ok) {
    return auth.response
  }

  try {
    const rawBody = await request.text()
    const authorization = request.headers.get('authorization') || request.headers.get('Authorization') || ''
    const upstreamUrl = new URL('/api/douyin/user', request.url)

    const response = await fetch(upstreamUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authorization ? { Authorization: authorization } : {}),
      },
      body: rawBody,
    })

    const text = await response.text()
    let payload: any = null
    try {
      payload = text ? JSON.parse(text) : {}
    } catch {
      payload = { success: false, error: text || '用户主页接口返回非JSON内容' }
    }

    return extensionJson(payload, { status: response.status })
  } catch (error) {
    return extensionJson(
      { success: false, error: error instanceof Error ? error.message : '扩展用户主页接口调用失败' },
      { status: 500 }
    )
  }
}
