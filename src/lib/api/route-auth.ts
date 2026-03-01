import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import { createServerCookieStore } from '@/lib/supabase/server-cookies'
import { getCurrentUser } from '@/lib/supabase/auth-server'
import { extractBearerToken, getUserByAccessToken } from '@/lib/supabase/extension'

export type RouteAuthContext = {
  userId: string
  via: 'bearer' | 'cookie'
}

type RouteAuthResult =
  | { ok: true; context: RouteAuthContext }
  | { ok: false; response: NextResponse }

function unauthorizedResponse(message = '登录状态无效，请先登录') {
  return NextResponse.json(
    {
      success: false,
      error: message,
    },
    { status: 401 }
  )
}

export async function requireRouteAuth(request: NextRequest): Promise<RouteAuthResult> {
  const bearerToken = extractBearerToken(request)
  if (bearerToken) {
    const user = await getUserByAccessToken(bearerToken)
    if (user?.id) {
      return {
        ok: true,
        context: {
          userId: user.id,
          via: 'bearer',
        },
      }
    }
  }

  const cookieStore = createServerCookieStore(request)
  const cookieUser = await getCurrentUser(request, cookieStore)
  if (cookieUser?.id) {
    return {
      ok: true,
      context: {
        userId: cookieUser.id,
        via: 'cookie',
      },
    }
  }

  return {
    ok: false,
    response: unauthorizedResponse(),
  }
}
