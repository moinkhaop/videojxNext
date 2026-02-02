import { NextResponse } from 'next/server'
import type { NextRequest, NextResponse as NextResponseType } from 'next/server'

// 受保护的路由列表
const protectedRoutes = [
  '/convert',
  '/batch',
  '/history',
  '/settings',
  '/settings/webdav',
  '/settings/parsers',
  '/settings/cleanup',
  '/settings/profile',
  '/settings/security'
]

// 认证相关的路由（不需要重定向）
const authRoutes = [
  '/auth/login',
  '/auth/register'
]

// 临时开关：禁用 Supabase 认证
const SUPABASE_AUTH_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_SUPABASE_AUTH === 'true' ||
  process.env.ENABLE_SUPABASE_AUTH === 'true'

function hasSupabaseAuthCookie(request: NextRequest) {
  const cookieNames = request.cookies.getAll().map(cookie => cookie.name)

  return cookieNames.some(name => {
    if (name === 'supabase-auth-token') return true
    if (name.startsWith('sb-') && name.includes('auth-token')) return true
    if (name.startsWith('sb-') && name.includes('access-token')) return true
    if (name.startsWith('sb-') && name.includes('refresh-token')) return true
    return false
  })
}

export async function middleware(request: NextRequest) {
  if (!SUPABASE_AUTH_ENABLED) {
    return NextResponse.next()
  }

  const { pathname } = request.nextUrl

  // 仅对需要认证的路由进行 Supabase 会话校验
  const isProtectedRoute = protectedRoutes.some(route =>
    pathname.startsWith(route)
  )
  const isAuthRoute = authRoutes.some(route =>
    pathname.startsWith(route)
  )

  if (!isProtectedRoute && !isAuthRoute) {
    return NextResponse.next()
  }

  const hasSession = hasSupabaseAuthCookie(request)

  if (isProtectedRoute && !hasSession) {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }

  if (isAuthRoute && hasSession) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - robots.txt (robots file)
    */
    '/((?!api|_next/static|_next/image|favicon.ico|robots.txt).*)',
  ],
}
