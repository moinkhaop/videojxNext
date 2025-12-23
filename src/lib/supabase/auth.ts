import type { SupabaseClient, User } from '@supabase/supabase-js'
import { createClient as createBrowserClient } from './client'

// 根据运行环境选择合适的 Supabase 客户端
const getSupabaseClient = async (): Promise<SupabaseClient> => {
  if (typeof window === 'undefined') {
    // 服务器环境：动态导入服务端客户端，避免被打包到浏览器端
    const { createClient: createServerClient } = await import('./server')
    return await createServerClient()
  }

  // 浏览器环境：直接使用浏览器客户端
  return createBrowserClient()
}

// 浏览器专用客户端，用于 auth 状态监听
const getBrowserClient = (): SupabaseClient => {
  if (typeof window === 'undefined') {
    throw new Error('onAuthStateChange 仅能在浏览器环境中使用')
  }

  const client = createBrowserClient()
  return client
}

// 获取当前用户
export async function getCurrentUser(): Promise<User | null> {
  const supabase = await getSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// 获取用户会话
export async function getCurrentSession() {
  const supabase = await getSupabaseClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

// 用户注册
export async function signUp(email: string, password: string) {
  const supabase = await getSupabaseClient()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  })

  if (error) {
    throw new Error(error.message)
  }

  return data
}

// 用户登录
export async function signIn(email: string, password: string) {
  const supabase = await getSupabaseClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    throw new Error(error.message)
  }

  return data
}

// 用户登出
export async function signOut() {
  const supabase = await getSupabaseClient()
  const { error } = await supabase.auth.signOut()

  if (error) {
    throw new Error(error.message)
  }
}

// 重置密码
export async function resetPassword(email: string) {
  const supabase = await getSupabaseClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email)

  if (error) {
    throw new Error(error.message)
  }
}

// 更新密码
export async function updatePassword(newPassword: string) {
  const supabase = await getSupabaseClient()
  const { error } = await supabase.auth.updateUser({
    password: newPassword
  })

  if (error) {
    throw new Error(error.message)
  }
}

// 监听认证状态变化
export function onAuthStateChange(callback: (event: string, session: any) => void) {
  const supabase = getBrowserClient()

  return supabase.auth.onAuthStateChange(callback)
}