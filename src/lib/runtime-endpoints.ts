function normalizeEndpoint(value: string | undefined | null): string {
  const raw = String(value || '').trim()
  if (!raw) return ''
  return raw
}

export function getWebdavProxyEndpoint(): string {
  const fromEnv = normalizeEndpoint(process.env.NEXT_PUBLIC_EDGEONE_NODE_WEBDAV_PROXY_URL)
  if (fromEnv) return fromEnv
  return '/api/proxy/webdav'
}

export function getPreferredParserEndpoint(): string {
  const fromEnv = normalizeEndpoint(process.env.NEXT_PUBLIC_EDGEONE_PARSER_API_URL)
  if (fromEnv) return fromEnv
  return '/api/douyin/parse'
}

