import { NextRequest, NextResponse } from 'next/server'
import { VideoParseResponse, ParsedVideoInfo, MediaType, ImageInfo } from '@/types'
import { requireRouteAuth } from '@/lib/api/route-auth'
import {
  readResponseTextLimited,
} from '@/lib/api/parser-security'
import { prepareCustomParserRequest } from '@/lib/api/custom-parser-request'
import {
  extractAuthorProfile,
  extractDescription,
  extractErrorMessageFromObject,
  extractMediaPayload,
  extractUpstreamErrorMessage,
  isVideoParseResponseLike,
  previewPayloadForLog,
  safeParseJsonBody,
} from '@/lib/api/custom-parser-response'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const auth = await requireRouteAuth(request)
  if (!auth.ok) {
    return auth.response
  }

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

    const prepared = await prepareCustomParserRequest({
      requestUrl: request.url,
      videoUrl,
      parserConfig,
    })
    if (!prepared.ok) {
      return NextResponse.json({
        success: false,
        error: prepared.error
      }, { status: 400 })
    }

    cleanedVideoUrl = prepared.value.cleanedVideoUrl
    extractedUrl = prepared.value.extractedUrl
    normalizedVideoUrl = prepared.value.normalizedVideoUrl
    parserName = prepared.value.parserName
    resolvedUpstreamUrl = prepared.value.upstreamUrl

    console.log(`[API] 使用解析器: ${parserName}`)
    const {
      finalApiUrl,
      method,
      requestOptions,
    } = prepared.value

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

    const rawBody = await readResponseTextLimited(response)
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
      const dataRecord = typeof data === 'object' && data ? data as Record<string, any> : {}
      const parserNameForDetection = parserConfig.name || parserName
      if (finalApiUrl.includes('jxcxin') || parserNameForDetection.includes('jxcxin')) {
        console.log('[API] 检测到jxcxin API格式');
        
        // jxcxin API 可能返回 { code: 200, msg: 'success', data: {...} }
        // 或者错误情况 { code: 100, msg: 'URL为空' }
        
        if (dataRecord.code === 200 || dataRecord.code === 0) {
          // 成功情况
          const jxData = dataRecord.data || {};
          const authorInfo = extractAuthorProfile(jxData)
          
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
              author: jxData.author || jxData.nickname || authorInfo?.name,
              avatar: jxData.avatar || authorInfo?.avatar,
              signature: jxData.signature || authorInfo?.signature,
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
              author: jxData.author || jxData.nickname || authorInfo?.name,
              avatar: jxData.avatar || authorInfo?.avatar,
              signature: jxData.signature || authorInfo?.signature,
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
          throw new Error(dataRecord.msg || '解析失败');
        }
      }
      
      // 通用解析逻辑
      // 检查常见的API返回格式
      if (dataRecord.success === true || dataRecord.code === 200 || dataRecord.code === 0) {
        // 尝试从不同的位置获取数据
        const dataSource = dataRecord.data || dataRecord.result || data
        
        // 尝试解析视频URL (添加更多可能的字段)
        console.log('[API] 数据源结构:', typeof dataSource === 'object' && dataSource ? Object.keys(dataSource) : [])
        
        const mediaDetectionResult = extractMediaPayload(dataSource)
        const detectedMediaType = mediaDetectionResult.mediaType
        const videoUrl = mediaDetectionResult.videoUrl || null
        const images: ImageInfo[] = mediaDetectionResult.images || []
        
        // 如果还是没找到视频URL且也没有图片，使用备用URL (使用测试视频)
        if (!videoUrl && images.length === 0) {
          throw new Error('无法从API响应中获取媒体URL（未找到视频或图集直链）')
        }
        
        console.log(`[API] 检测到媒体类型: ${detectedMediaType}`)
        
        // 根据媒体类型构建不同的解析结果
        if (detectedMediaType === MediaType.VIDEO && videoUrl) {
          console.log(`[API] 最终视频URL: ${videoUrl}`)
          const authorInfo = extractAuthorProfile(dataSource)
          
          parsedInfo = {
            title: dataSource.title || dataSource.name || dataSource.video_title || '未知标题',
            author: authorInfo?.name,
            avatar: authorInfo?.avatar,
            signature: authorInfo?.signature,
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
          const authorInfo = extractAuthorProfile(dataSource)
          
          parsedInfo = {
            title: dataSource.title || dataSource.name || dataSource.video_title || '未知图集',
            author: authorInfo?.name,
            avatar: authorInfo?.avatar,
            signature: authorInfo?.signature,
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
        const errorMsg = dataRecord.message || dataRecord.error || dataRecord.msg || 
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
  const auth = await requireRouteAuth(request)
  if (!auth.ok) {
    return auth.response
  }

  const searchParams = request.nextUrl.searchParams
  const videoUrl = searchParams.get('url')
  const testMode = searchParams.get('test') === 'true'

  if (!videoUrl && !testMode) {
    return NextResponse.json({
      success: false,
      error: '缺少视频链接参数'
    }, { status: 400 })
  }
  
  console.log(`[API] GET 请求测试模式: ${testMode}`)

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
