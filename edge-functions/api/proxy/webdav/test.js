export default async function onRequest(context) {
  try {
    const request = context.request
    if (request.method !== 'POST') {
      return json({ success: false, error: '仅支持 POST 请求' }, 405)
    }

    const body = await parseRequestBody(context)
    const webdavConfig = body && typeof body.webdavConfig === 'object' ? body.webdavConfig : null
    if (!webdavConfig || !webdavConfig.url || !webdavConfig.username || !webdavConfig.password) {
      return json({ success: false, error: '缺少WebDAV连接参数' }, 400)
    }

    const base = String(webdavConfig.url || '').replace(/\/$/, '')
    let testUrl = base
    const basePath = normalizePathSegment(webdavConfig.basePath || '')
    if (basePath) testUrl = `${testUrl}/${basePath}`

    const auth = base64Encode(`${String(webdavConfig.username || '')}:${String(webdavConfig.password || '')}`)

    const response = await fetch(testUrl, {
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

    if (response.ok || response.status === 207) {
      return json({ success: true, message: 'WebDAV连接测试成功' }, 200)
    }

    return json({ success: false, error: `WebDAV连接失败: ${response.status}` }, response.status)
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : 'WebDAV连接测试失败' }, 500)
  }
}

async function parseRequestBody(context) {
  const request = context.request

  if (typeof request.parse === 'function') {
    try {
      const parsed = await request.parse()
      if (parsed && typeof parsed === 'object') return parsed
      if (typeof parsed === 'string') return { url: parsed }
    } catch {
    }
  }

  try {
    const jsonBody = await request.clone().json()
    if (jsonBody && typeof jsonBody === 'object') return jsonBody
  } catch {
  }

  try {
    const text = await request.text()
    if (text && text.trim()) {
      try {
        return JSON.parse(text.trim())
      } catch {
        return {}
      }
    }
  } catch {
  }

  return {}
}

function normalizePathSegment(value) {
  return String(value || '').replace(/^\/+|\/+$/g, '')
}

function base64Encode(value) {
  const source = String(value ?? '')
  if (typeof btoa === 'function' && typeof TextEncoder !== 'undefined') {
    const bytes = new TextEncoder().encode(source)
    let binary = ''
    const chunkSize = 0x8000
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize)
      binary += String.fromCharCode(...Array.from(chunk))
    }
    return btoa(binary)
  }
  if (typeof btoa === 'function') return btoa(source)
  throw new Error('无法生成 Basic 认证信息')
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8'
    }
  })
}

