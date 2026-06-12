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

  const fetchWithRetry: typeof fetch = async (input, init) => {
    const maxAttempts = 3
    let lastError: unknown = null

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
      const timeout = typeof window !== 'undefined' ? window.setTimeout(() => controller?.abort(), 15000) : null

      try {
        const response = await fetch(input as any, { ...(init as any), signal: controller?.signal })
        if (timeout != null) window.clearTimeout(timeout)
        return response
      } catch (error) {
        if (timeout != null) window.clearTimeout(timeout)
        lastError = error

        const msg = (error as any)?.message ?? ''
        const isTransient =
          error instanceof TypeError ||
          String(msg).includes('Failed to fetch') ||
          String(msg).includes('NetworkError')

        if (!isTransient || attempt === maxAttempts) {
          throw error
        }

        await new Promise(r => setTimeout(r, 250 * attempt))
      }
    }

    throw lastError
  }

  cachedClient = createSupabaseClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: {
      // Some Kong setups expect a different API key header name; keep `apikey` (default) and add a fallback.
      headers: {
        'x-api-key': supabaseAnonKey,
      },
      fetch: fetchWithRetry,
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
