import { createClient } from './client'
import { assertSupabaseEnabled } from './enabled'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID_RE.test(value)

function getSupabase() {
  return createClient() as any
}

async function requireUserId() {
  assertSupabaseEnabled()

  const supabase = getSupabase()
  const { data, error } = await supabase.auth.getSession()
  const userId = data?.session?.user?.id
  const accessToken = data?.session?.access_token
  if (error || !userId || !accessToken) {
    throw new Error('用户未登录')
  }
  return { userId, accessToken }
}

async function restJson<T>(
  accessToken: string,
  pathWithQuery: string,
  init?: RequestInit & { expectNoJson?: boolean }
): Promise<T> {
  const headers = new Headers(init?.headers)
  headers.set('authorization', `Bearer ${accessToken}`)
  headers.set('accept', 'application/json')
  if (init?.body != null && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }

  const res = await fetch(`/api/supabase/rest/${pathWithQuery}`, {
    ...init,
    headers,
    cache: 'no-store',
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Supabase REST ${res.status}: ${text || res.statusText}`)
  }

  if ((init as any)?.expectNoJson) {
    return undefined as any
  }

  return (await res.json()) as T
}

// 用户配置相关
export async function getUserConfig(): Promise<any> {
  const { userId, accessToken } = await requireUserId()

  const rows = await restJson<any[]>(
    accessToken,
    `user_configs?select=id,config_data,created_at,updated_at&user_id=eq.${encodeURIComponent(userId)}&order=updated_at.desc&limit=1`
  )

  const row = rows?.[0]
  if (row?.config_data) {
    return row.config_data
  }

  const inserted = await restJson<any[]>(accessToken, 'user_configs?select=config_data', {
    method: 'POST',
    headers: { prefer: 'return=representation' },
    body: JSON.stringify({ user_id: userId, config_data: {} }),
  })

  return inserted?.[0]?.config_data ?? {}
}

export async function updateUserConfig(configData: any): Promise<any> {
  const { userId, accessToken } = await requireUserId()

  const existing = await restJson<any[]>(
    accessToken,
    `user_configs?select=id&user_id=eq.${encodeURIComponent(userId)}&order=updated_at.desc&limit=1`
  )

  const existingId = existing?.[0]?.id
  if (existingId) {
    const updated = await restJson<any[]>(accessToken, `user_configs?id=eq.${encodeURIComponent(existingId)}&select=config_data`, {
      method: 'PATCH',
      headers: { prefer: 'return=representation' },
      body: JSON.stringify({ config_data: configData }),
    })
    return updated?.[0]?.config_data
  }

  const inserted = await restJson<any[]>(accessToken, 'user_configs?select=config_data', {
    method: 'POST',
    headers: { prefer: 'return=representation' },
    body: JSON.stringify({ user_id: userId, config_data: configData }),
  })

  return inserted?.[0]?.config_data
}

// 历史记录相关
export async function getHistoryRecords(limit = 100, offset = 0): Promise<any[]> {
  const { userId, accessToken } = await requireUserId()

  const safeLimit = Math.max(0, limit)
  const safeOffset = Math.max(0, offset)

  const data = await restJson<any[]>(
    accessToken,
    `history_records?select=id,record_data,created_at,updated_at&user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&offset=${safeOffset}&limit=${safeLimit}`
  )

  return (data ?? []).map((row: any) => {
    const record = row.record_data ?? {}
    return {
      ...record,
      id: record.id ?? row.id,
      createdAt: record.createdAt ?? row.created_at,
      updatedAt: row.updated_at,
    }
  })
}

export async function addHistoryRecord(recordData: any): Promise<void> {
  const { userId, accessToken } = await requireUserId()

  const payload: any = { user_id: userId, record_data: recordData }
  if (isUuid(recordData?.id)) {
    payload.id = recordData.id
  }

  await restJson(accessToken, 'history_records', {
    method: 'POST',
    body: JSON.stringify(payload),
    expectNoJson: true,
  })
}

export async function updateHistoryRecord(id: string, updates: any): Promise<void> {
  const { userId, accessToken } = await requireUserId()

  const existing = await restJson<any[]>(
    accessToken,
    `history_records?select=record_data&id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}&limit=1`
  )

  const merged = { ...(existing?.[0]?.record_data ?? {}), ...(updates ?? {}) }

  await restJson(accessToken, `history_records?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ record_data: merged }),
    expectNoJson: true,
  })
}

export async function deleteHistoryRecord(id: string): Promise<void> {
  const { userId, accessToken } = await requireUserId()

  await restJson(accessToken, `history_records?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    expectNoJson: true,
  })
}

// 标签相关
export async function getTags(): Promise<any[]> {
  const { userId, accessToken } = await requireUserId()

  const data = await restJson<any[]>(
    accessToken,
    `tags?select=id,tag_data,created_at,updated_at&user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc`
  )

  return (data ?? []).map((row: any) => {
    const tag = row.tag_data ?? {}
    return {
      ...tag,
      id: tag.id ?? row.id,
      createdAt: tag.createdAt ?? row.created_at,
      updatedAt: row.updated_at,
    }
  })
}

export async function addTag(tagData: any): Promise<any> {
  const { userId, accessToken } = await requireUserId()

  const payload: any = { user_id: userId, tag_data: tagData }
  if (isUuid(tagData?.id)) {
    payload.id = tagData.id
  }

  const inserted = await restJson<any[]>(accessToken, 'tags?select=id,tag_data,created_at,updated_at', {
    method: 'POST',
    headers: { prefer: 'return=representation' },
    body: JSON.stringify(payload),
  })

  const data = inserted?.[0]
  return data
    ? {
        ...data,
        tag_data: {
          ...(data.tag_data ?? {}),
          id: data.id,
          createdAt: (data.tag_data ?? {})?.createdAt ?? data.created_at,
        },
      }
    : null
}

export async function updateTag(id: string, updates: any): Promise<void> {
  const { userId, accessToken } = await requireUserId()

  const existing = await restJson<any[]>(
    accessToken,
    `tags?select=tag_data&id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}&limit=1`
  )

  const merged = { ...(existing?.[0]?.tag_data ?? {}), ...(updates ?? {}) }

  await restJson(accessToken, `tags?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ tag_data: merged }),
    expectNoJson: true,
  })
}

export async function deleteTag(id: string): Promise<void> {
  const { userId, accessToken } = await requireUserId()

  await restJson(accessToken, `tags?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    expectNoJson: true,
  })
}

// 清理配置相关
export async function getCleanupConfig(): Promise<any> {
  const { userId, accessToken } = await requireUserId()

  const rows = await restJson<any[]>(
    accessToken,
    `cleanup_configs?select=id,config_data,created_at,updated_at&user_id=eq.${encodeURIComponent(userId)}&order=updated_at.desc&limit=1`
  )

  const row = rows?.[0]
  if (row?.config_data) {
    return row.config_data
  }

  const inserted = await restJson<any[]>(accessToken, 'cleanup_configs?select=config_data', {
    method: 'POST',
    headers: { prefer: 'return=representation' },
    body: JSON.stringify({ user_id: userId, config_data: {} }),
  })

  return inserted?.[0]?.config_data ?? {}
}

export async function updateCleanupConfig(configData: any): Promise<void> {
  const { userId, accessToken } = await requireUserId()

  const existing = await restJson<any[]>(
    accessToken,
    `cleanup_configs?select=id&user_id=eq.${encodeURIComponent(userId)}&order=updated_at.desc&limit=1`
  )

  const existingId = existing?.[0]?.id
  if (existingId) {
    await restJson(accessToken, `cleanup_configs?id=eq.${encodeURIComponent(existingId)}&user_id=eq.${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ config_data: configData }),
      expectNoJson: true,
    })
    return
  }

  await restJson(accessToken, 'cleanup_configs', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, config_data: configData }),
    expectNoJson: true,
  })
}
