// Central switch for all Supabase-related features.
const isTruthyEnv = (value: string | undefined) => {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on'
}

const isFalsyEnv = (value: string | undefined) => {
  if (value == null) return false
  const normalized = value.trim().toLowerCase()
  return normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off'
}

const hasSupabaseKeys = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

const explicitlyDisabled =
  isFalsyEnv(process.env.NEXT_PUBLIC_ENABLE_SUPABASE) ||
  isFalsyEnv(process.env.NEXT_PUBLIC_ENABLE_SUPABASE_AUTH) ||
  isFalsyEnv(process.env.ENABLE_SUPABASE) ||
  isFalsyEnv(process.env.ENABLE_SUPABASE_AUTH)

export const SUPABASE_ENABLED =
  !explicitlyDisabled &&
  (isTruthyEnv(process.env.NEXT_PUBLIC_ENABLE_SUPABASE) ||
    isTruthyEnv(process.env.NEXT_PUBLIC_ENABLE_SUPABASE_AUTH) ||
    isTruthyEnv(process.env.ENABLE_SUPABASE) ||
    isTruthyEnv(process.env.ENABLE_SUPABASE_AUTH) ||
    hasSupabaseKeys)

export function assertSupabaseEnabled(message = 'Supabase 功能已暂时禁用') {
  if (!SUPABASE_ENABLED) {
    throw new Error(message)
  }
}
