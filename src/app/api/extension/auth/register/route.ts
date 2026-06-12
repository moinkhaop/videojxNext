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

    if (password.length < 6) {
      return extensionJson(
        { success: false, error: '密码长度至少为6位' },
        { status: 400 }
      )
    }

    const supabase = createClient()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) {
      const message = error.message || '注册失败'
      const normalized = message.toLowerCase()
      if (normalized.includes('user already registered')) {
        return extensionJson(
          { success: false, error: '该邮箱已注册，请直接登录' },
          { status: 409 }
        )
      }

      return extensionJson(
        { success: false, error: message },
        { status: 400 }
      )
    }

    return extensionJson({
      success: true,
      message: '注册成功，请检查邮箱完成验证',
      user: data.user ?? null,
      requiresEmailVerification: !data.session,
    })
  } catch (error) {
    return extensionJson(
      { success: false, error: error instanceof Error ? error.message : '注册失败' },
      { status: 500 }
    )
  }
}
