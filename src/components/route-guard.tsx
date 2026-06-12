'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import { SUPABASE_ENABLED } from '@/lib/supabase/enabled'

const protectedPrefixes = [
  '/convert',
  '/batch',
  '/history',
  '/settings',
]

export function RouteGuard() {
  const { user, loading } = useAuth()
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (!SUPABASE_ENABLED) return
    if (loading) return

    const isAuthRoute = pathname.startsWith('/auth/')
    const isProtected = protectedPrefixes.some(prefix => pathname.startsWith(prefix))

    if (isProtected && !user) {
      router.replace('/auth/login')
      return
    }

    if (isAuthRoute && user) {
      router.replace('/')
    }
  }, [loading, pathname, router, user])

  return null
}

