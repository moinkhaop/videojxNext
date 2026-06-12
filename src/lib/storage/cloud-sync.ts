import { SUPABASE_ENABLED } from '@/lib/supabase/enabled'
import { ConfigManager, HistoryManager, TagManager, CleanupConfigManager, runWithCloudSyncSuppressed } from '@/lib/storage'
import type { HistoryRecord } from '@/types'

export const CLOUD_STORAGE_SYNC_EVENT = 'dyjx:cloud-storage-sync'

type RemoteHistoryRow = {
  id: string
  createdAt?: string | Date
  updatedAt?: string | Date
  [key: string]: any
}

type NormalizedConfig = {
  settings: Record<string, any>
  parsers: any[]
  webdavServers: any[]
  defaults: Record<string, any>
}

function asRecord(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, any>
}

function normalizeRootConfig(value: unknown): NormalizedConfig {
  const source = asRecord(value)
  const settings = asRecord(source.settings)
  if (!settings.retryPolicy && source.retryPolicy) {
    settings.retryPolicy = source.retryPolicy
  }
  if (!settings.notifications && source.notifications) {
    settings.notifications = source.notifications
  }
  if (!settings.templateProfiles && source.templateProfiles) {
    settings.templateProfiles = source.templateProfiles
  }
  if (!settings.uploadFolderTemplate && source.uploadFolderTemplate) {
    settings.uploadFolderTemplate = source.uploadFolderTemplate
  }
  if (!settings.uploadFileTemplate && source.uploadFileTemplate) {
    settings.uploadFileTemplate = source.uploadFileTemplate
  }
  return {
    settings,
    parsers: Array.isArray(source.parsers) ? source.parsers : [],
    webdavServers: Array.isArray(source.webdavServers) ? source.webdavServers : [],
    defaults: asRecord(source.defaults),
  }
}

function hasConfigContent(config: NormalizedConfig): boolean {
  if (config.parsers.length > 0) return true
  if (config.webdavServers.length > 0) return true
  if (Object.keys(config.settings).length > 0) return true
  if (Object.keys(config.defaults).length > 0) return true
  return false
}

function normalizeRemoteConfig(value: unknown): NormalizedConfig {
  const source = asRecord(value)
  const extensionNode = asRecord(source.extension)
  const extensionConfig = normalizeRootConfig(extensionNode.config)
  if (hasConfigContent(extensionConfig)) {
    return extensionConfig
  }
  return normalizeRootConfig(source)
}

function toDate(value: unknown): Date | undefined {
  if (!value) return undefined
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value
  const d = new Date(value as any)
  return Number.isNaN(d.getTime()) ? undefined : d
}

function safeCall<T>(fn: () => Promise<T>): Promise<T | null> {
  return fn().catch(() => null)
}

function emitCloudStorageSync(detail: Record<string, unknown>) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.dispatchEvent(
      new CustomEvent(CLOUD_STORAGE_SYNC_EVENT, {
        detail,
      })
    )
  } catch {
  }
}

function normalizeRemoteHistory(rows: RemoteHistoryRow[]): HistoryRecord[] {
  return rows
    .map((row): HistoryRecord => {
      const createdAt = toDate(row.createdAt) ?? new Date()
      const type: HistoryRecord['type'] = row.type === 'batch' ? 'batch' : 'single'
      const rawTask = row.task && typeof row.task === 'object' ? row.task : {}
      const taskCreatedAt = toDate(rawTask.createdAt) ?? createdAt
      const normalizedTask = {
        ...rawTask,
        createdAt: taskCreatedAt,
        completedAt: toDate(rawTask.completedAt),
      } as HistoryRecord['task']

      const normalized: HistoryRecord = {
        id: row.id,
        type,
        createdAt,
        task: normalizedTask,
      }

      const lastViewedAt = toDate((row as any).lastViewedAt)
      if (lastViewedAt) {
        normalized.lastViewedAt = lastViewedAt
      }

      const tags = Array.isArray((row as any).tags)
        ? (row as any).tags.filter((tagId: unknown): tagId is string => typeof tagId === 'string' && tagId.trim().length > 0)
        : []
      if (tags.length > 0) {
        normalized.tags = tags
      }

      if (typeof (row as any).notes === 'string') {
        normalized.notes = (row as any).notes
      }

      if (typeof (row as any).isFavorite === 'boolean') {
        normalized.isFavorite = (row as any).isFavorite
      }

      return normalized
    })
    .sort((a, b) => {
      const aTime = toDate(a.createdAt)?.getTime() ?? 0
      const bTime = toDate(b.createdAt)?.getTime() ?? 0
      return bTime - aTime
    })
}

export async function hydrateFromSupabase() {
  if (!SUPABASE_ENABLED || typeof window === 'undefined') {
    return
  }

  const { markSyncOk } = await import('@/lib/supabase/sync-status')

  const remote = await safeCall(() => import('@/lib/supabase/database'))
  if (!remote) {
    return
  }

  const syncSummary: Record<string, unknown> = {
    config: 'noop',
    history: 'noop',
    tags: 'noop',
    cleanup: 'noop',
  }

  const [remoteConfig, remoteHistory, remoteTags, remoteCleanup] = await Promise.all([
    safeCall(() => remote.getUserConfig()),
    safeCall(() => remote.getHistoryRecords(1000, 0)),
    safeCall(() => remote.getTags()),
    safeCall(() => remote.getCleanupConfig()),
  ])

  const localConfigPayload = {
    ...ConfigManager.getAppConfig(),
    parsers: ConfigManager.getParsers(),
    webdavServers: ConfigManager.getWebDAVServers(),
  }
  const normalizedRemoteConfig = normalizeRemoteConfig(remoteConfig)
  const normalizedLocalConfig = normalizeRootConfig(localConfigPayload)
  const hasRemoteConfig = hasConfigContent(normalizedRemoteConfig)
  const hasLocalConfig = hasConfigContent(normalizedLocalConfig)

  if (hasRemoteConfig) {
    const remoteRoot = asRecord(remoteConfig)
    runWithCloudSyncSuppressed(() => {
      const current = ConfigManager.getAppConfig()
      const theme = remoteRoot.theme
      const nextTheme = theme === 'light' || theme === 'dark' || theme === 'system'
        ? theme
        : current.theme
      const remoteSettings = normalizedRemoteConfig.settings || {}
      // AppConfig 的已提交类型仍是精简版，这里保留扩展设置同步，避免在构建期触发额外属性的类型报错。
      const nextAppConfig: any = {
        ...current,
        theme: nextTheme,
      }
      nextAppConfig.retryPolicy = remoteSettings.retryPolicy ?? (current as any).retryPolicy
      nextAppConfig.notifications = remoteSettings.notifications ?? (current as any).notifications
      nextAppConfig.templateProfiles = remoteSettings.templateProfiles ?? (current as any).templateProfiles
      nextAppConfig.uploadFolderTemplate = remoteSettings.uploadFolderTemplate ?? (current as any).uploadFolderTemplate
      nextAppConfig.uploadFileTemplate = remoteSettings.uploadFileTemplate ?? (current as any).uploadFileTemplate
      ConfigManager.saveAppConfig(nextAppConfig)

      const parsers = normalizedRemoteConfig.parsers
      if (Array.isArray(parsers)) {
        ConfigManager.saveParsers(parsers)
      }

      const webdavServers = normalizedRemoteConfig.webdavServers
      if (Array.isArray(webdavServers)) {
        ConfigManager.saveWebDAVServers(webdavServers)
      }
    })
    syncSummary.config = 'pulled'
  } else if (hasLocalConfig) {
    await safeCall(() => remote.updateUserConfig(localConfigPayload))
    markSyncOk('config')
    syncSummary.config = 'pushed'
  }

  if (Array.isArray(remoteHistory) && remoteHistory.length > 0) {
    const normalizedRemoteHistory = normalizeRemoteHistory(remoteHistory as RemoteHistoryRow[])

    runWithCloudSyncSuppressed(() => {
      // 登录用户下，以云端历史为准，避免本地遗留数据导致网站与插件展示不一致。
      HistoryManager.saveHistory(normalizedRemoteHistory)
    })
    syncSummary.history = 'pulled'
    syncSummary.historyCount = normalizedRemoteHistory.length
  }

  // Seed remote history when it is empty but local already has records.
  if (Array.isArray(remoteHistory) && remoteHistory.length === 0) {
    const local = HistoryManager.getHistory()
    if (local.length > 0) {
      for (const record of local.slice(0, 1000)) {
        await safeCall(() => remote.addHistoryRecord(record))
      }
      syncSummary.history = 'pushed'
      syncSummary.historyCount = local.length
    }
  }

  if (Array.isArray(remoteTags) && remoteTags.length > 0) {
    const local = TagManager.getTags()

    const byId = new Map<string, any>()
    const remoteByFingerprint = new Map<string, any>()

    for (const tag of remoteTags as any[]) {
      const normalized = { ...tag, createdAt: toDate(tag.createdAt) ?? new Date() }
      byId.set(tag.id, normalized)
      const fp = `${String(tag.name ?? '')}__${String(tag.color ?? '')}`
      remoteByFingerprint.set(fp, normalized)
    }

    const idRemap = new Map<string, string>()

    for (const tag of local) {
      if (byId.has(tag.id)) continue
      const fp = `${String((tag as any).name ?? '')}__${String((tag as any).color ?? '')}`
      const remoteMatch = remoteByFingerprint.get(fp)
      if (remoteMatch?.id && remoteMatch.id !== tag.id) {
        idRemap.set(tag.id, remoteMatch.id)
        continue
      }
      byId.set(tag.id, tag)
    }

    if (idRemap.size > 0) {
      const records = HistoryManager.getHistory()
      let historyChanged = false
      const updatedRecords = records.map(record => {
        if (!record.tags || record.tags.length === 0) return record
        const nextTags = record.tags.map(tagId => idRemap.get(tagId) ?? tagId)
        const different = nextTags.some((value, index) => value !== record.tags![index])
        if (!different) return record
        historyChanged = true
        return { ...record, tags: nextTags }
      })
      if (historyChanged) {
        runWithCloudSyncSuppressed(() => {
          HistoryManager.saveHistory(updatedRecords)
        })
      }
    }

    runWithCloudSyncSuppressed(() => {
      TagManager.saveTags(Array.from(byId.values()))
    })
    syncSummary.tags = 'pulled'
    syncSummary.tagsCount = byId.size
  }

  // Seed remote tags when it is empty but local already has tags (including defaults).
  if (Array.isArray(remoteTags) && remoteTags.length === 0) {
    const local = TagManager.getTags()
    if (local.length > 0) {
      for (const tag of local) {
        await safeCall(() => remote.addTag(tag))
      }
      syncSummary.tags = 'pushed'
      syncSummary.tagsCount = local.length
    }
  }

  if (remoteCleanup && typeof remoteCleanup === 'object') {
    runWithCloudSyncSuppressed(() => {
      const current = CleanupConfigManager.getCleanupConfig()
      CleanupConfigManager.saveCleanupConfig({ ...current, ...(remoteCleanup as any) })
    })
    syncSummary.cleanup = 'pulled'
  }

  markSyncOk('hydrate')
  emitCloudStorageSync(syncSummary)
}
