const HTTP_URL_PATTERN = /https?:\/\/[A-Za-z0-9\-._~%!$&'()*+,;=:@/?#[\]<>|]+/i
const DOUYIN_SHORT_LINK_PATTERN = /(?:https?:\/\/)?v\.douyin\.com\/([A-Za-z0-9_-]{4,})(?:\/)?/i
const DOUYIN_LONG_LINK_PATTERN =
  /(?:https?:\/\/)?(?:www\.)?(?:douyin\.com|iesdouyin\.com)\/[A-Za-z0-9\-._~%!$&'()*+,;=:@/?#[\]<>|]+/i
const TRAILING_PUNCTUATION_PATTERN = /[>\])},.;!?'"`，。！？；、）】》〉」』”’]+$/
const SUPPORTED_VIDEO_HOST_PATTERNS = [
  'douyin.com',
  'iesdouyin.com',
  'bilibili.com',
  'b23.tv',
  'xiaohongshu.com',
  'xhslink.com',
  'kuaishou.com',
  'weibo.com',
  'tiktok.com',
  'youtube.com',
  'youtu.be',
  'instagram.com',
  'twitter.com',
  'x.com',
  'facebook.com',
  'vimeo.com',
] as const

function normalizeShareText(text: string): string {
  return String(text || '')
    .replace(/\u3000/g, ' ')
    .replace(/：/g, ':')
    .replace(/／/g, '/')
    .trim()
}

export function sanitizeUrlCandidate(value: unknown): string {
  let cleaned = normalizeShareText(String(value || ''))

  // Slack and Lark-style rich links often arrive as <url> or <url|label>.
  // Strip only the wrapper/label so query strings remain intact.
  if (cleaned.startsWith('<')) {
    const wrapped = cleaned.match(/^<\s*(https?:\/\/[^|>\s]+)(?:\|[^>]*)?>$/i)
    if (wrapped?.[1]) {
      cleaned = wrapped[1]
    }
  }

  if (cleaned.includes('|')) {
    const pipeIndex = cleaned.indexOf('|')
    const head = cleaned.slice(0, pipeIndex).trim()
    if (/^https?:\/\//i.test(head)) {
      cleaned = head
    }
  }

  cleaned = cleaned.replace(/^[<([{]+/, '').trimStart()
  while (cleaned && TRAILING_PUNCTUATION_PATTERN.test(cleaned)) {
    cleaned = cleaned.replace(TRAILING_PUNCTUATION_PATTERN, '')
  }
  return cleaned
}

function trimTrailingPunctuation(candidate: string): string {
  return sanitizeUrlCandidate(candidate)
}

function isValidHttpUrl(candidate: string): boolean {
  if (!candidate) return false
  try {
    const parsed = new URL(candidate)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function normalizeMatchedUrl(raw: string, forceHttps = false): string {
  if (!raw) return ''

  const withProtocol = forceHttps && !/^https?:\/\//i.test(raw)
    ? `https://${raw}`
    : raw
  const candidate = sanitizeUrlCandidate(withProtocol)
  return isValidHttpUrl(candidate) ? candidate : ''
}

function isSupportedVideoHost(candidate: string): boolean {
  try {
    const host = new URL(candidate).hostname.toLowerCase()
    return SUPPORTED_VIDEO_HOST_PATTERNS.some(pattern => host === pattern || host.endsWith(`.${pattern}`))
  } catch {
    return false
  }
}

export function extractSupportedVideoUrl(text: string): string | undefined {
  const source = normalizeShareText(text)
  if (!source) return undefined

  const candidates = source.match(/https?:\/\/[^\s]+/g) || []
  for (const candidate of candidates) {
    const cleaned = sanitizeUrlCandidate(candidate)
    if (cleaned && isValidHttpUrl(cleaned) && isSupportedVideoHost(cleaned)) {
      return cleaned
    }
  }

  const douyinShortMatch = source.match(DOUYIN_SHORT_LINK_PATTERN)
  if (douyinShortMatch?.[1]) {
    return `https://v.douyin.com/${douyinShortMatch[1]}/`
  }

  const douyinLongMatch = source.match(DOUYIN_LONG_LINK_PATTERN)
  if (douyinLongMatch?.[0]) {
    const normalized = normalizeMatchedUrl(douyinLongMatch[0], true)
    if (normalized && isSupportedVideoHost(normalized)) {
      return normalized
    }
  }

  return undefined
}

export function extractFirstUrlFromText(text: string): string {
  const source = normalizeShareText(text)
  if (!source) return ''

  const supported = extractSupportedVideoUrl(source)
  if (supported) return supported

  const douyinShortMatch = source.match(DOUYIN_SHORT_LINK_PATTERN)
  if (douyinShortMatch?.[1]) {
    // Keep short-link canonical form so downstream can reliably follow redirects.
    return `https://v.douyin.com/${douyinShortMatch[1]}/`
  }

  const douyinLongMatch = source.match(DOUYIN_LONG_LINK_PATTERN)
  if (douyinLongMatch?.[0]) {
    const normalized = normalizeMatchedUrl(douyinLongMatch[0], true)
    if (normalized) {
      return normalized
    }
  }

  const genericMatch = source.match(HTTP_URL_PATTERN)
  if (genericMatch?.[0]) {
    const normalized = normalizeMatchedUrl(genericMatch[0], false)
    if (normalized) {
      return normalized
    }
  }

  return ''
}
