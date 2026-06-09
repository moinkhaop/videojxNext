import { NextRequest, NextResponse } from 'next/server'
import { PreviewParseResponse, ParsedVideoInfo, MediaType, ImageInfo } from '@/types'
import { requireRouteAuth } from '@/lib/api/route-auth'
import {
  readResponseTextLimited,
} from '@/lib/api/parser-security'
import { prepareCustomParserRequest } from '@/lib/api/custom-parser-request'
import {
  extractAuthorProfile,
  extractDescription,
  extractMediaPayload,
  extractTime,
  safeParseJsonBody,
} from '@/lib/api/custom-parser-response'

export async function POST(request: NextRequest) {
  const auth = await requireRouteAuth(request)
  if (!auth.ok) {
    return auth.response
  }

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
    const normalizedVideoUrl = prepared.value.normalizedVideoUrl
    const finalApiUrl = prepared.value.finalApiUrl
    const requestOptions = prepared.value.requestOptions

    console.log('[预览解析] 发送第三方解析请求')

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    
    let response;
    try {
      response = await fetch(finalApiUrl, {
        ...requestOptions,
        signal: controller.signal
      });
      
      console.log(`[预览解析] 收到第三方响应: ${response.status}`)
      clearTimeout(timeoutId);
      if (!response.ok) {
        const errorText = await readResponseTextLimited(response).catch(() => '无法获取错误内容');
        console.error(`[预览解析] API请求失败: ${response.status} ${response.statusText}`)
        
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

    const responseText = await readResponseTextLimited(response.clone()).catch(() => '')
    let data = responseText ? safeParseJsonBody(responseText) : null;
    try {
      if (!data) {
        data = await response.json();
      }
    } catch (jsonError) {
      try {
        const textResponse = responseText || await response.text();
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

    console.log('[预览解析] 第三方响应解析成功')

    let parsedInfo: ParsedVideoInfo
    
    try {
      const dataRecord = typeof data === 'object' && data ? data as Record<string, any> : {}
      const parserNameForDetection = parserConfig.name || prepared.value.parserName

      if (finalApiUrl.includes('jxcxin') || parserNameForDetection.includes('jxcxin')) {
        if (dataRecord.code === 200 || dataRecord.code === 0) {
          const jxData = dataRecord.data || {};
          const authorInfo = extractAuthorProfile(jxData);
          
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
          let errorMessage = dataRecord.msg || '解析失败';
          if (dataRecord.code === 404) {
            errorMessage = `解析失败：视频链接无效或已失效 (${dataRecord.msg || '404错误'})`;
          } else if (dataRecord.code === 500) {
            errorMessage = `解析失败：服务器内部错误 (${dataRecord.msg || '500错误'})`;
          } else {
            errorMessage = `解析失败：${dataRecord.msg || '未知错误'} (错误代码: ${dataRecord.code})`;
          }
          
          console.error('[预览解析] jxcxin API返回错误:', {
            code: dataRecord.code,
            msg: dataRecord.msg,
            url: normalizedVideoUrl,
            fullResponse: data
          });
          
          throw new Error(errorMessage);
        }
      }
      
      // {{ AURA: Add - 添加对xiazaitool等API格式的错误处理 }}
      // 检查xiazaitool等API的错误格式
      if (dataRecord.success === false && (dataRecord.status || dataRecord.message)) {
        let errorMessage = dataRecord.message || '解析失败';
        if (dataRecord.status === 500) {
          errorMessage = `解析失败：${dataRecord.message || '服务器内部错误'}`;
        } else if (dataRecord.status === 404) {
          errorMessage = `解析失败：${dataRecord.message || '资源未找到'}`;
        } else if (dataRecord.status) {
          errorMessage = `解析失败：${dataRecord.message || '未知错误'} (状态码: ${dataRecord.status})`;
        }
        
        console.error('[预览解析] xiazaitool类API返回错误:', {
          status: dataRecord.status,
          success: dataRecord.success,
          message: dataRecord.message,
          url: normalizedVideoUrl,
          fullResponse: data
        });
        
        throw new Error(errorMessage);
      }
      
      if (dataRecord.success === true || dataRecord.code === 200 || dataRecord.code === 0) {
        const dataSource = dataRecord.data || dataRecord.result || data
        const mediaDetectionResult = extractMediaPayload(dataSource)
        const detectedMediaType = mediaDetectionResult.mediaType
        const videoUrl = mediaDetectionResult.videoUrl || null
        const images: ImageInfo[] = mediaDetectionResult.images || []
        const authorInfo = extractAuthorProfile(dataSource);

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
        const errorMsg = dataRecord.message || dataRecord.error || dataRecord.msg || 
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
