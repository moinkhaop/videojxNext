import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/supabase/auth-server'
import { createServerCookieStore } from '@/lib/supabase/server-cookies'
import { SUPABASE_ENABLED } from '@/lib/supabase/enabled'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const MAX_SIZE = 1 * 1024 * 1024

function fileExtByMime(mime: string) {
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/png') return 'png'
  if (mime === 'image/gif') return 'gif'
  if (mime === 'image/webp') return 'webp'
  return 'bin'
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

    if (!ALLOWED_TYPES.includes(file.type)) {
      return respond(
        { error: '不支持的文件类型，请上传 JPG、PNG、GIF 或 WebP 格式的图片' },
        { status: 400 }
      )
    }

    if (file.size > MAX_SIZE) {
      return respond(
        { error: '文件大小不能超过 1MB' },
        { status: 400 }
      )
    }

    console.log('[API] 上传文件:', file.name, file.type, file.size)

    const supabase = createClient(request, cookieStore)
    const ext = fileExtByMime(file.type)
    const objectPath = `${user.id}/avatar-${Date.now()}.${ext}`
    const bytes = await file.arrayBuffer()

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(objectPath, bytes, {
        contentType: file.type,
        upsert: true,
        cacheControl: '3600',
      })

    if (uploadError) {
      throw new Error(`头像上传到 Storage 失败: ${uploadError.message}`)
    }

    const { data: publicData } = supabase.storage.from('avatars').getPublicUrl(objectPath)
    const avatarUrl = publicData?.publicUrl

    if (!avatarUrl) {
      throw new Error('头像上传后未获取到公开地址')
    }

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
