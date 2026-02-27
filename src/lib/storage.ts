import { AppConfig, VideoParserConfig, WebDAVConfig, HistoryRecord, CleanupConfig, CleanupLogEntry, HistoryStats, TaskStatus, Tag, ParserCapability, SupportedPlatform } from '@/types'
import { SUPABASE_ENABLED } from '@/lib/supabase/enabled'
import { markSyncError, markSyncOk } from '@/lib/supabase/sync-status'

let pendingConfigSyncTimer: ReturnType<typeof setTimeout> | null = null
let suppressCloudSync = false

export function runWithCloudSyncSuppressed<T>(fn: () => T): T {
  suppressCloudSync = true
  try {
    return fn()
  } finally {
    suppressCloudSync = false
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID_RE.test(value)
const builtinEdgeOneParserUrl = process.env.NEXT_PUBLIC_EDGEONE_PARSER_API_URL?.trim() || ''

const createUuid = (): string => {
  const uuid = (globalThis as any)?.crypto?.randomUUID
  if (typeof uuid === 'function') {
    return uuid.call((globalThis as any).crypto)
  }

  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.map(b => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const scheduleConfigSyncToSupabase = () => {
  if (!SUPABASE_ENABLED || typeof window === 'undefined' || suppressCloudSync) {
    return
  }

  if (pendingConfigSyncTimer) {
    clearTimeout(pendingConfigSyncTimer)
  }

  pendingConfigSyncTimer = setTimeout(() => {
    pendingConfigSyncTimer = null

    void (async () => {
      try {
        const { updateUserConfig } = await import('@/lib/supabase/database')
        const current = ConfigManager.getAppConfig()
        const payload = {
          ...current,
          parsers: ConfigManager.getParsers(),
          webdavServers: ConfigManager.getWebDAVServers(),
        }
        await updateUserConfig(payload)
        markSyncOk('config')
      } catch (error) {
        console.warn('[SupabaseSync] 配置同步失败:', error)
        markSyncError('config', error)
      }
    })()
  }, 500)
}

const scheduleHistoryUpsertToSupabase = (record: HistoryRecord | null) => {
  if (!SUPABASE_ENABLED || typeof window === 'undefined' || !record || suppressCloudSync) {
    return
  }

  void (async () => {
    try {
      const { updateHistoryRecord, addHistoryRecord } = await import('@/lib/supabase/database')
      try {
        await updateHistoryRecord(record.id, record)
      } catch {
        await addHistoryRecord(record)
      }
      markSyncOk('history')
    } catch (error) {
      console.warn('[SupabaseSync] 历史记录同步失败:', error)
      markSyncError('history', error)
    }
  })()
}

const scheduleHistoryDeleteToSupabase = (id: string) => {
  if (!SUPABASE_ENABLED || typeof window === 'undefined' || suppressCloudSync) {
    return
  }

  void (async () => {
    try {
      const { deleteHistoryRecord } = await import('@/lib/supabase/database')
      await deleteHistoryRecord(id)
      markSyncOk('history')
    } catch (error) {
      console.warn('[SupabaseSync] 删除历史记录同步失败:', error)
      markSyncError('history', error)
    }
  })()
}

const scheduleTagsSyncToSupabase = (action: 'upsert' | 'delete', payload: any) => {
  if (!SUPABASE_ENABLED || typeof window === 'undefined' || suppressCloudSync) {
    return
  }

  void (async () => {
    try {
      const { addTag, updateTag, deleteTag } = await import('@/lib/supabase/database')
      if (action === 'delete') {
        await deleteTag(payload.id)
        markSyncOk('tags')
        return
      }

      try {
        await updateTag(payload.id, payload)
      } catch {
        await addTag(payload)
      }
      markSyncOk('tags')
    } catch (error) {
      console.warn('[SupabaseSync] 标签同步失败:', error)
      markSyncError('tags', error)
    }
  })()
}


// 加密相关工具
export class StorageEncryption {
  private static readonly SECRET_KEY = 'dyjx-video-converter-2024'

  static encrypt(text: string): string {
    // 简单的Base64编码，生产环境建议使用更强的加密
    return btoa(text)
  }

  static decrypt(encrypted: string): string {
    try {
      return atob(encrypted)
    } catch {
      return ''
    }
  }
}

// 配置管理
export class ConfigManager {
  private static readonly CONFIG_KEY = 'dyjx_app_config'
  private static readonly PARSERS_KEY = 'dyjx_parsers_config'
  private static readonly WEBDAV_KEY = 'dyjx_webdav_config'

  // 获取应用配置
  static getAppConfig(): AppConfig {
    const defaultConfig: AppConfig = {
      parsers: [],
      webdavServers: [],
      theme: 'system'
    }

    try {
      const stored = localStorage.getItem(this.CONFIG_KEY)
      if (stored) {
        return { ...defaultConfig, ...JSON.parse(stored) }
      }
    } catch (error) {
      console.error('获取应用配置失败:', error)
    }

    return defaultConfig
  }

  // 保存应用配置
  static saveAppConfig(config: AppConfig): void {
    try {
      localStorage.setItem(this.CONFIG_KEY, JSON.stringify(config))
    } catch (error) {
      console.error('保存应用配置失败:', error)
    }

    scheduleConfigSyncToSupabase()
  }

  // 获取解析器配置（合并内置默认配置和用户自定义配置，过滤禁用项）
  static getParsers(): VideoParserConfig[] {
    const builtinParsers = this.getDefaultParsers()

    try {
      const stored = localStorage.getItem(this.PARSERS_KEY)
      if (stored) {
        const userParsers = JSON.parse(stored)
        // 解密敏感信息
        const decryptedUserParsers = userParsers.map((parser: VideoParserConfig) => ({
          ...parser,
          apiKey: parser.apiKey ? StorageEncryption.decrypt(parser.apiKey) : undefined
        }))

        // 合并内置配置和用户配置（用户配置可以覆盖内置配置）
        const mergedParsers = [...builtinParsers]
        const builtinIds = new Set(builtinParsers.map(p => p.id))

        decryptedUserParsers.forEach((userParser: VideoParserConfig) => {
          if (builtinIds.has(userParser.id)) {
            // 用户配置覆盖内置配置
            const index = mergedParsers.findIndex(p => p.id === userParser.id)
            if (index !== -1) {
              mergedParsers[index] = userParser
            }
          } else {
            // 添加新的用户配置
            mergedParsers.push(userParser)
          }
        })

        // 过滤掉被禁用的配置
        return mergedParsers.filter(p => !p.disabled)
      }
    } catch (error) {
      console.error('获取解析器配置失败:', error)
    }

    // 如果没有用户配置，返回默认解析器
    return builtinParsers
  }

  // {{ AURA: Add - 获取默认解析器配置 }}
  static getDefaultParsers(): VideoParserConfig[] {
    const parsers: VideoParserConfig[] = []

    parsers.push({
      id: 'builtin_parser_next_douyin',
      name: '内置抖音解析器',
      apiUrl: '/api/douyin/parse',
      isDefault: !builtinEdgeOneParserUrl,
      isBuiltin: true,
      requestMethod: 'POST',
      urlParamName: 'url',
      capabilities: [ParserCapability.SINGLE_VIDEO],
      supportedPlatforms: [SupportedPlatform.DOUYIN]
    })

    if (builtinEdgeOneParserUrl) {
      parsers.push({
        id: 'builtin_parser_edgeone_douyin',
        name: 'EdgeOne 抖音解析器',
        apiUrl: builtinEdgeOneParserUrl,
        isDefault: true,
        isBuiltin: true,
        requestMethod: 'POST',
        urlParamName: 'url',
        capabilities: [ParserCapability.SINGLE_VIDEO],
        supportedPlatforms: [SupportedPlatform.DOUYIN]
      })
    }

    parsers.push({
      id: 'builtin_parser_jxcxin',
      name: '默认抖音解析器',
      apiUrl: 'https://apis.jxcxin.cn/api/douyin',
      isDefault: false,
      isBuiltin: true,
      requestMethod: 'GET',
      urlParamName: 'url',
      capabilities: [ParserCapability.SINGLE_VIDEO],
      supportedPlatforms: [SupportedPlatform.DOUYIN]
    })

    // ===== Douyin / Universal public nodes (third-party) =====
    parsers.push({
      id: 'builtin_parser_douyin_wtf',
      name: 'douyin.wtf（抖音/多平台）',
      apiUrl: 'https://api.douyin.wtf/api/hybrid/video_data',
      isDefault: false,
      isBuiltin: true,
      requestMethod: 'GET',
      urlParamName: 'url',
      capabilities: [ParserCapability.SINGLE_VIDEO],
      supportedPlatforms: [SupportedPlatform.UNIVERSAL]
    })

    parsers.push({
      id: 'builtin_parser_yujn',
      name: '遇见API（抖音/多平台）',
      apiUrl: 'https://api.yujn.cn/api/dy_jx.php',
      isDefault: false,
      isBuiltin: true,
      requestMethod: 'GET',
      urlParamName: 'msg',
      capabilities: [ParserCapability.SINGLE_VIDEO],
      supportedPlatforms: [SupportedPlatform.UNIVERSAL]
    })

    parsers.push({
      id: 'builtin_parser_xzdx',
      name: 'xzdx.top（多平台）',
      apiUrl: 'https://xzdx.top/api/duan',
      isDefault: false,
      isBuiltin: true,
      requestMethod: 'GET',
      urlParamName: 'url',
      capabilities: [ParserCapability.SINGLE_VIDEO],
      supportedPlatforms: [SupportedPlatform.UNIVERSAL]
    })

    parsers.push({
      id: 'builtin_parser_oick_douyin',
      name: 'Oick（抖音）',
      apiUrl: 'https://api.oick.cn/douyin/',
      isDefault: false,
      isBuiltin: true,
      requestMethod: 'GET',
      urlParamName: 'url',
      capabilities: [ParserCapability.SINGLE_VIDEO],
      supportedPlatforms: [SupportedPlatform.DOUYIN]
    })

    parsers.push({
      id: 'builtin_parser_pearktrue_douyin',
      name: 'Pearktrue（抖音/多平台）',
      apiUrl: 'https://api.pearktrue.cn/api/video/douyin/',
      isDefault: false,
      isBuiltin: true,
      requestMethod: 'GET',
      urlParamName: 'url',
      capabilities: [ParserCapability.SINGLE_VIDEO],
      supportedPlatforms: [SupportedPlatform.DOUYIN]
    })

    // ===== Bilibili =====
    parsers.push({
      id: 'builtin_parser_next_bilibili',
      name: '内置B站解析器',
      apiUrl: '/api/bilibili/parse',
      isDefault: false,
      isBuiltin: true,
      requestMethod: 'POST',
      urlParamName: 'url',
      capabilities: [ParserCapability.SINGLE_VIDEO],
      supportedPlatforms: [SupportedPlatform.BILIBILI]
    })

    parsers.push({
      id: 'builtin_parser_mir6_bilibili',
      name: 'mir6（B站）',
      apiUrl: 'https://api.mir6.com/api/bzjiexi',
      isDefault: false,
      isBuiltin: true,
      requestMethod: 'GET',
      urlParamName: 'url',
      customQueryParams: { type: 'json' },
      capabilities: [ParserCapability.SINGLE_VIDEO],
      supportedPlatforms: [SupportedPlatform.BILIBILI]
    })

    return parsers
  }

  // {{ AURA: Add - 获取默认WebDAV服务器配置 }}
  static getDefaultWebDAVServers(): WebDAVConfig[] {
    return []
  }

  // 保存解析器配置（只保存用户自定义的配置和修改）
  static saveParsers(parsers: VideoParserConfig[]): void {
    try {
      // 过滤掉未修改的内置配置，只保存用户配置
      const builtinIds = new Set(this.getDefaultParsers().map(p => p.id))
      const userParsers = parsers.filter(parser => {
        // 保留：1) 非内置配置 2) 被修改或禁用的内置配置
        if (!builtinIds.has(parser.id)) {
          return true
        }
        // 检查内置配置是否被修改
        const builtinParser = this.getDefaultParsers().find(p => p.id === parser.id)
        if (!builtinParser) return true
        // 如果配置被禁用或其他属性被修改，则保存
        return parser.disabled || JSON.stringify(parser) !== JSON.stringify(builtinParser)
      })

      // 加密敏感信息
      const encryptedParsers = userParsers.map(parser => ({
        ...parser,
        apiKey: parser.apiKey ? StorageEncryption.encrypt(parser.apiKey) : undefined
      }))
      localStorage.setItem(this.PARSERS_KEY, JSON.stringify(encryptedParsers))
    } catch (error) {
      console.error('保存解析器配置失败:', error)
    }

    scheduleConfigSyncToSupabase()
  }

  // 获取WebDAV配置（合并内置默认配置和用户自定义配置，过滤禁用项）
  static getWebDAVServers(): WebDAVConfig[] {
    const builtinServers = this.getDefaultWebDAVServers()

    try {
      const stored = localStorage.getItem(this.WEBDAV_KEY)
      if (stored) {
        const userServers = JSON.parse(stored)
        // 解密敏感信息
        const decryptedUserServers = userServers.map((server: WebDAVConfig) => ({
          ...server,
          password: StorageEncryption.decrypt(server.password)
        }))

        // 合并内置配置和用户配置（用户配置可以覆盖内置配置）
        const mergedServers = [...builtinServers]
        const builtinIds = new Set(builtinServers.map(s => s.id))

        decryptedUserServers.forEach((userServer: WebDAVConfig) => {
          if (builtinIds.has(userServer.id)) {
            // 用户配置覆盖内置配置
            const index = mergedServers.findIndex(s => s.id === userServer.id)
            if (index !== -1) {
              mergedServers[index] = userServer
            }
          } else {
            // 添加新的用户配置
            mergedServers.push(userServer)
          }
        })

        // 过滤掉被禁用的配置
        return mergedServers.filter(s => !s.disabled)
      }
    } catch (error) {
      console.error('获取WebDAV配置失败:', error)
    }

    // 如果没有用户配置，返回默认服务器
    return builtinServers
  }

  // 保存WebDAV配置（只保存用户自定义的配置和修改）
  static saveWebDAVServers(servers: WebDAVConfig[]): void {
    try {
      // 过滤掉未修改的内置配置，只保存用户配置
      const builtinIds = new Set(this.getDefaultWebDAVServers().map(s => s.id))
      const userServers = servers.filter(server => {
        // 保留：1) 非内置配置 2) 被修改或禁用的内置配置
        if (!builtinIds.has(server.id)) {
          return true
        }
        // 检查内置配置是否被修改
        const builtinServer = this.getDefaultWebDAVServers().find(s => s.id === server.id)
        if (!builtinServer) return true
        // 如果配置被禁用或其他属性被修改，则保存
        return server.disabled || JSON.stringify(server) !== JSON.stringify(builtinServer)
      })

      // 加密敏感信息
      const encryptedServers = userServers.map(server => ({
        ...server,
        password: StorageEncryption.encrypt(server.password)
      }))
      localStorage.setItem(this.WEBDAV_KEY, JSON.stringify(encryptedServers))
    } catch (error) {
      console.error('保存WebDAV配置失败:', error)
    }

    scheduleConfigSyncToSupabase()
  }

  // 添加解析器
  static addParser(parser: VideoParserConfig): void {
    const parsers = this.getParsers()
    // 如果设置为默认，清除其他默认设置
    if (parser.isDefault) {
      parsers.forEach(p => p.isDefault = false)
    }
    parsers.push(parser)
    this.saveParsers(parsers)
  }

  // 更新解析器
  static updateParser(id: string, updates: Partial<VideoParserConfig>): void {
    const parsers = this.getParsers()
    const index = parsers.findIndex(p => p.id === id)
    if (index !== -1) {
      // 如果设置为默认，清除其他默认设置
      if (updates.isDefault) {
        parsers.forEach(p => p.isDefault = false)
      }
      parsers[index] = { ...parsers[index], ...updates }
      this.saveParsers(parsers)
    }
  }

  // 删除解析器（内置配置将被标记为禁用，而不是真正删除）
  static deleteParser(id: string): void {
    const builtinIds = new Set(this.getDefaultParsers().map(p => p.id))

    if (builtinIds.has(id)) {
      // 内置配置：保存一个禁用的版本到用户配置中
      const parser = this.getParsers().find(p => p.id === id)
      if (parser) {
        const userParsers = this.getUserParsers()
        const updatedParser = { ...parser, isDefault: false, disabled: true }
        const existingIndex = userParsers.findIndex(p => p.id === id)
        if (existingIndex !== -1) {
          userParsers[existingIndex] = updatedParser
        } else {
          userParsers.push(updatedParser)
        }
        this.saveUserParsers(userParsers)
      }
    } else {
      // 用户配置：直接删除
      const userParsers = this.getUserParsers().filter(p => p.id !== id)
      this.saveUserParsers(userParsers)
    }
  }

  // 获取仅用户添加的解析器配置（不包括内置配置）
  private static getUserParsers(): VideoParserConfig[] {
    try {
      const stored = localStorage.getItem(this.PARSERS_KEY)
      if (stored) {
        const parsers = JSON.parse(stored)
        return parsers.map((parser: VideoParserConfig) => ({
          ...parser,
          apiKey: parser.apiKey ? StorageEncryption.decrypt(parser.apiKey) : undefined
        }))
      }
    } catch (error) {
      console.error('获取用户解析器配置失败:', error)
    }
    return []
  }

  // 保存仅用户的解析器配置
  private static saveUserParsers(parsers: VideoParserConfig[]): void {
    try {
      const encryptedParsers = parsers.map(parser => ({
        ...parser,
        apiKey: parser.apiKey ? StorageEncryption.encrypt(parser.apiKey) : undefined
      }))
      localStorage.setItem(this.PARSERS_KEY, JSON.stringify(encryptedParsers))
    } catch (error) {
      console.error('保存用户解析器配置失败:', error)
    }
  }

  // 检查是否为内置解析器
  static isBuiltinParser(id: string): boolean {
    return this.getDefaultParsers().some(p => p.id === id)
  }

  // 恢复内置解析器（删除用户的覆盖配置）
  static restoreBuiltinParser(id: string): void {
    if (!this.isBuiltinParser(id)) {
      console.warn('无法恢复非内置解析器:', id)
      return
    }
    const userParsers = this.getUserParsers().filter(p => p.id !== id)
    this.saveUserParsers(userParsers)
  }

  // 添加WebDAV服务器
  static addWebDAVServer(server: WebDAVConfig): void {
    const servers = this.getWebDAVServers()
    // 如果设置为默认，清除其他默认设置
    if (server.isDefault) {
      servers.forEach(s => s.isDefault = false)
    }
    servers.push(server)
    this.saveWebDAVServers(servers)
  }

  // 更新WebDAV服务器
  static updateWebDAVServer(id: string, updates: Partial<WebDAVConfig>): void {
    const servers = this.getWebDAVServers()
    const index = servers.findIndex(s => s.id === id)
    if (index !== -1) {
      // 如果设置为默认，清除其他默认设置
      if (updates.isDefault) {
        servers.forEach(s => s.isDefault = false)
      }
      servers[index] = { ...servers[index], ...updates }
      this.saveWebDAVServers(servers)
    }
  }

  // 删除WebDAV服务器（内置配置将被标记为禁用，而不是真正删除）
  static deleteWebDAVServer(id: string): void {
    const builtinIds = new Set(this.getDefaultWebDAVServers().map(s => s.id))

    if (builtinIds.has(id)) {
      // 内置配置：保存一个禁用的版本到用户配置中
      const server = this.getWebDAVServers().find(s => s.id === id)
      if (server) {
        const userServers = this.getUserWebDAVServers()
        const updatedServer = { ...server, isDefault: false, disabled: true }
        const existingIndex = userServers.findIndex(s => s.id === id)
        if (existingIndex !== -1) {
          userServers[existingIndex] = updatedServer
        } else {
          userServers.push(updatedServer)
        }
        this.saveUserWebDAVServers(userServers)
      }
    } else {
      // 用户配置：直接删除
      const userServers = this.getUserWebDAVServers().filter(s => s.id !== id)
      this.saveUserWebDAVServers(userServers)
    }
  }

  // 获取仅用户添加的WebDAV服务器配置（不包括内置配置）
  private static getUserWebDAVServers(): WebDAVConfig[] {
    try {
      const stored = localStorage.getItem(this.WEBDAV_KEY)
      if (stored) {
        const servers = JSON.parse(stored)
        return servers.map((server: WebDAVConfig) => ({
          ...server,
          password: StorageEncryption.decrypt(server.password)
        }))
      }
    } catch (error) {
      console.error('获取用户WebDAV配置失败:', error)
    }
    return []
  }

  // 保存仅用户的WebDAV服务器配置
  private static saveUserWebDAVServers(servers: WebDAVConfig[]): void {
    try {
      const encryptedServers = servers.map(server => ({
        ...server,
        password: StorageEncryption.encrypt(server.password)
      }))
      localStorage.setItem(this.WEBDAV_KEY, JSON.stringify(encryptedServers))
    } catch (error) {
      console.error('保存用户WebDAV配置失败:', error)
    }
  }

  // 检查是否为内置WebDAV服务器
  static isBuiltinWebDAVServer(id: string): boolean {
    return this.getDefaultWebDAVServers().some(s => s.id === id)
  }

  // 恢复内置WebDAV服务器（删除用户的覆盖配置）
  static restoreBuiltinWebDAVServer(id: string): void {
    if (!this.isBuiltinWebDAVServer(id)) {
      console.warn('无法恢复非内置WebDAV服务器:', id)
      return
    }
    const userServers = this.getUserWebDAVServers().filter(s => s.id !== id)
    this.saveUserWebDAVServers(userServers)
  }

  // 获取默认解析器
  static getDefaultParser(): VideoParserConfig | null {
    const parsers = this.getParsers()
    return parsers.find(p => p.isDefault) || parsers[0] || null
  }

  // 获取默认WebDAV服务器
  static getDefaultWebDAVServer(): WebDAVConfig | null {
    const servers = this.getWebDAVServers()
    return servers.find(s => s.isDefault) || servers[0] || null
  }

  // 为了兼容性添加的别名方法
  static getWebDAVConfigs = this.getWebDAVServers
  static addWebDAVConfig = this.addWebDAVServer
  static updateWebDAVConfig = this.updateWebDAVServer
  static deleteWebDAVConfig = this.deleteWebDAVServer
  static setDefaultWebDAVConfig(id: string): void {
    this.updateWebDAVServer(id, { isDefault: true })
  }
}

// 清理配置管理
export class CleanupConfigManager {
  private static readonly CLEANUP_CONFIG_KEY = 'dyjx_cleanup_config'

  // 获取清理配置
  static getCleanupConfig(): CleanupConfig {
    const defaultConfig: CleanupConfig = {
      enabled: true,
      retainDays: 7,
      retainSuccessfulTasks: true,
      retainFailedTasks: false,
      retainExtensions: ['.mp4', '.mov', '.avi', '.mkv', '.jpg', '.png', '.webp'],
      cleanupSchedule: '0 2 * * *'
    }

    try {
      const stored = localStorage.getItem(this.CLEANUP_CONFIG_KEY)
      if (stored) {
        return { ...defaultConfig, ...JSON.parse(stored) }
      }
    } catch (error) {
      console.error('获取清理配置失败:', error)
    }

    return defaultConfig
  }

  // 保存清理配置
  static saveCleanupConfig(config: CleanupConfig): void {
    try {
      localStorage.setItem(this.CLEANUP_CONFIG_KEY, JSON.stringify(config))
    } catch (error) {
      console.error('保存清理配置失败:', error)
    }
  }

  // 更新清理配置
  static updateCleanupConfig(updates: Partial<CleanupConfig>): void {
    const config = this.getCleanupConfig()
    const updatedConfig = { ...config, ...updates }
    this.saveCleanupConfig(updatedConfig)
  }
}

// 清理日志管理
export class CleanupLogManager {
  private static readonly CLEANUP_LOGS_KEY = 'dyjx_cleanup_logs'

  // 获取清理日志
  static getCleanupLogs(): CleanupLogEntry[] {
    try {
      const stored = localStorage.getItem(this.CLEANUP_LOGS_KEY)
      if (stored) {
        const logs = JSON.parse(stored)
        // 转换时间戳为Date对象
        return logs.map((log: any) => ({
          ...log,
          timestamp: new Date(log.timestamp)
        }))
      }
    } catch (error) {
      console.error('获取清理日志失败:', error)
    }
    return []
  }

  // 保存清理日志
  static saveCleanupLog(log: CleanupLogEntry): void {
    try {
      const logs = this.getCleanupLogs()
      logs.unshift(log) // 最新的日志在前面
      
      // 限制日志数量，避免localStorage过大
      const maxLogs = 100
      if (logs.length > maxLogs) {
        logs.splice(maxLogs)
      }
      
      localStorage.setItem(this.CLEANUP_LOGS_KEY, JSON.stringify(logs))
    } catch (error) {
      console.error('保存清理日志失败:', error)
    }
  }

  // 清空清理日志
  static clearCleanupLogs(): void {
    try {
      localStorage.removeItem(this.CLEANUP_LOGS_KEY)
    } catch (error) {
      console.error('清空清理日志失败:', error)
    }
  }
}

// 历史记录管理
export class HistoryManager {
  private static readonly HISTORY_KEY = 'dyjx_history_records'
  private static readonly lastViewedSyncMap = new Map<string, number>()

  private static normalizeDate(value: unknown, fallback: Date): Date {
    const parsed = value instanceof Date ? value : new Date(value as any)
    return Number.isNaN(parsed.getTime()) ? fallback : parsed
  }

  private static normalizeRecord(record: any): HistoryRecord {
    const createdAt = this.normalizeDate(record?.createdAt, new Date())
    const rawTask = record?.task && typeof record.task === 'object' ? record.task : {}
    const taskCreatedAt = this.normalizeDate(rawTask.createdAt, createdAt)

    return {
      ...record,
      id: isUuid(record?.id) ? record.id : createUuid(),
      createdAt,
      task: {
        ...rawTask,
        createdAt: taskCreatedAt,
        completedAt: rawTask.completedAt
          ? this.normalizeDate(rawTask.completedAt, taskCreatedAt)
          : undefined
      },
      lastViewedAt: record?.lastViewedAt
        ? this.normalizeDate(record.lastViewedAt, createdAt)
        : undefined
    } as HistoryRecord
  }

  // 获取历史记录
  static getHistory(): HistoryRecord[] {
    try {
      const stored = localStorage.getItem(this.HISTORY_KEY)
      if (stored) {
        const records = JSON.parse(stored)
        if (!Array.isArray(records)) {
          return []
        }
        let changed = false
        const normalized = records.map((record: any) => {
          if (!isUuid(record?.id)) {
            changed = true
          }
          return this.normalizeRecord(record)
        })

        if (changed) {
          this.saveHistory(normalized)
        }

        return normalized
      }
    } catch (error) {
      console.error('获取历史记录失败:', error)
    }
    return []
  }

  // 保存历史记录
  static saveHistory(records: HistoryRecord[]): void {
    try {
      localStorage.setItem(this.HISTORY_KEY, JSON.stringify(records))
    } catch (error) {
      console.error('保存历史记录失败:', error)
    }
  }

  // 添加历史记录
  static addRecord(record: HistoryRecord): void {
    const records = this.getHistory()
    records.unshift(record) // 最新的记录在前面
    // 限制历史记录数量，避免localStorage过大
    const maxRecords = 1000
    if (records.length > maxRecords) {
      records.splice(maxRecords)
    }
    this.saveHistory(records)
    scheduleHistoryUpsertToSupabase(record)
  }

  // 删除历史记录
  static deleteRecord(id: string): void {
    const records = this.getHistory().filter(r => r.id !== id)
    this.lastViewedSyncMap.delete(id)
    this.saveHistory(records)
    scheduleHistoryDeleteToSupabase(id)
  }

  // 清空历史记录
  static clearHistory(): void {
    const records = this.getHistory()
    try {
      localStorage.removeItem(this.HISTORY_KEY)
      this.lastViewedSyncMap.clear()
      records.forEach(record => {
        scheduleHistoryDeleteToSupabase(record.id)
      })
    } catch (error) {
      console.error('清空历史记录失败:', error)
    }
  }

  // 搜索历史记录
  static searchHistory(keyword: string): HistoryRecord[] {
    const records = this.getHistory()
    const lowerKeyword = keyword.trim().toLowerCase()

    if (!lowerKeyword) {
      return records
    }

    return records.filter(record => this.matchesKeyword(record, lowerKeyword))
  }

  static matchesKeyword(record: HistoryRecord, keyword: string): boolean {
    const lowerKeyword = keyword.trim().toLowerCase()
    if (!lowerKeyword) {
      return true
    }

    const task = record.task as any
    const targets = [
      task.videoTitle,
      task.videoUrl,
      task.name,
      task.parsedVideoInfo?.author,
      task.sourceUrl,
      task.uploadResult?.filePath,
    ]

    return targets.some(value => String(value ?? '').toLowerCase().includes(lowerKeyword))
  }

  // {{ AURA: Add - 切换收藏状态 }}
  static toggleFavorite(id: string): void {
    const records = this.getHistory()
    const index = records.findIndex(r => r.id === id)
    if (index !== -1) {
      records[index].isFavorite = !records[index].isFavorite
      this.saveHistory(records)
      scheduleHistoryUpsertToSupabase(records[index])
    }
  }

  // {{ AURA: Add - 更新历史记录 }}
  static updateRecord(id: string, updates: Partial<HistoryRecord>): void {
    const records = this.getHistory()
    const index = records.findIndex(r => r.id === id)
    if (index !== -1) {
      records[index] = { ...records[index], ...updates }
      this.saveHistory(records)
      scheduleHistoryUpsertToSupabase(records[index])
    }
  }

  // {{ AURA: Add - 批量删除历史记录 }}
  static deleteRecords(ids: string[]): void {
    const records = this.getHistory().filter(r => !ids.includes(r.id))
    this.saveHistory(records)

    ids.forEach(id => {
      this.lastViewedSyncMap.delete(id)
      scheduleHistoryDeleteToSupabase(id)
    })
  }

  // {{ AURA: Add - 获取历史记录统计数据 }}
  static getStatistics(sourceRecords?: HistoryRecord[]): HistoryStats {
    const records = sourceRecords ?? this.getHistory()
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    let totalSuccess = 0
    let totalFailed = 0
    let totalPending = 0
    let todayRecords = 0
    let thisWeekRecords = 0
    let thisMonthRecords = 0
    let favoriteCount = 0
    const tagUsage: Record<string, number> = {}

    records.forEach(record => {
      const task = record.task

      // 统计状态
      if (task.status === TaskStatus.SUCCESS) totalSuccess++
      else if (task.status === TaskStatus.FAILED) totalFailed++
      else totalPending++

      // 统计时间范围
      const recordDate = new Date(record.createdAt)
      if (recordDate >= today) todayRecords++
      if (recordDate >= weekAgo) thisWeekRecords++
      if (recordDate >= monthStart) thisMonthRecords++

      // 统计收藏
      if (record.isFavorite) favoriteCount++

      // 统计标签使用
      if (record.tags && record.tags.length > 0) {
        record.tags.forEach(tagId => {
          tagUsage[tagId] = (tagUsage[tagId] || 0) + 1
        })
      }
    })

    const successRate = records.length > 0
      ? Math.round((totalSuccess / records.length) * 100)
      : 0

    return {
      totalRecords: records.length,
      totalSuccess,
      totalFailed,
      totalPending,
      successRate,
      todayRecords,
      thisWeekRecords,
      thisMonthRecords,
      favoriteCount,
      tagUsage
    }
  }

  // {{ AURA: Add - 导出历史记录为CSV }}
  static exportToCSV(): string {
    const records = this.getHistory()
    const headers = ['ID', '类型', '标题', '链接', '状态', '创建时间', '完成时间', '错误信息', '文件路径']

    const rows = records.map(record => {
      const task = record.task as any
      return [
        record.id,
        record.type === 'single' ? '单链接' : '批量',
        task.videoTitle || task.name || '',
        task.videoUrl || '',
        task.status,
        record.createdAt.toLocaleString(),
        task.completedAt ? task.completedAt.toLocaleString() : '',
        task.error || '',
        task.uploadResult?.filePath || ''
      ].map(field => `"${String(field).replace(/"/g, '""')}"`)
    })

    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n')
  }

  // {{ AURA: Add - 导出历史记录为JSON }}
  static exportToJSON(): string {
    const records = this.getHistory()
    return JSON.stringify(records, null, 2)
  }

  // {{ AURA: Add - 按日期范围筛选 }}
  static filterByDateRange(startDate: Date, endDate: Date): HistoryRecord[] {
    const records = this.getHistory()
    return records.filter(record => {
      const recordDate = new Date(record.createdAt)
      return recordDate >= startDate && recordDate <= endDate
    })
  }

  // {{ AURA: Add - 按作者筛选 }}
  static filterByAuthor(author: string): HistoryRecord[] {
    const records = this.getHistory()
    return records.filter(record => {
      const task = record.task as any
      return task.parsedVideoInfo?.author?.toLowerCase().includes(author.toLowerCase())
    })
  }

  // {{ AURA: Add - 获取收藏的历史记录 }}
  static getFavorites(): HistoryRecord[] {
    const records = this.getHistory()
    return records.filter(record => record.isFavorite)
  }

  // {{ AURA: Add - 为记录添加标签 }}
  static addTagToRecord(recordId: string, tagId: string): void {
    const records = this.getHistory()
    const index = records.findIndex(r => r.id === recordId)
    if (index !== -1) {
      if (!records[index].tags) {
        records[index].tags = []
      }
      if (!records[index].tags!.includes(tagId)) {
        records[index].tags!.push(tagId)
        this.saveHistory(records)
        scheduleHistoryUpsertToSupabase(records[index])
      }
    }
  }

  // {{ AURA: Add - 从记录移除标签 }}
  static removeTagFromRecord(recordId: string, tagId: string): void {
    const records = this.getHistory()
    const index = records.findIndex(r => r.id === recordId)
    if (index !== -1 && records[index].tags) {
      records[index].tags = records[index].tags!.filter(t => t !== tagId)
      this.saveHistory(records)
      scheduleHistoryUpsertToSupabase(records[index])
    }
  }

  // {{ AURA: Add - 按标签筛选记录 }}
  static filterByTag(tagId: string): HistoryRecord[] {
    const records = this.getHistory()
    return records.filter(record => record.tags && record.tags.includes(tagId))
  }

  // {{ AURA: Add - 更新记录的最后查看时间 }}
  static updateLastViewedAt(recordId: string, minIntervalMs = 0): void {
    const now = Date.now()
    const previousSyncTs = this.lastViewedSyncMap.get(recordId)
    if (minIntervalMs > 0 && typeof previousSyncTs === 'number' && now - previousSyncTs < minIntervalMs) {
      return
    }

    const records = this.getHistory()
    const index = records.findIndex(r => r.id === recordId)
    if (index !== -1) {
      const previousViewedAt = records[index].lastViewedAt
        ? new Date(records[index].lastViewedAt as any).getTime()
        : 0
      if (minIntervalMs > 0 && previousViewedAt > 0 && now - previousViewedAt < minIntervalMs) {
        this.lastViewedSyncMap.set(recordId, previousViewedAt)
        return
      }

      records[index].lastViewedAt = new Date(now)
      this.lastViewedSyncMap.set(recordId, now)
      this.saveHistory(records)
      scheduleHistoryUpsertToSupabase(records[index])
    }
  }
}

// {{ AURA: Add - 标签管理器 }}
export class TagManager {
  private static readonly TAGS_KEY = 'dyjx_tags'

  // 获取所有标签
  static getTags(): Tag[] {
    try {
      const stored = localStorage.getItem(this.TAGS_KEY)
      if (stored) {
        const raw = JSON.parse(stored)
        const idMap = new Map<string, string>()
        let changed = false
        const tags = raw.map((tag: any) => {
          const originalId = tag?.id
          const normalizedId = isUuid(originalId)
            ? originalId
            : (idMap.get(String(originalId)) ?? (() => {
                const next = createUuid()
                idMap.set(String(originalId), next)
                return next
              })())

          if (normalizedId !== originalId) {
            changed = true
          }

          return {
            ...tag,
            id: normalizedId,
            createdAt: new Date(tag.createdAt)
          }
        })

        if (changed) {
          this.saveTags(tags)

          const records = HistoryManager.getHistory()
          let historyChanged = false
          const updatedRecords = records.map(record => {
            if (!record.tags || record.tags.length === 0) return record
            const nextTags = record.tags.map(tagId => idMap.get(tagId) ?? tagId)
            const different = nextTags.some((value, index) => value !== record.tags![index])
            if (!different) return record
            historyChanged = true
            return { ...record, tags: nextTags }
          })
          if (historyChanged) {
            HistoryManager.saveHistory(updatedRecords)
          }
        }

        return tags
      }
    } catch (error) {
      console.error('获取标签失败:', error)
    }
    const defaults = this.getDefaultTags()
    this.saveTags(defaults)
    return defaults
  }

  // 获取默认标签
  static getDefaultTags(): Tag[] {
    return [
      {
        id: createUuid(),
        name: '工作',
        color: 'blue',
        createdAt: new Date()
      },
      {
        id: createUuid(),
        name: '个人',
        color: 'green',
        createdAt: new Date()
      },
      {
        id: createUuid(),
        name: '重要',
        color: 'red',
        createdAt: new Date()
      },
      {
        id: createUuid(),
        name: '归档',
        color: 'gray',
        createdAt: new Date()
      }
    ]
  }

  // 保存标签
  static saveTags(tags: Tag[]): void {
    try {
      localStorage.setItem(this.TAGS_KEY, JSON.stringify(tags))
    } catch (error) {
      console.error('保存标签失败:', error)
    }
  }

  // 添加标签
  static addTag(tag: Omit<Tag, 'id' | 'createdAt'>): Tag {
    const tags = this.getTags()
    const newTag: Tag = {
      id: createUuid(),
      ...tag,
      createdAt: new Date()
    }
    tags.push(newTag)
    this.saveTags(tags)
    scheduleTagsSyncToSupabase('upsert', newTag)
    return newTag
  }

  // 更新标签
  static updateTag(id: string, updates: Partial<Omit<Tag, 'id' | 'createdAt'>>): void {
    const tags = this.getTags()
    const index = tags.findIndex(t => t.id === id)
    if (index !== -1) {
      tags[index] = { ...tags[index], ...updates }
      this.saveTags(tags)
      scheduleTagsSyncToSupabase('upsert', tags[index])
    }
  }

  // 删除标签
  static deleteTag(id: string): void {
    const tags = this.getTags().filter(t => t.id !== id)
    this.saveTags(tags)

    // 同时从所有历史记录中移除该标签
    const records = HistoryManager.getHistory()
    records.forEach(record => {
      if (record.tags && record.tags.includes(id)) {
        record.tags = record.tags.filter(t => t !== id)
      }
    })
    HistoryManager.saveHistory(records)

    scheduleTagsSyncToSupabase('delete', { id })
  }

  // 获取单个标签
  static getTag(id: string): Tag | null {
    const tags = this.getTags()
    return tags.find(t => t.id === id) || null
  }

  // 批量获取标签
  static getTagsByIds(ids: string[]): Tag[] {
    const tags = this.getTags()
    return tags.filter(t => ids.includes(t.id))
  }
}

// 数据导出导入工具
export class DataManager {
  // 导出所有数据
  static exportData(): string {
    const data = {
      config: ConfigManager.getAppConfig(),
      parsers: ConfigManager.getParsers(),
      webdavServers: ConfigManager.getWebDAVServers(),
      history: HistoryManager.getHistory(),
      exportTime: new Date().toISOString(),
      version: '1.0.0'
    }
    
    return JSON.stringify(data, null, 2)
  }

  // 导入数据
  static importData(jsonData: string): { success: boolean; message: string } {
    try {
      const data = JSON.parse(jsonData)
      
      // 验证数据格式
      if (!data.version || !data.exportTime) {
        return { success: false, message: '无效的数据格式' }
      }

      // 导入配置
      if (data.config) {
        ConfigManager.saveAppConfig(data.config)
      }

      // 导入解析器配置
      if (data.parsers && Array.isArray(data.parsers)) {
        ConfigManager.saveParsers(data.parsers)
      }

      // 导入WebDAV配置
      if (data.webdavServers && Array.isArray(data.webdavServers)) {
        ConfigManager.saveWebDAVServers(data.webdavServers)
      }

      // 导入历史记录
      if (data.history && Array.isArray(data.history)) {
        HistoryManager.saveHistory(data.history)
      }

      return { success: true, message: '数据导入成功' }
    } catch (error) {
      console.error('导入数据失败:', error)
      return { success: false, message: '数据导入失败：' + (error as Error).message }
    }
  }

  // 下载数据文件
  static downloadData(): void {
    const data = this.exportData()
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dyjx-backup-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }
}
