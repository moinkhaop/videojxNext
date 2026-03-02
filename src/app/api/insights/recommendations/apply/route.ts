import { NextRequest, NextResponse } from 'next/server'
import type { Json } from '@/lib/supabase/database.types'
import { requireRouteAuth } from '@/lib/api/route-auth'
import { SUPABASE_ENABLED } from '@/lib/supabase/enabled'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createServerCookieStore } from '@/lib/supabase/server-cookies'
import { createExtensionTokenClient, extractBearerToken } from '@/lib/supabase/extension'

export const runtime = 'nodejs'

const DEFAULT_TEMPLATE_PROFILES = [
  {
    id: 'safe',
    name: '保守模式',
    folderTemplate: '{author}',
    fileTemplate: '{title}',
  },
  {
    id: 'balanced',
    name: '信息丰富',
    folderTemplate: '{author}',
    fileTemplate: '{awemeId}_{title}',
  },
  {
    id: 'by_date',
    name: '按日期归档',
    folderTemplate: '{date}/{author}',
    fileTemplate: '{awemeId}_{title}',
  },
]

function asRecord(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, any>
}

function toJson(value: unknown): Json {
  try {
    return JSON.parse(JSON.stringify(value ?? null)) as Json
  } catch {
    return {} as Json
  }
}

function normalizeExtensionConfig(value: unknown) {
  const source = asRecord(value)
  return {
    settings: asRecord(source.settings),
    parsers: Array.isArray(source.parsers) ? source.parsers : [],
    webdavServers: Array.isArray(source.webdavServers) ? source.webdavServers : [],
    defaults: asRecord(source.defaults),
  }
}

function applySetDefaultParser(config: ReturnType<typeof normalizeExtensionConfig>, payload: Record<string, any>) {
  const parserId = String(payload.parserId || '').trim()
  const parserName = String(payload.parserName || '').trim()
  const parser = config.parsers.find((item: any) => {
    if (!item || typeof item !== 'object') return false
    if (parserId && String(item.id || '').trim() === parserId) return true
    if (parserName && String(item.name || '').trim() === parserName) return true
    return false
  })
  if (!parser || !parser.id) {
    return false
  }
  config.defaults.parserId = String(parser.id)
  return true
}

function applySetRetryPolicy(config: ReturnType<typeof normalizeExtensionConfig>, payload: Record<string, any>) {
  const current = asRecord(config.settings.retryPolicy)
  const retryableClasses = Array.isArray(payload.retryableClasses)
    ? payload.retryableClasses.map((item: any) => String(item || '').trim()).filter(Boolean)
    : (Array.isArray(current.retryableClasses) ? current.retryableClasses : ['timeout', 'network', 'http5xx'])

  const maxRetries = Math.max(0, Math.min(5, Number(payload.maxRetries ?? current.maxRetries ?? 2)))
  const baseDelayMs = Math.max(150, Math.min(60000, Number(payload.baseDelayMs ?? current.baseDelayMs ?? 600)))
  const maxDelayMs = Math.max(baseDelayMs, Math.min(120000, Number(payload.maxDelayMs ?? current.maxDelayMs ?? 12000)))

  config.settings.retryPolicy = {
    retryableClasses,
    maxRetries,
    baseDelayMs,
    maxDelayMs,
  }
  config.settings.batchRetryCount = maxRetries
  return true
}

function applySetTemplateProfile(config: ReturnType<typeof normalizeExtensionConfig>, payload: Record<string, any>) {
  const profileId = String(payload.profileId || '').trim()
  if (!profileId) return false

  const current = asRecord(config.settings.templateProfiles)
  const profiles = Array.isArray(current.profiles) ? current.profiles : DEFAULT_TEMPLATE_PROFILES
  const active = profiles.find((item: any) => String(item?.id || '') === profileId)
  if (!active) return false

  config.settings.templateProfiles = {
    activeProfileId: profileId,
    profiles,
  }
  config.settings.uploadFolderTemplate = String(active.folderTemplate || '{author}')
  config.settings.uploadFileTemplate = String(active.fileTemplate || '{awemeId}_{title}')
  return true
}

export async function POST(request: NextRequest) {
  const auth = await requireRouteAuth(request)
  if (!auth.ok) {
    return auth.response
  }

  if (!SUPABASE_ENABLED) {
    return NextResponse.json({
      success: true,
      data: {
        applied: [],
        skipped: [],
      },
      source: 'disabled',
    })
  }

  try {
    const body = await request.json()
    const actions = Array.isArray(body?.actions) ? body.actions : []

    const bearerToken = extractBearerToken(request)
    const cookieStore = createServerCookieStore(request)
    const client = bearerToken
      ? (createExtensionTokenClient(bearerToken) as any)
      : (createServerClient(request, cookieStore) as any)

    const { data: existing, error: selectError } = await client
      .from('user_configs')
      .select('id, config_data')
      .eq('user_id', auth.context.userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (selectError) {
      return NextResponse.json(
        {
          success: false,
          error: selectError.message || '读取配置失败',
        },
        { status: 500 }
      )
    }

    const existingConfigData = asRecord(existing?.config_data)
    const extensionNode = asRecord(existingConfigData.extension)
    const extensionConfig = normalizeExtensionConfig(extensionNode.config)

    const applied: string[] = []
    const skipped: string[] = []
    for (const action of actions) {
      const id = String(action?.id || '').trim()
      const payload = asRecord(action?.payload)
      let ok = false
      if (id === 'set_default_parser') {
        ok = applySetDefaultParser(extensionConfig, payload)
      } else if (id === 'set_retry_policy') {
        ok = applySetRetryPolicy(extensionConfig, payload)
      } else if (id === 'set_template_profile') {
        ok = applySetTemplateProfile(extensionConfig, payload)
      }
      if (ok) {
        applied.push(id)
      } else {
        skipped.push(id)
      }
    }

    const nextConfigData: Json = toJson({
      ...existingConfigData,
      extension: {
        ...extensionNode,
        config: extensionConfig,
        updatedAt: Date.now(),
        syncedAt: new Date().toISOString(),
      },
    })

    if (existing?.id) {
      const { error: updateError } = await client
        .from('user_configs')
        .update({ config_data: nextConfigData })
        .eq('id', existing.id)
        .eq('user_id', auth.context.userId)
      if (updateError) {
        return NextResponse.json(
          {
            success: false,
            error: updateError.message || '应用建议失败',
          },
          { status: 500 }
        )
      }
    } else {
      const { error: insertError } = await client
        .from('user_configs')
        .insert({
          user_id: auth.context.userId,
          config_data: nextConfigData,
        })
      if (insertError) {
        return NextResponse.json(
          {
            success: false,
            error: insertError.message || '应用建议失败',
          },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        applied,
        skipped,
      },
      source: 'cloud',
    })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '应用建议失败',
      },
      { status: 500 }
    )
  }
}
