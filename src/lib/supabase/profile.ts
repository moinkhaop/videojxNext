import 'server-only'

// TODO: 暂时注释 Supabase 用户资料相关功能。

export async function updateUserMetadata(
  _updates: { full_name?: string; avatar_url?: string },
  _request?: Request,
  _cookieStore?: unknown
) {
  throw new Error('Supabase 功能已暂时禁用，请稍后再试')
}

export async function updateUserPassword(
  _newPassword: string,
  _request?: Request,
  _cookieStore?: unknown
) {
  throw new Error('Supabase 功能已暂时禁用，请稍后再试')
}
