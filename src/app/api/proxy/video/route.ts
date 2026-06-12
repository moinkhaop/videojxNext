import { NextRequest, NextResponse } from 'next/server'

const VIDEO_PROXY_TIMEOUT_MS = 20_000

function validateVideoUrl(rawUrl: string): { ok: true; url: URL } | { ok: false; error: string } {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return { ok: false, error: '无效的视频URL' }
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { ok: false, error: '仅支持 http/https 视频地址' }
  }

  const host = parsed.hostname.toLowerCase()
  if (host === 'localhost' || host === '0.0.0.0' || host === '::1' || host.endsWith('.local')) {
    return { ok: false, error: '不允许代理本地地址' }
  }

  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4Match) {
    const octets = ipv4Match.slice(1).map(Number)
    if (octets.some(part => Number.isNaN(part) || part < 0 || part > 255)) {
      return { ok: false, error: '无效的IPv4地址' }
    }

    const [a, b] = octets
    const isPrivate =
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)

    if (isPrivate) {
      return { ok: false, error: '不允许代理私有网络地址' }
    }
  }

  return { ok: true, url: parsed }
}

/**
 * 视频代理API - 解决直链访问问题
 * 用于代理外部视频链接，添加必要的请求头以绕过某些限制
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const videoUrl = searchParams.get('url')?.trim()

    if (!videoUrl) {
      return NextResponse.json({
        success: false,
        error: '缺少视频URL参数'
      }, { status: 400 })
    }

    const validated = validateVideoUrl(videoUrl)
    if (!validated.ok) {
      return NextResponse.json({
        success: false,
        error: validated.error
      }, { status: 400 })
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), VIDEO_PROXY_TIMEOUT_MS)
    let videoResponse: Response
    try {
      // 发送请求获取视频
      videoResponse = await fetch(validated.url.toString(), {
        method: 'GET',
        headers: {
          // 添加必要的请求头，模拟浏览器访问
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Referer': 'https://www.douyin.com/',
          'Accept': 'video/mp4,video/webm,video/*;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'video',
          'Sec-Fetch-Mode': 'no-cors',
          'Sec-Fetch-Site': 'cross-site',
        },
        redirect: 'follow',
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeoutId)
    }

    if (!videoResponse.ok) {
      console.error(`[视频代理] 获取视频失败: ${videoResponse.status} ${videoResponse.statusText}`)
      return NextResponse.json({
        success: false,
        error: `获取视频失败: ${videoResponse.status}`
      }, { status: videoResponse.status })
    }

    // 获取视频内容类型
    const contentType = videoResponse.headers.get('content-type') || 'video/mp4'
    const contentLength = videoResponse.headers.get('content-length')

    console.log(`[视频代理] 获取视频成功, 类型: ${contentType}, 大小: ${contentLength}`)

    // 流式返回视频
    const headers = new Headers()
    headers.set('Content-Type', contentType)
    
    // 设置CORS头允许跨域访问
    headers.set('Access-Control-Allow-Origin', '*')
    headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
    headers.set('Access-Control-Allow-Headers', 'Content-Type')
    
    // 设置缓存头
    headers.set('Cache-Control', 'public, max-age=3600')
    
    if (contentLength) {
      headers.set('Content-Length', contentLength)
    }

    // 添加Accept-Ranges以支持视频进度条
    headers.set('Accept-Ranges', 'bytes')

    return new NextResponse(videoResponse.body, {
      status: 200,
      headers
    })

  } catch (error) {
    console.error('[视频代理] 代理过程中出错:', error)
    
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    
    // 区分不同的错误类型
    let errorDetails = '代理视频失败'
    if (errorMessage.includes('fetch failed')) {
      errorDetails = '网络连接失败'
    } else if (errorMessage.includes('timeout')) {
      errorDetails = '请求超时'
    } else if (errorMessage.includes('ENOTFOUND')) {
      errorDetails = '域名解析失败'
    }

    return NextResponse.json({
      success: false,
      error: `${errorDetails}: ${errorMessage}`
    }, { status: 500 })
  }
}

// 处理HEAD请求（用于检查视频可用性）
export async function HEAD(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const videoUrl = searchParams.get('url')?.trim()

    if (!videoUrl) {
      return new NextResponse(null, { status: 400 })
    }

    const validated = validateVideoUrl(videoUrl)
    if (!validated.ok) {
      return new NextResponse(null, { status: 400 })
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), VIDEO_PROXY_TIMEOUT_MS)
    let videoResponse: Response
    try {
      // 发送HEAD请求检查视频可用性
      videoResponse = await fetch(validated.url.toString(), {
        method: 'HEAD',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://www.douyin.com/',
        },
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeoutId)
    }

    const headers = new Headers()
    headers.set('Content-Type', videoResponse.headers.get('content-type') || 'video/mp4')
    headers.set('Access-Control-Allow-Origin', '*')
    
    if (videoResponse.headers.get('content-length')) {
      headers.set('Content-Length', videoResponse.headers.get('content-length')!)
    }

    return new NextResponse(null, {
      status: videoResponse.ok ? 200 : videoResponse.status,
      headers
    })

  } catch (error) {
    console.error('[视频代理] HEAD请求失败:', error)
    return new NextResponse(null, { status: 500 })
  }
}

// 处理OPTIONS请求（用于CORS预检）
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '3600'
    }
  })
}
