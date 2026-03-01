'use client'

import { useEffect } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { SUPABASE_ENABLED } from '@/lib/supabase/enabled'
import { hydrateFromSupabase } from '@/lib/storage/cloud-sync'

export function StorageInitializer({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  useEffect(() => {
    if (!SUPABASE_ENABLED) {
      console.log('[StorageInitializer] 初始化完成')
      return
    }

    if (loading) {
      return
    }

    if (!user) {
      console.log('[StorageInitializer] 未登录，跳过云端同步')
      return
    }

    let active = true
    let syncing = false

    const runHydrate = async () => {
      if (!active || syncing) {
        return
      }
      syncing = true
      try {
        await hydrateFromSupabase()
        console.log('[StorageInitializer] 云端同步完成')
      } finally {
        syncing = false
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        return
      }
      void runHydrate()
    }

    void runHydrate()
    window.addEventListener('focus', runHydrate)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      active = false
      window.removeEventListener('focus', runHydrate)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [loading, user?.id])

  return <>{children}</>
}
