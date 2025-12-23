// Central switch to disable all Supabase-related features.
// Keep default OFF until you intentionally enable it.

export const SUPABASE_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_SUPABASE === 'true' ||
  process.env.NEXT_PUBLIC_ENABLE_SUPABASE_AUTH === 'true'

export function assertSupabaseEnabled(message = 'Supabase 功能已暂时禁用') {
  if (!SUPABASE_ENABLED) {
    throw new Error(message)
  }
}

