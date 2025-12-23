import { NextRequest, NextResponse } from 'next/server'
import { updateUserMetadata } from '@/lib/supabase/profile'
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
    console.log('[API] 收到更新个人资料请求')
    
    const user = await getCurrentUser()
    if (!user) {
      return respond(
        { error: '用户未登录' },
        { status: 401 }
      )
    }

    const { full_name, avatar_url } = await request.json()
    console.log('[API] 更新数据:', { full_name, avatar_url })

    // TODO: Supabase 功能已禁用
    await updateUserMetadata({
      full_name,
      avatar_url
    }, request, cookieStore)

    console.log('[API] 个人资料更新成功')

    return respond({
      success: true,
      message: '个人资料已更新',
      user: null  // TODO: Supabase 禁用期间返回 null
    })

  } catch (error) {
    console.error('[API] 更新个人资料失败:', error)
    
    const errorMessage = error instanceof Error ? error.message : '更新失败'
    
    return respond(
      { error: errorMessage },
      { status: 400 }
    )
  }
}
