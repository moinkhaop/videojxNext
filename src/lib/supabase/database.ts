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
  if (error || !userId) {
    throw new Error('用户未登录')
  }
  return userId
}

// 用户配置相关
export async function getUserConfig(): Promise<any> {
  const userId = await requireUserId()
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('user_configs')
    .select('id, config_data, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (data?.config_data) {
    return data.config_data
  }

  const { data: inserted, error: insertError } = await supabase
    .from('user_configs')
    .insert({ user_id: userId, config_data: {} })
    .select('config_data')
    .single()

  if (insertError) {
    throw insertError
  }

  return inserted.config_data ?? {}
}

export async function updateUserConfig(configData: any): Promise<any> {
  const userId = await requireUserId()
  const supabase = getSupabase()

  const { data: existing, error: existingError } = await supabase
    .from('user_configs')
    .select('id')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingError) {
    throw existingError
  }

  if (existing?.id) {
    const { data, error } = await supabase
      .from('user_configs')
      .update({ config_data: configData })
      .eq('id', existing.id)
      .select('config_data')
      .single()

    if (error) {
      throw error
    }

    return data.config_data
  }

  const { data, error } = await supabase
    .from('user_configs')
    .insert({ user_id: userId, config_data: configData })
    .select('config_data')
    .single()

  if (error) {
    throw error
  }

  return data.config_data
}

// 历史记录相关
export async function getHistoryRecords(limit = 100, offset = 0): Promise<any[]> {
  const userId = await requireUserId()
  const supabase = getSupabase()

  const rangeFrom = Math.max(0, offset)
  const rangeTo = Math.max(rangeFrom, rangeFrom + Math.max(0, limit) - 1)

  const { data, error } = await supabase
    .from('history_records')
    .select('id, record_data, created_at, updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(rangeFrom, rangeTo)

  if (error) {
    throw error
  }

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
  const userId = await requireUserId()
  const supabase = getSupabase()

  const payload: any = { user_id: userId, record_data: recordData }
  const hasStableId = isUuid(recordData?.id)
  if (hasStableId) {
    payload.id = recordData.id
  }

  const { error } = hasStableId
    ? await supabase
        .from('history_records')
        .upsert(payload, { onConflict: 'id' })
    : await supabase
        .from('history_records')
        .insert(payload)

  if (error) {
    throw error
  }
}

export async function updateHistoryRecord(id: string, updates: any): Promise<void> {
  const userId = await requireUserId()
  const supabase = getSupabase()

  const { data: existing, error: existingError } = await supabase
    .from('history_records')
    .select('record_data')
    .eq('id', id)
    .eq('user_id', userId)
    .single()

  if (existingError) {
    throw existingError
  }

  const merged = { ...(existing?.record_data ?? {}), ...(updates ?? {}) }

  const { error } = await supabase
    .from('history_records')
    .update({ record_data: merged })
    .eq('id', id)
    .eq('user_id', userId)

  if (error) {
    throw error
  }
}

export async function deleteHistoryRecord(id: string): Promise<void> {
  const userId = await requireUserId()
  const supabase = getSupabase()

  const { error } = await supabase
    .from('history_records')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)

  if (error) {
    throw error
  }
}

// 标签相关
export async function getTags(): Promise<any[]> {
  const userId = await requireUserId()
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('tags')
    .select('id, tag_data, created_at, updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    throw error
  }

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
  const userId = await requireUserId()
  const supabase = getSupabase()

  const payload: any = { user_id: userId, tag_data: tagData }
  if (isUuid(tagData?.id)) {
    payload.id = tagData.id
  }

  const { data, error } = await supabase
    .from('tags')
    .upsert(payload, { onConflict: 'id' })
    .select('id, tag_data, created_at, updated_at')
    .single()

  if (error) {
    throw error
  }

  return {
    ...data,
    tag_data: {
      ...(data.tag_data ?? {}),
      id: data.id,
      createdAt: (data.tag_data ?? {})?.createdAt ?? data.created_at,
    },
  }
}

export async function updateTag(id: string, updates: any): Promise<void> {
  const userId = await requireUserId()
  const supabase = getSupabase()

  const { data: existing, error: existingError } = await supabase
    .from('tags')
    .select('tag_data')
    .eq('id', id)
    .eq('user_id', userId)
    .single()

  if (existingError) {
    throw existingError
  }

  const merged = { ...(existing?.tag_data ?? {}), ...(updates ?? {}) }

  const { error } = await supabase
    .from('tags')
    .update({ tag_data: merged })
    .eq('id', id)
    .eq('user_id', userId)

  if (error) {
    throw error
  }
}

export async function deleteTag(id: string): Promise<void> {
  const userId = await requireUserId()
  const supabase = getSupabase()

  const { error } = await supabase
    .from('tags')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)

  if (error) {
    throw error
  }
}

// 清理配置相关
export async function getCleanupConfig(): Promise<any> {
  const userId = await requireUserId()
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('cleanup_configs')
    .select('id, config_data, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (data?.config_data) {
    return data.config_data
  }

  const { data: inserted, error: insertError } = await supabase
    .from('cleanup_configs')
    .insert({ user_id: userId, config_data: {} })
    .select('config_data')
    .single()

  if (insertError) {
    throw insertError
  }

  return inserted.config_data ?? {}
}

export async function updateCleanupConfig(configData: any): Promise<void> {
  const userId = await requireUserId()
  const supabase = getSupabase()

  const { data: existing, error: existingError } = await supabase
    .from('cleanup_configs')
    .select('id')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingError) {
    throw existingError
  }

  if (existing?.id) {
    const { error } = await supabase
      .from('cleanup_configs')
      .update({ config_data: configData })
      .eq('id', existing.id)
      .eq('user_id', userId)

    if (error) {
      throw error
    }

    return
  }

  const { error } = await supabase
    .from('cleanup_configs')
    .insert({ user_id: userId, config_data: configData })

  if (error) {
    throw error
  }
}
