import { NextRequest, NextResponse } from 'next/server'
import { requireRouteAuth } from '@/lib/api/route-auth'
import { SUPABASE_ENABLED } from '@/lib/supabase/enabled'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createServerCookieStore } from '@/lib/supabase/server-cookies'
import { createExtensionTokenClient, extractBearerToken } from '@/lib/supabase/extension'
import { computeInsightsSummary, type InsightsRange } from '@/lib/insights'

export const runtime = 'nodejs'

function normalizeRange(value: string | null): InsightsRange {
  return value === '30d' ? '30d' : '7d'
}

function toRecords(rows: any[]) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const recordData = row?.record_data && typeof row.record_data === 'object' ? row.record_data : {}
    return {
      ...recordData,
      createdAt: recordData.createdAt || row?.created_at || new Date().toISOString(),
    }
  })
}

export async function GET(request: NextRequest) {
  const range = normalizeRange(request.nextUrl.searchParams.get('range'))

  const auth = await requireRouteAuth(request)
  if (!auth.ok) {
    return auth.response
  }

  if (!SUPABASE_ENABLED) {
    return NextResponse.json({
      success: true,
      data: computeInsightsSummary([], range),
      source: 'disabled',
    })
  }

  try {
    const bearerToken = extractBearerToken(request)
    const cookieStore = createServerCookieStore(request)
    const client = bearerToken
      ? (createExtensionTokenClient(bearerToken) as any)
      : (createServerClient(request, cookieStore) as any)

    const { data, error } = await client
      .from('history_records')
      .select('record_data, created_at')
      .eq('user_id', auth.context.userId)
      .order('created_at', { ascending: false })
      .limit(2000)

    if (error) {
      return NextResponse.json(
        {
          success: false,
          error: error.message || '读取洞察数据失败',
        },
        { status: 500 }
      )
    }

    const summary = computeInsightsSummary(toRecords(data || []), range)
    return NextResponse.json({
      success: true,
      data: summary,
      source: 'cloud',
    })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '洞察摘要计算失败',
      },
      { status: 500 }
    )
  }
}
