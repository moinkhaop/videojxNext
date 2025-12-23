import type { CookieOptions } from '@supabase/ssr'
import type { NextResponse } from 'next/server'

type ResponseCookieOptions = {
  maxAge?: number
  expires?: Date
  path?: string
  domain?: string
  secure?: boolean
  sameSite?: 'lax' | 'strict' | 'none'
  httpOnly?: boolean
}

// {{ AURA: Add - 服务端 Cookie 存储容器，负责跟踪 Supabase 的读写操作 }}
export class ServerCookieStore {
  private readonly state: Map<string, string>
  private readonly mutations: Array<
    | { type: 'set'; name: string; value: string; options?: CookieOptions }
    | { type: 'remove'; name: string; options?: CookieOptions }
  > = []

  constructor(cookieHeader?: string | null) {
    this.state = parseCookieHeader(cookieHeader)
  }

  get(name: string) {
    return this.state.get(name)
  }

  set(name: string, value: string, options?: CookieOptions) {
    this.state.set(name, value)
    this.pushMutation({ type: 'set', name, value, options })
  }

  remove(name: string, options?: CookieOptions) {
    this.state.delete(name)
    this.pushMutation({ type: 'remove', name, options })
  }

  applyToResponse(response: NextResponse) {
    if (this.mutations.length === 0) {
      return
    }

    try {
      for (const mutation of this.mutations) {
        if (mutation.type === 'set') {
          response.cookies.set(
            mutation.name,
            mutation.value,
            normalizeCookieOptions(mutation.options)
          )
          continue
        }

        response.cookies.set(
          mutation.name,
          '',
          buildRemovalOptions(mutation.options)
        )
      }
    } catch (error) {
      console.error('[Supabase] 写入 cookie 失败:', error)
    }
  }

  private pushMutation(
    mutation:
      | { type: 'set'; name: string; value: string; options?: CookieOptions }
      | { type: 'remove'; name: string; options?: CookieOptions }
  ) {
    const index = this.mutations.findIndex(item => item.name === mutation.name)
    if (index !== -1) {
      this.mutations.splice(index, 1)
    }
    this.mutations.push(mutation)
  }
}

export function createServerCookieStore(request?: Request) {
  const header = request?.headers.get('cookie') ?? null
  return new ServerCookieStore(header)
}

function parseCookieHeader(header?: string | null) {
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

function normalizeCookieOptions(options?: CookieOptions): ResponseCookieOptions {
  if (!options) {
    return {}
  }

  const result: ResponseCookieOptions = {}

  if (typeof options.maxAge !== 'undefined') {
    result.maxAge = options.maxAge
  }

  if (options.expires) {
    const expiresDate = buildDate(options.expires)
    if (expiresDate) {
      result.expires = expiresDate
    }
  }

  if (options.path) {
    result.path = options.path
  }

  if (options.domain) {
    result.domain = options.domain
  }

  if (typeof options.secure !== 'undefined') {
    result.secure = options.secure
  }

  if (typeof (options as CookieOptions & { httpOnly?: boolean }).httpOnly !== 'undefined') {
    result.httpOnly = (options as CookieOptions & { httpOnly?: boolean }).httpOnly
  }

  const sameSite = normalizeSameSite(options.sameSite)
  if (sameSite) {
    result.sameSite = sameSite
  }

  return result
}

function buildRemovalOptions(options?: CookieOptions): ResponseCookieOptions {
  const normalized = normalizeCookieOptions(options)
  normalized.maxAge = 0
  normalized.expires = new Date(0)
  return normalized
}

function normalizeSameSite(value: CookieOptions['sameSite']) {
  if (value === undefined || value === false) {
    return undefined
  }

  if (value === true) {
    return 'strict'
  }

  if (typeof value !== 'string') {
    return undefined
  }

  const lower = value.toLowerCase()
  if (lower === 'lax' || lower === 'strict' || lower === 'none') {
    return lower
  }

  return undefined
}

function buildDate(input: CookieOptions['expires']) {
  if (!input) {
    return undefined
  }

  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? undefined : input
  }

  const date = new Date(input)
  return Number.isNaN(date.getTime()) ? undefined : date
}
