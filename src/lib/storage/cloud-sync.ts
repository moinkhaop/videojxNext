import { SUPABASE_ENABLED } from '@/lib/supabase/enabled'
import { ConfigManager, HistoryManager, TagManager, CleanupConfigManager } from '@/lib/storage'

type RemoteHistoryRow = {
  id: string
  createdAt?: string | Date
  updatedAt?: string | Date
  [key: string]: any
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

  if (remoteConfig && typeof remoteConfig === 'object') {
    const theme = (remoteConfig as any).theme
    if (theme === 'light' || theme === 'dark' || theme === 'system') {
      const current = ConfigManager.getAppConfig()
      ConfigManager.saveAppConfig({ ...current, theme })
    }

    const parsers = (remoteConfig as any).parsers
    if (Array.isArray(parsers)) {
      ConfigManager.saveParsers(parsers)
    }

    const webdavServers = (remoteConfig as any).webdavServers
    if (Array.isArray(webdavServers)) {
      ConfigManager.saveWebDAVServers(webdavServers)
    }
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

    HistoryManager.saveHistory(merged)
  }

  if (Array.isArray(remoteTags) && remoteTags.length > 0) {
    const local = TagManager.getTags()
    const byId = new Map<string, any>()
    for (const tag of local) {
      byId.set(tag.id, tag)
    }
    for (const tag of remoteTags as any[]) {
      byId.set(tag.id, { ...tag, createdAt: toDate(tag.createdAt) ?? new Date() })
    }
    TagManager.saveTags(Array.from(byId.values()))
  }

  if (remoteCleanup && typeof remoteCleanup === 'object') {
    const current = CleanupConfigManager.getCleanupConfig()
    CleanupConfigManager.saveCleanupConfig({ ...current, ...(remoteCleanup as any) })
  }
}

