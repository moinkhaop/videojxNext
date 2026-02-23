import { createClient as createSupabaseClient, type User } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { assertSupabaseEnabled } from './enabled'

type TokenClient = ReturnType<typeof createSupabaseClient<Database>>

function getSupabasePublicEnv() {
  assertSupabaseEnabled()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('缺少 Supabase 环境变量：NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }

  return {
    supabaseUrl,
    supabaseAnonKey,
  }
}

export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') || request.headers.get('Authorization')
  if (!header) {
    return null
  }

  const matched = header.match(/^Bearer\s+(.+)$/i)
  if (!matched?.[1]) {
    return null
  }

  return matched[1].trim()
}

export function createExtensionTokenClient(accessToken: string): TokenClient {
  const { supabaseUrl, supabaseAnonKey } = getSupabasePublicEnv()

  return createSupabaseClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: supabaseAnonKey,
        'x-api-key': supabaseAnonKey,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}

export async function getUserByAccessToken(accessToken: string): Promise<User | null> {
  const { supabaseUrl, supabaseAnonKey } = getSupabasePublicEnv()

  const client = createSupabaseClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })

  const { data, error } = await client.auth.getUser(accessToken)
  if (error) {
    return null
  }

  return data.user ?? null
}
