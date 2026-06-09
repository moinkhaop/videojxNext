import { ImageInfo, MediaType, VideoParseResponse } from '../../types'

type AuthorProfile = {
  name?: string
  avatar?: string
  signature?: string
}

type MediaExtractionResult = {
  mediaType: MediaType
  videoUrl?: string
  images?: ImageInfo[]
}

const IMAGE_ARRAY_FIELDS = ['images', 'pics', 'pictures', 'photos', 'image_list', 'pic_list']
const IMAGE_URL_FIELDS = ['url', 'src', 'image_url', 'pic_url', 'photo_url', 'link', 'href']
const VIDEO_URL_FIELDS = [
  'url',
  'video_url',
  'videoUrl',
  'play_url',
  'playUrl',
  'playAddr',
  'download_url',
  'downloadUrl',
  'media_url',
  'mediaUrl',
  'mp4',
  'src',
  'source',
  'link',
  'content',
  'video',
  'hd',
  'sd',
]

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

function isHttpUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value)
}

function hasUsableMedia(result: MediaExtractionResult | null): result is MediaExtractionResult {
  if (!result) {
    return false
  }
  if (result.mediaType === MediaType.IMAGE_ALBUM) {
    return Boolean(result.images?.length)
  }
  return Boolean(result.videoUrl)
}

function toImageInfo(item: unknown, index: number): ImageInfo | null {
  if (isHttpUrl(item)) {
    return {
      url: item,
      filename: `image_${String(index + 1).padStart(3, '0')}.jpg`,
    }
  }

  const record = asRecord(item)
  if (!record) {
    return null
  }

  for (const field of IMAGE_URL_FIELDS) {
    if (isHttpUrl(record[field])) {
      return {
        url: record[field] as string,
        filename: `image_${String(index + 1).padStart(3, '0')}.jpg`,
      }
    }
  }

  return null
}

function detectMediaPayload(value: unknown, seen: WeakSet<object>): MediaExtractionResult | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = detectMediaPayload(item, seen)
      if (hasUsableMedia(nested)) {
        return nested
      }
    }
    return null
  }

  const record = asRecord(value)
  if (!record) {
    return null
  }

  if (seen.has(record)) {
    return null
  }
  seen.add(record)

  for (const field of IMAGE_ARRAY_FIELDS) {
    const candidate = record[field]
    if (!Array.isArray(candidate) || candidate.length === 0) {
      continue
    }

    const images = candidate
      .map((item, index) => toImageInfo(item, index))
      .filter((item): item is ImageInfo => item !== null)

    if (images.length > 0) {
      return {
        mediaType: MediaType.IMAGE_ALBUM,
        images,
      }
    }
  }

  for (const field of VIDEO_URL_FIELDS) {
    if (isHttpUrl(record[field])) {
      return {
        mediaType: MediaType.VIDEO,
        videoUrl: record[field] as string,
      }
    }
  }

  for (const nestedValue of Object.values(record)) {
    const nested = detectMediaPayload(nestedValue, seen)
    if (hasUsableMedia(nested)) {
      return nested
    }
  }

  return null
}

export function safeParseJsonBody(body: string): unknown | null {
  if (!body || !body.trim()) {
    return null
  }

  try {
    return JSON.parse(body)
  } catch {
    const start = body.indexOf('{')
    const end = body.lastIndexOf('}')
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(body.substring(start, end + 1))
      } catch {
        return null
      }
    }
  }

  return null
}

export function extractUpstreamErrorMessage(body: string): string {
  const parsed = safeParseJsonBody(body)
  const fromObject = extractErrorMessageFromObject(parsed)
  if (fromObject) {
    return fromObject
  }

  return sanitizeTextSnippet(body)
}

export function extractErrorMessageFromObject(payload: unknown): string {
  const record = asRecord(payload)
  if (!record) {
    return ''
  }

  for (const key of ['error', 'message', 'msg', 'detail', 'reason']) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return ''
}

export function sanitizeTextSnippet(text: string, maxLength = 200): string {
  if (!text) {
    return ''
  }

  const condensed = text.replace(/\s+/g, ' ').trim()
  if (!condensed) {
    return ''
  }

  return condensed.length > maxLength
    ? `${condensed.substring(0, maxLength)}…`
    : condensed
}

export function previewPayloadForLog(payload: unknown): string {
  if (payload == null) {
    return ''
  }

  if (typeof payload === 'string') {
    return sanitizeTextSnippet(payload)
  }

  try {
    const serialized = JSON.stringify(payload)
    return serialized.length > 500 ? `${serialized.substring(0, 500)}…` : serialized
  } catch {
    return '[unserializable payload]'
  }
}

export function isVideoParseResponseLike(payload: unknown): payload is VideoParseResponse {
  const record = asRecord(payload)
  if (!record || record.success !== true) {
    return false
  }

  const data = asRecord(record.data)
  if (!data || typeof data.mediaType !== 'string') {
    return false
  }

  const hasVideo = isHttpUrl(data.url)
  const hasImages = Array.isArray(data.images) && data.images.length > 0
  return hasVideo || hasImages
}

/**
 * 从任意上游 payload 中递归寻找可用媒体直链。
 * 这里把 proxy/preview 两条路由之前散落的“一级字段 + 二级字段 + 深搜”规则
 * 收敛到一处，后续新增字段时只需要维护这一份映射。
 */
export function extractMediaPayload(dataSource: unknown): MediaExtractionResult {
  return detectMediaPayload(dataSource, new WeakSet<object>()) ?? {
    mediaType: MediaType.VIDEO,
  }
}

export function extractAuthorProfile(dataSource: unknown): AuthorProfile | undefined {
  const record = asRecord(dataSource)
  if (!record) {
    return undefined
  }

  const result: AuthorProfile = {}

  for (const field of ['author', 'creator', 'user', 'author_info', 'user_info']) {
    const authorRecord = asRecord(record[field])
    if (!authorRecord) {
      continue
    }

    result.name = stringOrUndefined(authorRecord.name)
      ?? stringOrUndefined(authorRecord.nickname)
      ?? stringOrUndefined(authorRecord.username)
      ?? stringOrUndefined(authorRecord.title)
      ?? result.name
    result.avatar = stringOrUndefined(authorRecord.avatar)
      ?? stringOrUndefined(authorRecord.avatar_url)
      ?? stringOrUndefined(authorRecord.icon)
      ?? stringOrUndefined(authorRecord.head_url)
      ?? result.avatar
    result.signature = stringOrUndefined(authorRecord.signature)
      ?? stringOrUndefined(authorRecord.sign)
      ?? stringOrUndefined(authorRecord.desc)
      ?? stringOrUndefined(authorRecord.description)
      ?? result.signature

    if (result.name) {
      return result
    }
  }

  result.name = result.name ?? firstStringField(record, [
    'author',
    'creator',
    'user',
    'username',
    'nickname',
    'name',
    'author_name',
    'user_name',
  ])
  result.avatar = result.avatar ?? firstStringField(record, [
    'avatar',
    'author_avatar',
    'avatar_url',
    'icon',
    'head_url',
  ])
  result.signature = result.signature ?? firstStringField(record, [
    'signature',
    'sign',
    'desc',
    'description',
    'author_signature',
  ])

  return Object.keys(result).length > 0 ? result : undefined
}

export function extractDescription(dataSource: unknown, fallbackTitle?: string): string | undefined {
  const record = asRecord(dataSource)
  if (!record) {
    return fallbackTitle
  }

  for (const field of ['description', 'desc', 'content', 'text', 'caption', 'summary', 'detail']) {
    const value = record[field]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return fallbackTitle
}

export function extractTime(dataSource: unknown): number | string | undefined {
  const record = asRecord(dataSource)
  if (!record) {
    return undefined
  }

  for (const field of ['time', 'timestamp', 'create_time', 'created_at', 'publish_time', 'release_time', 'date']) {
    const value = record[field]
    if (typeof value === 'number') {
      return value < 10_000_000_000 ? value * 1000 : value
    }
    if (typeof value === 'string') {
      const timestamp = Date.parse(value)
      return Number.isNaN(timestamp) ? value : timestamp
    }
  }

  return undefined
}

function firstStringField(record: Record<string, unknown>, fields: string[]): string | undefined {
  for (const field of fields) {
    const value = record[field]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return undefined
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
