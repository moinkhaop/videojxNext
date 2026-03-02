const DEFAULT_IMAGE_UPLOAD_CONCURRENCY = 4
const DEFAULT_VIDEO_DOWNLOAD_TIMEOUT_MS = 60000
const DEFAULT_MAX_VIDEO_RETRIES = 3
const DEFAULT_MAX_BUFFER_BYTES = 80 * 1024 * 1024 // 80MB safety cap to avoid crashing edge runtime

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
}

export default async function onRequest(context) {
  try {
    const request = context.request

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    if (request.method !== 'POST') {
      return json({ success: false, error: '仅支持 POST 请求' }, 405)
    }

    const body = await parseRequestBody(context)
    const videoUrl = body && typeof body.videoUrl === 'string' ? body.videoUrl.trim() : ''
    const sourceUrl = body && typeof body.sourceUrl === 'string' ? body.sourceUrl.trim() : ''
    const images = body && Array.isArray(body.images) ? body.images : null
    const webdavConfig = body && typeof body.webdavConfig === 'object' ? body.webdavConfig : null
    const fileName = body && typeof body.fileName === 'string' ? body.fileName : ''
    const folderPath = body && typeof body.folderPath === 'string' ? body.folderPath : ''

    if ((!videoUrl && (!images || images.length === 0)) || !webdavConfig || !fileName) {
      return json({ success: false, error: '缺少必要参数' }, 400)
    }

    const auth = buildBasicAuth(webdavConfig)

    // Image album: create folder and upload images.
    if (images && images.length > 0) {
      const albumFolderUrl = buildWebDAVPath(webdavConfig, folderPath, fileName, { asFolder: true })
      const ok = await ensureWebDAVFolderExists(albumFolderUrl, auth)
      if (!ok) {
        return json({ success: false, error: '创建图集文件夹失败' }, 500)
      }

      const concurrency = clampInt(getEnvInt(context.env, 'WEBDAV_IMAGE_UPLOAD_CONCURRENCY', DEFAULT_IMAGE_UPLOAD_CONCURRENCY), 1, 8)
      let successCount = 0
      let skippedCount = 0
      const workers = Array.from({ length: Math.min(concurrency, images.length) }, (_, workerIndex) => {
        return (async () => {
          for (let index = workerIndex; index < images.length; index += concurrency) {
            const item = images[index]
            const imageUrl = item && typeof item.url === 'string' ? item.url : ''
            if (!imageUrl) continue
            const imageFileName = buildAlbumImageFileName(fileName, index, imageUrl)
            const imageUploadUrl = `${albumFolderUrl.replace(/\/$/, '')}/${encodePathSegment(imageFileName)}`
            const alreadyExists = await checkWebDAVResourceExists(imageUploadUrl, auth)
            if (alreadyExists) {
              skippedCount++
              successCount++
              continue
            }
            const uploaded = await uploadBinaryToWebDAV({
              sourceUrl: imageUrl,
              destUrl: imageUploadUrl,
              auth,
              downloadHeaders: buildDouyinHeaders('image'),
              timeoutMs: clampInt(getEnvInt(context.env, 'WEBDAV_VIDEO_DOWNLOAD_TIMEOUT_MS', DEFAULT_VIDEO_DOWNLOAD_TIMEOUT_MS), 5000, 120000),
            }).catch(() => false)
            if (uploaded) successCount++
          }
        })()
      })
      await Promise.all(workers)

      console.log(`[WebDAV] 图集上传完成，成功 ${successCount}/${images.length}（跳过已存在 ${skippedCount}）`)
      return json({ success: successCount > 0, filePath: albumFolderUrl }, 200)
    }

    // Video: download then upload to WebDAV.
    const timeoutMs = clampInt(getEnvInt(context.env, 'WEBDAV_VIDEO_DOWNLOAD_TIMEOUT_MS', DEFAULT_VIDEO_DOWNLOAD_TIMEOUT_MS), 5000, 180000)
    const maxRetries = clampInt(getEnvInt(context.env, 'WEBDAV_VIDEO_MAX_RETRIES', DEFAULT_MAX_VIDEO_RETRIES), 1, 8)
    const maxBufferBytes = clampInt(getEnvInt(context.env, 'WEBDAV_MAX_BUFFER_BYTES', DEFAULT_MAX_BUFFER_BYTES), 5 * 1024 * 1024, 200 * 1024 * 1024)

    const uploadUrl = buildWebDAVPath(webdavConfig, folderPath, fileName, { asFolder: false })
    const dirUrl = getWebDAVDirUrl(uploadUrl)
    const dirOk = await ensureWebDAVFolderExists(dirUrl, auth)
    if (!dirOk) {
      return json({ success: false, error: `创建上传目录失败: ${dirUrl}` }, 500)
    }

    const alreadyExists = await checkWebDAVResourceExists(uploadUrl, auth)
    if (alreadyExists) {
      return json({
        success: true,
        filePath: uploadUrl,
        skipped: true,
        message: '文件已存在，已跳过上传'
      }, 200)
    }

    let downloadUrl = videoUrl
    const canRefresh = isLikelyDouyinUrl(sourceUrl)
    let refreshed = false
    let lastErr = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const downloadHeaders = buildDouyinHeaders('video', attempt)
        const payload = await downloadForUpload(downloadUrl, downloadHeaders, timeoutMs, maxBufferBytes)

        const uploadResp = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': payload.contentType || 'application/octet-stream',
            ...(payload.contentLength ? { 'Content-Length': payload.contentLength } : {})
          },
          body: payload.body
        })

        if (uploadResp.ok) {
          return json({ success: true, filePath: uploadUrl }, 200)
        }

        const errText = await safeReadText(uploadResp)
        const detail = extractUpstreamErrorMessage(errText) || uploadResp.statusText || `HTTP ${uploadResp.status}`

        const shouldTrySafeNameFallback = uploadResp.status === 423 || uploadResp.status >= 500
        if (shouldTrySafeNameFallback) {
          const extension = getFileExtension(fileName, 'mp4')
          const fallbackFileName = generateRandomFileName(extension)
          const fallbackUploadUrl = `${dirUrl.replace(/\/$/, '')}/${encodePathSegment(fallbackFileName)}`

          try {
            const fallbackPayload = await downloadForUpload(downloadUrl, downloadHeaders, timeoutMs, maxBufferBytes)
            const fallbackResp = await fetch(fallbackUploadUrl, {
              method: 'PUT',
              headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': fallbackPayload.contentType || 'application/octet-stream',
                ...(fallbackPayload.contentLength ? { 'Content-Length': fallbackPayload.contentLength } : {})
              },
              body: fallbackPayload.body
            })

            if (fallbackResp.ok) {
              return json({ success: true, filePath: fallbackUploadUrl }, 200)
            }

            const fallbackErrText = await safeReadText(fallbackResp)
            const fallbackDetail =
              extractUpstreamErrorMessage(fallbackErrText) ||
              fallbackResp.statusText ||
              `HTTP ${fallbackResp.status}`

            if (uploadResp.status >= 500 && attempt < maxRetries) {
              await sleep(Math.min(1000 * Math.pow(2, attempt - 1), 10000))
              continue
            }

            return json(
              {
                success: false,
                error: `上传失败: ${uploadResp.status} - ${detail}；回退文件名上传失败: ${fallbackResp.status} - ${fallbackDetail}`
              },
              uploadResp.status
            )
          } catch (fallbackError) {
            if (uploadResp.status >= 500 && attempt < maxRetries) {
              await sleep(Math.min(1000 * Math.pow(2, attempt - 1), 10000))
              continue
            }

            const fallbackMessage =
              fallbackError instanceof Error ? fallbackError.message : String(fallbackError || 'unknown')
            return json(
              {
                success: false,
                error: `上传失败: ${uploadResp.status} - ${detail}；回退文件名上传异常: ${fallbackMessage}`
              },
              uploadResp.status
            )
          }
        }

        return json({ success: false, error: `上传失败: ${uploadResp.status} - ${detail}` }, uploadResp.status)
      } catch (err) {
        lastErr = err
        const status = err && typeof err === 'object' ? Number(err.status) : NaN

        if (canRefresh && !refreshed && (status === 401 || status === 403)) {
          try {
            downloadUrl = await refreshDouyinDirectVideoUrl(context, sourceUrl)
            refreshed = true
            await sleep(300)
            continue
          } catch {
            // ignore refresh failure
          }
        }

        if (attempt < maxRetries) {
          await sleep(Math.min(1000 * Math.pow(2, attempt - 1), 10000))
          continue
        }
      }
    }

    const message = lastErr instanceof Error ? lastErr.message : String(lastErr || '下载或上传失败')
    return json({ success: false, error: message }, 502)
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : 'WebDAV 代理异常' }, 500)
  }
}

async function refreshDouyinDirectVideoUrl(context, sourceUrl) {
  const requestUrl = new URL(context.request.url)
  const endpoint = new URL('/api/douyin/parse', requestUrl.origin)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12000)
  try {
    const resp = await fetch(endpoint.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ url: sourceUrl, videoUrl: sourceUrl, text: sourceUrl }),
      signal: controller.signal
    })
    const text = await safeReadText(resp)
    if (!resp.ok) {
      const detail = extractUpstreamErrorMessage(text)
      const err = new Error(detail ? `刷新解析失败: ${detail}` : `刷新解析失败: HTTP ${resp.status}`)
      err.status = resp.status
      throw err
    }
    const payload = text ? safeJsonParse(text) : null
    const url = payload && payload.data && typeof payload.data.url === 'string' ? payload.data.url : ''
    if (!payload || payload.success !== true || !url) {
      throw new Error('刷新解析失败: 未返回有效视频URL')
    }
    return url
  } finally {
    clearTimeout(timer)
  }
}

function isLikelyDouyinUrl(value) {
  if (!value) return false
  try {
    const u = new URL(value)
    const host = (u.hostname || '').toLowerCase()
    return (
      host === 'v.douyin.com' ||
      host.endsWith('.douyin.com') ||
      host === 'iesdouyin.com' ||
      host.endsWith('.iesdouyin.com')
    )
  } catch {
    return false
  }
}

function buildDouyinHeaders(kind, attempt = 1) {
  const desktop = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  const mobile = 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1'
  const ua = attempt > 1 ? mobile : desktop

  const headers = {
    'User-Agent': ua,
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Referer': 'https://www.douyin.com/',
    'Origin': 'https://www.douyin.com',
  }

  if (kind === 'video') {
    headers['Accept'] = 'video/*,*/*;q=0.9'
  } else {
    headers['Accept'] = '*/*'
  }

  if (attempt > 1) {
    headers['Range'] = 'bytes=0-'
  }

  return headers
}

async function uploadBinaryToWebDAV(args) {
  const { sourceUrl, destUrl, auth, downloadHeaders, timeoutMs } = args
  const payload = await downloadForUpload(sourceUrl, downloadHeaders, timeoutMs, 15 * 1024 * 1024)
  const resp = await fetch(destUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': payload.contentType || 'application/octet-stream',
      ...(payload.contentLength ? { 'Content-Length': payload.contentLength } : {})
    },
    body: payload.body
  })
  return resp.ok
}

async function downloadForUpload(url, headers, timeoutMs, maxBufferBytes) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await fetch(url, {
      method: 'GET',
      headers,
      redirect: 'follow',
      signal: controller.signal
    })
    if (!resp.ok) {
      const err = new Error(`下载失败: ${resp.status} ${resp.statusText}`)
      err.status = resp.status
      err.statusText = resp.statusText
      throw err
    }

    const contentType = resp.headers.get('content-type') || 'application/octet-stream'
    const contentLengthHeader = resp.headers.get('content-length')
    const contentLength = contentLengthHeader && /^[0-9]{1,20}$/.test(contentLengthHeader) ? contentLengthHeader : ''

    // Prefer streaming transfer to avoid buffering the whole video in edge runtime (545 risk).
    if (resp.body) {
      return {
        body: resp.body,
        contentType,
        contentLength: contentLength || null
      }
    }

    // Fallback: buffer in memory (only when body streaming isn't available).
    const buf = await resp.arrayBuffer()
    if (maxBufferBytes > 0 && buf.byteLength > maxBufferBytes) {
      throw new Error(`文件过大(${Math.round(buf.byteLength / 1024 / 1024)}MB)，请改用更小的视频或提升服务端限制`)
    }
    return {
      body: buf,
      contentType,
      contentLength: String(buf.byteLength)
    }
  } finally {
    clearTimeout(timer)
  }
}

function buildBasicAuth(webdavConfig) {
  const username = String(webdavConfig.username || '')
  const password = String(webdavConfig.password || '')
  return base64Encode(`${username}:${password}`)
}

function base64Encode(value) {
  const source = String(value ?? '')

  if (typeof btoa === 'function' && typeof TextEncoder !== 'undefined') {
    const bytes = new TextEncoder().encode(source)
    let binary = ''
    const chunkSize = 0x8000
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize)
      binary += String.fromCharCode(...Array.from(chunk))
    }
    return btoa(binary)
  }

  if (typeof btoa === 'function') {
    return btoa(source)
  }

  throw new Error('无法生成 Basic 认证信息')
}

function normalizePathSegment(value) {
  return String(value || '').replace(/^\/+|\/+$/g, '')
}

function encodePathSegment(value) {
  // Keep Chinese readable but escape reserved characters.
  const safe = String(value || '').replace(/[<>:"/\\|?*]/g, '_')
  let out = ''
  for (let i = 0; i < safe.length; i++) {
    const ch = safe[i]
    const code = ch.charCodeAt(0)
    if (
      (code >= 48 && code <= 57) ||
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122) ||
      code === 45 || code === 46 || code === 95 ||
      (code >= 0x4e00 && code <= 0x9fa5)
    ) {
      out += ch
    } else {
      out += encodeURIComponent(ch)
    }
  }
  return out
}

function buildWebDAVPath(webdavConfig, folderPath, fileName, opts) {
  const asFolder = opts && opts.asFolder === true
  const base = String(webdavConfig.url || '').replace(/\/$/, '')
  let full = base
  const basePath = normalizePathSegment(webdavConfig.basePath || '')
  if (basePath) full = `${full}/${basePath}`
  const sub = normalizePathSegment(folderPath || '')
  if (sub) full = `${full}/${sub}`

  if (asFolder) {
    const name = encodePathSegment(fileName)
    return `${full}/${name}/`
  }

  const name = encodePathSegment(fileName)
  return `${full}/${name}`
}

function getWebDAVDirUrl(fileUrl) {
  const u = new URL(fileUrl)
  const path = u.pathname
  const lastSlash = path.lastIndexOf('/')
  const dirPath = lastSlash >= 0 ? path.slice(0, lastSlash + 1) : '/'
  u.pathname = dirPath
  u.search = ''
  u.hash = ''
  return u.toString()
}

async function ensureWebDAVFolderExists(folderUrl, auth, depth = 0) {
  if (!folderUrl) return false
  if (depth > 12) return false
  const normalized = folderUrl.endsWith('/') ? folderUrl : `${folderUrl}/`
  const ok = await mkcol(normalized, auth)
  if (ok) return true

  try {
    const u = new URL(normalized)
    const trimmed = u.pathname.replace(/\/+$/, '')
    const idx = trimmed.lastIndexOf('/')
    if (idx <= 0) return false
    u.pathname = trimmed.slice(0, idx + 1)
    const parent = u.toString()
    const parentOk = await ensureWebDAVFolderExists(parent, auth, depth + 1)
    if (!parentOk) return false
    return await mkcol(normalized, auth)
  } catch {
    return false
  }
}

async function checkWebDAVResourceExists(resourceUrl, auth) {
  if (!resourceUrl) return false
  const headers = { 'Authorization': `Basic ${auth}` }

  try {
    const head = await fetch(resourceUrl, {
      method: 'HEAD',
      headers
    })
    if (head.status === 200 || head.status === 204 || head.status === 206) return true
    if (head.status === 404) return false
    if (head.status !== 405 && head.status !== 501) {
      return false
    }
  } catch {
  }

  try {
    const propfind = await fetch(resourceUrl, {
      method: 'PROPFIND',
      headers: {
        ...headers,
        'Depth': '0'
      }
    })
    if (propfind.status === 207 || propfind.status === 200) return true
  } catch {
  }

  return false
}

async function mkcol(url, auth) {
  try {
    const resp = await fetch(url, {
      method: 'MKCOL',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/xml'
      }
    })
    return resp.status === 201 || resp.status === 405
  } catch {
    return false
  }
}

function generateRandomFileName(extension) {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')
  const ms = String(now.getMilliseconds()).padStart(3, '0')
  const randomNum = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
  return `${year}${month}${day}_${hours}${minutes}${seconds}_${ms}${randomNum}.${String(extension || 'jpg')}`
}

function getNameWithoutExtension(fileName) {
  return String(fileName || '').replace(/\.[^.]*$/, '')
}

function sanitizeAlbumName(name) {
  return getNameWithoutExtension(String(name || ''))
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'image_album'
}

function getImageExtensionFromUrl(imageUrl, fallback = 'jpg') {
  try {
    const parsed = new URL(String(imageUrl || ''))
    const path = parsed.pathname || ''
    const ext = path.split('.').pop()?.toLowerCase() || ''
    if (/^[a-z0-9]{1,5}$/.test(ext)) {
      return ext === 'jpeg' ? 'jpg' : ext
    }
  } catch {
  }
  return fallback
}

function buildAlbumImageFileName(albumName, index, imageUrl) {
  const base = sanitizeAlbumName(albumName)
  const seq = String(Number(index) + 1).padStart(3, '0')
  const ext = getImageExtensionFromUrl(imageUrl, 'jpg')
  return `${base}_${seq}.${ext}`
}

function getFileExtension(fileName, fallback = 'mp4') {
  const match = /\.([a-zA-Z0-9]{1,10})$/.exec(String(fileName || ''))
  return String(match && match[1] ? match[1] : fallback).toLowerCase()
}

function extractUpstreamErrorMessage(body) {
  if (!body) return ''
  const sanitized = String(body).replace(/\s+/g, ' ').trim()
  return sanitized.length > 300 ? `${sanitized.slice(0, 300)}…` : sanitized
}

function clampInt(value, min, max) {
  const v = Number(value)
  if (!Number.isFinite(v)) return min
  return Math.max(min, Math.min(max, Math.trunc(v)))
}

function getEnvInt(env, key, fallback) {
  try {
    const raw = env && Object.prototype.hasOwnProperty.call(env, key) ? env[key] : undefined
    const v = Number(raw)
    return Number.isFinite(v) ? v : fallback
  } catch {
    return fallback
  }
}

async function parseRequestBody(context) {
  const request = context.request

  if (typeof request.parse === 'function') {
    try {
      const parsed = await request.parse()
      if (parsed && typeof parsed === 'object') return parsed
      if (typeof parsed === 'string') return { videoUrl: parsed }
    } catch {
    }
  }

  try {
    const jsonBody = await request.clone().json()
    if (jsonBody && typeof jsonBody === 'object') return jsonBody
  } catch {
  }

  try {
    const text = await request.text()
    if (text && text.trim()) return safeJsonParse(text.trim()) || { videoUrl: text.trim() }
  } catch {
  }

  return {}
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

async function safeReadText(resp) {
  try {
    return await resp.text()
  } catch {
    return ''
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS_HEADERS
    }
  })
}
