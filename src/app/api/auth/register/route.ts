import { NextRequest, NextResponse } from 'next/server'
import { signUp } from '@/lib/supabase/auth-server'
import { createServerCookieStore } from '@/lib/supabase/server-cookies'
import { SUPABASE_ENABLED } from '@/lib/supabase/enabled'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  if (!SUPABASE_ENABLED) {
    return NextResponse.json(
      { error: 'Supabase 功能已暂时禁用' },
      { status: 503 }
    )
  }

  const cookieStore = createServerCookieStore(request)
  const respond = (body: unknown, init?: ResponseInit) => {
    const response = NextResponse.json(body, init)
    cookieStore.applyToResponse(response)
    return response
  }

  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return respond(
        { error: '邮箱和密码不能为空' },
        { status: 400 }
      )
    }

    if (password.length < 6) {
      return respond(
        { error: '密码长度至少为6位' },
        { status: 400 }
      )
    }

    const data = await signUp(email, password, request, cookieStore)

    return respond({
      success: true,
      message: '注册成功，请检查邮箱进行验证',
      user: data.user
    })

  } catch (error) {
    console.error('注册失败:', error)
    
    const errorMessage = error instanceof Error ? error.message : '注册失败'
    const normalizedMessage = errorMessage.toLowerCase()

    if (normalizedMessage.includes('user already registered')) {
      return respond(
        { error: '该邮箱已注册，请直接登录或尝试重置密码' },
        { status: 409 }
      )
    }

    return respond(
      { error: errorMessage },
      { status: 400 }
    )
  }
}
