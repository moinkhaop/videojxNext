import { createBrowserClient, type CookieOptions } from '@supabase/ssr'
import { assertSupabaseEnabled } from './enabled'

// 统一构造 cookie 字符串，避免重复拼接逻辑
const buildCookieString = (name: string, value: string, options: CookieOptions = {}): string => {
  const segments: string[] = [`${name}=${value}`]
  const { maxAge, expires, path, domain, sameSite, secure } = options

  if (typeof maxAge !== 'undefined') {
    segments.push(`Max-Age=${Math.floor(maxAge)}`)
  }

  if (expires) {
    const expiresDate = expires instanceof Date ? expires : new Date(expires)
    if (!Number.isNaN(expiresDate.getTime())) {
      segments.push(`Expires=${expiresDate.toUTCString()}`)
    }
  }

  segments.push(`Path=${path ?? '/'}`)

  if (domain) {
    segments.push(`Domain=${domain}`)
  }

  if (sameSite !== undefined) {
    let sameSiteValue: string | undefined
    if (typeof sameSite === 'string') {
      const normalized = sameSite.toLowerCase()
      if (['lax', 'strict', 'none'].includes(normalized)) {
        sameSiteValue = normalized.charAt(0).toUpperCase() + normalized.slice(1)
      }
    } else if (sameSite === true) {
      sameSiteValue = 'Strict'
    }

    if (sameSiteValue) {
      segments.push(`SameSite=${sameSiteValue}`)
    }
  }

  if (secure) {
    segments.push('Secure')
  }

  return segments.join('; ')
}

// {{ AURA: Add - 归一化浏览器 Cookie 配置，确保本地开发环境可写入 }}
const normalizeBrowserCookieOptions = (options: CookieOptions = {}): CookieOptions => {
  const normalized: CookieOptions = { ...options }

  if (!normalized.path) {
    normalized.path = '/'
  }

  if (!normalized.sameSite) {
    normalized.sameSite = 'lax'
  }

  if (typeof window !== 'undefined' && window.location.protocol !== 'https:') {
    normalized.secure = false
  }

  return normalized
}

// 创建客户端 Supabase 实例（用于浏览器环境）
let cachedClient: ReturnType<typeof createBrowserClient> | null = null

export const createClient = () => {
  assertSupabaseEnabled()

  if (cachedClient) {
    return cachedClient
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('缺少 Supabase 环境变量：NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }

  cachedClient = createBrowserClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        // {{ AURA: Modify - 仅在浏览器读取 cookie 值 }}
        get(key: string) {
          if (typeof document === 'undefined') {
            return null
          }

          const rawCookie = document.cookie
            .split('; ')
            .find(cookie => cookie.startsWith(`${key}=`))

          if (!rawCookie) {
            return null
          }

          const [, value] = rawCookie.split('=')
          return decodeURIComponent(value ?? '')
        },

        // {{ AURA: Modify - 遵循 CookieMethods 的签名写入 cookie }}
        set(key: string, value: string, options?: CookieOptions) {
          if (typeof document === 'undefined') {
            return
          }

          const encodedValue = encodeURIComponent(value)
          const finalOptions = normalizeBrowserCookieOptions(options)
          document.cookie = buildCookieString(key, encodedValue, finalOptions)
        },

        // {{ AURA: Modify - 通过设置过期时间清除 cookie }}
        remove(key: string, options?: CookieOptions) {
          if (typeof document === 'undefined') {
            return
          }

          const removalOptions = normalizeBrowserCookieOptions({
            path: options?.path,
            domain: options?.domain,
            sameSite: options?.sameSite,
            secure: options?.secure,
            expires: new Date(0),
            maxAge: 0
          })

          document.cookie = buildCookieString(key, '', removalOptions)
        }
      }
    }
  )
}

// 导出一个懒加载的代理，避免模块加载时就强制初始化。
export const supabase = new Proxy({} as any, {
  get(_target, prop) {
    return (createClient() as any)[prop]
  },
})
