import 'server-only'
import type { User } from '@supabase/supabase-js'
import { createClient } from './server'
import type { ServerCookieStore } from './server-cookies'

// {{ AURA: Add - 服务端专用认证工具，仅在 Next.js API/Server Components 使用 }}

// 获取当前用户
export async function getCurrentUser(
  request?: Request,
  cookieStore?: ServerCookieStore
): Promise<User | null> {
  const supabase = createClient(request, cookieStore)
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// 获取用户会话
export async function getCurrentSession(
  request?: Request,
  cookieStore?: ServerCookieStore
) {
  const supabase = createClient(request, cookieStore)
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

// 用户注册
export async function signUp(
  email: string,
  password: string,
  request?: Request,
  cookieStore?: ServerCookieStore
) {
  const supabase = createClient(request, cookieStore)
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
export async function signIn(
  email: string,
  password: string,
  request?: Request,
  cookieStore?: ServerCookieStore
) {
  const supabase = createClient(request, cookieStore)
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
export async function signOut(request?: Request, cookieStore?: ServerCookieStore) {
  const supabase = createClient(request, cookieStore)
  const { error } = await supabase.auth.signOut()

  if (error) {
    throw new Error(error.message)
  }
}

// 重置密码
export async function resetPassword(email: string) {
  const supabase = createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email)

  if (error) {
    throw new Error(error.message)
  }
}

// 更新密码
export async function updatePassword(newPassword: string) {
  const supabase = createClient()
  const { error } = await supabase.auth.updateUser({
    password: newPassword
  })

  if (error) {
    throw new Error(error.message)
  }
}
