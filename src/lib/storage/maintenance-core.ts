import {
  AppConfig,
  CleanupConfig,
  CleanupLogEntry,
  HistoryRecord,
  Tag,
  VideoParserConfig,
  WebDAVConfig,
} from '../../types'
import { getScopedStorageItem, removeScopedStorageItem, setScopedStorageItem } from './config-core'

const DEFAULT_CLEANUP_CONFIG: CleanupConfig = {
  enabled: true,
  retainDays: 7,
  retainSuccessfulTasks: true,
  retainFailedTasks: false,
  retainExtensions: ['.mp4', '.mov', '.avi', '.mkv', '.jpg', '.png', '.webp'],
  cleanupSchedule: '0 2 * * *',
}

const MAX_CLEANUP_LOGS = 100

export function getDefaultCleanupConfig(): CleanupConfig {
  return {
    ...DEFAULT_CLEANUP_CONFIG,
    retainExtensions: [...DEFAULT_CLEANUP_CONFIG.retainExtensions],
  }
}

export function readCleanupConfig(storageKey: string): CleanupConfig {
  const defaultConfig = getDefaultCleanupConfig()
  const stored = getScopedStorageItem(storageKey)
  if (!stored) {
    return defaultConfig
  }
  return { ...defaultConfig, ...JSON.parse(stored) }
}

export function writeCleanupConfig(storageKey: string, config: CleanupConfig): void {
  setScopedStorageItem(storageKey, JSON.stringify(config))
}

export function readCleanupLogs(storageKey: string): CleanupLogEntry[] {
  const stored = getScopedStorageItem(storageKey)
  if (!stored) {
    return []
  }

  const logs = JSON.parse(stored)
  if (!Array.isArray(logs)) {
    return []
  }

  return logs.map((log: any) => ({
    ...log,
    timestamp: new Date(log.timestamp),
  }))
}

export function appendCleanupLog(storageKey: string, log: CleanupLogEntry): void {
  const logs = readCleanupLogs(storageKey)
  logs.unshift(log)
  if (logs.length > MAX_CLEANUP_LOGS) {
    logs.splice(MAX_CLEANUP_LOGS)
  }
  setScopedStorageItem(storageKey, JSON.stringify(logs))
}

export function clearCleanupLogs(storageKey: string): void {
  removeScopedStorageItem(storageKey)
}

export type ExportedAppData = {
  config: AppConfig
  parsers: VideoParserConfig[]
  webdavServers: WebDAVConfig[]
  history: HistoryRecord[]
  tags?: Tag[]
  cleanupConfig?: CleanupConfig
  exportTime: string
  version: string
}

export function createExportedAppData(payload: {
  config: AppConfig
  parsers: VideoParserConfig[]
  webdavServers: WebDAVConfig[]
  history: HistoryRecord[]
  tags?: Tag[]
  cleanupConfig?: CleanupConfig
}): ExportedAppData {
  return {
    config: payload.config,
    parsers: payload.parsers,
    webdavServers: payload.webdavServers,
    history: payload.history,
    tags: payload.tags,
    cleanupConfig: payload.cleanupConfig,
    exportTime: new Date().toISOString(),
    version: '1.1.0',
  }
}

export function serializeExportedAppData(payload: ExportedAppData): string {
  return JSON.stringify(payload, null, 2)
}

export function parseImportedAppData(jsonData: string): ExportedAppData {
  const data = JSON.parse(jsonData)
  if (!data?.version || !data?.exportTime) {
    throw new Error('无效的数据格式')
  }
  return data as ExportedAppData
}
