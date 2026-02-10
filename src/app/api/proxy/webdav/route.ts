import { NextRequest, NextResponse } from 'next/server'
import { WebDAVUploadResponse, ImageInfo, WebDAVConfig } from '@/types'

const DEFAULT_IMAGE_UPLOAD_CONCURRENCY = 4
const DEFAULT_VIDEO_DOWNLOAD_TIMEOUT_MS = 20000
const DEFAULT_MAX_VIDEO_RETRIES = 3

const IMAGE_UPLOAD_CONCURRENCY = (() => {
  const fromEnv = Number(process.env.WEBDAV_IMAGE_UPLOAD_CONCURRENCY ?? String(DEFAULT_IMAGE_UPLOAD_CONCURRENCY))
  if (!Number.isFinite(fromEnv)) return DEFAULT_IMAGE_UPLOAD_CONCURRENCY
  return Math.max(1, Math.min(8, Math.floor(fromEnv)))
})()

const VIDEO_DOWNLOAD_TIMEOUT_MS = (() => {
  const fromEnv = Number(process.env.WEBDAV_VIDEO_DOWNLOAD_TIMEOUT_MS ?? String(DEFAULT_VIDEO_DOWNLOAD_TIMEOUT_MS))
  if (!Number.isFinite(fromEnv)) return DEFAULT_VIDEO_DOWNLOAD_TIMEOUT_MS
  return Math.max(5000, Math.min(120000, Math.floor(fromEnv)))
})()

const MAX_VIDEO_RETRIES = (() => {
  const fromEnv = Number(process.env.WEBDAV_VIDEO_MAX_RETRIES ?? String(DEFAULT_MAX_VIDEO_RETRIES))
  if (!Number.isFinite(fromEnv)) return DEFAULT_MAX_VIDEO_RETRIES
  return Math.max(1, Math.min(8, Math.floor(fromEnv)))
})()

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

function getFileExtension(fileName: string, fallback = 'mp4'): string {
  const match = /\.([a-zA-Z0-9]{1,10})$/.exec(fileName)
  return (match?.[1] ?? fallback).toLowerCase()
}

function getNameWithoutExtension(fileName: string): string {
  return fileName.replace(/\.[^.]*$/, '')
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function extractUpstreamErrorMessage(body: string): string | null {
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
    // 忽略非JSON返回体
  }

  const sanitized = body.replace(/\s+/g, ' ').trim()
  if (!sanitized) {
    return null
  }

  return sanitized.length > 300 ? `${sanitized.substring(0, 300)}…` : sanitized
}

// {{ AURA: Modify - 修复路径构建，添加URL编码和验证 }}
// 构建WebDAV完整路径
function buildWebDAVPath(webdavConfig: WebDAVConfig, folderPath: string, fileName: string): string {
  const baseUploadUrl = webdavConfig.url.replace(/\/$/, '')
  
  // 构建完整的上传路径，包含basePath、folderPath和fileName
  let fullPath = baseUploadUrl
  
  // 添加basePath（如果存在）
  if (webdavConfig.basePath) {
    const normalizedBasePath = webdavConfig.basePath.replace(/^\/+|\/+$/g, '')
    if (normalizedBasePath) {
      // 不对basePath进行整体编码，保持路径结构
      fullPath = `${fullPath}/${normalizedBasePath}`
    }
  }
  
  // 添加folderPath（如果存在）
  if (folderPath) {
    const normalizedFolderPath = folderPath.replace(/^\/+|\/+$/g, '')
    if (normalizedFolderPath) {
      // 不对folderPath进行整体编码，保持路径结构
      fullPath = `${fullPath}/${normalizedFolderPath}`
    }
  }
  
  // 只对文件名中的特殊字符进行编码，保留中文字符
  // 使用更温和的编码方式，只编码必要的字符
  const safeFileName = fileName.replace(/[<>:"/\\|?*]/g, '_')
  
  // 更精确的编码逻辑，只编码真正需要编码的字符
  let encodedFileName = ''
  for (let i = 0; i < safeFileName.length; i++) {
    const char = safeFileName[i]
    const code = char.charCodeAt(0)
    
    // 保留ASCII字母数字、基本标点和中文字符
    if ((code >= 48 && code <= 57) || // 0-9
        (code >= 65 && code <= 90) || // A-Z
        (code >= 97 && code <= 122) || // a-z
        code === 45 || code === 46 || code === 95 || // -._
        (code >= 0x4e00 && code <= 0x9fa5)) { // 中文字符
      encodedFileName += char
    } else {
      // 其他字符进行编码
      try {
        // 检查字符是否为有效的Unicode字符
        if (code === 0xFFFD || // 替换字符
            (code >= 0xD800 && code <= 0xDFFF) || // 代理区域
            code < 0x20) { // 控制字符
          // 对于无效字符，直接替换为下划线
          encodedFileName += '_'
          console.warn(`[WebDAV] 检测到无效字符，已替换: "${char}" (代码: ${code})`)
        } else {
          // 对于有效字符，尝试编码
          encodedFileName += encodeURIComponent(char)
        }
      } catch (e: any) {
        // 如果编码失败，替换为下划线
        encodedFileName += '_'
        console.warn(`[WebDAV] 字符编码失败，已替换: "${char}" (错误: ${e?.message || e})`)
      }
    }
  }
  
  const finalPath = `${fullPath}/${encodedFileName}`
  
  console.log(`[WebDAV] 构建路径: 原始文件名="${fileName}", 安全处理后="${safeFileName}", 编码后="${encodedFileName}"`)
  console.log(`[WebDAV] 最终路径: ${finalPath}`)
  
  return finalPath
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
      
      // 2. 并发上传图片文件（限流）
      let successCount = 0
      const workers = Array.from({ length: Math.min(IMAGE_UPLOAD_CONCURRENCY, images.length) }, (_, workerIndex) => {
        return (async () => {
          for (let index = workerIndex; index < images.length; index += IMAGE_UPLOAD_CONCURRENCY) {
            const image: ImageInfo = images[index]
            const imageFileName = generateRandomFileName('jpg')
            const imageUploadPath = `${albumFolderPath}/${imageFileName}`

            console.log(`[WebDAV] 上传图片 ${index + 1}/${images.length}: ${imageUploadPath}`)

            const uploadSuccess = await uploadImageFile(image.url, imageUploadPath, auth)
            if (uploadSuccess) {
              successCount++
            } else {
              console.error(`[WebDAV] 图片上传失败: ${image.url}`)
            }
          }
        })()
      })
      await Promise.all(workers)
      
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
    const maxRetries = MAX_VIDEO_RETRIES; // 最大重试次数
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
        const timeoutId = setTimeout(() => controller.abort(), VIDEO_DOWNLOAD_TIMEOUT_MS)
        
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
        console.log(`[WebDAV] 完整上传路径: ${uploadPath}`)

        // 构建认证头
        const auth = Buffer.from(`${webdavConfig.username}:${webdavConfig.password}`).toString('base64')
        const uploadHeaders = {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/octet-stream',
          'Content-Length': videoBuffer.byteLength.toString()
        }
        console.log(`[WebDAV] 认证信息: 用户名=${webdavConfig.username}, 密码长度=${webdavConfig.password.length}`)

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
          let upstreamErrorDetail = ''
          try {
            const errorText = await uploadResponse.text()
            const parsedError = extractUpstreamErrorMessage(errorText)
            if (parsedError) {
              upstreamErrorDetail = parsedError
              errorMessage += ` - ${parsedError}`
            }

            const isScriptError =
              uploadResponse.status === 545 ||
              /error\s+return\s+from\s+script/i.test(parsedError ?? '')

            const isLockedError =
              uploadResponse.status === 423 ||
              /locked/i.test(`${parsedError ?? ''} ${uploadResponse.statusText}`)

            if (isLockedError) {
              console.warn('[WebDAV] 检测到 423 Locked，尝试延迟并改名重试上传')

              const extension = getFileExtension(fileName, 'mp4')
              const baseName = getNameWithoutExtension(fileName) || 'video'
              const retryDetails: string[] = []
              const maxLockedRetries = 3

              for (let retryIndex = 1; retryIndex <= maxLockedRetries; retryIndex++) {
                await sleep(Math.min(500 * retryIndex, 2000))

                const retryFileName = `${baseName}_retry${retryIndex}_${Date.now()}.${extension}`
                const retryUploadPath = buildWebDAVPath(webdavConfig, folderPath, retryFileName)

                const retryResponse = await fetch(retryUploadPath, {
                  method: 'PUT',
                  headers: uploadHeaders,
                  body: videoBuffer
                })

                if (retryResponse.ok) {
                  console.log(`[WebDAV] 423 回退上传成功: ${retryUploadPath}`)
                  return NextResponse.json({
                    success: true,
                    filePath: retryUploadPath
                  })
                }

                const retryBody = await retryResponse.text().catch(() => '')
                const retryDetail = extractUpstreamErrorMessage(retryBody)
                  || retryResponse.statusText
                  || `HTTP ${retryResponse.status}`

                retryDetails.push(`第${retryIndex}次(${retryResponse.status}): ${retryDetail}`)

                if (retryResponse.status !== 423) {
                  break
                }
              }

              errorMessage = `上传服务错误 (423): 目标文件被锁定。已尝试自动改名重试但仍失败。${retryDetails.join('；')}。建议稍后重试，或检查 WebDAV 服务端锁机制（如 Nextcloud 文件锁/数据库锁）和目录权限。`
            }

            if (isScriptError) {
              console.warn('[WebDAV] 检测到脚本类错误，尝试使用安全随机文件名回退上传')
              const fallbackFileName = generateRandomFileName(getFileExtension(fileName, 'mp4'))
              const fallbackUploadPath = buildWebDAVPath(webdavConfig, folderPath, fallbackFileName)

              const fallbackResponse = await fetch(fallbackUploadPath, {
                method: 'PUT',
                headers: uploadHeaders,
                body: videoBuffer
              })

              if (fallbackResponse.ok) {
                console.log(`[WebDAV] 回退文件名上传成功: ${fallbackUploadPath}`)
                return NextResponse.json({
                  success: true,
                  filePath: fallbackUploadPath
                })
              }

              const fallbackBody = await fallbackResponse.text().catch(() => '')
              const fallbackDetail = extractUpstreamErrorMessage(fallbackBody)
              const detailMessage = [
                `原始文件名上传失败: ${upstreamErrorDetail || uploadResponse.statusText}`,
                `回退文件名上传失败: ${fallbackDetail || fallbackResponse.statusText}`,
              ].join('；')

              errorMessage = `上传服务错误 (545): 远端脚本执行失败。${detailMessage}。建议检查WebDAV服务端脚本、目录写权限，或改用纯英文路径。`
            }
          } catch (e) {
            // 忽略错误详情获取失败
          }

          // {{ AURA: Modify - 增强404错误处理，提供更详细的调试信息 }}
          if (uploadResponse.status === 404) {
            console.error(`[WebDAV] 详细路径分析:`)
            console.error(`[WebDAV] - 基础URL: ${webdavConfig.url}`)
            console.error(`[WebDAV] - basePath: ${webdavConfig.basePath || '无'}`)
            console.error(`[WebDAV] - folderPath: ${folderPath || '无'}`)
            console.error(`[WebDAV] - 原始文件名: ${fileName}`)
            console.error(`[WebDAV] - 编码后路径: ${uploadPath}`)
            
            errorMessage = `上传路径不存在 (404): ${uploadPath}. 请检查WebDAV服务器地址和路径配置是否正确。错误详情: ${errorMessage}`
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
