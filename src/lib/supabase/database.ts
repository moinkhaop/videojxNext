import { createClient } from './client'
import { getCurrentUser } from './auth-client'

// 用户配置相关操作
export async function getUserConfig() {
  const supabase = createClient()
  const user = await getCurrentUser()
  
  if (!user) {
    throw new Error('用户未登录')
  }

  const { data, error } = await supabase
    .from('user_configs')
    .select('config_data')
    .eq('user_id', user.id)
    .single()

  if (error && error.code !== 'PGRST116') { // PGRST116 表示没有找到记录
    throw error
  }

  return data?.config_data || {}
}

export async function updateUserConfig(configData: any) {
  const supabase = createClient()
  const user = await getCurrentUser()
  
  if (!user) {
    throw new Error('用户未登录')
  }

  const { data, error } = await supabase
    .from('user_configs')
    .upsert({
      user_id: user.id,
      config_data: configData,
      updated_at: new Date().toISOString()
    })
    .select()
    .single()

  if (error) {
    throw error
  }

  return data
}

// 历史记录相关操作
export async function getHistoryRecords(limit = 100, offset = 0) {
  const supabase = createClient()
  const user = await getCurrentUser()
  
  if (!user) {
    throw new Error('用户未登录')
  }

  const { data, error } = await supabase
    .from('history_records')
    .select('record_data, created_at, updated_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    throw error
  }

  return data?.map(item => item.record_data) || []
}

export async function addHistoryRecord(recordData: any) {
  const supabase = createClient()
  const user = await getCurrentUser()
  
  if (!user) {
    throw new Error('用户未登录')
  }

  const { data, error } = await supabase
    .from('history_records')
    .insert({
      user_id: user.id,
      record_data: recordData
    })
    .select()
    .single()

  if (error) {
    throw error
  }

  return data
}

export async function updateHistoryRecord(id: string, recordData: any) {
  const supabase = createClient()
  const user = await getCurrentUser()
  
  if (!user) {
    throw new Error('用户未登录')
  }

  const { data, error } = await supabase
    .from('history_records')
    .update({
      record_data: recordData,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    throw error
  }

  return data
}

export async function deleteHistoryRecord(id: string) {
  const supabase = createClient()
  const user = await getCurrentUser()
  
  if (!user) {
    throw new Error('用户未登录')
  }

  const { error } = await supabase
    .from('history_records')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    throw error
  }

  return true
}

// 标签相关操作
export async function getTags() {
  const supabase = createClient()
  const user = await getCurrentUser()
  
  if (!user) {
    throw new Error('用户未登录')
  }

  const { data, error } = await supabase
    .from('tags')
    .select('tag_data')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    throw error
  }

  return data?.map(item => item.tag_data) || []
}

export async function addTag(tagData: any) {
  const supabase = createClient()
  const user = await getCurrentUser()
  
  if (!user) {
    throw new Error('用户未登录')
  }

  const { data, error } = await supabase
    .from('tags')
    .insert({
      user_id: user.id,
      tag_data: tagData
    })
    .select()
    .single()

  if (error) {
    throw error
  }

  return data
}

export async function updateTag(id: string, tagData: any) {
  const supabase = createClient()
  const user = await getCurrentUser()
  
  if (!user) {
    throw new Error('用户未登录')
  }

  const { data, error } = await supabase
    .from('tags')
    .update({
      tag_data: tagData,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    throw error
  }

  return data
}

export async function deleteTag(id: string) {
  const supabase = createClient()
  const user = await getCurrentUser()
  
  if (!user) {
    throw new Error('用户未登录')
  }

  const { error } = await supabase
    .from('tags')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    throw error
  }

  return true
}

// 清理配置相关操作
export async function getCleanupConfig() {
  const supabase = createClient()
  const user = await getCurrentUser()
  
  if (!user) {
    throw new Error('用户未登录')
  }

  const { data, error } = await supabase
    .from('cleanup_configs')
    .select('config_data')
    .eq('user_id', user.id)
    .single()

  if (error && error.code !== 'PGRST116') {
    throw error
  }

  return data?.config_data || {}
}

export async function updateCleanupConfig(configData: any) {
  const supabase = createClient()
  const user = await getCurrentUser()
  
  if (!user) {
    throw new Error('用户未登录')
  }

  const { data, error } = await supabase
    .from('cleanup_configs')
    .upsert({
      user_id: user.id,
      config_data: configData,
      updated_at: new Date().toISOString()
    })
    .select()
    .single()

  if (error) {
    throw error
  }

  return data
}