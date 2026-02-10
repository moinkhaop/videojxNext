const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const DEFAULT_UPSTREAMS = ['https://apis.jxcxin.cn/api/douyin?url={url}']

export default async function onRequest(context) {
  try {
    const request = context.request

    if (!['GET', 'POST'].includes(request.method)) {
      return json({ success: false, error: '仅支持 GET/POST 请求' }, 405)
    }

    const inputUrl = await getInputUrl(context)
    if (!inputUrl) {
      return json({ success: false, error: '缺少 url 或 videoUrl 参数' }, 400)
    }

    const extractedUrl = extractFirstUrl(inputUrl)
    if (!extractedUrl) {
      return json({ success: false, error: '未识别到有效链接' }, 400)
    }

    const timeoutMs = getTimeoutMs(context.env)
    const resolvedUrl = await resolveShareUrl(extractedUrl, timeoutMs)
    const upstreams = getUpstreams(context.env)

    if (upstreams.length === 0) {
      return json({ success: false, error: '未配置可用的上游解析源' }, 500)
    }

    const failures = []

    for (const upstream of upstreams) {
      try {
        const rawResponse = await callUpstream(upstream, resolvedUrl, timeoutMs)
        const normalized = normalizeResult(rawResponse, resolvedUrl, upstream.name)
        return json({
          success: true,
          data: normalized,
          rawData: {
            source: upstream.name,
            resolvedUrl,
            upstream: rawResponse
          }
        })
      } catch (error) {
        failures.push(`${upstream.name}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    return json({
      success: false,
      error: '所有上游解析源均失败',
      details: failures.slice(0, 3)
    }, 502)
  } catch (error) {
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'EdgeOne 解析函数执行失败'
    }, 500)
  }
}

async function getInputUrl(context) {
  const request = context.request

  if (request.method === 'GET') {
    const url = new URL(request.url)
    return pickFirstNonEmpty([
      url.searchParams.get('url'),
      url.searchParams.get('videoUrl'),
      url.searchParams.get('text')
    ])
  }

  const body = await parseRequestBody(context)
  if (!body || typeof body !== 'object') {
    return ''
  }

  return pickFirstNonEmpty([
    body.url,
    body.videoUrl,
    body.text,
    body.content
  ])
}

async function parseRequestBody(context) {
  const request = context.request

  if (typeof request.parse === 'function') {
    try {
      const parsed = await request.parse()
      if (parsed && typeof parsed === 'object') {
        return parsed
      }
      if (typeof parsed === 'string') {
        return { url: parsed }
      }
    } catch {
    }
  }

  try {
    const fromJson = await request.clone().json()
    if (fromJson && typeof fromJson === 'object') {
      return fromJson
    }
  } catch {
  }

  try {
    const text = await request.text()
    if (text && text.trim()) {
      return { url: text.trim() }
    }
  } catch {
  }

  return null
}

function extractFirstUrl(text) {
  if (!text || typeof text !== 'string') {
    return ''
  }

  const match = text.match(/https?:\/\/[^\s]+/i)
  return match ? match[0].trim() : ''
}

async function resolveShareUrl(url, timeoutMs) {
  const timeout = createTimeoutController(timeoutMs)
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': DEFAULT_USER_AGENT },
      signal: timeout.signal
    })

    if (response.url) {
      return response.url
    }
  } catch {
  } finally {
    timeout.cleanup()
  }

  return url
}

function getTimeoutMs(env) {
  const value = Number(env?.DOUYIN_PARSER_TIMEOUT_MS)
  if (!Number.isFinite(value)) {
    return 10000
  }
  return Math.min(Math.max(Math.trunc(value), 3000), 30000)
}

function getUpstreams(env) {
  const rawConfig = typeof env?.DOUYIN_PARSER_UPSTREAMS === 'string'
    ? env.DOUYIN_PARSER_UPSTREAMS.trim()
    : ''

  let entries = []

  if (!rawConfig) {
    entries = [...DEFAULT_UPSTREAMS]
  } else if (rawConfig.startsWith('[')) {
    try {
      const parsed = JSON.parse(rawConfig)
      if (Array.isArray(parsed)) {
        entries = parsed.filter(item => typeof item === 'string')
      }
    } catch {
      entries = []
    }
  } else {
    entries = rawConfig
      .split(/[\n,]/)
      .map(item => item.trim())
      .filter(Boolean)
  }

  return entries
    .map((entry, index) => parseUpstreamEntry(entry, index))
    .filter(Boolean)
}

function parseUpstreamEntry(entry, index) {
  let name = `upstream_${index + 1}`
  let target = entry

  if (entry.includes('|')) {
    const splitIndex = entry.indexOf('|')
    name = entry.slice(0, splitIndex).trim() || name
    target = entry.slice(splitIndex + 1).trim()
  }

  let method = 'GET'
  const methodMatch = target.match(/^(GET|POST)\s+(.+)$/i)
  if (methodMatch) {
    method = methodMatch[1].toUpperCase()
    target = methodMatch[2].trim()
  }

  try {
    new URL(target.replace('{url}', 'https://www.douyin.com/video/1'))
  } catch {
    return null
  }

  return {
    name,
    method,
    target
  }
}

async function callUpstream(upstream, resolvedUrl, timeoutMs) {
  const timeout = createTimeoutController(timeoutMs)
  try {
    if (upstream.method === 'POST') {
      const requestUrl = upstream.target
      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          'User-Agent': DEFAULT_USER_AGENT,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          url: resolvedUrl,
          videoUrl: resolvedUrl
        }),
        signal: timeout.signal
      })
      return await unwrapUpstreamResponse(response)
    }

    const requestUrl = applyUrlTemplate(upstream.target, resolvedUrl)
    const response = await fetch(requestUrl, {
      method: 'GET',
      headers: {
        'User-Agent': DEFAULT_USER_AGENT,
        'Accept': 'application/json'
      },
      signal: timeout.signal
    })

    return await unwrapUpstreamResponse(response)
  } finally {
    timeout.cleanup()
  }
}

function applyUrlTemplate(template, targetUrl) {
  if (template.includes('{url}')) {
    return template.replaceAll('{url}', encodeURIComponent(targetUrl))
  }

  const requestUrl = new URL(template)
  if (!requestUrl.searchParams.has('url')) {
    requestUrl.searchParams.set('url', targetUrl)
  }
  return requestUrl.toString()
}

async function unwrapUpstreamResponse(response) {
  const text = await response.text()
  const parsed = safeJsonParse(text)

  if (!response.ok) {
    const message = extractErrorMessage(parsed) || truncateText(text)
    throw new Error(`HTTP ${response.status}${message ? `: ${message}` : ''}`)
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('上游未返回 JSON 数据')
  }

  return parsed
}

function normalizeResult(payload, resolvedUrl, source) {
  if (payload?.success === false) {
    throw new Error(extractErrorMessage(payload) || '上游返回失败状态')
  }

  if (typeof payload?.code === 'number' && ![0, 200].includes(payload.code)) {
    throw new Error(extractErrorMessage(payload) || `上游错误码: ${payload.code}`)
  }

  let dataSource = payload

  if (payload?.data && typeof payload.data === 'object') {
    dataSource = payload.data
  } else if (payload?.result && typeof payload.result === 'object') {
    dataSource = payload.result
  }

  if (dataSource?.aweme_detail && typeof dataSource.aweme_detail === 'object') {
    dataSource = dataSource.aweme_detail
  }

  if (dataSource?.item_info?.item_struct && typeof dataSource.item_info.item_struct === 'object') {
    dataSource = dataSource.item_info.item_struct
  }

  const images = collectImageUrls(dataSource)
  const videoUrl = detectVideoUrl(dataSource)

  if (!videoUrl && images.length === 0) {
    throw new Error('响应中未找到视频或图集链接')
  }

  const title = pickFirstNonEmpty([
    dataSource?.title,
    dataSource?.desc,
    dataSource?.name,
    dataSource?.video_title,
    '未命名作品'
  ])

  const author = pickAuthor(dataSource)
  const description = pickFirstNonEmpty([
    dataSource?.description,
    dataSource?.desc,
    dataSource?.content,
    title
  ])

  const thumbnail = pickFirstNonEmpty([
    dataSource?.thumbnail,
    dataSource?.cover,
    getByPath(dataSource, 'video.cover.url_list.0'),
    getByPath(dataSource, 'video.dynamic_cover.url_list.0'),
    images[0]
  ])

  if (videoUrl) {
    const duration = toDurationSeconds(
      pickFirstNonEmpty([
        dataSource?.duration,
        getByPath(dataSource, 'video.duration'),
        getByPath(dataSource, 'video_info.duration')
      ])
    )

    return {
      title,
      author,
      description,
      mediaType: 'video',
      url: videoUrl,
      duration,
      format: inferFormat(videoUrl),
      thumbnail,
      source,
      resolvedUrl
    }
  }

  return {
    title,
    author,
    description,
    mediaType: 'image_album',
    images: images.map(url => ({ url })),
    imageCount: images.length,
    thumbnail,
    source,
    resolvedUrl
  }
}

function detectVideoUrl(dataSource) {
  const directCandidates = [
    dataSource?.video_url,
    dataSource?.videoUrl,
    dataSource?.play_url,
    dataSource?.download_url,
    dataSource?.downloadUrl,
    dataSource?.playAddr,
    getByPath(dataSource, 'video.play_addr.url_list.0'),
    getByPath(dataSource, 'video.play_addr_h264.url_list.0'),
    getByPath(dataSource, 'video.bit_rate.0.play_addr.url_list.0'),
    getByPath(dataSource, 'video_info.url'),
    dataSource?.url
  ]

  const firstDirect = pickFirstHttpUrl(directCandidates)
  if (firstDirect) {
    return firstDirect
  }

  return deepFindHttpUrl(dataSource)
}

function collectImageUrls(dataSource) {
  const arrayCandidates = [
    dataSource?.images,
    dataSource?.pics,
    dataSource?.pic_list,
    dataSource?.image_list,
    dataSource?.photo_list,
    dataSource?.photos,
    Array.isArray(dataSource?.url) ? dataSource.url : null
  ].filter(Array.isArray)

  const results = []
  for (const list of arrayCandidates) {
    for (const item of list) {
      if (typeof item === 'string' && /^https?:\/\//i.test(item)) {
        results.push(item)
      } else if (item && typeof item === 'object') {
        const url = pickFirstHttpUrl([
          item.url,
          item.src,
          item.image_url,
          item.pic_url,
          item.photo_url,
          item.href
        ])
        if (url) {
          results.push(url)
        }
      }
    }
  }

  return [...new Set(results)]
}

function pickAuthor(dataSource) {
  return pickFirstNonEmpty([
    dataSource?.author,
    dataSource?.nickname,
    dataSource?.user_name,
    dataSource?.author_name,
    dataSource?.user?.nickname,
    dataSource?.author?.nickname,
    dataSource?.author?.name
  ])
}

function pickFirstHttpUrl(values) {
  for (const value of values) {
    if (typeof value === 'string' && /^https?:\/\//i.test(value)) {
      return value
    }
  }
  return ''
}

function deepFindHttpUrl(node, depth = 0, visited = new Set()) {
  if (!node || depth > 5 || visited.has(node)) {
    return ''
  }

  if (typeof node === 'string') {
    return /^https?:\/\//i.test(node) ? node : ''
  }

  if (typeof node !== 'object') {
    return ''
  }

  visited.add(node)

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = deepFindHttpUrl(item, depth + 1, visited)
      if (found) {
        return found
      }
    }
    return ''
  }

  const preferredKeys = Object.keys(node).filter(key => /(video|play|download|addr|url)/i.test(key))
  const otherKeys = Object.keys(node).filter(key => !preferredKeys.includes(key))

  for (const key of [...preferredKeys, ...otherKeys]) {
    const found = deepFindHttpUrl(node[key], depth + 1, visited)
    if (found) {
      return found
    }
  }

  return ''
}

function getByPath(source, path) {
  if (!source || typeof source !== 'object') {
    return undefined
  }

  const segments = path.split('.')
  let current = source

  for (const segment of segments) {
    if (current == null) {
      return undefined
    }

    const index = Number(segment)
    if (Number.isInteger(index) && Array.isArray(current)) {
      current = current[index]
      continue
    }

    if (typeof current === 'object' && segment in current) {
      current = current[segment]
      continue
    }

    return undefined
  }

  return current
}

function inferFormat(url) {
  if (typeof url !== 'string') {
    return 'mp4'
  }

  try {
    const pathname = new URL(url).pathname.toLowerCase()
    const matched = pathname.match(/\.([a-z0-9]{2,5})$/)
    if (matched) {
      return matched[1]
    }
  } catch {
  }

  return 'mp4'
}

function toDurationSeconds(raw) {
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) {
    return undefined
  }
  if (value > 1000) {
    return Math.round(value / 1000)
  }
  return Math.round(value)
}

function safeJsonParse(text) {
  if (!text || typeof text !== 'string') {
    return null
  }

  try {
    return JSON.parse(text)
  } catch {
  }

  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1))
    } catch {
    }
  }

  return null
}

function extractErrorMessage(payload) {
  if (!payload || typeof payload !== 'object') {
    return ''
  }

  return pickFirstNonEmpty([
    payload.error,
    payload.message,
    payload.msg,
    payload.detail,
    payload.reason
  ])
}

function truncateText(text, maxLength = 140) {
  if (!text || typeof text !== 'string') {
    return ''
  }
  const compact = text.replace(/\s+/g, ' ').trim()
  if (compact.length <= maxLength) {
    return compact
  }
  return `${compact.slice(0, maxLength)}…`
}

function pickFirstNonEmpty(values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value)
    }
  }
  return ''
}

function createTimeoutController(timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timer)
  }
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8'
    }
  })
}
