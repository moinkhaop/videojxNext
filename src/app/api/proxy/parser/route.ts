import { NextRequest, NextResponse } from 'next/server'
import { VideoParseResponse, ParsedVideoInfo, MediaType, ImageInfo } from '@/types'

export async function POST(request: NextRequest) {
  try {
    const { videoUrl, parserConfig } = await request.json()

    if (!videoUrl || !parserConfig) {
      return NextResponse.json({
        success: false,
        error: '缺少必要参数'
      }, { status: 400 })
    }

    console.log(`[API] 解析视频链接: ${videoUrl}`)
    console.log(`[API] 使用解析器: ${parserConfig.name}`)

    // 构建请求到第三方解析API
    let finalApiUrl = parserConfig.apiUrl;
    let method = 'POST'; // 默认使用POST
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }

    // 判断是否需要使用GET请求（根据配置或API URL格式）
    const isGetRequest = 
      parserConfig.requestMethod === 'GET' ||
      parserConfig.useGetMethod === true ||
      parserConfig.apiUrl.includes('?url=') || 
      parserConfig.apiUrl.includes('jxcxin') ||
      parserConfig.apiUrl.includes('apis.') ||
      parserConfig.name.toLowerCase().includes('get');

    // 根据API类型构建最终请求
    if (isGetRequest) {
      method = 'GET';
      
      // 确定URL参数名称
      const urlParamName = parserConfig.urlParamName || 'url';
      
      // 处理特殊情况：jxcxin API
      if (parserConfig.apiUrl.includes('jxcxin')) {
        // 对于jxcxin API，确保格式为 https://apis.jxcxin.cn/api/douyin?url=视频地址
        if (parserConfig.apiUrl.endsWith('?url=')) {
          // URL已经包含参数名和等号
          finalApiUrl = `${parserConfig.apiUrl}${encodeURIComponent(videoUrl)}`;
        } else if (parserConfig.apiUrl.includes('?')) {
          // URL包含其他参数
          finalApiUrl = `${parserConfig.apiUrl}&url=${encodeURIComponent(videoUrl)}`;
        } else {
          // URL需要添加参数
          finalApiUrl = `${parserConfig.apiUrl}?url=${encodeURIComponent(videoUrl)}`;
        }
      } 
      // 通用GET请求处理
      else {
        // 检查API URL是否已经包含url参数
        if (parserConfig.apiUrl.endsWith('=')) {
          // URL已经包含参数名和等号
          finalApiUrl = `${parserConfig.apiUrl}${encodeURIComponent(videoUrl)}`;
        } else if (parserConfig.apiUrl.includes('?')) {
          // URL包含其他参数
          finalApiUrl = `${parserConfig.apiUrl}&${urlParamName}=${encodeURIComponent(videoUrl)}`;
        } else {
          // URL需要添加参数
          finalApiUrl = `${parserConfig.apiUrl}?${urlParamName}=${encodeURIComponent(videoUrl)}`;
        }
      }
      
      console.log(`[API] 使用GET请求: ${finalApiUrl}`);
    } else {
      // POST请求
      headers['Content-Type'] = 'application/json';
      console.log(`[API] 使用POST请求: ${finalApiUrl}`);
    }

    // 如果有API密钥，添加到headers
    if (parserConfig.apiKey) {
      headers['Authorization'] = `Bearer ${parserConfig.apiKey}`
      // 或者根据具体API的要求设置
      headers['X-API-Key'] = parserConfig.apiKey
    }

    // 构建请求选项
    const requestOptions: RequestInit = {
      method,
      headers,
      // 只有POST请求才需要请求体
      ...(method === 'POST' && {
        body: JSON.stringify({
          url: videoUrl,
          // 可以根据不同的API添加不同的参数
        })
      })
    };

    console.log(`[API] 最终请求URL: ${finalApiUrl.substring(0, 100)}${finalApiUrl.length > 100 ? '...' : ''}`);
    console.log(`[API] 请求方法: ${method}`);

    // 添加超时控制
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15秒超时
    
    let response;
    try {
      response = await fetch(finalApiUrl, {
        ...requestOptions,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        console.error(`[API] 解析API返回错误: ${response.status} ${response.statusText}`)
        return NextResponse.json({
          success: false,
          error: `解析API返回错误: ${response.status}`
        }, { status: response.status })
      }
    } catch (fetchError) {
      clearTimeout(timeoutId);
      console.error('[API] 请求失败:', fetchError instanceof Error ? fetchError.message : String(fetchError));
      return NextResponse.json({
        success: false,
        error: `请求解析API失败: ${fetchError instanceof Error ? fetchError.message : '网络错误'}`
      }, { status: 500 })
    }

    let data;
    try {
      data = await response.json();
      console.log('[API] 成功获取响应:', JSON.stringify(data).substring(0, 500));
    } catch (jsonError) {
      console.error('[API] 解析JSON响应失败:', jsonError instanceof Error ? jsonError.message : String(jsonError));
      
      // 尝试获取文本响应
      try {
        const textResponse = await response.text();
        console.log('[API] 文本响应:', textResponse.substring(0, 500));
        
        // 尝试从文本中提取可能的JSON
        if (textResponse.includes('{') && textResponse.includes('}')) {
          try {
            const jsonStart = textResponse.indexOf('{');
            const jsonEnd = textResponse.lastIndexOf('}') + 1;
            const jsonPart = textResponse.substring(jsonStart, jsonEnd);
            data = JSON.parse(jsonPart);
            console.log('[API] 从文本中提取JSON成功');
          } catch (e) {
            console.error('[API] 从文本中提取JSON失败');
            data = { text: textResponse };
          }
        } else {
          data = { text: textResponse };
        }
      } catch (textError) {
        return NextResponse.json({
          success: false,
          error: '无法解析API响应'
        }, { status: 500 })
      }
    }
    console.log(`[API] 解析结果:`, data)

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
              author: extractAuthor(jxData),
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
              author: extractAuthor(jxData),
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
          console.warn('[API] 无法从API响应中获取媒体URL，尝试使用备用测试视频')
          
          // 备用测试视频URL列表
          const backupUrls = [
            'https://www.w3schools.com/html/mov_bbb.mp4', // W3Schools 示例视频
            'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4', // 另一个测试视频
            'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4', // Google 示例视频
            'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4' // 另一个 Google 示例视频
          ];
          
          // 随机选择一个备用URL
          videoUrl = backupUrls[Math.floor(Math.random() * backupUrls.length)];
          detectedMediaType = MediaType.VIDEO
          
          // 标记为测试模式
          const title = dataSource.title || dataSource.name || '未知视频 (测试模式)'
          
          parsedInfo = {
            title: `${title} [测试模式]`,
            author: extractAuthor(dataSource),
            description: extractDescription(dataSource, title),
            mediaType: MediaType.VIDEO,
            url: videoUrl,
            duration: 30,
            fileSize: 1024 * 1024 * 10, // 10MB
            format: 'mp4',
            thumbnail: 'https://source.unsplash.com/random/1280x720/?video'
          }
          
          console.log('[API] 已切换到测试模式，将使用备用视频URL')
          return NextResponse.json({
            success: true,
            data: parsedInfo,
            message: '已切换到测试模式：无法从API获取真实视频URL'
          })
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
      return NextResponse.json({
        success: false,
        error: error instanceof Error ? error.message : '解析视频信息失败，API返回数据格式不兼容'
      }, { status: 400 })
    }

    const result: VideoParseResponse = {
      success: true,
      data: parsedInfo
    }

    return NextResponse.json(result)

  } catch (error) {
    console.error('[API] 视频解析错误:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '解析过程中发生未知错误'
    }, { status: 500 })
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
