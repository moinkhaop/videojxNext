import 'server-only'
import { createClient } from './server'
import type { ServerCookieStore } from './server-cookies'

// 更新用户元数据（姓名、头像等）
export async function updateUserMetadata(updates: {
  full_name?: string
  avatar_url?: string
}, request?: Request, cookieStore?: ServerCookieStore) {
  const supabase = createClient(request, cookieStore)
  
  const { data, error } = await supabase.auth.updateUser({
    data: updates
  })

  if (error) {
    throw new Error(error.message)
  }

  return data
}

// 更新用户密码
export async function updateUserPassword(
  newPassword: string,
  request?: Request,
  cookieStore?: ServerCookieStore
) {
  const supabase = createClient(request, cookieStore)
  
  const { data, error } = await supabase.auth.updateUser({
    password: newPassword
  })

  if (error) {
    throw new Error(error.message)
  }

  return data
}

