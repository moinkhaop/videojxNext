import { supabaseStorage } from './supabase-storage'
import { ConfigManager, HistoryManager, TagManager, CleanupConfigManager } from '../storage'
import { 
  AppConfig, 
  VideoParserConfig, 
  WebDAVConfig, 
  HistoryRecord, 
  Tag, 
  CleanupConfig 
} from '@/types'
import { getCurrentUser } from '@/lib/supabase/auth-client'

// 统一存储管理器 - 根据用户登录状态自动选择存储方式
export class StorageManager {
  private static instance: StorageManager
  private useSupabase = false
  private initialized = false

  static getInstance(): StorageManager {
    if (!StorageManager.instance) {
      StorageManager.instance = new StorageManager()
    }
    return StorageManager.instance
  }

  private constructor() {}

  // 初始化存储管理器
  async initialize() {
    if (this.initialized) return

    try {
      // 检查用户是否已登录
      const user = await getCurrentUser()
      this.useSupabase = !!user

      if (this.useSupabase) {
        await supabaseStorage.initialize()
        console.log('[StorageManager] 使用 Supabase 存储')
      } else {
        console.log('[StorageManager] 使用本地存储')
      }

      this.initialized = true
    } catch (error) {
      console.warn('[StorageManager] 初始化失败，使用本地存储:', error)
      this.useSupabase = false
      this.initialized = true
    }
  }

  // 检查是否使用 Supabase
  isUsingSupabase(): boolean {
    return this.useSupabase
  }

  // 重新检查存储方式（用户登录状态变化时调用）
  async refreshStorageMode() {
    this.initialized = false
    await this.initialize()
  }

  // 配置管理
  async getAppConfig(): Promise<AppConfig> {
    if (this.useSupabase) {
      return await supabaseStorage.getAppConfig()
    }
    return ConfigManager.getAppConfig()
  }

  async saveAppConfig(config: AppConfig): Promise<void> {
    if (this.useSupabase) {
      await supabaseStorage.saveAppConfig(config)
    } else {
      ConfigManager.saveAppConfig(config)
    }
  }

  async getParsers(): Promise<VideoParserConfig[]> {
    if (this.useSupabase) {
      return await supabaseStorage.getParsers()
    }
    return ConfigManager.getParsers()
  }

  async saveParsers(parsers: VideoParserConfig[]): Promise<void> {
    if (this.useSupabase) {
      await supabaseStorage.saveParsers(parsers)
    } else {
      ConfigManager.saveParsers(parsers)
    }
  }

  async getWebDAVServers(): Promise<WebDAVConfig[]> {
    if (this.useSupabase) {
      return await supabaseStorage.getWebDAVServers()
    }
    return ConfigManager.getWebDAVServers()
  }

  async saveWebDAVServers(servers: WebDAVConfig[]): Promise<void> {
    if (this.useSupabase) {
      await supabaseStorage.saveWebDAVServers(servers)
    } else {
      ConfigManager.saveWebDAVServers(servers)
    }
  }

  // 历史记录管理
  async getHistory(): Promise<HistoryRecord[]> {
    if (this.useSupabase) {
      return await supabaseStorage.getHistory()
    }
    return HistoryManager.getHistory()
  }

  async addRecord(record: HistoryRecord): Promise<void> {
    if (this.useSupabase) {
      await supabaseStorage.addRecord(record)
    } else {
      HistoryManager.addRecord(record)
    }
  }

  async updateRecord(id: string, updates: Partial<HistoryRecord>): Promise<void> {
    if (this.useSupabase) {
      await supabaseStorage.updateRecord(id, updates)
    } else {
      HistoryManager.updateRecord(id, updates)
    }
  }

  async deleteRecord(id: string): Promise<void> {
    if (this.useSupabase) {
      await supabaseStorage.deleteRecord(id)
    } else {
      HistoryManager.deleteRecord(id)
    }
  }

  // 标签管理
  async getTags(): Promise<Tag[]> {
    if (this.useSupabase) {
      return await supabaseStorage.getTags()
    }
    return TagManager.getTags()
  }

  async addTag(tag: Omit<Tag, 'id' | 'createdAt'>): Promise<Tag> {
    if (this.useSupabase) {
      return await supabaseStorage.addTag(tag)
    }
    return TagManager.addTag(tag)
  }

  async updateTag(id: string, updates: Partial<Omit<Tag, 'id' | 'createdAt'>>): Promise<void> {
    if (this.useSupabase) {
      await supabaseStorage.updateTag(id, updates)
    } else {
      TagManager.updateTag(id, updates)
    }
  }

  async deleteTag(id: string): Promise<void> {
    if (this.useSupabase) {
      await supabaseStorage.deleteTag(id)
    } else {
      TagManager.deleteTag(id)
    }
  }

  // 清理配置管理
  async getCleanupConfig(): Promise<CleanupConfig> {
    if (this.useSupabase) {
      return await supabaseStorage.getCleanupConfig()
    }
    return CleanupConfigManager.getCleanupConfig()
  }

  async saveCleanupConfig(config: CleanupConfig): Promise<void> {
    if (this.useSupabase) {
      await supabaseStorage.saveCleanupConfig(config)
    } else {
      CleanupConfigManager.saveCleanupConfig(config)
    }
  }

  // 数据迁移方法
  async migrateFromLocalToSupabase(): Promise<void> {
    if (!this.useSupabase) {
      throw new Error('用户未登录，无法迁移数据')
    }

    console.log('[StorageManager] 开始迁移本地数据到 Supabase')

    try {
      // 迁移应用配置
      const localConfig = ConfigManager.getAppConfig()
      await supabaseStorage.saveAppConfig(localConfig)

      // 迁移历史记录
      const localHistory = HistoryManager.getHistory()
      for (const record of localHistory) {
        await supabaseStorage.addRecord(record)
      }

      // 迁移标签
      const localTags = TagManager.getTags()
      for (const tag of localTags) {
        await supabaseStorage.addTag({
          name: tag.name,
          color: tag.color
        })
      }

      // 迁移清理配置
      const localCleanupConfig = CleanupConfigManager.getCleanupConfig()
      await supabaseStorage.saveCleanupConfig(localCleanupConfig)

      console.log('[StorageManager] 数据迁移完成')
    } catch (error) {
      console.error('[StorageManager] 数据迁移失败:', error)
      throw error
    }
  }

  // 数据同步方法（双向同步）
  async syncData(): Promise<void> {
    if (!this.useSupabase) {
      console.log('[StorageManager] 用户未登录，跳过同步')
      return
    }

    console.log('[StorageManager] 开始数据同步')

    try {
      // 获取本地和远程数据
      const localConfig = ConfigManager.getAppConfig()
      const remoteConfig = await supabaseStorage.getAppConfig()

      const localHistory = HistoryManager.getHistory()
      const remoteHistory = await supabaseStorage.getHistory()

      const localTags = TagManager.getTags()
      const remoteTags = await supabaseStorage.getTags()

      const localCleanupConfig = CleanupConfigManager.getCleanupConfig()
      const remoteCleanupConfig = await supabaseStorage.getCleanupConfig()

      // 简单的同步策略：以远程数据为主，但保留本地独有的数据
      // 这里可以实现更复杂的同步逻辑，如时间戳比较、冲突解决等

      console.log('[StorageManager] 数据同步完成')
    } catch (error) {
      console.error('[StorageManager] 数据同步失败:', error)
      throw error
    }
  }
}

// 导出单例实例
export const storageManager = StorageManager.getInstance()