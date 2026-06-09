import { MediaType, ParsedVideoInfo, WebDAVConfig } from '../types'
import { FilenameSanitizer } from './filename-sanitizer'
import { getWebdavProxyEndpoint } from './runtime-endpoints'

export class UploadCancelledError extends Error {
  constructor(message = '用户已停止批量任务') {
    super(message)
    this.name = 'UploadCancelledError'
  }
}

export type UploadRuntimeControl = {
  signal?: AbortSignal
  isCancelled?: () => boolean
  fileNameOverride?: string
}

export async function uploadToWebDAV(
  mediaInfo: ParsedVideoInfo,
  webdavConfig: WebDAVConfig,
  folderPath?: string,
  onProgress?: (progress: number, hint: string) => void,
  sourceUrl?: string,
  runtimeControl?: UploadRuntimeControl
): Promise<string> {
  const maxRetries = 5
  let attempt = 0
  let lastError: unknown
  let lastProgress = 60
  const startedAt = Date.now()

  const formatElapsed = (ms: number) => {
    const seconds = Math.max(0, Math.floor(ms / 1000))
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const rest = seconds % 60
    return `${minutes}m${String(rest).padStart(2, '0')}s`
  }

  const emit = (progress: number, hint: string) => {
    if (!onProgress) return
    const clamped = Math.max(0, Math.min(99, Math.floor(progress)))
    lastProgress = Math.max(lastProgress, clamped)
    onProgress(clamped, hint)
  }

  const ensureActive = () => {
    if (runtimeControl?.isCancelled?.() || runtimeControl?.signal?.aborted) {
      throw new UploadCancelledError()
    }
  }

  ensureActive()
  let fileName = String(runtimeControl?.fileNameOverride || '').trim()
  if (!fileName) {
    if (mediaInfo.mediaType === MediaType.VIDEO && mediaInfo.url) {
      const format = inferVideoFormat(mediaInfo.format, mediaInfo.url)
      fileName = generateFileName(mediaInfo.title, format)
    } else if (mediaInfo.mediaType === MediaType.IMAGE_ALBUM && mediaInfo.images?.length) {
      fileName = generateFolderName(mediaInfo.title)
    }
  }

  while (attempt < maxRetries) {
    try {
      ensureActive()
      attempt++
      emit(
        Math.min(90, 60 + attempt * 2),
        `服务器上传中（第 ${attempt}/${maxRetries} 次，已用时 ${formatElapsed(Date.now() - startedAt)}）`
      )
      console.log(`[转存] WebDAV上传尝试 ${attempt}/${maxRetries}: ${mediaInfo.mediaType === MediaType.VIDEO ? '视频' : '图集'}`)

      const controller = new AbortController()
      let removeAbortListener: (() => void) | null = null
      if (runtimeControl?.signal) {
        const onAbort = () => controller.abort()
        if (runtimeControl.signal.aborted) {
          controller.abort()
        } else {
          runtimeControl.signal.addEventListener('abort', onAbort, { once: true })
          removeAbortListener = () => runtimeControl.signal?.removeEventListener('abort', onAbort)
        }
      }

      const timeoutMs = Number(process.env.NEXT_PUBLIC_WEBDAV_PROXY_TIMEOUT_MS ?? '180000')
      const timeoutId = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 180000)
      const progressCeiling = Math.max(70, Math.min(95, 92 + attempt))
      const ticker = setInterval(() => {
        if (lastProgress >= progressCeiling) return
        emit(
          lastProgress + 1,
          `服务器上传中（第 ${attempt}/${maxRetries} 次，已用时 ${formatElapsed(Date.now() - startedAt)}）`
        )
      }, 900)

      let response: Response
      try {
        response = await fetch(getWebdavProxyEndpoint(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            videoUrl: mediaInfo.mediaType === MediaType.VIDEO ? mediaInfo.url : undefined,
            sourceUrl: sourceUrl || undefined,
            images: mediaInfo.mediaType === MediaType.IMAGE_ALBUM ? mediaInfo.images : undefined,
            webdavConfig,
            fileName,
            folderPath: folderPath || '',
          }),
          signal: controller.signal,
        })
      } finally {
        removeAbortListener?.()
        clearTimeout(timeoutId)
        clearInterval(ticker)
      }

      const responseText = await response.text()
      if (!responseText.trim()) {
        throw new Error(`服务器返回空响应 (HTTP ${response.status})`)
      }

      if (!response.ok) {
        const message = extractErrorMessageFromResponse(responseText)
        throw new Error(
          message
            ? `上传服务错误 (${response.status}): ${message}`
            : `上传服务错误 (HTTP ${response.status})`
        )
      }

      let result: any
      try {
        result = JSON.parse(responseText)
      } catch {
        const message = extractErrorMessageFromResponse(responseText)
        throw new Error(
          message
            ? `上传服务返回非JSON响应: ${message}`
            : '上传服务返回了无法解析的响应'
        )
      }

      if (!result.success) {
        throw new Error(result.error || '媒体上传失败')
      }

      if (!result.filePath) {
        throw new Error('上传成功但未返回文件路径')
      }

      console.log(`[转存] 上传成功，尝试次数: ${attempt}`)
      emit(99, `上传完成，正在收尾（已用时 ${formatElapsed(Date.now() - startedAt)}）`)
      return result.filePath
    } catch (error) {
      if (isUploadCancelledError(error) || runtimeControl?.isCancelled?.() || runtimeControl?.signal?.aborted) {
        throw new UploadCancelledError()
      }

      lastError = error
      console.error(`[转存] 上传尝试 ${attempt} 失败:`, error)
      emit(
        Math.max(60, lastProgress),
        `上传失败（第 ${attempt}/${maxRetries} 次，已用时 ${formatElapsed(Date.now() - startedAt)}）`
      )

      if (attempt < maxRetries) {
        const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 10000)
        console.log(`[转存] 等待 ${waitTime / 1000} 秒后重试...`)
        emit(
          Math.max(60, lastProgress),
          `等待 ${Math.round(waitTime / 1000)} 秒后重试（第 ${attempt + 1}/${maxRetries} 次）`
        )
        await waitFor(waitTime, runtimeControl?.signal)
      } else {
        break
      }
    }
  }

  console.error('[转存] 所有上传尝试均失败')
  throw lastError || new Error('视频上传失败，已达到最大重试次数')
}

export function generateFileName(title: string, format: string): string {
  console.log(`[文件名生成] 原始标题: "${title}"`)

  const specialChars = FilenameSanitizer.detectSpecialChars(title)
  if (specialChars.length > 0) {
    console.log(`[文件名生成] 检测到特殊字符: ${specialChars.join(', ')}`)
  }

  const sanitizedTitle = FilenameSanitizer.sanitize(title, {
    replacement: '_',
    maxLength: 80,
    preserveExtension: false,
    addTimestamp: true,
  })

  const nameWithoutExt = sanitizedTitle.replace(/\.[^.]*$/, '')
  const finalName = `${nameWithoutExt}.${format}`

  console.log(`[文件名生成] 最终文件名: "${finalName}"`)
  return finalName
}

export function generateFolderName(title: string): string {
  return FilenameSanitizer.sanitize(title, {
    replacement: '_',
    maxLength: 100,
    preserveExtension: false,
    addTimestamp: false,
  })
}

export function buildDouyinUserFolderPath(videos: ParsedVideoInfo[]): string {
  const first = videos.find(video => video && (video.author || video.uid || video.short_id))
  const author = String(first?.author || '抖音用户').trim()
  const stableId = String(first?.uid || first?.short_id || '').trim()
  const raw = stableId ? `${author}_${stableId}` : author
  return generateFolderName(raw || '抖音用户')
}

export function buildStableBatchVideoFileName(mediaInfo: ParsedVideoInfo, sourceUrl?: string): string {
  const format = inferVideoFormat(mediaInfo.format, mediaInfo.url || sourceUrl)
  const stableId = extractStableVideoId(mediaInfo, sourceUrl)
  const authorPart = FilenameSanitizer.sanitize(String(mediaInfo.author || '').trim() || '用户', {
    replacement: '_',
    maxLength: 32,
    preserveExtension: false,
    addTimestamp: false,
  }).replace(/\.[^.]*$/, '')
  const titlePart = FilenameSanitizer.sanitize(String(mediaInfo.title || '').trim() || '视频', {
    replacement: '_',
    maxLength: 80,
    preserveExtension: false,
    addTimestamp: false,
  }).replace(/\.[^.]*$/, '')

  const baseName = stableId
    ? `${authorPart}_${stableId}`
    : `${authorPart}_${titlePart}`
  return `${baseName}.${format}`
}

export function inferVideoFormat(providedFormat: string | undefined, videoUrl?: string): string {
  const validFormats = [
    'mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv', 'm4v',
    '3gp', 'f4v', 'asf', 'rm', 'rmvb', 'vob', 'ogv', 'm2ts', 'mts',
  ]

  if (providedFormat && validFormats.includes(providedFormat.toLowerCase())) {
    return providedFormat.toLowerCase()
  }

  if (videoUrl) {
    const urlFormat = extractFormatFromUrl(videoUrl)
    if (urlFormat && validFormats.includes(urlFormat.toLowerCase())) {
      return urlFormat.toLowerCase()
    }
  }

  return 'mp4'
}

export function extractErrorMessageFromResponse(body: string): string | null {
  if (!body) {
    return null
  }

  try {
    const parsed = JSON.parse(body)
    if (parsed && typeof parsed === 'object') {
      const fields = ['error', 'message', 'msg', 'detail', 'reason'] as const
      for (const field of fields) {
        const value = (parsed as Record<string, unknown>)[field]
        if (typeof value === 'string' && value.trim()) {
          return value.trim()
        }
      }
    }
  } catch {
    // body 不是 JSON 时，退回到纯文本摘要。
  }

  const sanitized = body.replace(/\s+/g, ' ').trim()
  if (!sanitized) {
    return null
  }

  return sanitized.length > 300 ? `${sanitized.substring(0, 300)}…` : sanitized
}

function isUploadCancelledError(error: unknown): boolean {
  if (error instanceof UploadCancelledError) {
    return true
  }
  if (!(error instanceof Error)) {
    return false
  }
  if (error.name === 'AbortError') {
    return true
  }
  const message = String(error.message || '').toLowerCase()
  return message.includes('abort') || message.includes('stopped')
}

async function waitFor(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) {
    return
  }

  if (!signal) {
    await new Promise(resolve => setTimeout(resolve, ms))
    return
  }

  if (signal.aborted) {
    throw new UploadCancelledError()
  }

  await new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)

    const onAbort = () => {
      clearTimeout(timeoutId)
      signal.removeEventListener('abort', onAbort)
      reject(new UploadCancelledError())
    }

    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function extractStableVideoId(mediaInfo: ParsedVideoInfo, sourceUrl?: string): string {
  const directId = String(mediaInfo.short_id || mediaInfo.uid || '').trim()
  if (directId) {
    return directId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48)
  }

  const candidates = [
    String(mediaInfo.url || ''),
    String(sourceUrl || ''),
    String(mediaInfo.title || ''),
  ]
  const patterns = [
    /[?&](?:aweme_id|video_id)=([a-zA-Z0-9_-]{6,})/i,
    /\/video\/([0-9]{8,})/i,
    /\b(v[0-9a-z]{8,})\b/i,
    /[（(]([a-zA-Z0-9_-]{8,})[）)]/i,
  ]

  for (const candidate of candidates) {
    if (!candidate) continue
    for (const pattern of patterns) {
      const matched = candidate.match(pattern)?.[1]
      if (!matched) continue
      const cleaned = matched.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48)
      if (cleaned && !/^https?$/i.test(cleaned)) {
        return cleaned
      }
    }
  }

  const fallback = simpleStringHash(String(mediaInfo.url || sourceUrl || mediaInfo.title || 'video'))
  return `vid_${fallback}`
}

function simpleStringHash(input: string): string {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0
  }
  return hash.toString(36)
}

function extractFormatFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url)
    const pathname = urlObj.pathname
    const lastDotIndex = pathname.lastIndexOf('.')

    if (lastDotIndex !== -1) {
      const extension = pathname.substring(lastDotIndex + 1)
      return extension.toLowerCase()
    }
  } catch {
    // URL 解析失败时直接回退到默认格式。
  }

  return null
}
