import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/supabase/auth-server'
import { createServerCookieStore } from '@/lib/supabase/server-cookies'
import { SUPABASE_ENABLED } from '@/lib/supabase/enabled'
import { Buffer } from 'node:buffer'

export const runtime = 'nodejs'

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

    // 不要把 base64 data URL 写进 user_metadata（会导致 JWT 超大，进而无法访问 /rest/v1）。
    // 改为上传到 Storage，再把短链接写入 metadata。
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const admin = createAdminClient()

    const bytes = Buffer.from(await file.arrayBuffer())
    const ext = (file.name.split('.').pop() || '').toLowerCase()
    const safeExt = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) ? ext : 'png'
    const objectPath = `avatars/${user.id}/avatar.${safeExt}`

    const { error: uploadError } = await admin.storage
      .from('avatars')
      .upload(objectPath, bytes, { upsert: true, contentType: file.type })

    if (uploadError) {
      return respond(
        { error: `Storage 上传失败: ${uploadError.message}` },
        { status: 400 }
      )
    }

    const { data: publicData } = admin.storage.from('avatars').getPublicUrl(objectPath)
    const avatarUrl = publicData?.publicUrl

    if (!avatarUrl) {
      return respond(
        { error: '无法获取头像公开链接（请确认 avatars bucket 为 public 或改用 signed url）' },
        { status: 400 }
      )
    }

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
