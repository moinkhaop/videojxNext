import 'server-only'

import type { ServerCookieStore } from './server-cookies'
import { createClient } from './server'

const MAX_FULL_NAME_LENGTH = 64
const MAX_AVATAR_URL_LENGTH = 1024

function sanitizeMetadataUpdates(updates: { full_name?: string; avatar_url?: string }) {
  const next: Record<string, string> = {}

  if (typeof updates.full_name === 'string') {
    next.full_name = updates.full_name.trim().slice(0, MAX_FULL_NAME_LENGTH)
  }

  if (typeof updates.avatar_url === 'string') {
    const avatarUrl = updates.avatar_url.trim()

    if (!avatarUrl) {
      next.avatar_url = ''
    } else {
      if (avatarUrl.startsWith('data:')) {
        throw new Error('头像地址不能使用 data URL，请使用 Supabase Storage 公网地址')
      }
      if (!/^https?:\/\//i.test(avatarUrl)) {
        throw new Error('头像地址必须是 http/https URL')
      }
      if (avatarUrl.length > MAX_AVATAR_URL_LENGTH) {
        throw new Error('头像地址长度超过限制')
      }
      next.avatar_url = avatarUrl
    }
  }

  if (Object.keys(next).length === 0) {
    throw new Error('没有可更新的资料字段')
  }

  return next
}

export async function updateUserMetadata(
  updates: { full_name?: string; avatar_url?: string },
  request?: Request,
  cookieStore?: ServerCookieStore
) {
  const safeUpdates = sanitizeMetadataUpdates(updates)
  const supabase = createClient(request, cookieStore)
  const { data, error } = await supabase.auth.updateUser({
    data: safeUpdates,
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
