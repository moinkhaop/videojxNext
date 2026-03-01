import { NextRequest } from 'next/server'
import type { Json } from '@/lib/supabase/database.types'
import {
  ensureSupabaseEnabled,
  extensionJson,
  extensionOptionsResponse,
  requireExtensionAuth,
} from '../_shared'

export const runtime = 'nodejs'

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function normalizeConfig(value: unknown) {
  const source = asRecord(value)

  const settings = asRecord(source.settings)
  const parsers = Array.isArray(source.parsers) ? source.parsers : []
  const webdavServers = Array.isArray(source.webdavServers) ? source.webdavServers : []
  const defaults = asRecord(source.defaults)

  // Only keep fields that the extension understands, so cloud data stays clean.
  return {
    settings,
    parsers,
    webdavServers,
    defaults,
  }
}

function toTimestampMs(value: unknown): number {
  const direct = Number(value)
  if (Number.isFinite(direct) && direct > 0) {
    return Math.floor(direct)
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed)
    }
  }

  return 0
}

function hasConfigContent(config: ReturnType<typeof normalizeConfig>): boolean {
  if (config.parsers.length > 0) return true
  if (config.webdavServers.length > 0) return true
  if (Object.keys(config.settings).length > 0) return true
  if (Object.keys(config.defaults).length > 0) return true
  return false
}

function toJson(value: unknown): Json {
  // Supabase jsonb expects Json (no undefined / functions / symbols). Stringify/parse
  // is a pragmatic way to enforce this at the edge of the API.
  try {
    return JSON.parse(JSON.stringify(value ?? null)) as Json
  } catch {
    return {} as Json
  }
}

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

  const { client, userId } = auth.context
  const { data, error } = await client
    .from('user_configs')
    .select('id, config_data, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    return extensionJson(
      { success: false, error: error.message || '读取云端配置失败' },
      { status: 500 }
    )
  }

  const rawConfigData = data?.config_data ?? {}
  const configData = asRecord(rawConfigData)
  const extensionNode = asRecord(configData.extension)
  const extensionConfig = normalizeConfig(extensionNode.config)
  const legacyConfig = normalizeConfig(configData)

  const hasExtensionConfig = hasConfigContent(extensionConfig)
  const hasLegacyConfig = hasConfigContent(legacyConfig)
  const hasRemoteConfig = hasExtensionConfig || hasLegacyConfig

  const config = hasExtensionConfig ? extensionConfig : legacyConfig
  const extensionUpdatedAt = toTimestampMs(extensionNode.updatedAt)
  const rowUpdatedAt = toTimestampMs(data?.updated_at)
  const updatedAt = hasRemoteConfig ? (extensionUpdatedAt || rowUpdatedAt) : 0

  return extensionJson({
    success: true,
    data: {
      config,
      updatedAt,
      rowUpdatedAt: data?.updated_at ?? null,
    },
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
    const config = normalizeConfig(body?.config)
    const updatedAt = Number(body?.updatedAt || Date.now())

    const { client, userId } = auth.context
    const { data: existing, error: selectError } = await client
      .from('user_configs')
      .select('id, config_data')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (selectError) {
      return extensionJson(
        { success: false, error: selectError.message || '查询云端配置失败' },
        { status: 500 }
      )
    }

    const existingConfigData = asRecord(existing?.config_data)
    const nextConfigData: Json = toJson({
      ...existingConfigData,
      extension: {
        ...(asRecord(existingConfigData.extension) || {}),
        config,
        updatedAt,
        syncedAt: new Date().toISOString(),
      },
    })

    if (existing?.id) {
      const { error: updateError } = await client
        .from('user_configs')
        .update({ config_data: nextConfigData })
        .eq('id', existing.id)
        .eq('user_id', userId)

      if (updateError) {
        return extensionJson(
          { success: false, error: updateError.message || '写入云端配置失败' },
          { status: 500 }
        )
      }
    } else {
      const { error: insertError } = await client
        .from('user_configs')
        .insert({
          user_id: userId,
          config_data: nextConfigData,
        })

      if (insertError) {
        return extensionJson(
          { success: false, error: insertError.message || '写入云端配置失败' },
          { status: 500 }
        )
      }
    }

    return extensionJson({
      success: true,
      data: {
        config,
        updatedAt,
      },
    })
  } catch (error) {
    return extensionJson(
      { success: false, error: error instanceof Error ? error.message : '写入云端配置失败' },
      { status: 500 }
    )
  }
}
