import { NextRequest } from 'next/server'
import {
  ensureSupabaseEnabled,
  extensionJson,
  extensionOptionsResponse,
  requireExtensionAuth,
} from '../_shared'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function normalizePositiveInt(value: string | null | undefined, fallback: number, max: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback
  }
  return Math.min(max, Math.floor(parsed))
}

function createId() {
  const uuid = (globalThis as any)?.crypto?.randomUUID
  if (typeof uuid === 'function') {
    return uuid.call((globalThis as any).crypto)
  }

  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.map((item) => item.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export const runtime = 'nodejs'

export async function OPTIONS() {
  return extensionOptionsResponse()
}

export async function GET(request: NextRequest) {
  const unavailable = ensureSupabaseEnabled()
  if (unavailable) {
    return unavailable
  }

  const auth = await requireExtensionAuth(request)
  if (!auth.ok) {
    return auth.response
  }

  const limit = normalizePositiveInt(request.nextUrl.searchParams.get('limit'), 100, 500)
  const offset = normalizePositiveInt(request.nextUrl.searchParams.get('offset'), 0, 5000)
  const rangeTo = Math.max(offset, offset + Math.max(0, limit) - 1)

  const { client, userId } = auth.context
  const { data, error } = await client
    .from('history_records')
    .select('id, record_data, created_at, updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, rangeTo)

  if (error) {
    return extensionJson(
      { success: false, error: error.message || '读取历史记录失败' },
      { status: 500 }
    )
  }

  const records = (data ?? []).map((row: any) => {
    const recordData = row.record_data ?? {}
    return {
      ...recordData,
      id: recordData.id ?? row.id,
      createdAt: recordData.createdAt ?? row.created_at,
      updatedAt: row.updated_at,
      cloudSynced: true,
    }
  })

  return extensionJson({
    success: true,
    data: records,
    total: records.length,
    limit,
    offset,
  })
}

export async function POST(request: NextRequest) {
  const unavailable = ensureSupabaseEnabled()
  if (unavailable) {
    return unavailable
  }

  const auth = await requireExtensionAuth(request)
  if (!auth.ok) {
    return auth.response
  }

  try {
    const body = await request.json()
    const inputRecord = body?.record

    if (!inputRecord || typeof inputRecord !== 'object') {
      return extensionJson(
        { success: false, error: '缺少 record 数据' },
        { status: 400 }
      )
    }

    const recordId = typeof inputRecord.id === 'string' && UUID_RE.test(inputRecord.id)
      ? inputRecord.id
      : createId()

    const record = {
      ...inputRecord,
      id: recordId,
      updatedAt: new Date().toISOString(),
    }

    if (!record.createdAt) {
      ;(record as any).createdAt = new Date().toISOString()
    }

    const { client, userId } = auth.context
    const payload = {
      id: recordId,
      user_id: userId,
      record_data: record,
    }

    const { error } = await client
      .from('history_records')
      .upsert(payload, { onConflict: 'id' })

    if (error) {
      return extensionJson(
        { success: false, error: error.message || '保存历史记录失败' },
        { status: 500 }
      )
    }

    return extensionJson({
      success: true,
      data: {
        ...record,
        cloudSynced: true,
      },
    })
  } catch (error) {
    return extensionJson(
      { success: false, error: error instanceof Error ? error.message : '保存历史记录失败' },
      { status: 500 }
    )
  }
}
