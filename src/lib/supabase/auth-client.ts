import type { Session, User } from '@supabase/supabase-js'
import { createClient } from './client'
import { SUPABASE_ENABLED } from './enabled'

// {{ AURA: Add - 客户端专用认证工具，仅在浏览器环境使用 }}

// 获取当前用户
export async function getCurrentUser(): Promise<User | null> {
  if (!SUPABASE_ENABLED) {
    return null
  }

  const supabase = createClient()
  // Avoid network fetch to `/auth/v1/user` (some networks/proxies may close the connection).
  // Session already contains the user payload.
  const { data, error } = await supabase.auth.getSession()
  if (error) {
    return null
  }
  return data.session?.user ?? null
}

// 获取用户会话
export async function getCurrentSession(): Promise<Session | null> {
  if (!SUPABASE_ENABLED) {
    return null
  }

  const supabase = createClient()
  const { data, error } = await supabase.auth.getSession()
  if (error) {
    return null
  }
  return data.session
}

// 监听认证状态变化
export function onAuthStateChange(callback: (event: string, session: Session | null) => void) {
  if (!SUPABASE_ENABLED) {
    return { data: { subscription: { unsubscribe: () => {} } } }
  }

  const supabase = createClient()
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(_event, session)
  })
}
