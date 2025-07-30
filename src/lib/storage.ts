import { AppConfig, VideoParserConfig, WebDAVConfig, HistoryRecord, CleanupConfig, CleanupLogEntry } from '@/types'


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
  }

  // 获取解析器配置
  static getParsers(): VideoParserConfig[] {
    try {
      const stored = localStorage.getItem(this.PARSERS_KEY)
      if (stored) {
        const parsers = JSON.parse(stored)
        // 解密敏感信息
        return parsers.map((parser: VideoParserConfig) => ({
          ...parser,
          apiKey: parser.apiKey ? StorageEncryption.decrypt(parser.apiKey) : undefined
        }))
      }
    } catch (error) {
      console.error('获取解析器配置失败:', error)
    }
    return []
  }

  // 保存解析器配置
  static saveParsers(parsers: VideoParserConfig[]): void {
    try {
      // 加密敏感信息
      const encryptedParsers = parsers.map(parser => ({
        ...parser,
        apiKey: parser.apiKey ? StorageEncryption.encrypt(parser.apiKey) : undefined
      }))
      localStorage.setItem(this.PARSERS_KEY, JSON.stringify(encryptedParsers))
    } catch (error) {
      console.error('保存解析器配置失败:', error)
    }
  }

  // 获取WebDAV配置
  static getWebDAVServers(): WebDAVConfig[] {
    try {
      const stored = localStorage.getItem(this.WEBDAV_KEY)
      if (stored) {
        const servers = JSON.parse(stored)
        // 解密敏感信息
        return servers.map((server: WebDAVConfig) => ({
          ...server,
          password: StorageEncryption.decrypt(server.password)
        }))
      }
    } catch (error) {
      console.error('获取WebDAV配置失败:', error)
    }
    return []
  }

  // 保存WebDAV配置
  static saveWebDAVServers(servers: WebDAVConfig[]): void {
    try {
      // 加密敏感信息
      const encryptedServers = servers.map(server => ({
        ...server,
        password: StorageEncryption.encrypt(server.password)
      }))
      localStorage.setItem(this.WEBDAV_KEY, JSON.stringify(encryptedServers))
    } catch (error) {
      console.error('保存WebDAV配置失败:', error)
    }
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

  // 删除解析器
  static deleteParser(id: string): void {
    const parsers = this.getParsers().filter(p => p.id !== id)
    this.saveParsers(parsers)
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

  // 删除WebDAV服务器
  static deleteWebDAVServer(id: string): void {
    const servers = this.getWebDAVServers().filter(s => s.id !== id)
    this.saveWebDAVServers(servers)
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

  // 获取历史记录
  static getHistory(): HistoryRecord[] {
    try {
      const stored = localStorage.getItem(this.HISTORY_KEY)
      if (stored) {
        const records = JSON.parse(stored)
        // 转换日期字符串为Date对象
        return records.map((record: any) => ({
          ...record,
          createdAt: new Date(record.createdAt),
          task: {
            ...record.task,
            createdAt: new Date(record.task.createdAt),
            completedAt: record.task.completedAt ? new Date(record.task.completedAt) : undefined
          }
        }))
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
  }

  // 删除历史记录
  static deleteRecord(id: string): void {
    const records = this.getHistory().filter(r => r.id !== id)
    this.saveHistory(records)
  }

  // 清空历史记录
  static clearHistory(): void {
    try {
      localStorage.removeItem(this.HISTORY_KEY)
    } catch (error) {
      console.error('清空历史记录失败:', error)
    }
  }

  // 搜索历史记录
  static searchHistory(keyword: string): HistoryRecord[] {
    const records = this.getHistory()
    const lowerKeyword = keyword.toLowerCase()
    
    return records.filter(record => {
      const task = record.task as any
      return (
        task.videoTitle?.toLowerCase().includes(lowerKeyword) ||
        task.videoUrl?.toLowerCase().includes(lowerKeyword) ||
        task.name?.toLowerCase().includes(lowerKeyword)
      )
    })
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
