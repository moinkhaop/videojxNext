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
      
      const urlParamName = parserConfig.urlParamName || 'url';
      
      if (parserConfig.apiUrl.includes('jxcxin')) {
        if (parserConfig.apiUrl.endsWith('?url=')) {
          finalApiUrl = `${parserConfig.apiUrl}${encodeURIComponent(videoUrl)}`;
        } else if (parserConfig.apiUrl.includes('?')) {
          finalApiUrl = `${parserConfig.apiUrl}&url=${encodeURIComponent(videoUrl)}`;
        } else {
          finalApiUrl = `${parserConfig.apiUrl}?url=${encodeURIComponent(videoUrl)}`;
        }
      } 
      else {
        if (parserConfig.apiUrl.endsWith('=')) {
          finalApiUrl = `${parserConfig.apiUrl}${encodeURIComponent(videoUrl)}`;
        } else if (parserConfig.apiUrl.includes('?')) {
          finalApiUrl = `${parserConfig.apiUrl}&${urlParamName}=${encodeURIComponent(videoUrl)}`;
        } else {
          finalApiUrl = `${parserConfig.apiUrl}?${urlParamName}=${encodeURIComponent(videoUrl)}`;
        }
      }
    } else {
      headers['Content-Type'] = 'application/json';
    }

    if (parserConfig.apiKey) {
      headers['Authorization'] = `Bearer ${parserConfig.apiKey}`
      headers['X-API-Key'] = parserConfig.apiKey
    }

    const requestOptions: RequestInit = {
      method,
      headers,
      ...(method === 'POST' && {
        body: JSON.stringify({ url: videoUrl })
      })
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    
    let response;
    try {
      response = await fetch(finalApiUrl, {
        ...requestOptions,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        return NextResponse.json({
          success: false,
          error: `解析API返回错误: ${response.status}`
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
          
          return NextResponse.json({
            success: true,
            data: parsedInfo,
            message: '解析成功，已生成预览数据'
          });
        } else {
          throw new Error(data.msg || '解析失败');
        }
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
      return NextResponse.json({
        success: false,
        error: error instanceof Error ? error.message : '解析视频信息失败，API返回数据格式不兼容'
      }, { status: 400 })
    }

    const result: PreviewParseResponse = {
      success: true,
      data: parsedInfo,
      message: '解析成功，已生成预览数据'
    }

    return NextResponse.json(result)

  } catch (error) {
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