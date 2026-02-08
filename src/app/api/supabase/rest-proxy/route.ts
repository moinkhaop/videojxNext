export const runtime = 'edge'

type ProxyRequest = {
  path: string
  query?: string
  method?: string
  accessToken?: string
  body?: any
  prefer?: string
  range?: string
}

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
  return headers
}

export async function POST(request: Request) {
  const env = getEnv()
  if (!env) {
    return Response.json({ error: 'Missing Supabase envs' }, { status: 500 })
  }

  let payload: ProxyRequest | null = null
  try {
    payload = (await request.json()) as ProxyRequest
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const path = payload?.path?.replace(/^\/+/, '') ?? ''
  if (!path) {
    return Response.json({ error: 'Missing path' }, { status: 400 })
  }

  const method = String(payload.method ?? 'GET').toUpperCase()
  const accessToken = payload.accessToken

  const base = env.supabaseUrl.replace(/\/$/, '')
  const upstreamUrl = new URL(`${base}/rest/v1/${path}`)
  if (payload.query) {
    upstreamUrl.search = payload.query.startsWith('?') ? payload.query : `?${payload.query}`
  }

  const headers = new Headers()
  headers.set('apikey', env.supabaseAnonKey)
  headers.set('x-api-key', env.supabaseAnonKey)
  headers.set('accept', 'application/json')
  if (accessToken) {
    headers.set('authorization', `Bearer ${accessToken}`)
  }
  if (payload.prefer) {
    headers.set('prefer', payload.prefer)
  }
  if (payload.range) {
    headers.set('range', payload.range)
  }

  let body: string | undefined
  if (method !== 'GET' && method !== 'HEAD') {
    if (payload.body !== undefined) {
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
    const buffer = await upstream.arrayBuffer()
    return new Response(buffer, { status: upstream.status, headers: responseHeaders })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return Response.json({ error: 'Upstream fetch failed', message }, { status: 502 })
  }
}
