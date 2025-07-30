import { NextRequest, NextResponse } from 'next/server'
import { WebDAVUploadResponse, MediaType, ParsedVideoInfo, ImageInfo } from '@/types'

export async function POST(request: NextRequest) {
  console.log('[WebDAV] POST方法被调用')
  
  try {
    const requestBody = await request.json()
    console.log('[WebDAV] 请求体:', requestBody)
    
    return NextResponse.json({
      success: true,
      message: 'WebDAV POST route is working',
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('[WebDAV] 上传错误:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '上传过程中发生未知错误'
    }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  console.log('[WebDAV] GET方法被调用')
  
  return NextResponse.json({
    success: true,
    message: 'WebDAV GET route is working',
    timestamp: new Date().toISOString()
  })
}
