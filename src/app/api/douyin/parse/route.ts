import { NextRequest, NextResponse } from 'next/server'
import { parseDouyinVideo } from '@/lib/api/douyin-parser'

function pickFirstNonEmpty(values: Array<unknown>): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return ''
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const input = pickFirstNonEmpty([
      searchParams.get('url'),
      searchParams.get('videoUrl'),
      searchParams.get('text'),
      searchParams.get('content'),
    ])

    if (!input) {
      return NextResponse.json({ success: false, error: '缺少 url 参数' }, { status: 400 })
    }

    const result = await parseDouyinVideo(input)
    return NextResponse.json(result.body, { status: result.status })
  } catch (error) {
    console.error('[douyin/parse] GET 顶层异常:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '抖音解析服务异常' },
      { status: 502 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    let body: any = null
    try {
      body = await request.json()
    } catch {
      body = null
    }

    const input = pickFirstNonEmpty([
      body?.url,
      body?.videoUrl,
      body?.text,
      body?.content,
    ])

    if (!input) {
      return NextResponse.json({ success: false, error: '缺少 url 或 videoUrl 参数' }, { status: 400 })
    }

    const result = await parseDouyinVideo(String(input))
    return NextResponse.json(result.body, { status: result.status })
  } catch (error) {
    console.error('[douyin/parse] POST 顶层异常:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '抖音解析服务异常' },
      { status: 502 }
    )
  }
}
