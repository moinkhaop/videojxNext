import { NextRequest, NextResponse } from 'next/server'
import { VideoParseResponse, ParsedVideoInfo, MediaType, ImageInfo } from '@/types'

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

export async function POST(request: NextRequest) {
  let cleanedVideoUrl = ''
  let extractedUrl = ''
  let normalizedVideoUrl = ''
  let parserName = '自定义解析器'
  let resolvedUpstreamUrl: URL | null = null

  try {
    const { videoUrl, parserConfig } = await request.json()

    if (!videoUrl || !parserConfig) {
      return NextResponse.json({
        success: false,
        error: '缺少必要参数'
      }, { status: 400 })
    }

    if (!parserConfig.apiUrl || typeof parserConfig.apiUrl !== 'string' || !parserConfig.apiUrl.trim()) {
      return NextResponse.json({
        success: false,
        error: '解析API地址无效或未配置'
      }, { status: 400 })
    }

    cleanedVideoUrl = String(videoUrl || '').trim()
    extractedUrl = extractFirstUrlFromText(cleanedVideoUrl) || cleanedVideoUrl
    const initialNormalizedUrl = normalizeDouyinInputUrl(extractedUrl)
    parserName = parserConfig.name?.trim() || '自定义解析器'
    const urlParamName = parserConfig.urlParamName?.trim() || 'url'

    let upstreamUrl: URL
    try {
      upstreamUrl = new URL(String(parserConfig.apiUrl).trim(), request.url)
    } catch (urlError) {
      console.error('[API] 解析API地址格式错误:', urlError)
      return NextResponse.json({
        success: false,
        error: '解析API地址格式错误，请填写完整URL或以 / 开头的站内路径'
      }, { status: 400 })
    }

    if (!['http:', 'https:'].includes(upstreamUrl.protocol)) {
      return NextResponse.json({
        success: false,
        error: '解析API地址仅支持 http/https 协议'
      }, { status: 400 })
    }

    resolvedUpstreamUrl = upstreamUrl

    const resolvedUrl = await resolveShareUrlIfNeeded(initialNormalizedUrl, 10000)
    normalizedVideoUrl = normalizeDouyinInputUrl(resolvedUrl)

    console.log(`[API] 解析视频链接: ${cleanedVideoUrl}`)
    if (extractedUrl && extractedUrl !== cleanedVideoUrl) {
      console.log(`[API] 从文本提取URL: ${extractedUrl}`)
    }
    if (resolvedUrl && resolvedUrl !== initialNormalizedUrl) {
      console.log(`[API] 解析短链重定向: ${resolvedUrl}`)
    }
    if (normalizedVideoUrl && normalizedVideoUrl !== extractedUrl) {
      console.log(`[API] 归一化链接: ${normalizedVideoUrl}`)
    }
    console.log(`[API] 使用解析器: ${parserName}`)

    const headers: Record<string, string> = {
      'User-Agent': DEFAULT_USER_AGENT
    }

    if (parserConfig.customHeaders) {
      for (const [key, value] of Object.entries(parserConfig.customHeaders)) {
        if (typeof key === 'string' && typeof value === 'string' && key.trim()) {
          headers[key] = value
        }
      }
    }

    const headerKeys = Object.keys(headers)
    const hasContentTypeHeader = headerKeys.some(key => key.toLowerCase() === 'content-type')
    const hasAuthorizationHeader = headerKeys.some(key => key.toLowerCase() === 'authorization')
    const hasApiKeyHeader = headerKeys.some(key => key.toLowerCase() === 'x-api-key')

    if (parserConfig.apiKey) {
      if (!hasAuthorizationHeader) {
        headers['Authorization'] = `Bearer ${parserConfig.apiKey}`
      }
      if (!hasApiKeyHeader) {
        headers['X-API-Key'] = parserConfig.apiKey
      }
    }

    const configuredMethod = parserConfig.requestMethod?.toUpperCase()
    const shouldUseGet = configuredMethod === 'GET'
      || (!configuredMethod && (
        parserConfig.useGetMethod === true ||
        upstreamUrl.searchParams.has(urlParamName) ||
        parserConfig.apiUrl.includes('?url=') ||
        parserName.toLowerCase().includes('get')
      ))

    const method: 'GET' | 'POST' = shouldUseGet ? 'GET' : 'POST'

    if (method === 'GET') {
      const queryParams = new URLSearchParams()
      if (parserConfig.customQueryParams) {
        Object.entries(parserConfig.customQueryParams).forEach(([key, value]) => {
          if (typeof key === 'string' && value !== undefined && value !== null) {
            queryParams.set(key, String(value))
          }
        })
      }
      queryParams.set(urlParamName, normalizedVideoUrl)

      queryParams.forEach((value, key) => {
        upstreamUrl.searchParams.set(key, value)
      })

      console.log(`[API] 使用GET请求: ${upstreamUrl.toString()}`)
    }

    let requestBody: string | undefined
    if (method === 'POST') {
      if (!hasContentTypeHeader) {
        headers['Content-Type'] = 'application/json'
      }

      const bodyPayload = {
        ...(parserConfig.customBodyParams || {}),
        [urlParamName]: normalizedVideoUrl
      }

      requestBody = JSON.stringify(bodyPayload)
      console.log(`[API] 使用POST请求: ${upstreamUrl.toString()}`)
    }

    const finalApiUrl = upstreamUrl.toString()

    const requestOptions: RequestInit = {
      method,
      headers,
      ...(method === 'POST' && requestBody ? { body: requestBody } : {})
    }

    console.log(`[API] 最终请求URL: ${finalApiUrl.substring(0, 100)}${finalApiUrl.length > 100 ? '...' : ''}`)
    console.log(`[API] 请求方法: ${method}`)
    // 添加超时控制
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15秒超时

    let response: Response
    try {
      response = await fetch(finalApiUrl, {
        ...requestOptions,
        signal: controller.signal
      })
    } catch (fetchError) {
      clearTimeout(timeoutId)
      console.error('[API] 请求失败:', fetchError instanceof Error ? fetchError.message : String(fetchError))
      throw new Error(`请求解析API失败: ${fetchError instanceof Error ? fetchError.message : '网络错误'}`)
    }

    clearTimeout(timeoutId)

    const rawBody = await response.text()
    console.log(`[API] 上游响应状态: ${response.status}, 内容长度: ${rawBody.length}`)

    if (!response.ok) {
      const upstreamMessage = extractUpstreamErrorMessage(rawBody)
      console.error(`[API] 解析API返回错误: ${response.status} ${upstreamMessage}`)
      throw new Error(`${parserName} 返回错误 (${response.status}): ${upstreamMessage || '请求失败'}`)
    }

    const data = safeParseJsonBody(rawBody)

    if (!data) {
      console.error('[API] 无法将上游响应解析为JSON')
      throw new Error('解析API返回了非JSON响应')
    }

    // 如果上游已经返回了标准化格式（例如站内内置解析器），直接透传。
    if (isVideoParseResponseLike(data)) {
      return NextResponse.json({
        success: true,
        data: data.data,
        rawData: data.rawData ?? data
      } satisfies VideoParseResponse)
    }

    console.log('[API] 成功获取响应片段:', previewPayloadForLog(data))

    // 根据不同的API返回格式，标准化数据结构
    let parsedInfo: ParsedVideoInfo
    
    // 更健壮的数据解析逻辑
    try {
      // 特殊处理jxcxin API (如果检测到其格式)
      if (finalApiUrl.includes('jxcxin') || parserConfig.name.includes('jxcxin')) {
        console.log('[API] 检测到jxcxin API格式');
        
        // jxcxin API 可能返回 { code: 200, msg: 'success', data: {...} }
        // 或者错误情况 { code: 100, msg: 'URL为空' }
        
        if (data.code === 200 || data.code === 0) {
          // 成功情况
          const jxData = data.data || {};
          
          // {{ AURA: Modify - 修复jxcxin API图集识别问题 }}
          // 检查是否是图集（包含url数组）
          if (jxData.url && Array.isArray(jxData.url)) {
            // 图集类型
            const images = jxData.url.map((url: string, index: number) => ({
              url: url,
              filename: `image_${(index + 1).toString().padStart(3, '0')}.jpg`
            }));
            
            parsedInfo = {
              title: jxData.title || jxData.desc || '未知图集',
              author: jxData.author || jxData.nickname || extractAuthor(jxData),
              avatar: jxData.avatar,
              signature: jxData.signature,
              short_id: jxData.short_id,
              uid: jxData.uid,
              like: jxData.like,
              cover: jxData.cover,
              time: jxData.time,
              description: extractDescription(jxData),
              mediaType: MediaType.IMAGE_ALBUM,
              images: images,
              imageCount: images.length,
              thumbnail: jxData.cover || jxData.thumbnail || (images.length > 0 ? images[0].url : undefined)
            };
          } else {
            // 视频类型
            parsedInfo = {
              title: jxData.title || jxData.desc || '未知标题',
              author: jxData.author || jxData.nickname || extractAuthor(jxData),
              avatar: jxData.avatar,
              signature: jxData.signature,
              short_id: jxData.short_id,
              uid: jxData.uid,
              like: jxData.like,
              cover: jxData.cover,
              time: jxData.time,
              description: extractDescription(jxData),
              mediaType: MediaType.VIDEO,
              url: jxData.url || jxData.video_url || jxData.playAddr || '',
              duration: jxData.duration,
              fileSize: jxData.size,
              format: 'mp4',
              thumbnail: jxData.cover || jxData.thumbnail
            };
            
            if (!parsedInfo.url) {
              throw new Error('解析结果中没有视频URL');
            }
          }
          
          return NextResponse.json({
            success: true,
            data: parsedInfo
          });
        } else {
          // 错误情况
          throw new Error(data.msg || '解析失败');
        }
      }
      
      // 通用解析逻辑
      // 检查常见的API返回格式
      if (data.success === true || data.code === 200 || data.code === 0) {
        // 尝试从不同的位置获取数据
        const dataSource = data.data || data.result || data
        
        // 尝试解析视频URL (添加更多可能的字段)
        console.log('[API] 数据源结构:', Object.keys(dataSource))
        
        // 深度搜索对象中任何可能的URL字段
        let videoUrl = null
        let images: ImageInfo[] = []
        let detectedMediaType = MediaType.VIDEO // 默认为视频类型
        
        // {{ AURA: Add - 检测媒体类型和提取相应数据 }}
        const mediaDetectionResult = detectMediaTypeAndExtractData(dataSource)
        detectedMediaType = mediaDetectionResult.mediaType
        
        if (detectedMediaType === MediaType.VIDEO) {
          videoUrl = mediaDetectionResult.videoUrl
        } else if (detectedMediaType === MediaType.IMAGE_ALBUM) {
          images = mediaDetectionResult.images || []
        }
        
        // 如果没有检测到明确的媒体类型，尝试原来的逻辑
        if (!videoUrl && images.length === 0) {
          const possibleUrlFields = ['url', 'download_url', 'play_url', 'downloadUrl', 'playUrl', 
                                    'video_url', 'videoUrl', 'media_url', 'mediaUrl', 'mp4', 
                                    'src', 'source', 'link', 'content', 'video', 'hd', 'sd', 'playAddr']
          
          // 先直接查找一级字段
          for (const field of possibleUrlFields) {
            if (dataSource[field] && typeof dataSource[field] === 'string' && dataSource[field].startsWith('http')) {
              videoUrl = dataSource[field]
              console.log(`[API] 找到视频URL(${field}): ${videoUrl}`)
              detectedMediaType = MediaType.VIDEO
              break
            }
          }
          
          // 如果没找到，查找二级字段
          if (!videoUrl) {
            for (const key in dataSource) {
              if (typeof dataSource[key] === 'object' && dataSource[key]) {
                for (const field of possibleUrlFields) {
                  if (dataSource[key][field] && typeof dataSource[key][field] === 'string' && 
                      dataSource[key][field].startsWith('http')) {
                    videoUrl = dataSource[key][field]
                    console.log(`[API] 找到嵌套视频URL(${key}.${field}): ${videoUrl}`)
                    detectedMediaType = MediaType.VIDEO
                    break
                  }
                }
                if (videoUrl) break
              }
            }
          }
        }
        
        // 如果还是没找到视频URL且也没有图片，使用备用URL (使用测试视频)
        if (!videoUrl && images.length === 0) {
          throw new Error('无法从API响应中获取媒体URL（未找到视频或图集直链）')
        }
        
        console.log(`[API] 检测到媒体类型: ${detectedMediaType}`)
        
        // 根据媒体类型构建不同的解析结果
        if (detectedMediaType === MediaType.VIDEO && videoUrl) {
          console.log(`[API] 最终视频URL: ${videoUrl}`)
          
          parsedInfo = {
            title: dataSource.title || dataSource.name || dataSource.video_title || '未知标题',
            author: extractAuthor(dataSource),
            description: extractDescription(dataSource),
            mediaType: MediaType.VIDEO,
            url: videoUrl,
            duration: dataSource.duration || dataSource.length || dataSource.video_duration,
            fileSize: dataSource.fileSize || dataSource.size || dataSource.file_size,
            format: dataSource.format || dataSource.file_format || dataSource.type || 'mp4',
            thumbnail: dataSource.thumbnail || dataSource.cover || dataSource.poster || dataSource.image
          }
        } else if (detectedMediaType === MediaType.IMAGE_ALBUM && images.length > 0) {
          console.log(`[API] 检测到图集，包含 ${images.length} 张图片`)
          
          parsedInfo = {
            title: dataSource.title || dataSource.name || dataSource.video_title || '未知图集',
            author: extractAuthor(dataSource),
            description: extractDescription(dataSource),
            mediaType: MediaType.IMAGE_ALBUM,
            images: images,
            imageCount: images.length,
            thumbnail: images[0]?.url || dataSource.thumbnail || dataSource.cover
          }
        } else {
          throw new Error('无法解析媒体内容：既没有视频URL也没有图片')
        }
      } else {
        // 解析失败，提供详细错误信息
        const errorMsg = data.message || data.error || data.msg || 
                        (typeof data === 'string' ? data : '解析失败，无法识别API返回格式')
        throw new Error(errorMsg)
      }
    } catch (error) {
      console.error('[API] 数据解析错误:', error)
      throw new Error(error instanceof Error ? error.message : '解析视频信息失败，API返回数据格式不兼容')
    }

    const result: VideoParseResponse = {
      success: true,
      data: parsedInfo
    }

    return NextResponse.json(result)

  } catch (error) {
    console.error('[API] 视频解析错误:', error)
    const failure = error instanceof Error ? error.message : '解析过程中发生未知错误'
    const platform = detectPlatformHint(extractedUrl || cleanedVideoUrl)

    const failures: string[] = [failure]

    const fallbackResponse = await tryFallbackParse({
      requestUrl: request.url,
      platform,
      inputUrl: extractedUrl || cleanedVideoUrl,
      usedParserName: parserName,
      usedParserUrl: resolvedUpstreamUrl?.toString() || '',
      failures
    })

    if (fallbackResponse) {
      return NextResponse.json(fallbackResponse)
    }

    return NextResponse.json({
      success: false,
      error: failures[0] || '解析失败',
      rawData: {
        failures: failures.slice(0, 3),
        platform,
        extractedUrl: extractedUrl || undefined,
        resolvedUrl: normalizedVideoUrl || undefined,
        parserName,
        parserUrl: resolvedUpstreamUrl?.toString() || undefined
      }
    }, { status: 502 })
  }
}

// 支持GET请求用于测试
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const videoUrl = searchParams.get('url')
  const testMode = searchParams.get('test') === 'true'

  if (!videoUrl && !testMode) {
    return NextResponse.json({
      success: false,
      error: '缺少视频链接参数'
    }, { status: 400 })
  }
  
  console.log(`[API] GET 请求测试模式: ${testMode}, URL: ${videoUrl}`)

  // 用于模拟和测试的视频信息
  let title = '测试视频标题'
  
  // 备用测试视频URL列表
  const testVideoUrls = [
    'https://www.w3schools.com/html/mov_bbb.mp4', // W3Schools 示例视频
    'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4', // 另一个测试视频
    'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4', // Google 示例视频
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4' // 另一个 Google 示例视频
  ];
  
  // 随机选择一个备用URL
  let fileUrl = testVideoUrls[Math.floor(Math.random() * testVideoUrls.length)];
  let duration = 120
  
  // 如果提供了实际URL，尝试从URL中提取一些信息作为标题
  if (videoUrl) {
    try {
      const url = new URL(videoUrl)
      const pathParts = url.pathname.split('/').filter(Boolean)
      if (pathParts.length > 0) {
        const lastPart = pathParts[pathParts.length - 1]
        if (lastPart) {
          title = decodeURIComponent(lastPart.replace(/\.\w+$/, '').replace(/-|_/g, ' '))
        }
      }
    } catch (e) {
      // 如果URL解析失败，使用默认标题
    }
  }

  // 模拟解析结果用于测试
  const mockResult: VideoParseResponse = {
    success: true,
    data: {
      title: videoUrl ? `[测试] ${title}` : `[测试视频] ${new Date().toISOString()}`,
      author: '测试作者',
      description: '这是一个测试视频的描述文本',
      mediaType: MediaType.VIDEO,
      url: fileUrl,
      duration: duration,
      fileSize: 1024 * 1024 * 10, // 10MB
      format: 'mp4',
      thumbnail: 'https://source.unsplash.com/random/1280x720/?video'
    }
  }

  console.log('[API] 返回测试解析结果:', mockResult)
  return NextResponse.json(mockResult)
}

function extractFirstUrlFromText(text: string): string {
  const source = String(text || '')
  const match = source.match(/https?:\/\/[^\s]+/i)
  return match ? match[0].trim() : ''
}

function isVideoParseResponseLike(payload: any): payload is VideoParseResponse {
  if (!payload || typeof payload !== 'object') return false
  if (payload.success !== true) return false
  const data = payload.data
  if (!data || typeof data !== 'object') return false
  const hasVideo = typeof data.url === 'string' && data.url.startsWith('http')
  const hasImages = Array.isArray(data.images) && data.images.length > 0
  return typeof data.mediaType === 'string' && (hasVideo || hasImages)
}

function normalizeDouyinInputUrl(input: string): string {
  const url = String(input || '').trim()
  if (!url) return ''

  // If user pasted just an aweme_id, convert to a stable share page URL.
  if (/^[0-9]{10,25}$/.test(url)) {
    return `https://www.iesdouyin.com/share/video/${url}`
  }

  // Only normalize Douyin URLs.
  if (!/douyin\.com|iesdouyin\.com|v\.douyin\.com/i.test(url)) {
    return url
  }

  // Normalize long video pages to the share page URL. Many upstream parsers accept this input format.
  const awemeMatch = url.match(/\/video\/([0-9]{10,25})/i)
  if (awemeMatch && awemeMatch[1]) {
    return `https://www.iesdouyin.com/share/video/${awemeMatch[1]}`
  }

  return url
}

function shouldResolveShareUrl(url: string): boolean {
  const source = String(url || '').trim()
  if (!source) return false
  if (!/^https?:\/\//i.test(source)) return false
  // Resolve Douyin short links; many upstream parsers require a long/share URL.
  return /^https?:\/\/v\.douyin\.com\//i.test(source)
}

async function resolveShareUrlIfNeeded(url: string, timeoutMs: number): Promise<string> {
  if (!shouldResolveShareUrl(url)) {
    return url
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': DEFAULT_USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      signal: controller.signal
    })
    return response.url || url
  } catch {
    return url
  } finally {
    clearTimeout(timeout)
  }
}

function safeParseJsonBody(body: string): any | null {
  if (!body || !body.trim()) {
    return null
  }

  try {
    return JSON.parse(body)
  } catch (error) {
    const start = body.indexOf('{')
    const end = body.lastIndexOf('}')
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(body.substring(start, end + 1))
      } catch (innerError) {
        console.error('[API] 无法从响应文本中提取JSON:', innerError)
      }
    }
  }

  return null
}

function extractUpstreamErrorMessage(body: string): string {
  const parsed = safeParseJsonBody(body)
  if (parsed && typeof parsed === 'object') {
    const possibleKeys = ['error', 'message', 'msg', 'detail', 'reason']
    for (const key of possibleKeys) {
      const value = (parsed as Record<string, unknown>)[key]
      if (typeof value === 'string' && value.trim()) {
        return value.trim()
      }
    }
  }

  return sanitizeTextSnippet(body)
}

function extractErrorMessageFromObject(payload: any): string {
  if (!payload || typeof payload !== 'object') {
    return ''
  }

  const keys = ['error', 'message', 'msg', 'detail', 'reason']
  for (const key of keys) {
    const value = payload?.[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return ''
}

function sanitizeTextSnippet(text: string, maxLength = 200): string {
  if (!text) return ''
  const condensed = text.replace(/\s+/g, ' ').trim()
  if (!condensed) {
    return ''
  }
  return condensed.length > maxLength
    ? `${condensed.substring(0, maxLength)}…`
    : condensed
}

function previewPayloadForLog(payload: unknown): string {
  if (payload == null) {
    return ''
  }

  if (typeof payload === 'string') {
    return sanitizeTextSnippet(payload)
  }

  try {
    const serialized = JSON.stringify(payload)
    return serialized.length > 500 ? `${serialized.substring(0, 500)}…` : serialized
  } catch (error) {
    console.error('[API] 无法序列化上游响应用于日志:', error)
    return '[unserializable payload]'
  }
}

// {{ AURA: Add - 智能媒体类型检测函数 }}
function detectMediaTypeAndExtractData(dataSource: any): {
  mediaType: MediaType,
  videoUrl?: string,
  images?: ImageInfo[]
} {
  // 检查是否包含图片数组字段
  const imageArrayFields = ['images', 'pics', 'pictures', 'photos', 'image_list', 'pic_list']
  
  for (const field of imageArrayFields) {
    if (dataSource[field] && Array.isArray(dataSource[field]) && dataSource[field].length > 0) {
      console.log(`[API] 检测到图集字段: ${field}，包含 ${dataSource[field].length} 个项目`)
      
      const images = dataSource[field].map((item: any, index: number) => {
        let imageUrl = ''
        
        if (typeof item === 'string') {
          imageUrl = item
        } else if (typeof item === 'object' && item) {
          // 尝试从对象中提取图片URL
          const urlFields = ['url', 'src', 'image_url', 'pic_url', 'photo_url', 'link', 'href']
          for (const urlField of urlFields) {
            if (item[urlField] && typeof item[urlField] === 'string') {
              imageUrl = item[urlField]
              break
            }
          }
        }
        
        if (imageUrl && imageUrl.startsWith('http')) {
          return {
            url: imageUrl,
            filename: `image_${(index + 1).toString().padStart(3, '0')}.jpg`
          } as ImageInfo
        }
        return null
      }).filter((item): item is ImageInfo => item !== null)
      
      if (images.length > 0) {
        return {
          mediaType: MediaType.IMAGE_ALBUM,
          images: images
        }
      }
    }
  }
  
  // 检查视频URL字段
  const videoUrlFields = ['url', 'video_url', 'videoUrl', 'play_url', 'playAddr', 'download_url', 'downloadUrl']
  
  for (const field of videoUrlFields) {
    if (dataSource[field] && typeof dataSource[field] === 'string' && dataSource[field].startsWith('http')) {
      console.log(`[API] 检测到视频URL字段: ${field}`)
      return {
        mediaType: MediaType.VIDEO,
        videoUrl: dataSource[field]
      }
    }
  }
  
  // 深度搜索嵌套对象
  for (const key in dataSource) {
    if (typeof dataSource[key] === 'object' && dataSource[key]) {
      const nestedResult = detectMediaTypeAndExtractData(dataSource[key])
      if (nestedResult.mediaType === MediaType.IMAGE_ALBUM && nestedResult.images?.length ||
          nestedResult.mediaType === MediaType.VIDEO && nestedResult.videoUrl) {
        return nestedResult
      }
    }
  }
  
  // 默认返回视频类型
  return {
    mediaType: MediaType.VIDEO
  }
}

// {{ AURA: Add - 提取作者信息的函数 }}
function extractAuthor(dataSource: any): string | undefined {
  const authorFields = ['author', 'creator', 'user', 'username', 'nickname', 'name', 'author_name', 'user_name']
  
  for (const field of authorFields) {
    if (dataSource[field]) {
      if (typeof dataSource[field] === 'string') {
        return dataSource[field]
      } else if (typeof dataSource[field] === 'object' && dataSource[field]) {
        // 从作者对象中提取名称
        const nameFields = ['name', 'nickname', 'username', 'title']
        for (const nameField of nameFields) {
          if (dataSource[field][nameField] && typeof dataSource[field][nameField] === 'string') {
            return dataSource[field][nameField]
          }
        }
      }
    }
  }
  
  return undefined
}

// {{ AURA: Add - 提取描述信息的函数 }}
function extractDescription(dataSource: any, fallbackTitle?: string): string | undefined {
  const descFields = ['description', 'desc', 'content', 'text', 'caption', 'summary', 'detail']
  
  for (const field of descFields) {
    if (dataSource[field] && typeof dataSource[field] === 'string' && dataSource[field].trim()) {
      return dataSource[field].trim()
    }
  }
  
  // 如果没有找到描述，使用标题作为备用
  return fallbackTitle
}

type PlatformHint = 'douyin' | 'bilibili' | 'unknown'

function detectPlatformHint(input: string): PlatformHint {
  const text = String(input || '').trim()
  if (!text) return 'unknown'

  if (/douyin\.com|iesdouyin\.com|v\.douyin\.com/i.test(text) || /^[0-9]{10,25}$/.test(text)) {
    return 'douyin'
  }

  if (/bilibili\.com|b23\.tv/i.test(text) || /(^|\W)(BV[0-9A-Za-z]{10,})/i.test(text) || /(^|\W)av[0-9]{1,12}(\W|$)/i.test(text)) {
    return 'bilibili'
  }

  return 'unknown'
}

async function tryFallbackParse(args: {
  requestUrl: string
  platform: PlatformHint
  inputUrl: string
  usedParserName: string
  usedParserUrl: string
  failures: string[]
}): Promise<VideoParseResponse | null> {
  const { platform, requestUrl, inputUrl, usedParserName, usedParserUrl, failures } = args
  if (platform === 'unknown') {
    return null
  }

  const fallbackPath = platform === 'douyin'
    ? '/api/douyin/parse'
    : '/api/bilibili/parse'

  try {
    const endpoint = new URL(fallbackPath, requestUrl).toString()
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: inputUrl, videoUrl: inputUrl })
    })

    const raw = await response.text()
    const parsed = safeParseJsonBody(raw)

    if (!response.ok || !parsed) {
      throw new Error(`HTTP ${response.status}: ${extractUpstreamErrorMessage(raw) || 'fallback returned non-json'}`)
    }

    if (!isVideoParseResponseLike(parsed)) {
      const upstreamErr = extractErrorMessageFromObject(parsed) || extractUpstreamErrorMessage(raw)
      throw new Error(upstreamErr || 'fallback response is not VideoParseResponse')
    }

    const result: VideoParseResponse = {
      success: true,
      data: parsed.data,
      rawData: {
        ...(parsed.rawData ?? parsed),
        fallback: {
          fromParser: usedParserName,
          fromUrl: usedParserUrl,
          failures: failures.slice(0, 3),
          usedFallback: fallbackPath
        }
      }
    }

    console.log(`[API] 解析失败后自动降级到内置解析器: ${fallbackPath}`)
    return result
  } catch (error) {
    failures.push(`fallback(${fallbackPath}): ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}
