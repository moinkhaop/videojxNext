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
    const email = typeof body?.email === 'string' ? body.email.trim() : ''
    const password = typeof body?.password === 'string' ? body.password : ''

    if (!email || !password) {
      return extensionJson(
        { success: false, error: '邮箱和密码不能为空' },
        { status: 400 }
      )
    }

    const supabase = createClient()
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      return extensionJson(
        { success: false, error: error.message || '登录失败' },
        { status: 400 }
      )
    }

    if (!data.session?.access_token || !data.session.refresh_token) {
      return extensionJson(
        { success: false, error: '登录成功但会话无效，请重试' },
        { status: 500 }
      )
    }

    return extensionJson({
      success: true,
      user: data.user,
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
      { success: false, error: error instanceof Error ? error.message : '登录失败' },
      { status: 500 }
    )
  }
}
