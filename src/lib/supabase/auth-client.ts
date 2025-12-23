import type { User } from '@supabase/supabase-js'
import { createClient } from './client'

// {{ AURA: Add - 客户端专用认证工具，仅在浏览器环境使用 }}

// 获取当前用户
export async function getCurrentUser(): Promise<User | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// 获取用户会话
export async function getCurrentSession() {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

// 监听认证状态变化
export function onAuthStateChange(callback: (event: string, session: any) => void) {
  const supabase = createClient()
  return supabase.auth.onAuthStateChange(callback)
}
