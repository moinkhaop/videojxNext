import { NextResponse } from 'next/server'
import type { NextRequest, NextResponse as NextResponseType } from 'next/server'
// TODO: 暂时注释 Supabase 功能
// import { createServerClient } from '@supabase/ssr'

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
const SUPABASE_AUTH_ENABLED = false // process.env.NEXT_PUBLIC_ENABLE_SUPABASE_AUTH === 'true'

export async function middleware(request: NextRequest) {
  // TODO: 暂时完全禁用 Supabase 认证
  return NextResponse.next()

  /* 原有的 Supabase 认证逻辑
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

  const response = NextResponse.next()

  // {{ AURA: Add - 归一化中间件的 Cookie 选项，避免本地 secure cookie 丢失 }}
  const normalizeCookieOptions = (options: any = {}) => {
    const normalized = { ...options }

    if (!normalized.path) {
      normalized.path = '/'
    }

    if (!normalized.sameSite) {
      normalized.sameSite = 'lax'
    }

    if (process.env.NODE_ENV !== 'production') {
      normalized.secure = false
    }

    return normalized
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          const normalized = normalizeCookieOptions(options)
          response.cookies.set({ name, value, ...normalized })
        },
        remove(name: string, options: any) {
          const normalized = normalizeCookieOptions(options)
          response.cookies.set({ name, value: '', ...normalized, expires: new Date(0) })
        },
      },
    }
  )

  const copyCookies = (targetResponse: NextResponseType) => {
    response.cookies.getAll().forEach(cookie => {
      targetResponse.cookies.set(cookie)
    })
  }

  try {
    const { data: { session } } = await supabase.auth.getSession()

    if (isProtectedRoute && !session) {
      const loginUrl = new URL('/auth/login', request.url)
      const redirectResponse = NextResponse.redirect(loginUrl)
      copyCookies(redirectResponse)
      return redirectResponse
    }

    if (isAuthRoute && session) {
      const homeUrl = new URL('/', request.url)
      const redirectResponse = NextResponse.redirect(homeUrl)
      copyCookies(redirectResponse)
      return redirectResponse
    }

    return response
  } catch (error) {
    console.error('中间件认证检查失败:', error)

    if (isProtectedRoute) {
      const loginUrl = new URL('/auth/login', request.url)
      const redirectResponse = NextResponse.redirect(loginUrl)
      copyCookies(redirectResponse)
      return redirectResponse
    }

    return response
  }
  */
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
