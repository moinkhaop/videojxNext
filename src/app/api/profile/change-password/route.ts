import { NextRequest, NextResponse } from 'next/server'
import { updateUserPassword } from '@/lib/supabase/profile'
import { getCurrentUser } from '@/lib/supabase/auth-server'
import { createServerCookieStore } from '@/lib/supabase/server-cookies'
import { SUPABASE_ENABLED } from '@/lib/supabase/enabled'

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
    console.log('[API] 收到修改密码请求')
    
    const user = await getCurrentUser()
    if (!user) {
      return respond(
        { error: '用户未登录' },
        { status: 401 }
      )
    }

    const { newPassword } = await request.json()

    if (!newPassword) {
      return respond(
        { error: '新密码不能为空' },
        { status: 400 }
      )
    }

    if (newPassword.length < 6) {
      return respond(
        { error: '密码长度至少为6位' },
        { status: 400 }
      )
    }

    console.log('[API] 更新密码...')

    const data = await updateUserPassword(newPassword, request, cookieStore)

    console.log('[API] 密码修改成功')

    return respond({
      success: true,
      message: '密码已更新，请重新登录'
    })

  } catch (error) {
    console.error('[API] 修改密码失败:', error)
    
    const errorMessage = error instanceof Error ? error.message : '修改密码失败'
    
    return respond(
      { error: errorMessage },
      { status: 400 }
    )
  }
}
