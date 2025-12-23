// Central switch to disable all Supabase-related features.
// Keep default OFF until you intentionally enable it.

// 临时强制关闭（需要启用时再改回读取 env）。
export const SUPABASE_ENABLED = false
// process.env.NEXT_PUBLIC_ENABLE_SUPABASE === 'true' ||
// process.env.NEXT_PUBLIC_ENABLE_SUPABASE_AUTH === 'true'

export function assertSupabaseEnabled(message = 'Supabase 功能已暂时禁用') {
  if (!SUPABASE_ENABLED) {
    throw new Error(message)
  }
}
