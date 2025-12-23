import { NextRequest, NextResponse } from 'next/server'
import { signOut } from '@/lib/supabase/auth-server'
import { createServerCookieStore } from '@/lib/supabase/server-cookies'

export async function POST(request: NextRequest) {
  const cookieStore = createServerCookieStore(request)
  const respond = (body: unknown, init?: ResponseInit) => {
    const response = NextResponse.json(body, init)
    cookieStore.applyToResponse(response)
    return response
  }

  try {
    await signOut(request, cookieStore)

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