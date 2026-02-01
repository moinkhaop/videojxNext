import 'server-only'

import type { ServerCookieStore } from './server-cookies'
import { createClient } from './server'

export async function updateUserMetadata(
  updates: { full_name?: string; avatar_url?: string },
  request?: Request,
  cookieStore?: ServerCookieStore
) {
  const supabase = createClient(request, cookieStore)
  const { data, error } = await supabase.auth.updateUser({
    data: updates,
  })
  if (error) {
    throw error
  }
  return data
}

export async function updateUserPassword(
  newPassword: string,
  request?: Request,
  cookieStore?: ServerCookieStore
) {
  const supabase = createClient(request, cookieStore)
  const { data, error } = await supabase.auth.updateUser({
    password: newPassword,
  })
  if (error) {
    throw error
  }
  return data
}
