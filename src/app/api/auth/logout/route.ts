import { NextRequest, NextResponse } from 'next/server'
import { signOut } from '@/lib/supabase/auth-server'
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
    await signOut()

    return respond({
      success: true,
      message: '登出成功'
    })

  } catch (error) {
    console.error('登出失败:', error)
    
    const errorMessage = error instanceof Error ? error.message : '登出失败'
    
    return respond(
      { error: errorMessage },
      { status: 500 }
    )
  }
}
