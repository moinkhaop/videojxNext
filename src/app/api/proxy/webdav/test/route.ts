import { NextRequest, NextResponse } from 'next/server'
import { WebDAVConfig } from '@/types'

export async function POST(request: NextRequest) {
  try {
    const { webdavConfig } = await request.json()

    if (!webdavConfig || !webdavConfig.url || !webdavConfig.username || !webdavConfig.password) {
      return NextResponse.json({
        success: false,
        error: '缺少WebDAV连接参数'
      }, { status: 400 })
    }

    console.log(`[WebDAV测试] 测试连接到: ${webdavConfig.url}`)

    // 构建完整的测试路径
    const baseUrl = webdavConfig.url.replace(/\/$/, '')
    let testUrl = baseUrl

    // 添加basePath（如果存在）
    if (webdavConfig.basePath) {
      const normalizedBasePath = webdavConfig.basePath.replace(/^\/+|\/+$/g, '')
      if (normalizedBasePath) {
        testUrl = `${testUrl}/${normalizedBasePath}`
      }
    }

    // 测试WebDAV连接 - 使用PROPFIND方法
    const auth = Buffer.from(`${webdavConfig.username}:${webdavConfig.password}`).toString('base64')
    const testResponse = await fetch(testUrl, {
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
      console.log(`[WebDAV测试] 连接测试成功`)
      return NextResponse.json({
        success: true,
        message: 'WebDAV连接测试成功'
      })
    } else {
      console.error(`[WebDAV测试] 连接测试失败: ${testResponse.status}`)

      let errorMessage = `WebDAV连接失败 (${testResponse.status})`

      if (testResponse.status === 401) {
        errorMessage += ' - 认证失败，请检查用户名和密码'
      } else if (testResponse.status === 403) {
        errorMessage += ' - 权限不足，请检查账户权限'
      } else if (testResponse.status === 404) {
        errorMessage += ' - 路径不存在，请检查服务器地址和basePath配置'
      } else if (testResponse.status >= 500) {
        errorMessage += ' - 服务器错误'
      }

      return NextResponse.json({
        success: false,
        error: errorMessage
      }, { status: testResponse.status })
    }

  } catch (error) {
    console.error('[WebDAV测试] 连接测试错误:', error)

    let errorMessage = 'WebDAV连接测试失败'
    if (error instanceof Error) {
      if (error.message.includes('fetch failed')) {
        errorMessage += ' - 网络连接失败，请检查服务器地址是否正确'
      } else {
        errorMessage += ` - ${error.message}`
      }
    }

    return NextResponse.json({
      success: false,
      error: errorMessage
    }, { status: 500 })
  }
}
