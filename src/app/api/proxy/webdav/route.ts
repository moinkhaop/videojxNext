import { NextRequest, NextResponse } from 'next/server'
import { WebDAVUploadResponse, ImageInfo, WebDAVConfig } from '@/types'

// 生成随机日期命名的文件名
function generateRandomFileName(extension: string = 'jpg'): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')
  const milliseconds = String(now.getMilliseconds()).padStart(3, '0')
  const randomNum = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
  
  return `${year}${month}${day}_${hours}${minutes}${seconds}_${milliseconds}${randomNum}.${extension}`
}

// 构建WebDAV完整路径
function buildWebDAVPath(webdavConfig: WebDAVConfig, folderPath: string, fileName: string): string {
  const baseUploadUrl = webdavConfig.url.replace(/\/$/, '')
  
  // 构建完整的上传路径，包含basePath、folderPath和fileName
  let fullPath = baseUploadUrl
  
  // 添加basePath（如果存在）
  if (webdavConfig.basePath) {
    const normalizedBasePath = webdavConfig.basePath.replace(/^\/+|\/+$/g, '')
    if (normalizedBasePath) {
      fullPath = `${fullPath}/${normalizedBasePath}`
    }
  }
  
  // 添加folderPath（如果存在）
  if (folderPath) {
    const normalizedFolderPath = folderPath.replace(/^\/+|\/+$/g, '')
    if (normalizedFolderPath) {
      fullPath = `${fullPath}/${normalizedFolderPath}`
    }
  }
  
  // 添加文件名
  return `${fullPath}/${fileName}`
}

// 创建WebDAV文件夹
async function createWebDAVFolder(folderPath: string, auth: string): Promise<boolean> {
  try {
    const headers = {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/xml',
    }

    // 使用MKCOL方法创建文件夹
    const response = await fetch(folderPath, {
      method: 'MKCOL',
      headers
    })

    // 201表示创建成功，405表示文件夹已存在
    return response.status === 201 || response.status === 405
  } catch (error) {
    console.error('[WebDAV] 创建文件夹失败:', error)
    return false
  }
}

// 上传单个图片文件
async function uploadImageFile(imageUrl: string, uploadPath: string, auth: string): Promise<boolean> {
  try {
    // 下载图片
    const imageResponse = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    })

    if (!imageResponse.ok) {
      console.error(`[WebDAV] 下载图片失败: ${imageResponse.status}`)
      return false
    }

    const imageBuffer = await imageResponse.arrayBuffer()
    
    // 上传图片到WebDAV
    const headers = {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/octet-stream',
      'Content-Length': imageBuffer.byteLength.toString()
    }

    const uploadResponse = await fetch(uploadPath, {
      method: 'PUT',
      headers,
      body: imageBuffer
    })

    if (!uploadResponse.ok) {
      console.error(`[WebDAV] 上传图片失败: ${uploadResponse.status}`)
      return false
    }

    return true
  } catch (error) {
    console.error('[WebDAV] 图片上传错误:', error)
    
    // 对于网络错误，提供更具体的错误信息
    if (error instanceof Error) {
      if (error.message.toLowerCase().includes('fetch failed') ||
          error.message.toLowerCase().includes('econnreset') ||
          error.message.toLowerCase().includes('timeout')) {
        console.error('[WebDAV] 网络连接问题导致图片上传失败');
      }
    }
    
    return false
  }
}

export async function POST(request: NextRequest) {
  try {
    const { videoUrl, images, webdavConfig, fileName, folderPath = '' } = await request.json()

    if ((!videoUrl && (!images || images.length === 0)) || !webdavConfig || !fileName) {
      return NextResponse.json({
        success: false,
        error: '缺少必要参数'
      }, { status: 400 })
    }

    console.log(`[WebDAV] 开始上传文件: ${fileName}`)
    console.log(`[WebDAV] 服务器: ${webdavConfig.url}`)

    // 处理图集上传 - 新的文件夹上传方式
    if (images && images.length > 0) {
      console.log(`[WebDAV] 图集上传，包含 ${images.length} 张图片`)
      
      // 1. 创建图集文件夹 (使用解析后的标题作为文件夹名)
      const albumFolderPath = buildWebDAVPath(webdavConfig, folderPath, fileName)
      
      // 构建认证头
      const auth = btoa(`${webdavConfig.username}:${webdavConfig.password}`)
      
      // 创建文件夹
      const folderCreated = await createWebDAVFolder(albumFolderPath, auth)
      if (!folderCreated) {
        return NextResponse.json({
          success: false,
          error: '创建图集文件夹失败'
        }, { status: 500 })
      }
      
      console.log(`[WebDAV] 图集文件夹创建成功: ${albumFolderPath}`)
      
      // 2. 逐个上传图片文件
      let successCount = 0
      for (let i = 0; i < images.length; i++) {
        const image: ImageInfo = images[i]
        const imageFileName = generateRandomFileName('jpg') // 使用随机日期命名
        const imageUploadPath = `${albumFolderPath}/${imageFileName}`
        
        console.log(`[WebDAV] 上传图片 ${i+1}/${images.length}: ${imageUploadPath}`)
        
        const uploadSuccess = await uploadImageFile(image.url, imageUploadPath, auth)
        if (uploadSuccess) {
          successCount++
        } else {
          console.error(`[WebDAV] 图片上传失败: ${image.url}`)
        }
      }
      
      console.log(`[WebDAV] 图集上传完成，成功上传 ${successCount}/${images.length} 张图片`)
      
      // 3. 返回文件夹路径作为上传结果
      const result: WebDAVUploadResponse = {
        success: successCount > 0, // 至少有一张图片上传成功就算成功
        filePath: albumFolderPath
      }

      return NextResponse.json(result)
    }
    
    // 处理视频上传 (保持原有方式不变)
    // 首先下载视频文件
    const maxRetries = 5; // 最大重试次数
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[WebDAV] 视频下载尝试 ${attempt}/${maxRetries}`);
        
        // 根据尝试次数选择不同的User-Agent
        let userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
        if (attempt > 1) {
          // 第二次及以后的尝试使用移动版User-Agent
          userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1';
        }
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒超时
        
        // 构建更丰富的请求头
        const headers: Record<string, string> = {
          'User-Agent': userAgent,
          'Accept': 'video/*,*/*;q=0.9',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        };
        
        // 如果不是第一次尝试，添加Referer头
        if (attempt > 1) {
          try {
            headers['Referer'] = new URL(videoUrl).origin;
          } catch (e) {
            // URL解析失败，忽略Referer头
          }
        }
        
        const videoResponse = await fetch(videoUrl, {
          headers,
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        if (!videoResponse.ok) {
          const errorMessage = `下载视频失败: ${videoResponse.status} ${videoResponse.statusText}`;
          console.error(`[WebDAV] ${errorMessage}`);
          
          // 对于权限错误(403/401)、服务器错误(5xx)和临时错误(408, 429)，进行重试
          const shouldRetry =
            (videoResponse.status === 403 || videoResponse.status === 401 ||
             videoResponse.status === 408 || videoResponse.status === 429 ||
             videoResponse.status >= 500) &&
            attempt < maxRetries;
            
          if (shouldRetry) {
            // 使用指数退避策略等待后重试
            const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // 最大等待10秒
            console.log(`[WebDAV] 等待 ${waitTime/1000} 秒后重试...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue; // 继续下一次尝试
          }
          
          // 对于403错误提供更具体的错误信息
          let finalErrorMessage = errorMessage;
          if (videoResponse.status === 403) {
            finalErrorMessage += '。可能是视频链接已过期或需要登录，请尝试其他视频链接。';
          } else if (videoResponse.status === 401) {
            finalErrorMessage += '。认证失败，请检查视频链接是否正确。';
          }
          
          return NextResponse.json({
            success: false,
            error: finalErrorMessage
          }, { status: videoResponse.status })
        }

        const videoBuffer = await videoResponse.arrayBuffer()
        console.log(`[WebDAV] 视频文件大小: ${videoBuffer.byteLength} bytes`)

        // 构建WebDAV上传路径
        const uploadPath = buildWebDAVPath(webdavConfig, folderPath, fileName)

        // 构建认证头
        const auth = btoa(`${webdavConfig.username}:${webdavConfig.password}`)
        const uploadHeaders = {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/octet-stream',
          'Content-Length': videoBuffer.byteLength.toString()
        }

        // 上传到WebDAV服务器
        const uploadResponse = await fetch(uploadPath, {
          method: 'PUT',
          headers: uploadHeaders,
          body: videoBuffer
        })

        if (!uploadResponse.ok) {
          console.error(`[WebDAV] 上传失败: ${uploadResponse.status} ${uploadResponse.statusText}`)
          console.error(`[WebDAV] 上传路径: ${uploadPath}`)
          
          // 尝试获取错误详情
          let errorMessage = `上传失败: ${uploadResponse.status}`
          try {
            const errorText = await uploadResponse.text()
            if (errorText) {
              errorMessage += ` - ${errorText}`
            }
          } catch (e) {
            // 忽略错误详情获取失败
          }

          // 对于404错误，提供更具体的错误信息
          if (uploadResponse.status === 404) {
            errorMessage = `上传路径不存在 (404): ${uploadPath}. 请检查WebDAV服务器地址和路径配置是否正确。`
          }

          return NextResponse.json({
            success: false,
            error: errorMessage
          }, { status: uploadResponse.status })
        }

        console.log(`[WebDAV] 上传成功: ${uploadPath}`)

        const result: WebDAVUploadResponse = {
          success: true,
          filePath: uploadPath
        }

        return NextResponse.json(result)
      } catch (downloadError) {
        lastError = downloadError;
        console.error(`[WebDAV] 视频下载或上传错误 (尝试 ${attempt}/${maxRetries}):`, downloadError)
        
        // 对于网络错误，在达到最大重试次数前进行重试
        const isNetworkError =
          downloadError instanceof Error &&
          (downloadError.message.toLowerCase().includes('network error') ||
           downloadError.message.toLowerCase().includes('fetch failed') ||
           downloadError.message.toLowerCase().includes('econnreset') ||
           downloadError.message.toLowerCase().includes('timeout') ||
           downloadError.message.toLowerCase().includes('econnrefused') ||
           downloadError.message.toLowerCase().includes('etimedout'));
           
        if (isNetworkError && attempt < maxRetries) {
          // 使用指数退避策略等待后重试
          const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // 最大等待10秒
          console.log(`[WebDAV] 网络错误，等待 ${waitTime/1000} 秒后重试...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue; // 继续下一次尝试
        }
        
        // 对于403错误，在第一次尝试时进行重试
        const isAuthError =
          downloadError instanceof Error &&
          (downloadError.message.includes('403') || downloadError.message.includes('401'));
          
        if (isAuthError && attempt === 1) {
          console.log(`[WebDAV] 权限错误，等待1秒后重试...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue; // 重试一次
        }
        
        // 如果是最后一次尝试，跳出循环
        if (attempt >= maxRetries) {
          break;
        }
      }
    }
    
    // 所有尝试都失败
    console.error('[WebDAV] 所有下载尝试均失败');
    return NextResponse.json({
      success: false,
      error: lastError instanceof Error ? lastError.message : '下载或上传视频文件时发生错误'
    }, { status: 500 });

  } catch (error) {
    console.error('[WebDAV] 上传错误:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '上传过程中发生未知错误'
    }, { status: 500 })
  }
}

// 测试WebDAV连接
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const serverUrl = searchParams.get('serverUrl')
    const username = searchParams.get('username')
    const password = searchParams.get('password')

    if (!serverUrl || !username || !password) {
      return NextResponse.json({
        success: false,
        error: '缺少WebDAV连接参数'
      }, { status: 400 })
    }

    // 解码可能被编码的参数
    const decodedUrl = decodeURIComponent(serverUrl)
    const decodedUsername = decodeURIComponent(username)
    const decodedPassword = decodeURIComponent(password)

    console.log(`[WebDAV] 测试连接到: ${decodedUrl}`)
    
    // 测试WebDAV连接
    const auth = Buffer.from(`${decodedUsername}:${decodedPassword}`).toString('base64')
    const testResponse = await fetch(decodedUrl, {
      method: 'PROPFIND',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Depth': '0',
        'Content-Type': 'application/xml'
      },
      body: `<?xml version="1.0" encoding="utf-8" ?>
        <D:propfind xmlns:D="DAV:">
          <D:prop>
            <D:resourcetype/>
          </D:prop>
        </D:propfind>`
    })

    if (testResponse.ok || testResponse.status === 207) {
      return NextResponse.json({
        success: true,
        message: 'WebDAV连接测试成功'
      })
    } else {
      return NextResponse.json({
        success: false,
        error: `WebDAV连接失败: ${testResponse.status}`
      }, { status: testResponse.status })
    }

  } catch (error) {
    console.error('[WebDAV] 连接测试错误:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'WebDAV连接测试失败'
    }, { status: 500 })
  }
}
