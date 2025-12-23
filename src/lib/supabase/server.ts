// TODO: 暂时注释 Supabase 服务端功能
/*
import { createServerClient } from '@supabase/ssr'
import { createServerCookieStore, ServerCookieStore } from './server-cookies'

// {{ AURA: Modify - 支持完整的 Supabase Cookie 生命周期处理 }}
export function createClient(request?: Request, cookieStore?: ServerCookieStore) {
  const store = cookieStore ?? (request ? createServerCookieStore(request) : undefined)
  const fallbackState = parseCookieHeader(request?.headers.get('cookie') ?? null)

  const cookies = {
    async get(name: string) {
      return store ? store.get(name) : fallbackState.get(name)
    },
    async set(name: string, value: string, options?: Parameters<ServerCookieStore['set']>[2]) {
      if (store) {
        store.set(name, value, options)
        return
      }
      fallbackState.set(name, value)
    },
    async remove(name: string, options?: Parameters<ServerCookieStore['remove']>[1]) {
      if (store) {
        store.remove(name, options)
        return
      }
      fallbackState.delete(name)
    },
  }

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies,
    }
  )
}

function parseCookieHeader(header: string | null) {
  const map = new Map<string, string>()

  if (!header) {
    return map
  }

  const segments = header.split(';')
  for (const segment of segments) {
    const trimmed = segment.trim()
    if (!trimmed) {
      continue
    }

    const equalIndex = trimmed.indexOf('=')
    if (equalIndex === -1) {
      continue
    }

    const name = trimmed.slice(0, equalIndex)
    const rawValue = trimmed.slice(equalIndex + 1)
    const decodedValue = safelyDecodeCookieValue(rawValue)
    map.set(name, decodedValue)
  }

  return map
}

function safelyDecodeCookieValue(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
*/

// 临时导出空函数，防止编译错误
export function createClient() {
  throw new Error('Supabase 服务端功能已暂时禁用')
}