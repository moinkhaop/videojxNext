import { NextRequest, NextResponse } from 'next/server'
import { SUPABASE_ENABLED } from '@/lib/supabase/enabled'
import {
  createExtensionTokenClient,
  extractBearerToken,
  getUserByAccessToken,
} from '@/lib/supabase/extension'

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
}

type JsonInit = ResponseInit & {
  headers?: HeadersInit
}

export type ExtensionAuthContext = {
  accessToken: string
  userId: string
  client: ReturnType<typeof createExtensionTokenClient>
}

export function extensionJson(body: unknown, init: JsonInit = {}) {
  const response = NextResponse.json(body, init)
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    response.headers.set(key, value)
  }
  return response
}

export function extensionOptionsResponse() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  })
}

export function ensureSupabaseEnabled() {
  if (!SUPABASE_ENABLED) {
    return extensionJson(
      { success: false, error: 'Supabase 功能已暂时禁用' },
      { status: 503 }
    )
  }
  return null
}

export async function requireExtensionAuth(request: NextRequest): Promise<
  | { ok: true; context: ExtensionAuthContext }
  | { ok: false; response: NextResponse }
> {
  const accessToken = extractBearerToken(request)
  if (!accessToken) {
    return {
      ok: false,
      response: extensionJson(
        { success: false, error: '缺少 Authorization Bearer Token' },
        { status: 401 }
      ),
    }
  }

  const user = await getUserByAccessToken(accessToken)
  if (!user?.id) {
    return {
      ok: false,
      response: extensionJson(
        { success: false, error: '登录状态无效，请重新登录' },
        { status: 401 }
      ),
    }
  }

  return {
    ok: true,
    context: {
      accessToken,
      userId: user.id,
      client: createExtensionTokenClient(accessToken),
    },
  }
}
