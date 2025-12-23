import { 
  getUserConfig, 
  updateUserConfig,
  getHistoryRecords,
  addHistoryRecord,
  updateHistoryRecord,
  deleteHistoryRecord,
  getTags,
  addTag,
  updateTag,
  deleteTag,
  getCleanupConfig,
  updateCleanupConfig
} from '@/lib/supabase/database'
import { 
  ConfigManager, 
  HistoryManager, 
  TagManager, 
  CleanupConfigManager 
} from '@/lib/storage'
import { 
  AppConfig, 
  VideoParserConfig, 
  WebDAVConfig, 
  HistoryRecord, 
  Tag, 
  CleanupConfig 
} from '@/types'

// Supabase 存储管理器 - 实现数据隔离
export class SupabaseStorageManager {
  private static instance: SupabaseStorageManager
  private initialized = false

  static getInstance(): SupabaseStorageManager {
    if (!SupabaseStorageManager.instance) {
      SupabaseStorageManager.instance = new SupabaseStorageManager()
    }
    return SupabaseStorageManager.instance
  }

  private constructor() {}

  // 初始化方法
  async initialize() {
    if (this.initialized) return
    
    try {
      // 检查用户是否已登录
      const userConfig = await getUserConfig()
      this.initialized = true
      console.log('[SupabaseStorage] 初始化成功')
    } catch (error) {
      console.warn('[SupabaseStorage] 用户未登录，将使用本地存储')
      this.initialized = false
    }
  }

  // 检查是否已初始化（用户已登录）
  isInitialized(): boolean {
    return this.initialized
  }

  // 配置管理
  async getAppConfig(): Promise<AppConfig> {
    try {
      const configData = await getUserConfig()
      return configData as AppConfig
    } catch (error) {
      console.warn('[SupabaseStorage] 获取应用配置失败，回退到本地存储')
      return ConfigManager.getAppConfig()
    }
  }

  async saveAppConfig(config: AppConfig): Promise<void> {
    try {
      await updateUserConfig(config)
    } catch (error) {
      console.warn('[SupabaseStorage] 保存应用配置失败，回退到本地存储')
      ConfigManager.saveAppConfig(config)
    }
  }

  async getParsers(): Promise<VideoParserConfig[]> {
    try {
      const config = await this.getAppConfig()
      return config.parsers || []
    } catch (error) {
      console.warn('[SupabaseStorage] 获取解析器配置失败，回退到本地存储')
      return ConfigManager.getParsers()
    }
  }

  async saveParsers(parsers: VideoParserConfig[]): Promise<void> {
    try {
      const config = await this.getAppConfig()
      config.parsers = parsers
      await this.saveAppConfig(config)
    } catch (error) {
      console.warn('[SupabaseStorage] 保存解析器配置失败，回退到本地存储')
      ConfigManager.saveParsers(parsers)
    }
  }

  async getWebDAVServers(): Promise<WebDAVConfig[]> {
    try {
      const config = await this.getAppConfig()
      return config.webdavServers || []
    } catch (error) {
      console.warn('[SupabaseStorage] 获取WebDAV配置失败，回退到本地存储')
      return ConfigManager.getWebDAVServers()
    }
  }

  async saveWebDAVServers(servers: WebDAVConfig[]): Promise<void> {
    try {
      const config = await this.getAppConfig()
      config.webdavServers = servers
      await this.saveAppConfig(config)
    } catch (error) {
      console.warn('[SupabaseStorage] 保存WebDAV配置失败，回退到本地存储')
      ConfigManager.saveWebDAVServers(servers)
    }
  }

  // 历史记录管理
  async getHistory(): Promise<HistoryRecord[]> {
    try {
      const records = await getHistoryRecords()
      return records.map(record => ({
        ...record,
        createdAt: new Date(record.createdAt),
        task: {
          ...record.task,
          createdAt: new Date(record.task.createdAt),
          completedAt: record.task.completedAt ? new Date(record.task.completedAt) : undefined
        }
      }))
    } catch (error) {
      console.warn('[SupabaseStorage] 获取历史记录失败，回退到本地存储')
      return HistoryManager.getHistory()
    }
  }

  async addRecord(record: HistoryRecord): Promise<void> {
    try {
      await addHistoryRecord(record)
    } catch (error) {
      console.warn('[SupabaseStorage] 添加历史记录失败，回退到本地存储')
      HistoryManager.addRecord(record)
    }
  }

  async updateRecord(id: string, updates: Partial<HistoryRecord>): Promise<void> {
    try {
      await updateHistoryRecord(id, updates)
    } catch (error) {
      console.warn('[SupabaseStorage] 更新历史记录失败，回退到本地存储')
      HistoryManager.updateRecord(id, updates)
    }
  }

  async deleteRecord(id: string): Promise<void> {
    try {
      await deleteHistoryRecord(id)
    } catch (error) {
      console.warn('[SupabaseStorage] 删除历史记录失败，回退到本地存储')
      HistoryManager.deleteRecord(id)
    }
  }

  // 标签管理
  async getTags(): Promise<Tag[]> {
    try {
      const tags = await getTags()
      return tags.map(tag => ({
        ...tag,
        createdAt: new Date(tag.createdAt)
      }))
    } catch (error) {
      console.warn('[SupabaseStorage] 获取标签失败，回退到本地存储')
      return TagManager.getTags()
    }
  }

  async addTag(tag: Omit<Tag, 'id' | 'createdAt'>): Promise<Tag> {
    try {
      const newTag = {
        ...tag,
        createdAt: new Date().toISOString()
      }
      const result = await addTag(newTag)
      return {
        ...result.tag_data,
        createdAt: new Date(result.tag_data.createdAt)
      }
    } catch (error) {
      console.warn('[SupabaseStorage] 添加标签失败，回退到本地存储')
      return TagManager.addTag(tag)
    }
  }

  async updateTag(id: string, updates: Partial<Omit<Tag, 'id' | 'createdAt'>>): Promise<void> {
    try {
      await updateTag(id, updates)
    } catch (error) {
      console.warn('[SupabaseStorage] 更新标签失败，回退到本地存储')
      TagManager.updateTag(id, updates)
    }
  }

  async deleteTag(id: string): Promise<void> {
    try {
      await deleteTag(id)
    } catch (error) {
      console.warn('[SupabaseStorage] 删除标签失败，回退到本地存储')
      TagManager.deleteTag(id)
    }
  }

  // 清理配置管理
  async getCleanupConfig(): Promise<CleanupConfig> {
    try {
      const config = await getCleanupConfig()
      return config as CleanupConfig
    } catch (error) {
      console.warn('[SupabaseStorage] 获取清理配置失败，回退到本地存储')
      return CleanupConfigManager.getCleanupConfig()
    }
  }

  async saveCleanupConfig(config: CleanupConfig): Promise<void> {
    try {
      await updateCleanupConfig(config)
    } catch (error) {
      console.warn('[SupabaseStorage] 保存清理配置失败，回退到本地存储')
      CleanupConfigManager.saveCleanupConfig(config)
    }
  }
}

// 导出单例实例
export const supabaseStorage = SupabaseStorageManager.getInstance()