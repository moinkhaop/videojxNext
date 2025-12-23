import { NextRequest, NextResponse } from 'next/server'
import { signIn } from '@/lib/supabase/auth-server'
import { createServerCookieStore } from '@/lib/supabase/server-cookies'

export async function POST(request: NextRequest) {
  const cookieStore = createServerCookieStore(request)
  const respond = (body: unknown, init?: ResponseInit) => {
    const response = NextResponse.json(body, init)
    cookieStore.applyToResponse(response)
    return response
  }

  try {
    console.log('[API] 收到登录请求')
    const { email, password } = await request.json()
    console.log('[API] 登录邮箱:', email)

    if (!email || !password) {
      console.error('[API] 参数不完整')
      return respond(
        { error: '邮箱和密码不能为空' },
        { status: 400 }
      )
    }

    console.log('[API] 调用 Supabase 登录...')
    const data = await signIn(email, password, request, cookieStore)
    console.log('[API] 登录成功，用户ID:', data.user?.id)

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