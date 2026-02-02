// Central switch for all Supabase-related features.
const isTruthyEnv = (value: string | undefined) => {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on'
}

export const SUPABASE_ENABLED =
  isTruthyEnv(process.env.NEXT_PUBLIC_ENABLE_SUPABASE) ||
  isTruthyEnv(process.env.NEXT_PUBLIC_ENABLE_SUPABASE_AUTH) ||
  isTruthyEnv(process.env.ENABLE_SUPABASE) ||
  isTruthyEnv(process.env.ENABLE_SUPABASE_AUTH)

export function assertSupabaseEnabled(message = 'Supabase 功能已暂时禁用') {
  if (!SUPABASE_ENABLED) {
    throw new Error(message)
  }
}
