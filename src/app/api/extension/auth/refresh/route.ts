import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  ensureSupabaseEnabled,
  extensionJson,
  extensionOptionsResponse,
} from '../../_shared'

export const runtime = 'nodejs'

export async function OPTIONS() {
  return extensionOptionsResponse()
}

export async function POST(request: NextRequest) {
  const unavailable = ensureSupabaseEnabled()
  if (unavailable) {
    return unavailable
  }

  try {
    const body = await request.json()
    const refreshToken = typeof body?.refreshToken === 'string' ? body.refreshToken.trim() : ''

    if (!refreshToken) {
      return extensionJson(
        { success: false, error: '缺少 refreshToken' },
        { status: 400 }
      )
    }

    const supabase = createClient()
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken,
    })

    if (error || !data.session) {
      return extensionJson(
        { success: false, error: error?.message || '刷新会话失败，请重新登录' },
        { status: 401 }
      )
    }

    return extensionJson({
      success: true,
      user: data.user ?? null,
      session: {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at ?? null,
        expiresIn: data.session.expires_in ?? null,
        tokenType: data.session.token_type ?? 'bearer',
      },
    })
  } catch (error) {
    return extensionJson(
      { success: false, error: error instanceof Error ? error.message : '刷新会话失败' },
      { status: 500 }
    )
  }
}
