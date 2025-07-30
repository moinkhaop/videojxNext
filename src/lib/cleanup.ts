import { ConversionTask, BatchTask, CleanupConfig, CleanupLogEntry } from '@/types';
import { CleanupConfigManager, CleanupLogManager } from './storage';

// 清理服务类
export class CleanupService {
// 获取清理配置
  static getCleanupConfig() {
    return CleanupConfigManager.getCleanupConfig();
  }

  // 保存清理配置
  static saveCleanupConfig(config: Partial<CleanupConfig>) {
    CleanupConfigManager.updateCleanupConfig(config);
  }

  // 获取清理日志
  static getCleanupLogs() {
    return CleanupLogManager.getCleanupLogs();
  }

  // 清空清理日志
  static clearCleanupLogs() {
    CleanupLogManager.clearCleanupLogs();
  }

  // 清理临时文件和缓存数据
  static async cleanupTemporaryFiles(): Promise<{ filesDeleted: number; spaceFreed: number }> {
    // 注意：在浏览器环境中，我们无法直接访问文件系统进行清理
    // 这里主要是清理localStorage中的缓存数据和历史记录
    
    const config = CleanupConfigManager.getCleanupConfig();
    const now = new Date();
    
    // 计算保留日期
    const cutoffDate = new Date(now);
    cutoffDate.setDate(cutoffDate.getDate() - config.retainDays);
    
    // 清理过期的历史记录
    let filesDeleted = 0;
    let spaceFreed = 0;
    
    try {
      // 获取历史记录
      const historyKey = 'dyjx_history_records';
      const storedHistory = localStorage.getItem(historyKey);
      
      if (storedHistory) {
        const history = JSON.parse(storedHistory);
        const originalLength = history.length;
        
        // 过滤掉过期的记录
        const filteredHistory = history.filter((record: any) => {
          const recordDate = new Date(record.createdAt);
          
          // 如果记录日期在保留日期之前，则应该删除
          if (recordDate < cutoffDate) {
            // 检查是否应该保留该记录
            if (record.task) {
              const task = record.task;
              
              // 根据配置决定是否保留成功或失败的任务
              if (task.status === 'success' && config.retainSuccessfulTasks) {
                return true; // 保留成功任务
              }
              if (task.status === 'failed' && config.retainFailedTasks) {
                return true; // 保留失败任务
              }
              
              // 检查文件扩展名
              if (record.task.videoUrl) {
                const url = record.task.videoUrl;
                const extension = this.getFileExtension(url);
                if (config.retainExtensions.includes(extension)) {
                  return true; // 保留指定扩展名的文件
                }
              }
            }
            
            // 如果没有满足保留条件，则删除
            return false;
          }
          
          // 保留日期在保留范围内的记录
          return true;
        });
        
        // 计算删除的记录数
        filesDeleted = originalLength - filteredHistory.length;
        
        // 估算释放的空间（简化计算）
        spaceFreed = filesDeleted * 1024; // 假设每个记录约1KB
        
        // 保存过滤后的历史记录
        localStorage.setItem(historyKey, JSON.stringify(filteredHistory));
      }
      
      // 清理其他可能的缓存数据
      const cacheKeys = [
        'dyjx_parser_cache', // 解析器缓存
        'dyjx_download_cache', // 下载缓存
        'dyjx_temp_data' // 临时数据
      ];
      
      for (const key of cacheKeys) {
        const stored = localStorage.getItem(key);
        if (stored) {
          const cacheData = JSON.parse(stored);
          const originalLength = Array.isArray(cacheData) ? cacheData.length : 1;
          
          // 清理过期的缓存数据
          if (Array.isArray(cacheData)) {
            const filteredCache = cacheData.filter((item: any) => {
              if (item.timestamp) {
                const itemDate = new Date(item.timestamp);
                return itemDate >= cutoffDate;
              }
              return true; // 没有时间戳的数据保留
            });
            
            const deletedCount = originalLength - filteredCache.length;
            filesDeleted += deletedCount;
            spaceFreed += deletedCount * 512; // 假设每个缓存项约512字节
            
            localStorage.setItem(key, JSON.stringify(filteredCache));
          } else {
            // 对于非数组数据，检查是否有时间戳
            if (cacheData.timestamp) {
              const itemDate = new Date(cacheData.timestamp);
              if (itemDate < cutoffDate) {
                localStorage.removeItem(key);
                filesDeleted += 1;
                spaceFreed += 1024; // 假设每个缓存项约1KB
              }
            }
          }
        }
      }
      
      // 记录清理日志
      const logEntry: CleanupLogEntry = {
        id: `cleanup_${Date.now()}`,
        timestamp: new Date(),
        filesDeleted,
        spaceFreed,
        details: `清理了${filesDeleted}个临时文件/缓存，释放了约${this.formatFileSize(spaceFreed)}空间`
      };
      
      CleanupLogManager.saveCleanupLog(logEntry);
      
    } catch (error) {
      console.error('清理临时文件时出错:', error);
      
      // 记录错误日志
      const errorLogEntry: CleanupLogEntry = {
        id: `cleanup_error_${Date.now()}`,
        timestamp: new Date(),
        filesDeleted: 0,
        spaceFreed: 0,
        details: `清理过程中发生错误: ${error instanceof Error ? error.message : '未知错误'}`
      };
      
      CleanupLogManager.saveCleanupLog(errorLogEntry);
    }
    
    return { filesDeleted, spaceFreed };
  }

  // 根据任务完成情况执行清理
  static async cleanupAfterTaskCompletion(task: ConversionTask | BatchTask): Promise<void> {
    const config = CleanupConfigManager.getCleanupConfig();
    
    // 检查是否启用了自动清理
    if (!config.enabled) {
      return;
    }
    
    // 根据任务状态决定是否需要清理
    const shouldCleanup = 
      (task.status === 'failed' && !config.retainFailedTasks) ||
      (task.status === 'success' && !config.retainSuccessfulTasks);
    
    // 如果任务不需要保留，则清理相关缓存
    if (shouldCleanup) {
      // 注意：在浏览器环境中，我们无法直接删除文件系统中的文件
      // 这里主要是清理与任务相关的缓存数据
      
      try {
        // 清理与任务相关的缓存
        const taskCacheKeys = [
          `dyjx_task_cache_${task.id}`,
          `dyjx_download_cache_${task.id}`
        ];
        
        for (const key of taskCacheKeys) {
          localStorage.removeItem(key);
        }
        
        // 记录清理日志
        const logEntry: CleanupLogEntry = {
          id: `task_cleanup_${task.id}_${Date.now()}`,
          timestamp: new Date(),
          filesDeleted: taskCacheKeys.length,
          spaceFreed: taskCacheKeys.length * 512, // 估算
          details: `任务${task.id}完成后清理了${taskCacheKeys.length}个缓存项`
        };
        
        CleanupLogManager.saveCleanupLog(logEntry);
      } catch (error) {
        console.error('任务完成后清理时出错:', error);
      }
    }
  }

  // 手动执行清理
  static async manualCleanup(): Promise<{ filesDeleted: number; spaceFreed: number; message: string }> {
    try {
      const result = await this.cleanupTemporaryFiles();
      return {
        ...result,
        message: `手动清理完成：删除了${result.filesDeleted}个文件，释放了${this.formatFileSize(result.spaceFreed)}空间`
      };
    } catch (error) {
      return {
        filesDeleted: 0,
        spaceFreed: 0,
        message: `清理过程中发生错误: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  // 获取文件扩展名
  private static getFileExtension(filename: string): string {
    const lastDotIndex = filename.lastIndexOf('.');
    if (lastDotIndex === -1) return '';
    return filename.substring(lastDotIndex).toLowerCase();
  }

  // 格式化文件大小
  private static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}