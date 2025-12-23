// TODO: 暂时注释 Supabase 认证功能
// import type { User } from '@supabase/supabase-js'
// import { createClient } from './client'

// {{ AURA: Add - 客户端专用认证工具，仅在浏览器环境使用 }}

// 获取当前用户
export async function getCurrentUser(): Promise<null> {
  // TODO: Supabase 功能已禁用
  return null
  /*
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
  */
}

// 获取用户会话
export async function getCurrentSession() {
  // TODO: Supabase 功能已禁用
  return null
  /*
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session
  */
}

// 监听认证状态变化
export function onAuthStateChange(callback: (event: string, session: any) => void) {
  // TODO: Supabase 功能已禁用
  return { data: { subscription: { unsubscribe: () => {} } } }
  /*
  const supabase = createClient()
  return supabase.auth.onAuthStateChange(callback)
  */
}
