import { NextRequest, NextResponse } from 'next/server'
import { signIn } from '@/lib/supabase/auth-server'
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

    const data = await signIn(email, password, request, cookieStore)

    return respond({
      success: true,
      message: '登录成功',
      user: data.user
    })

  } catch (error) {
    console.error('[API] 登录失败:', error)
    
    const errorMessage = error instanceof Error ? error.message : '登录失败'
    
    return respond(
      { error: errorMessage },
      { status: 400 }
    )
  }
}
