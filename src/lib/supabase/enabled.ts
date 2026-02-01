// Central switch for all Supabase-related features.
export const SUPABASE_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_SUPABASE === 'true' ||
  process.env.NEXT_PUBLIC_ENABLE_SUPABASE_AUTH === 'true'

export function assertSupabaseEnabled(message = 'Supabase 功能已暂时禁用') {
  if (!SUPABASE_ENABLED) {
    throw new Error(message)
  }
}
