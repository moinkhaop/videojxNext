import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/supabase/auth-server'
import { createServerCookieStore } from '@/lib/supabase/server-cookies'
import { Buffer } from 'node:buffer'
import { SUPABASE_ENABLED } from '@/lib/supabase/enabled'

export const runtime = 'nodejs'

async function fileToDataUrl(file: File) {
  const arrayBuffer = await file.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString('base64')
  return `data:${file.type};base64,${base64}`
}

export async function POST(request: NextRequest) {
  if (!SUPABASE_ENABLED) {
    return NextResponse.json(
      { error: 'Supabase 功能已暂时禁用' },
      { status: 503 }
    )
  }

  const cookieStore = createServerCookieStore(request)
  const respond = (body: unknown, init?: ResponseInit) => {
    const response = NextResponse.json(body, init)
    cookieStore.applyToResponse(response)
    return response
  }

  try {
    console.log('[API] 收到头像上传请求')
    
    const user = await getCurrentUser(request, cookieStore)
    if (!user) {
      return respond(
        { error: '用户未登录' },
        { status: 401 }
      )
    }

    const formData = await request.formData()
    const file = formData.get('avatar') as File
    
    if (!file) {
      return respond(
        { error: '未提供文件' },
        { status: 400 }
      )
    }

    // 验证文件类型
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      return respond(
        { error: '不支持的文件类型，请上传 JPG、PNG、GIF 或 WebP 格式的图片' },
        { status: 400 }
      )
    }

    // 验证文件大小（最大 1MB，因为Base64编码会增加约33%的大小）
    const maxSize = 1 * 1024 * 1024 // 1MB
    if (file.size > maxSize) {
      return respond(
        { error: '文件大小不能超过 1MB' },
        { status: 400 }
      )
    }

    console.log('[API] 上传文件:', file.name, file.type, file.size)

  // 将文件转换为 data URL，兼容服务端环境
  const avatarUrl = await fileToDataUrl(file)

    console.log('[API] 头像上传成功:', avatarUrl)

    // 更新用户元数据中的头像URL
    const { updateUserMetadata } = await import('@/lib/supabase/profile')
    await updateUserMetadata({ avatar_url: avatarUrl }, request, cookieStore)

    return respond({
      success: true,
      message: '头像上传成功',
      avatar_url: avatarUrl
    })

  } catch (error) {
    console.error('[API] 头像上传失败:', error)
    
    const errorMessage = error instanceof Error ? error.message : '上传失败'
    
    return respond(
      { error: errorMessage },
      { status: 400 }
    )
  }
}
