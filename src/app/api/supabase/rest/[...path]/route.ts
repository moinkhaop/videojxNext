export const runtime = 'edge'

const getEnv = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    return null
  }
  return { supabaseUrl, supabaseAnonKey }
}

const passthroughRequestHeaders = (request: Request, supabaseAnonKey: string) => {
  const headers = new Headers()

  // Required by Supabase APIs
  headers.set('apikey', supabaseAnonKey)
  headers.set('x-api-key', supabaseAnonKey)

  // Forward auth token so PostgREST can enforce RLS.
  // Some CDNs/WAFs block the standard `Authorization` header on same-origin requests,
  // so the browser sends `x-supabase-access-token` and we translate it upstream.
  const accessToken = request.headers.get('x-supabase-access-token')
  if (accessToken) {
    headers.set('authorization', `Bearer ${accessToken}`)
  } else {
    const authorization = request.headers.get('authorization')
    if (authorization) {
      headers.set('authorization', authorization)
    }
  }

  // Forward common PostgREST headers when present
  const accept = request.headers.get('accept')
  if (accept) headers.set('accept', accept)

  const contentType = request.headers.get('content-type')
  if (contentType) headers.set('content-type', contentType)

  const prefer = request.headers.get('prefer')
  if (prefer) headers.set('prefer', prefer)

  const range = request.headers.get('range')
  if (range) headers.set('range', range)

  return headers
}

const passthroughResponseHeaders = (upstream: Response) => {
  const headers = new Headers()
  const keys = ['content-type', 'content-range', 'content-location']
  for (const key of keys) {
    const value = upstream.headers.get(key)
    if (value) headers.set(key, value)
  }
  return headers
}

async function proxy(request: Request, pathSegments: string[]) {
  const env = getEnv()
  if (!env) {
    return Response.json({ error: 'Missing Supabase envs' }, { status: 500 })
  }

  const { supabaseUrl, supabaseAnonKey } = env
  const base = supabaseUrl.replace(/\/$/, '')
  const upstreamUrl = new URL(`${base}/rest/v1/${pathSegments.join('/')}`)
  upstreamUrl.search = new URL(request.url).search

  const method = request.method.toUpperCase()
  const body =
    method === 'GET' || method === 'HEAD' || method === 'OPTIONS'
      ? undefined
      : await request.arrayBuffer()

  try {
    const upstream = await fetch(upstreamUrl.toString(), {
      method,
      headers: passthroughRequestHeaders(request, supabaseAnonKey),
      body,
      cache: 'no-store',
    })

    const responseHeaders = passthroughResponseHeaders(upstream)
    const buffer = await upstream.arrayBuffer()
    return new Response(buffer, { status: upstream.status, headers: responseHeaders })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return Response.json({ error: 'Upstream fetch failed', message }, { status: 502 })
  }
}

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params
  return proxy(request, path ?? [])
}

export async function POST(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params
  return proxy(request, path ?? [])
}

export async function PATCH(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params
  return proxy(request, path ?? [])
}

export async function DELETE(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params
  return proxy(request, path ?? [])
}
