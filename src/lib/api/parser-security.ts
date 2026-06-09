export const DEFAULT_UPSTREAM_RESPONSE_LIMIT_BYTES = 1024 * 1024

const BLOCKED_CUSTOM_HEADERS = new Set([
  'host',
  'cookie',
  'set-cookie',
  'connection',
  'content-length',
  'transfer-encoding',
  'proxy-authorization',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-forwarded-port',
  'forwarded',
])

export type ValidatedHttpUrl =
  | { ok: true; url: URL }
  | { ok: false; error: string }

export function resolveAndValidateHttpUrl(
  rawUrl: string,
  baseUrl?: string,
  options: { allowRelativeApi?: boolean } = {}
): ValidatedHttpUrl {
  const source = String(rawUrl || '').trim()
  const isRelativeApi = /^\/api(?:\/|\?|$)/i.test(source)
  let parsed: URL
  try {
    parsed = baseUrl ? new URL(source, baseUrl) : new URL(source)
  } catch {
    return { ok: false, error: '解析API地址格式错误' }
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { ok: false, error: '解析API地址仅支持 http/https 协议' }
  }

  if (!(options.allowRelativeApi && isRelativeApi)) {
    const hostValidation = validatePublicHostname(parsed.hostname)
    if (!hostValidation.ok) {
      return hostValidation
    }
  }

  return { ok: true, url: parsed }
}

export function validatePublicHostname(hostname: string): { ok: true } | { ok: false; error: string } {
  const host = normalizeHostname(hostname)
  if (!host) {
    return { ok: false, error: '解析API地址缺少有效主机名' }
  }

  if (host === 'localhost' || host === '0.0.0.0' || host.endsWith('.local')) {
    return { ok: false, error: '不允许请求本地或内网解析API地址' }
  }

  const ipv4 = parseIpv4(host)
  if (ipv4) {
    if (isPrivateOrSpecialIpv4(ipv4)) {
      return { ok: false, error: '不允许请求私有网络解析API地址' }
    }
    return { ok: true }
  }

  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    return { ok: false, error: '解析API地址包含无效IPv4地址' }
  }

  if (host.includes(':') && isPrivateOrSpecialIpv6(host)) {
    return { ok: false, error: '不允许请求私有网络解析API地址' }
  }

  return { ok: true }
}

export function sanitizeCustomHeaders(
  customHeaders: unknown,
  baseHeaders: Record<string, string> = {}
): Record<string, string> {
  const headers: Record<string, string> = { ...baseHeaders }
  if (!customHeaders || typeof customHeaders !== 'object' || Array.isArray(customHeaders)) {
    return headers
  }

  for (const [rawKey, rawValue] of Object.entries(customHeaders)) {
    const key = String(rawKey || '').trim()
    if (!key || !isSafeHeaderName(key)) {
      continue
    }

    const lowerKey = key.toLowerCase()
    if (BLOCKED_CUSTOM_HEADERS.has(lowerKey)) {
      continue
    }

    if (rawValue === undefined || rawValue === null) {
      continue
    }

    const value = String(rawValue)
    if (/[\r\n]/.test(value)) {
      continue
    }

    headers[key] = value
  }

  return headers
}

export async function readResponseTextLimited(
  response: Response,
  maxBytes = DEFAULT_UPSTREAM_RESPONSE_LIMIT_BYTES
): Promise<string> {
  if (!response.body) {
    const text = await response.text().catch(() => '')
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      throw new Error(`上游响应超过大小限制 (${maxBytes} bytes)`)
    }
    return text
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let received = 0
  let text = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue

      received += value.byteLength
      if (received > maxBytes) {
        await reader.cancel().catch(() => undefined)
        throw new Error(`上游响应超过大小限制 (${maxBytes} bytes)`)
      }

      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
    return text
  } finally {
    reader.releaseLock()
  }
}

function normalizeHostname(hostname: string): string {
  return String(hostname || '')
    .trim()
    .toLowerCase()
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .replace(/\.$/, '')
}

function isSafeHeaderName(key: string): boolean {
  return /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(key)
}

function parseIpv4(host: string): number[] | null {
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!match) return null

  const octets = match.slice(1).map(Number)
  if (octets.some(part => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null
  }
  return octets
}

function isPrivateOrSpecialIpv4(octets: number[]): boolean {
  const [a, b] = octets
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19))
  )
}

function isPrivateOrSpecialIpv6(host: string): boolean {
  const normalized = host.toLowerCase()
  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fe80:') ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('::ffff:127.') ||
    normalized.startsWith('::ffff:10.') ||
    normalized.startsWith('::ffff:192.168.')
  )
}
