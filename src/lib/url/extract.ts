const HTTP_URL_PATTERN = /https?:\/\/[A-Za-z0-9\-._~%!$&'()*+,;=:@/?#[\]]+/i
const DOUYIN_SHORT_LINK_PATTERN = /(?:https?:\/\/)?v\.douyin\.com\/([A-Za-z0-9_-]{4,})(?:\/)?/i
const DOUYIN_LONG_LINK_PATTERN =
  /(?:https?:\/\/)?(?:www\.)?(?:douyin\.com|iesdouyin\.com)\/[A-Za-z0-9\-._~%!$&'()*+,;=:@/?#[\]]+/i
const TRAILING_PUNCTUATION_PATTERN = /[),.;!?'"`，。！？；、）】》〉」』”’]+$/u

function normalizeShareText(text: string): string {
  return String(text || '')
    .replace(/\u3000/g, ' ')
    .replace(/：/g, ':')
    .replace(/／/g, '/')
    .trim()
}

function trimTrailingPunctuation(candidate: string): string {
  let normalized = String(candidate || '').trim()
  while (normalized && TRAILING_PUNCTUATION_PATTERN.test(normalized)) {
    normalized = normalized.replace(TRAILING_PUNCTUATION_PATTERN, '')
  }
  return normalized
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
  const candidate = trimTrailingPunctuation(withProtocol)
  return isValidHttpUrl(candidate) ? candidate : ''
}

export function extractFirstUrlFromText(text: string): string {
  const source = normalizeShareText(text)
  if (!source) return ''

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
