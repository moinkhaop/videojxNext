import { SUPABASE_ENABLED } from '@/lib/supabase/enabled'
import { ConfigManager, HistoryManager, TagManager, CleanupConfigManager, runWithCloudSyncSuppressed } from '@/lib/storage'

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
  return {
    settings: asRecord(source.settings),
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

export async function hydrateFromSupabase() {
  if (!SUPABASE_ENABLED || typeof window === 'undefined') {
    return
  }

  const { markSyncOk } = await import('@/lib/supabase/sync-status')

  const remote = await safeCall(() => import('@/lib/supabase/database'))
  if (!remote) {
    return
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
      const theme = remoteRoot.theme
      if (theme === 'light' || theme === 'dark' || theme === 'system') {
        const current = ConfigManager.getAppConfig()
        ConfigManager.saveAppConfig({ ...current, theme })
      }

      const parsers = normalizedRemoteConfig.parsers
      if (Array.isArray(parsers)) {
        ConfigManager.saveParsers(parsers)
      }

      const webdavServers = normalizedRemoteConfig.webdavServers
      if (Array.isArray(webdavServers)) {
        ConfigManager.saveWebDAVServers(webdavServers)
      }
    })
  } else if (hasLocalConfig) {
    await safeCall(() => remote.updateUserConfig(localConfigPayload))
    markSyncOk('config')
  }

  if (Array.isArray(remoteHistory) && remoteHistory.length > 0) {
    const local = HistoryManager.getHistory()
    const byId = new Map<string, any>()

    for (const record of local) {
      byId.set(record.id, record)
    }

    for (const row of remoteHistory as RemoteHistoryRow[]) {
      const createdAt = toDate(row.createdAt) ?? new Date()
      const merged = {
        ...row,
        id: row.id,
        createdAt,
        task: row.task
          ? {
              ...row.task,
              createdAt: toDate(row.task.createdAt) ?? createdAt,
              completedAt: toDate(row.task.completedAt),
            }
          : row.task,
        lastViewedAt: toDate((row as any).lastViewedAt),
      }
      byId.set(row.id, merged)
    }

    const merged = Array.from(byId.values()).sort((a, b) => {
      const aTime = toDate(a.createdAt)?.getTime() ?? 0
      const bTime = toDate(b.createdAt)?.getTime() ?? 0
      return bTime - aTime
    })

    runWithCloudSyncSuppressed(() => {
      HistoryManager.saveHistory(merged)
    })
  }

  // Seed remote history when it is empty but local already has records.
  if (Array.isArray(remoteHistory) && remoteHistory.length === 0) {
    const local = HistoryManager.getHistory()
    if (local.length > 0) {
      for (const record of local.slice(0, 1000)) {
        await safeCall(() => remote.addHistoryRecord(record))
      }
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
  }

  // Seed remote tags when it is empty but local already has tags (including defaults).
  if (Array.isArray(remoteTags) && remoteTags.length === 0) {
    const local = TagManager.getTags()
    if (local.length > 0) {
      for (const tag of local) {
        await safeCall(() => remote.addTag(tag))
      }
    }
  }

  if (remoteCleanup && typeof remoteCleanup === 'object') {
    runWithCloudSyncSuppressed(() => {
      const current = CleanupConfigManager.getCleanupConfig()
      CleanupConfigManager.saveCleanupConfig({ ...current, ...(remoteCleanup as any) })
    })
  }

  markSyncOk('hydrate')
}
