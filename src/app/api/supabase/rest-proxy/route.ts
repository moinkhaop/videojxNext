export const runtime = 'nodejs'

type LegacyProxyRequest = {
  path?: string
  query?: string
  method?: string
  accessToken?: string
  accessTokenB64Url?: string
  body?: unknown
  prefer?: string
  range?: string
}

type TableProxyRequest = {
  table?: string
  query?: string
  method?: string
  accessToken?: string
  accessTokenB64Url?: string
  body?: unknown
  prefer?: string
  range?: string
}

type ProxyRequest = LegacyProxyRequest & TableProxyRequest

const ERROR_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-dyjx-rest-proxy': '1',
}

const ALLOWED_METHODS = new Set(['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'HEAD'])

const getEnv = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    return null
  }
  return { supabaseUrl, supabaseAnonKey }
}

const pickResponseHeaders = (upstream: Response) => {
  const headers = new Headers()
  const keys = ['content-type', 'content-range', 'content-location']
  for (const key of keys) {
    const value = upstream.headers.get(key)
    if (value) headers.set(key, value)
  }
  headers.set('cache-control', 'no-store')
  headers.set('x-dyjx-rest-proxy', '1')
  return headers
}

const decodeBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=')
  return Buffer.from(padded, 'base64').toString('utf8')
}

const makeError = (status: number, payload: Record<string, unknown>, headers?: HeadersInit) => {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...ERROR_HEADERS, ...(headers ?? {}) },
  })
}

const resolvePath = (payload: ProxyRequest) => {
  const rawPath = payload.path ?? payload.table ?? ''
  return String(rawPath).replace(/^\/+/, '').trim()
}

const resolveMethod = (payload: ProxyRequest) => {
  const method = String(payload.method ?? 'GET').toUpperCase()
  return ALLOWED_METHODS.has(method) ? method : null
}

export async function POST(request: Request) {
  const env = getEnv()
  if (!env) {
    return makeError(500, { error: 'Missing Supabase envs' })
  }

  let payload: ProxyRequest | null = null
  try {
    payload = (await request.json()) as ProxyRequest
  } catch {
    return makeError(400, { error: 'Invalid JSON body' })
  }

  const path = resolvePath(payload ?? {})
  if (!path) {
    return makeError(400, { error: 'Missing path/table' })
  }

  const method = resolveMethod(payload ?? {})
  if (!method) {
    return makeError(400, { error: 'Invalid method' })
  }

  let accessToken = payload?.accessToken
  if (!accessToken && payload?.accessTokenB64Url) {
    try {
      accessToken = decodeBase64Url(payload.accessTokenB64Url)
    } catch {
      return makeError(400, { error: 'Invalid accessTokenB64Url' })
    }
  }

  const base = env.supabaseUrl.replace(/\/$/, '')
  const upstreamUrl = new URL(`${base}/rest/v1/${path}`)
  if (payload?.query) {
    upstreamUrl.search = payload.query.startsWith('?') ? payload.query : `?${payload.query}`
  }

  const headers = new Headers()
  headers.set('apikey', env.supabaseAnonKey)
  headers.set('x-api-key', env.supabaseAnonKey)
  headers.set('accept', 'application/json')

  if (accessToken) {
    headers.set('authorization', `Bearer ${accessToken}`)
  }
  if (payload?.prefer) {
    headers.set('prefer', payload.prefer)
  }
  if (payload?.range) {
    headers.set('range', payload.range)
  }

  let body: string | undefined
  if (method !== 'GET' && method !== 'HEAD') {
    if (payload?.body !== undefined) {
      body = typeof payload.body === 'string' ? payload.body : JSON.stringify(payload.body)
      headers.set('content-type', 'application/json')
    }
  }

  try {
    const upstream = await fetch(upstreamUrl.toString(), {
      method,
      headers,
      body,
      cache: 'no-store',
    })

    const responseHeaders = pickResponseHeaders(upstream)
    responseHeaders.set('x-dyjx-upstream-status', String(upstream.status))
    responseHeaders.set('x-dyjx-auth-len', String(accessToken ? accessToken.length : 0))

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '')
      return makeError(
        upstream.status,
        {
          error: 'UpstreamError',
          upstreamStatus: upstream.status,
          upstreamBody: text.slice(0, 1200),
        },
        responseHeaders
      )
    }

    const buffer = await upstream.arrayBuffer()
    return new Response(buffer, { status: upstream.status, headers: responseHeaders })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return makeError(502, { error: 'UpstreamFetchFailed', message })
  }
}

export async function GET() {
  return new Response(JSON.stringify({ ok: true, name: 'dyjx-supabase-rest-proxy' }), {
    headers: ERROR_HEADERS,
  })
}
