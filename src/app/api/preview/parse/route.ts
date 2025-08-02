import { NextRequest, NextResponse } from 'next/server'
import { PreviewParseResponse, VideoParserConfig, ParsedVideoInfo, MediaType, ImageInfo } from '@/types'

export async function POST(request: NextRequest) {
  try {
    const { videoUrl, parserConfig } = await request.json()

    if (!videoUrl || !parserConfig) {
      return NextResponse.json({
        success: false,
        error: '缺少必要参数'
      }, { status: 400 })
    }

    // {{ AURA: Modify - 重构请求构建逻辑以支持自定义参数 }}
    // 构建请求到第三方解析API
    let finalApiUrl = parserConfig.apiUrl;
    let method = parserConfig.requestMethod || 'POST'; // 使用配置的请求方法
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }

    // 添加自定义请求头
    if (parserConfig.customHeaders) {
      Object.assign(headers, parserConfig.customHeaders);
    }

    // 根据请求方法构建最终请求
    if (method === 'GET') {
      // 构建GET请求的查询参数
      // {{ AURA: Fix - 修复GET请求URL重复参数的问题 }}
      const url = new URL(finalApiUrl);
      
      // 添加视频URL参数
      const urlParamName = parserConfig.urlParamName || 'url';
      // {{ AURA: Fix - 使用 .set 覆盖可能已存在的URL参数，而不是 .append }}
      url.searchParams.set(urlParamName, videoUrl);
      
      // 添加自定义查询参数
      if (parserConfig.customQueryParams) {
        Object.entries(parserConfig.customQueryParams).forEach(([key, value]) => {
          url.searchParams.append(key, String(value));
        });
      }
      
      finalApiUrl = url.toString();
    } else {
      // POST请求设置Content-Type
      headers['Content-Type'] = 'application/json';
    }

    // 添加API密钥
    if (parserConfig.apiKey) {
      headers['Authorization'] = `Bearer ${parserConfig.apiKey}`
      headers['X-API-Key'] = parserConfig.apiKey
    }

    // {{ AURA: Fix - 修复POST请求自定义Body无效的问题 }}
    let body: any = {};
    if (method === 'POST') {
      const urlParamName = parserConfig.urlParamName || 'url';
      body[urlParamName] = videoUrl;
      if (parserConfig.customBodyParams) {
        Object.assign(body, parserConfig.customBodyParams);
      }
    }

    const requestOptions: RequestInit = {
      method,
      headers,
      ...(method === 'POST' && {
        body: JSON.stringify(body)
      })
    };

    // {{ AURA: Add - 添加请求日志 }}
    console.log('[预览解析] 发送请求到第三方API:', {
      url: finalApiUrl,
      method: method,
      headers: Object.keys(headers),
      videoUrl: videoUrl.substring(0, 50) + '...'
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    
    let response;
    try {
      response = await fetch(finalApiUrl, {
        ...requestOptions,
        signal: controller.signal
      });
      
      console.log('[预览解析] 收到API响应:', {
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get('content-type')
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        const errorText = await response.text().catch(() => '无法获取错误内容');
        console.error('[预览解析] API请求失败:', {
          status: response.status,
          statusText: response.statusText,
          url: finalApiUrl,
          method: method,
          errorText: errorText.substring(0, 500)
        });
        
        return NextResponse.json({
          success: false,
          error: `解析API返回错误 (${response.status}): ${response.statusText}. 详情: ${errorText.substring(0, 200)}`
        }, { status: response.status })
      }
    } catch (fetchError) {
      clearTimeout(timeoutId);
      return NextResponse.json({
        success: false,
        error: `请求解析API失败: ${fetchError instanceof Error ? fetchError.message : '网络错误'}`
      }, { status: 500 })
    }

    let data;
    try {
      data = await response.json();
    } catch (jsonError) {
      try {
        const textResponse = await response.text();
        if (textResponse.includes('{') && textResponse.includes('}')) {
          const jsonStart = textResponse.indexOf('{');
          const jsonEnd = textResponse.lastIndexOf('}') + 1;
          const jsonPart = textResponse.substring(jsonStart, jsonEnd);
          data = JSON.parse(jsonPart);
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

    // {{ AURA: Add - 添加完整的API响应日志 }}
    console.log('[预览解析] 第三方API响应JSON:', JSON.stringify(data, null, 2));

    let parsedInfo: ParsedVideoInfo
    
    try {
      if (finalApiUrl.includes('jxcxin') || parserConfig.name.includes('jxcxin')) {
        if (data.code === 200 || data.code === 0) {
          const jxData = data.data || {};
          const authorInfo = extractAuthor(jxData);
          
          if (jxData.url && Array.isArray(jxData.url)) {
            const images = jxData.url.map((url: string, index: number) => ({
              url: url,
              filename: `image_${(index + 1).toString().padStart(3, '0')}.jpg`
            }));
            
            parsedInfo = {
              title: jxData.title || jxData.desc || '未知图集',
              author: authorInfo?.name,
              avatar: authorInfo?.avatar,
              signature: authorInfo?.signature,
              time: extractTime(jxData),
              description: extractDescription(jxData),
              mediaType: MediaType.IMAGE_ALBUM,
              images: images,
              imageCount: images.length,
              thumbnail: jxData.cover || jxData.thumbnail || (images.length > 0 ? images[0]?.url : undefined)
            };
          } else {
            parsedInfo = {
              title: jxData.title || jxData.desc || '未知标题',
              author: authorInfo?.name,
              avatar: authorInfo?.avatar,
              signature: authorInfo?.signature,
              time: extractTime(jxData),
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
          
          // {{ AURA: Fix - 确保jxcxin成功解析时也返回原始数据 }}
          return NextResponse.json({
            success: true,
            data: parsedInfo,
            message: '解析成功，已生成预览数据',
            rawData: data
          });
        } else {
          // {{ AURA: Modify - 改进jxcxin API的错误处理 }}
          let errorMessage = data.msg || '解析失败';
          if (data.code === 404) {
            errorMessage = `解析失败：视频链接无效或已失效 (${data.msg || '404错误'})`;
          } else if (data.code === 500) {
            errorMessage = `解析失败：服务器内部错误 (${data.msg || '500错误'})`;
          } else {
            errorMessage = `解析失败：${data.msg || '未知错误'} (错误代码: ${data.code})`;
          }
          
          console.error('[预览解析] jxcxin API返回错误:', {
            code: data.code,
            msg: data.msg,
            url: videoUrl,
            fullResponse: data
          });
          
          throw new Error(errorMessage);
        }
      }
      
      // {{ AURA: Add - 添加对xiazaitool等API格式的错误处理 }}
      // 检查xiazaitool等API的错误格式
      if (data.success === false && (data.status || data.message)) {
        let errorMessage = data.message || '解析失败';
        if (data.status === 500) {
          errorMessage = `解析失败：${data.message || '服务器内部错误'}`;
        } else if (data.status === 404) {
          errorMessage = `解析失败：${data.message || '资源未找到'}`;
        } else if (data.status) {
          errorMessage = `解析失败：${data.message || '未知错误'} (状态码: ${data.status})`;
        }
        
        console.error('[预览解析] xiazaitool类API返回错误:', {
          status: data.status,
          success: data.success,
          message: data.message,
          url: videoUrl,
          fullResponse: data
        });
        
        throw new Error(errorMessage);
      }
      
      if (data.success === true || data.code === 200 || data.code === 0) {
        const dataSource = data.data || data.result || data
        
        let videoUrl = null
        let images: ImageInfo[] = []
        let detectedMediaType = MediaType.VIDEO

        const mediaDetectionResult = detectMediaTypeAndExtractData(dataSource)
        detectedMediaType = mediaDetectionResult.mediaType
        
        if (detectedMediaType === MediaType.VIDEO) {
          videoUrl = mediaDetectionResult.videoUrl
        } else if (detectedMediaType === MediaType.IMAGE_ALBUM) {
          images = mediaDetectionResult.images || []
        }
        
        if (!videoUrl && images.length === 0) {
          const possibleUrlFields = ['url', 'download_url', 'play_url', 'downloadUrl', 'playUrl', 
                                    'video_url', 'videoUrl', 'media_url', 'mediaUrl', 'mp4', 
                                    'src', 'source', 'link', 'content', 'video', 'hd', 'sd', 'playAddr']
          
          for (const field of possibleUrlFields) {
            if (dataSource[field] && typeof dataSource[field] === 'string' && dataSource[field].startsWith('http')) {
              videoUrl = dataSource[field]
              detectedMediaType = MediaType.VIDEO
              break
            }
          }
          
          if (!videoUrl) {
            for (const key in dataSource) {
              if (typeof dataSource[key] === 'object' && dataSource[key]) {
                for (const field of possibleUrlFields) {
                  if (dataSource[key][field] && typeof dataSource[key][field] === 'string' && 
                      dataSource[key][field].startsWith('http')) {
                    videoUrl = dataSource[key][field]
                    detectedMediaType = MediaType.VIDEO
                    break
                  }
                }
                if (videoUrl) break
              }
            }
          }
        }
        
        const authorInfo = extractAuthor(dataSource);

        if (detectedMediaType === MediaType.VIDEO && videoUrl) {
          parsedInfo = {
            title: dataSource.title || dataSource.name || dataSource.video_title || '未知标题',
            author: authorInfo?.name,
            avatar: authorInfo?.avatar,
            signature: authorInfo?.signature,
            time: extractTime(dataSource),
            description: extractDescription(dataSource),
            mediaType: MediaType.VIDEO,
            url: videoUrl,
            duration: dataSource.duration || dataSource.length || dataSource.video_duration,
            fileSize: dataSource.fileSize || dataSource.size || dataSource.file_size,
            format: dataSource.format || dataSource.file_format || dataSource.type || 'mp4',
            thumbnail: dataSource.thumbnail || dataSource.cover || dataSource.poster || dataSource.image
          }
        } else if (detectedMediaType === MediaType.IMAGE_ALBUM && images.length > 0) {
          parsedInfo = {
            title: dataSource.title || dataSource.name || dataSource.video_title || '未知图集',
            author: authorInfo?.name,
            avatar: authorInfo?.avatar,
            signature: authorInfo?.signature,
            time: extractTime(dataSource),
            description: extractDescription(dataSource),
            mediaType: MediaType.IMAGE_ALBUM,
            images: images,
            imageCount: images.length,
            thumbnail: (images.length > 0 ? images[0]?.url : undefined) || dataSource.thumbnail || dataSource.cover
          }
        } else {
          throw new Error('无法解析媒体内容：既没有视频URL也没有图片')
        }
      } else {
        const errorMsg = data.message || data.error || data.msg || 
                        (typeof data === 'string' ? data : '解析失败，无法识别API返回格式')
        throw new Error(errorMsg)
      }
    } catch (error) {
      console.error('[预览解析] 数据处理失败:', {
        error: error instanceof Error ? error.message : '未知错误',
        stack: error instanceof Error ? error.stack : undefined,
        apiUrl: finalApiUrl,
        rawDataPreview: JSON.stringify(data).substring(0, 500)
      });
      
      return NextResponse.json({
        success: false,
        error: error instanceof Error ? error.message : '解析视频信息失败，API返回数据格式不兼容',
        rawData: data // {{ AURA: Fix - 在解析失败时也返回原始数据以供调试 }}
      }, { status: 400 })
    }

    const result: PreviewParseResponse = {
      success: true,
      data: parsedInfo,
      message: '解析成功，已生成预览数据',
      rawData: data
    }

    // {{ AURA: Add - 添加成功解析的详细日志 }}
    console.log('[预览解析] 解析成功:', {
      apiUrl: finalApiUrl,
      title: parsedInfo.title,
      mediaType: parsedInfo.mediaType,
      author: parsedInfo.author,
      rawDataPreview: JSON.stringify(data).substring(0, 300) + '...'
    });

    return NextResponse.json(result)

  } catch (error) {
    console.error('[预览解析] 顶层错误捕获:', {
      error: error instanceof Error ? error.message : '未知错误',
      stack: error instanceof Error ? error.stack : undefined
    });
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '解析过程中发生未知错误'
    }, { status: 500 })
  }
}

function detectMediaTypeAndExtractData(dataSource: any): {
  mediaType: MediaType,
  videoUrl?: string,
  images?: ImageInfo[]
} {
  const imageArrayFields = ['images', 'pics', 'pictures', 'photos', 'image_list', 'pic_list']
  
  for (const field of imageArrayFields) {
    if (dataSource[field] && Array.isArray(dataSource[field]) && dataSource[field].length > 0) {
      const images = dataSource[field].map((item: any, index: number) => {
        let imageUrl = ''
        
        if (typeof item === 'string') {
          imageUrl = item
        } else if (typeof item === 'object' && item) {
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
  
  const videoUrlFields = ['url', 'video_url', 'videoUrl', 'play_url', 'playAddr', 'download_url', 'downloadUrl']
  
  for (const field of videoUrlFields) {
    if (dataSource[field] && typeof dataSource[field] === 'string' && dataSource[field].startsWith('http')) {
      return {
        mediaType: MediaType.VIDEO,
        videoUrl: dataSource[field]
      }
    }
  }
  
  for (const key in dataSource) {
    if (typeof dataSource[key] === 'object' && dataSource[key]) {
      const nestedResult = detectMediaTypeAndExtractData(dataSource[key])
      if (nestedResult.mediaType === MediaType.IMAGE_ALBUM && nestedResult.images?.length ||
          nestedResult.mediaType === MediaType.VIDEO && nestedResult.videoUrl) {
        return nestedResult
      }
    }
  }
  
  return {
    mediaType: MediaType.VIDEO
  }
}

function extractAuthor(dataSource: any): { name?: string; avatar?: string; signature?: string } | undefined {
  let result: { name?: string; avatar?: string; signature?: string } = {};

  const authorObjectFields = ['author', 'creator', 'user', 'author_info', 'user_info'];
  for (const field of authorObjectFields) {
    if (typeof dataSource[field] === 'object' && dataSource[field]) {
      const authorData = dataSource[field];
      result.name = authorData.name || authorData.nickname || authorData.username || authorData.title;
      result.avatar = authorData.avatar || authorData.avatar_url || authorData.icon || authorData.head_url;
      result.signature = authorData.signature || authorData.sign || authorData.desc || authorData.description;
      if (result.name) {
        return result;
      }
    }
  }

  const nameFields = ['author', 'creator', 'user', 'username', 'nickname', 'name', 'author_name', 'user_name'];
  for (const field of nameFields) {
    if (typeof dataSource[field] === 'string' && !result.name) {
      result.name = dataSource[field];
      break;
    }
  }

  const avatarFields = ['avatar', 'author_avatar', 'avatar_url', 'icon', 'head_url'];
  for (const field of avatarFields) {
    if (typeof dataSource[field] === 'string' && !result.avatar) {
      result.avatar = dataSource[field];
      break;
    }
  }

  const signatureFields = ['signature', 'sign', 'desc', 'description', 'author_signature'];
  for (const field of signatureFields) {
    if (typeof dataSource[field] === 'string' && !result.signature) {
      result.signature = dataSource[field];
      break;
    }
  }
  
  if (Object.keys(result).length > 0) {
    return result;
  }

  return undefined;
}

function extractDescription(dataSource: any, fallbackTitle?: string): string | undefined {
  const descFields = ['description', 'desc', 'content', 'text', 'caption', 'summary', 'detail']
  
  for (const field of descFields) {
    if (dataSource[field] && typeof dataSource[field] === 'string' && dataSource[field].trim()) {
      return dataSource[field].trim()
    }
  }
  
  return fallbackTitle
}

function extractTime(dataSource: any): number | string | undefined {
  const timeFields = ['time', 'timestamp', 'create_time', 'created_at', 'publish_time', 'release_time', 'date']
  
  for (const field of timeFields) {
    if (dataSource[field]) {
      const value = dataSource[field]
      if (typeof value === 'number') {
        return value < 10000000000 ? value * 1000 : value
      }
      if (typeof value === 'string') {
        const timestamp = Date.parse(value)
        if (!isNaN(timestamp)) {
          return timestamp
        }
        return value
      }
    }
  }
  
  return undefined
}