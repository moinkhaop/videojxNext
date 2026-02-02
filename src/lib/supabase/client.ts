import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { assertSupabaseEnabled } from './enabled'
import type { Database } from './database.types'

// 创建客户端 Supabase 实例（用于浏览器环境）
type BrowserClient = ReturnType<typeof createSupabaseClient<Database>>

let cachedClient: BrowserClient | null = null

export const createClient = (): BrowserClient => {
  assertSupabaseEnabled()

  if (cachedClient) {
    return cachedClient
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('缺少 Supabase 环境变量：NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }

  const browserStorage = typeof window !== 'undefined' ? window.localStorage : undefined

  cachedClient = createSupabaseClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: {
      // Some Kong setups expect a different API key header name; keep `apikey` (default) and add a fallback.
      headers: {
        'x-api-key': supabaseAnonKey,
      },
    },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: browserStorage,
      userStorage: browserStorage,
    },
  })

  return cachedClient
}

// 导出一个懒加载的代理，避免模块加载时就强制初始化。
export const supabase = new Proxy({} as any, {
  get(_target, prop) {
    return (createClient() as any)[prop]
  },
})
