import { 
  ConversionTask, 
  BatchTask, 
  TaskStatus, 
  VideoParserConfig, 
  EnhancedVideoParserConfig,
  WebDAVConfig, 
  ParsedVideoInfo, 
  MediaType, 
  VideoParseResponse,
  PreviewParseResponse, 
  BatchInputMode, 
  ExtendedBatchTask, 
  DouyinUserParseRequest,
  ParserCapability,
  SupportedPlatform
} from '@/types'
import { CleanupService } from './cleanup'
import { FilenameSanitizer } from './filename-sanitizer'
import { parserRouter } from './parser-router'
import { apiCapabilityDetector } from './capability-detector'

export type BatchPoolStage = 'normal_batch' | 'douyin_upload'

export type BatchPoolEvent =
  | 'init'
  | 'task_started'
  | 'task_settled'
  | 'scale_up'
  | 'scale_down'

export interface BatchPoolState {
  stage: BatchPoolStage
  event: BatchPoolEvent
  currentConcurrency: number
  maxConcurrency: number
  inFlight: number
  processed: number
  total: number
}

type BatchRuntimeCallbacks = {
  onPoolState?: (state: BatchPoolState) => void
}

export class ConversionService {
  private static readonly DEFAULT_BATCH_CONCURRENCY = 3
  private static readonly DEFAULT_BATCH_TASK_DELAY_MS = 0
  private static readonly DEFAULT_PARSE_CACHE_TTL_MS = 5 * 60 * 1000
  private static readonly DEFAULT_PARSE_CACHE_MAX_ENTRIES = 300

  private static readonly BATCH_CONCURRENCY = (() => {
    const fromEnv = Number(process.env.NEXT_PUBLIC_BATCH_CONCURRENCY ?? String(this.DEFAULT_BATCH_CONCURRENCY))
    if (!Number.isFinite(fromEnv)) return this.DEFAULT_BATCH_CONCURRENCY
    return Math.max(1, Math.min(6, Math.floor(fromEnv)))
  })()

  private static readonly PARSE_CACHE_TTL_MS = (() => {
    const fromEnv = Number(process.env.NEXT_PUBLIC_PARSE_CACHE_TTL_MS ?? String(this.DEFAULT_PARSE_CACHE_TTL_MS))
    if (!Number.isFinite(fromEnv)) return this.DEFAULT_PARSE_CACHE_TTL_MS
    return Math.max(30_000, Math.floor(fromEnv))
  })()

  private static readonly PARSE_CACHE_MAX_ENTRIES = (() => {
    const fromEnv = Number(process.env.NEXT_PUBLIC_PARSE_CACHE_MAX_ENTRIES ?? String(this.DEFAULT_PARSE_CACHE_MAX_ENTRIES))
    if (!Number.isFinite(fromEnv)) return this.DEFAULT_PARSE_CACHE_MAX_ENTRIES
    return Math.max(50, Math.min(3000, Math.floor(fromEnv)))
  })()

  private static readonly parseCache = new Map<string, { expiresAt: number; data: ParsedVideoInfo }>()
  private static readonly parseInFlight = new Map<string, Promise<ParsedVideoInfo>>()

  private static readonly INTER_TASK_DELAY_MS = (() => {
    const fromEnv = Number(process.env.NEXT_PUBLIC_BATCH_TASK_DELAY_MS ?? String(this.DEFAULT_BATCH_TASK_DELAY_MS))
    if (!Number.isFinite(fromEnv)) return this.DEFAULT_BATCH_TASK_DELAY_MS
    return Math.max(0, Math.floor(fromEnv))
  })()

  private static async maybeDelayBetweenTasks() {
    if (this.INTER_TASK_DELAY_MS <= 0) {
      return
    }
    await new Promise(resolve => setTimeout(resolve, this.INTER_TASK_DELAY_MS))
  }

  private static cloneParsedInfo(data: ParsedVideoInfo): ParsedVideoInfo {
    return JSON.parse(JSON.stringify(data)) as ParsedVideoInfo
  }

  private static buildParseCacheKey(videoUrl: string, parserConfig: VideoParserConfig): string {
    const parserId = parserConfig.id ?? parserConfig.name ?? parserConfig.apiUrl
    return `${parserId}::${videoUrl}`
  }

  private static getParseCache(key: string): ParsedVideoInfo | null {
    const entry = this.parseCache.get(key)
    if (!entry) {
      return null
    }
    if (entry.expiresAt <= Date.now()) {
      this.parseCache.delete(key)
      return null
    }
    return this.cloneParsedInfo(entry.data)
  }

  private static setParseCache(key: string, data: ParsedVideoInfo) {
    if (this.parseCache.size >= this.PARSE_CACHE_MAX_ENTRIES) {
      const now = Date.now()
      const expiredKeys: string[] = []
      this.parseCache.forEach((entry, entryKey) => {
        if (entry.expiresAt <= now) {
          expiredKeys.push(entryKey)
        }
      })
      expiredKeys.forEach(entryKey => {
        this.parseCache.delete(entryKey)
      })
      if (this.parseCache.size >= this.PARSE_CACHE_MAX_ENTRIES) {
        const oldestKey = this.parseCache.keys().next().value
        if (oldestKey) {
          this.parseCache.delete(oldestKey)
        }
      }
    }

    this.parseCache.set(key, {
      data: this.cloneParsedInfo(data),
      expiresAt: Date.now() + this.PARSE_CACHE_TTL_MS,
    })
  }

  private static prewarmBatchParse(tasks: ConversionTask[], parserConfig: VideoParserConfig) {
    const seen = new Set<string>()
    const warmCount = Math.min(tasks.length, Math.max(2, this.BATCH_CONCURRENCY * 2))

    for (let i = 0; i < warmCount; i++) {
      const task = tasks[i]
      if (!task?.videoUrl) continue
      try {
        const extracted = this.extractRealUrl(task.videoUrl)
        const key = this.buildParseCacheKey(extracted, parserConfig)
        if (seen.has(key)) continue
        seen.add(key)
        void this.parseVideo(task.videoUrl, parserConfig).catch(() => undefined)
      } catch {
        // ignore invalid urls during prewarm
      }
    }
  }

  private static async runAdaptivePool(
    stage: BatchPoolStage,
    totalTasks: number,
    runTask: (index: number) => Promise<boolean>,
    onTaskSettled?: (index: number, processed: number) => void,
    onPoolState?: (state: BatchPoolState) => void
  ) {
    if (totalTasks <= 0) {
      return
    }

    let nextIndex = 0
    let inFlight = 0
    let processed = 0

    const initialConcurrency = Math.min(this.BATCH_CONCURRENCY, totalTasks)
    let currentConcurrency = initialConcurrency

    const emitPoolState = (event: BatchPoolEvent) => {
      onPoolState?.({
        stage,
        event,
        currentConcurrency,
        maxConcurrency: initialConcurrency,
        inFlight,
        processed,
        total: totalTasks,
      })
    }

    emitPoolState('init')

    let failureStreak = 0
    let successStreak = 0

    let launchChain = Promise.resolve()

    const withLaunchDelay = async () => {
      if (this.INTER_TASK_DELAY_MS <= 0) {
        return
      }
      launchChain = launchChain.then(() => this.maybeDelayBetweenTasks())
      await launchChain
    }

    await new Promise<void>(resolve => {
      const pump = () => {
        while (inFlight < currentConcurrency && nextIndex < totalTasks) {
          const index = nextIndex++
          inFlight++
          emitPoolState('task_started')

          void (async () => {
            await withLaunchDelay()

            let success = false
            try {
              success = await runTask(index)
            } catch {
              success = false
            }

            if (success) {
              successStreak++
              failureStreak = 0
              if (currentConcurrency < initialConcurrency && successStreak >= 3) {
                currentConcurrency++
                successStreak = 0
                console.log(`[批量转存] 连续成功，恢复并发到 ${currentConcurrency}`)
                emitPoolState('scale_up')
              }
            } else {
              failureStreak++
              successStreak = 0
              if (currentConcurrency > 1 && failureStreak >= 2) {
                currentConcurrency--
                failureStreak = 0
                console.warn(`[批量转存] 连续失败，降并发到 ${currentConcurrency}`)
                emitPoolState('scale_down')
              }
            }

            inFlight--
            processed++
            emitPoolState('task_settled')
            onTaskSettled?.(index, processed)

            if (processed >= totalTasks) {
              resolve()
              return
            }

            pump()
          })()
        }
      }

      pump()
    })
  }

  // {{ AURA: Modify - 使用多API适配器系统的抖音用户主页解析方法 }}
  static async parseDouyinUser(
    userUrl: string, 
    limit: number = 20,
    parsers?: EnhancedVideoParserConfig[]
  ): Promise<ParsedVideoInfo[]> {
    try {
      console.log(`[抖音用户解析] 开始解析用户主页: ${userUrl}, 限制: ${limit}`)
      
      // 如果提供了解析器列表，使用智能路由系统
      if (parsers && parsers.length > 0) {
        const routeResult = parserRouter.selectBestParser(
          BatchInputMode.DOUYIN_USER,
          SupportedPlatform.DOUYIN,
          parsers
        );
        
        if (routeResult.primary) {
          try {
            console.log(`[抖音用户解析] 使用解析器: ${routeResult.primary.name}`)
            return await parserRouter.executeParseRequest(
              routeResult.primary,
              userUrl,
              ParserCapability.USER_PAGE,
              limit
            );
          } catch (error) {
            console.error(`[抖音用户解析] 主解析器失败: ${error}`)
            
            // 尝试备用解析器
            for (const fallback of routeResult.fallbacks) {
              try {
                console.log(`[抖音用户解析] 尝试备用解析器: ${fallback.name}`)
                // 备用解析器通常是单视频解析，需要先获取用户视频列表
                throw new Error('需要实现单视频降级逻辑')
              } catch (fallbackError) {
                console.error(`[抖音用户解析] 备用解析器失败: ${fallbackError}`)
                continue;
              }
            }
            
            throw error; // 所有解析器都失败
          }
        } else {
          throw new Error('没有找到支持用户主页解析的API')
        }
      }
      
      // 兼容模式：使用原有的固定API端点
      const request: DouyinUserParseRequest = {
        url: userUrl,
        limit: limit
      }
      
      const response = await fetch('/api/douyin/user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request)
      })
      
      if (!response.ok) {
        throw new Error(`抖音用户解析API请求失败: ${response.status}`)
      }
      
      const result = await response.json()
      
      if (!result.success) {
        throw new Error(result.error || '抖音用户解析失败')
      }
      
      console.log(`[抖音用户解析] 解析成功，获取到 ${result.data.videos.length} 个视频`)
      return result.data.videos
      
    } catch (error) {
      console.error('[抖音用户解析] 解析失败:', error)
      throw error
    }
  }

  // {{ AURA: Add - 智能识别输入类型：普通链接 vs 抖音用户主页 }}
  static detectInputMode(input: string): BatchInputMode {
    const trimmedInput = input.trim()
    
    // 检查是否是抖音用户主页链接
    const douyinUserPatterns = [
      /douyin\.com\/user\//i,
      /iesdouyin\.com\/share\/user\//i,
      /v\.douyin\.com\/.*\/user\//i
    ]
    
    for (const pattern of douyinUserPatterns) {
      if (pattern.test(trimmedInput)) {
        return BatchInputMode.DOUYIN_USER
      }
    }
    
    // 检查是否包含多行（普通批量模式）
    const lines = trimmedInput.split('\n').filter(line => line.trim())
    if (lines.length > 1) {
      return BatchInputMode.NORMAL
    }
    
    // 单行输入默认为普通模式
    return BatchInputMode.NORMAL
  }

  // {{ AURA: Add - 扩展的批量转存方法，支持抖音用户模式 }}
  static async convertExtendedBatch(
    batchTask: ExtendedBatchTask,
    onProgress?: (batchProgress: number, currentTask?: ConversionTask) => void,
    callbacks?: BatchRuntimeCallbacks
  ): Promise<ExtendedBatchTask> {
    
    if (batchTask.inputMode === BatchInputMode.DOUYIN_USER) {
      return await this.convertDouyinUserBatch(batchTask, onProgress, callbacks)
    } else {
      // 使用原有的批量转存方法
      const originalBatch = await this.convertBatch(batchTask, onProgress, callbacks)
      return {
        ...originalBatch,
        inputMode: BatchInputMode.NORMAL
      }
    }
  }

  // {{ AURA: Add - 抖音用户批量转存方法 }}
  private static async convertDouyinUserBatch(
    batchTask: ExtendedBatchTask,
    onProgress?: (batchProgress: number, currentTask?: ConversionTask) => void,
    callbacks?: BatchRuntimeCallbacks
  ): Promise<ExtendedBatchTask> {
    
    batchTask.status = TaskStatus.PARSING
    
    try {
      // 第一阶段：解析用户主页获取视频列表
      onProgress?.(10, undefined)
      
      if (!batchTask.sourceUrl) {
        throw new Error('缺少用户主页URL')
      }
      
      console.log(`[抖音用户批量转存] 开始解析用户主页: ${batchTask.sourceUrl}`)
      
      // 根据任务数量确定解析限制
      const limit = batchTask.totalTasks || 20
      const userVideos = await this.parseDouyinUser(batchTask.sourceUrl, limit)
      
      // 更新批量任务信息
      batchTask.totalSourceVideos = userVideos.length
      batchTask.totalTasks = userVideos.length
      
      // 创建任务列表
      batchTask.tasks = userVideos.map((video, index) => ({
        id: this.generateTaskId(),
        videoUrl: video.url || '', // 使用解析后的视频URL
        videoTitle: video.title,
        status: TaskStatus.PENDING,
        createdAt: new Date(),
        parsedVideoInfo: video // 预先设置解析信息
      }))
      
      onProgress?.(20, undefined)
      console.log(`[抖音用户批量转存] 获取到 ${userVideos.length} 个视频，开始批量转存`)
      
      // 第二阶段：批量上传
      const totalTasks = batchTask.tasks.length
      let completedTasks = 0

      if (totalTasks > 0) {
        await this.runAdaptivePool(
          'douyin_upload',
          totalTasks,
          async (index) => {
            const task = batchTask.tasks[index]

            try {
              task.status = TaskStatus.UPLOADING
              console.log(`[抖音用户批量转存] 上传视频 ${index + 1}/${totalTasks}: ${task.videoTitle}`)

              const filePath = await this.uploadToWebDAV(
                task.parsedVideoInfo!,
                batchTask.webdavConfig
              )

              task.status = TaskStatus.SUCCESS
              task.completedAt = new Date()
              task.uploadResult = {
                success: true,
                filePath
              }

              completedTasks++
              console.log(`[抖音用户批量转存] 上传成功: ${task.videoTitle}`)
              return true
            } catch (error) {
              console.error(`[抖音用户批量转存] 任务失败:`, error)
              task.status = TaskStatus.FAILED
              task.completedAt = new Date()
              task.error = error instanceof Error ? error.message : '上传失败'
              task.uploadResult = {
                success: false,
                error: task.error
              }
              return false
            }
          },
          (_index, processed) => {
            batchTask.completedTasks = completedTasks
            const progress = 20 + (processed / totalTasks) * 70
            onProgress?.(progress, batchTask.tasks[_index])
          },
          callbacks?.onPoolState
        )
      }
      
      // 更新最终状态
      batchTask.completedAt = new Date()
      
      if (completedTasks === totalTasks) {
        batchTask.status = TaskStatus.SUCCESS
        await CleanupService.cleanupAfterTaskCompletion(batchTask);
      } else if (completedTasks === 0) {
        batchTask.status = TaskStatus.FAILED
      } else {
        batchTask.status = TaskStatus.SUCCESS // 部分成功也标记为成功
      }
      
      onProgress?.(100, undefined)
      console.log(`[抖音用户批量转存] 批量转存完成，成功: ${completedTasks}/${totalTasks}`)
      
      return batchTask
      
    } catch (error) {
      console.error('[抖音用户批量转存] 批量转存失败:', error)
      batchTask.status = TaskStatus.FAILED
      batchTask.completedAt = new Date()
      throw error
    }
  }

  // {{ AURA: Add - 解析器配置增强工具方法 }}
  static async enhanceParserConfigs(parsers: VideoParserConfig[]): Promise<EnhancedVideoParserConfig[]> {
    return await apiCapabilityDetector.updateParserCapabilities(parsers);
  }
  
  // {{ AURA: Add - 获取或创建抖音用户解析器 }}
  static getOrCreateDouyinUserParser(parsers: VideoParserConfig[]): EnhancedVideoParserConfig {
    // 检查是否已有抖音用户解析器
    const existingUserParser = parsers.find(p => 
      p.apiUrl.includes('cenguigui.cn') && p.apiUrl.includes('user.php')
    );
    
    if (existingUserParser) {
      return {
        ...existingUserParser,
        capabilities: [ParserCapability.USER_PAGE],
        supportedPlatforms: [SupportedPlatform.DOUYIN],
        responseAdapter: 'douyin_user_api'
      };
    }
    
    // 创建默认的抖音用户解析器
    return apiCapabilityDetector.createDouyinUserParser();
  }

  // 解析视频链接列表
  static parseVideoUrls(text: string): string[] {
    const lines = text.split('\n')
    const urls: string[] = []
    
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed) {
        // 尝试从包含其他文字的输入中提取URL
        const extractedUrl = this.extractRealUrl(trimmed)
        if (extractedUrl && this.isValidUrl(extractedUrl)) {
          urls.push(extractedUrl)
        }
      }
    }
    
    return urls
  }

  // 生成任务ID
  static generateTaskId(): string {
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

  // 生成批量任务ID
  static generateBatchId(): string {
    return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  // 验证文件名
  static validateFilename(filename: string): {
    sanitized: string;
    isValid: boolean;
    issues: string[]
  } {
    const issues: string[] = []

    // 检测特殊字符
    const specialChars = FilenameSanitizer.detectSpecialChars(filename)
    if (specialChars.length > 0) {
      issues.push(`包含特殊字符: ${specialChars.join(', ')}`)
    }

    // 检测控制字符
    if (/[\x00-\x1f\x7f-\x9f]/.test(filename)) {
      issues.push('包含控制字符')
    }

    // 检测 Windows 保留名称
    const nameWithoutExt = filename.replace(/\.[^.]*$/, '')
    const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9']
    if (reservedNames.includes(nameWithoutExt.toUpperCase())) {
      issues.push('文件名是 Windows 保留名称')
    }

    // 检测文件名长度
    if (filename.length > 255) {
      issues.push('文件名过长')
    }

    // 规范化文件名
    const sanitized = FilenameSanitizer.sanitize(filename, {
      replacement: '_',
      maxLength: 255,
      preserveExtension: true,
      addTimestamp: false
    })

    return {
      sanitized,
      isValid: issues.length === 0,
      issues
    }
  }

  // 格式化时长（秒转为可读格式）
  static formatDuration(seconds: number): string {
    if (!seconds || seconds < 0) return '00:00'

    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)

    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // 格式化文件大小（字节转为可读格式）
  static formatFileSize(bytes: number): string {
    if (!bytes || bytes === 0) return '0 B'

    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const k = 1024
    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`
  }

  // 测试WebDAV连接
  static async testWebDAVConnection(webdavConfig: WebDAVConfig): Promise<{ success: boolean; message?: string }> {
    try {
      console.log(`[WebDAV测试] 开始测试连接: ${webdavConfig.name}`)

      const response = await fetch('/api/proxy/webdav/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ webdavConfig })
      })

      const responseText = await response.text()
      if (!responseText.trim()) {
        return { success: false, message: `WebDAV测试返回空响应 (HTTP ${response.status})` }
      }

      let result: any
      try {
        result = JSON.parse(responseText)
      } catch {
        const message = this.extractErrorMessageFromResponse(responseText) ?? 'WebDAV测试返回非JSON响应'
        return { success: false, message }
      }

      if (result.success) {
        console.log(`[WebDAV测试] 连接成功`)
        return { success: true, message: '连接成功' }
      } else {
        console.error(`[WebDAV测试] 连接失败:`, result.error)
        return { success: false, message: result.error || '连接失败' }
      }
    } catch (error) {
      console.error('[WebDAV测试] 测试过程出错:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : '测试连接时发生未知错误'
      }
    }
  }

  // 验证URL格式
  private static isValidUrl(url: string): boolean {
    try {
      // 首先提取抖音等平台的真实链接
      const extractedUrl = this.extractRealUrl(url)
      new URL(extractedUrl)
      return true
    } catch {
      return false
    }
  }
  
  // 处理短视频分享文本，提取真实URL
  private static extractRealUrl(input: string): string {
    // 如果已经是有效URL，直接返回
    try {
      new URL(input)
      return input
    } catch {
      // 不是有效URL，尝试提取
    }
    
    // 处理抖音分享文本格式
    // 例如: "7.97 DUL:/ 02/05 z@T.yg 不知道啊被季莹莹抽了之后就这样了# 永劫无间手游 # 季莹莹 # 胡桃 # cos # 猎奇  https://v.douyin.com/d689EsOAlug/ 复制此链接，打开Dou音搜索，直接观看视频！"
    // 改进的URL正则表达式，能够更好地匹配各种分享文本中的URL
    const urlRegex = /(https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&=\/=]*))/g
    const matches = input.match(urlRegex)
    
    if (matches && matches.length > 0) {
      // 返回第一个匹配的URL并移除末尾斜杠
      return matches[0].replace(/\/$/, '')
    }
    
    return input
  }

  // 上传媒体到WebDAV
  static async uploadToWebDAV(
    mediaInfo: ParsedVideoInfo,
    webdavConfig: WebDAVConfig,
    folderPath?: string
  ): Promise<string> {
    const maxRetries = 5
    let attempt = 0
    let lastError
    
    // 根据媒体类型生成文件名
    let fileName = ''
    if (mediaInfo.mediaType === MediaType.VIDEO && mediaInfo.url) {
      const format = this.inferVideoFormat(mediaInfo.format, mediaInfo.url)
      fileName = this.generateFileName(mediaInfo.title, format)
    } else if (mediaInfo.mediaType === MediaType.IMAGE_ALBUM && mediaInfo.images && mediaInfo.images.length > 0) {
      fileName = this.generateFolderName(mediaInfo.title)
    }
    
    while (attempt < maxRetries) {
      try {
        attempt++
        console.log(`[转存] WebDAV上传尝试 ${attempt}/${maxRetries}: ${mediaInfo.mediaType === MediaType.VIDEO ? '视频' : '图集'}`)
        
        const response = await fetch('/api/proxy/webdav', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            videoUrl: mediaInfo.mediaType === MediaType.VIDEO ? mediaInfo.url : undefined,
            images: mediaInfo.mediaType === MediaType.IMAGE_ALBUM ? mediaInfo.images : undefined,
            webdavConfig,
            fileName,
            folderPath: folderPath || ''
          })
        })

        const responseText = await response.text()
        if (!responseText.trim()) {
          throw new Error(`服务器返回空响应 (HTTP ${response.status})`)
        }

        if (!response.ok) {
          const message = this.extractErrorMessageFromResponse(responseText)
          throw new Error(message
            ? `上传服务错误 (${response.status}): ${message}`
            : `上传服务错误 (HTTP ${response.status})`)
        }

        let result: any
        try {
          result = JSON.parse(responseText)
        } catch {
          const message = this.extractErrorMessageFromResponse(responseText)
          throw new Error(message
            ? `上传服务返回非JSON响应: ${message}`
            : '上传服务返回了无法解析的响应')
        }
        
        if (!result.success) {
          throw new Error(result.error || '媒体上传失败')
        }

        if (!result.filePath) {
          throw new Error('上传成功但未返回文件路径')
        }

        console.log(`[转存] 上传成功，尝试次数: ${attempt}`)
        return result.filePath
        
      } catch (error) {
        lastError = error
        console.error(`[转存] 上传尝试 ${attempt} 失败:`, error)
        
        if (attempt < maxRetries) {
          const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 10000)
          console.log(`[转存] 等待 ${waitTime/1000} 秒后重试...`)
          await new Promise(resolve => setTimeout(resolve, waitTime))
        } else {
          break
        }
      }
    }
    
    console.error('[转存] 所有上传尝试均失败')
    throw lastError || new Error('视频上传失败，已达到最大重试次数')
  }

  // 批量转存
  static async convertBatch(
    batchTask: BatchTask,
    onProgress?: (batchProgress: number, currentTask?: ConversionTask) => void,
    callbacks?: BatchRuntimeCallbacks
  ): Promise<BatchTask> {
    batchTask.status = TaskStatus.PARSING
    
    const totalTasks = batchTask.tasks.length
    let completedTasks = 0

    if (totalTasks > 0) {
      this.prewarmBatchParse(batchTask.tasks, batchTask.parserConfig)

      const inFlightProgress = new Map<string, number>()

      const emitOverallProgress = (currentTask?: ConversionTask) => {
        const partial = Array.from(inFlightProgress.values()).reduce((sum, value) => sum + value, 0) / 100
        const overall = ((completedTasks + partial) / totalTasks) * 100
        onProgress?.(Math.min(99.9, overall), currentTask)
      }

      await this.runAdaptivePool(
        'normal_batch',
        totalTasks,
        async (index) => {
          const task = batchTask.tasks[index]

          inFlightProgress.set(task.id, 0)
          emitOverallProgress(task)

          try {
            const updatedTask = await this.convertSingle(
              task,
              batchTask.parserConfig,
              batchTask.webdavConfig,
              (progress, status) => {
                task.status = status
                inFlightProgress.set(task.id, Math.max(0, Math.min(99, progress)))
                emitOverallProgress(task)
              }
            )

            batchTask.tasks[index] = updatedTask

            if (updatedTask.status === TaskStatus.SUCCESS) {
              completedTasks++
              return true
            }

            return false
          } catch (error) {
            console.error(`批量任务中的单个任务失败:`, error)
            task.status = TaskStatus.FAILED
            task.completedAt = new Date()
            task.error = error instanceof Error ? error.message : '任务失败'
            batchTask.tasks[index] = task
            return false
          } finally {
            inFlightProgress.delete(task.id)
            batchTask.completedTasks = completedTasks
          }
        },
        (index, processed) => {
          onProgress?.((processed / totalTasks) * 100, batchTask.tasks[index])
        },
        callbacks?.onPoolState
      )
    }

    batchTask.completedAt = new Date()
    
    if (completedTasks === totalTasks) {
      batchTask.status = TaskStatus.SUCCESS
      await CleanupService.cleanupAfterTaskCompletion(batchTask)
    } else if (completedTasks === 0) {
      batchTask.status = TaskStatus.FAILED
    } else {
      batchTask.status = TaskStatus.SUCCESS
    }

    return batchTask
  }

  // 单个视频转存
  static async convertSingle(
    task: ConversionTask,
    parserConfig: VideoParserConfig,
    webdavConfig: WebDAVConfig,
    onProgress?: (progress: number, status: TaskStatus) => void
  ): Promise<ConversionTask> {
    try {
      task.status = TaskStatus.PARSING
      onProgress?.(20, TaskStatus.PARSING)
      
      console.log(`[转存] 开始解析视频: ${task.videoUrl}`)
      console.log(`[转存] 使用解析器: ${parserConfig.name} (${parserConfig.apiUrl})`)

      // 解析视频
      try {
        if (!this.isValidUrl(task.videoUrl)) {
          throw new Error('视频链接格式无效，请确保以http://或https://开头')
        }
        
        const parsedInfo = await this.parseVideo(task.videoUrl, parserConfig)
        console.log(`[转存] 解析成功，媒体类型: ${parsedInfo.mediaType}`)
        
        task.parsedVideoInfo = parsedInfo
        task.videoTitle = parsedInfo.title
        console.log(`[转存] 解析完成: ${parsedInfo.title}`)
      } catch (error) {
        console.error('[转存] 视频解析失败:', error)
        task.status = TaskStatus.FAILED
        let errorMsg = error instanceof Error ? error.message : '视频解析失败'
        
        if (errorMsg.includes('URL为空')) {
          errorMsg = 'URL为空 - 解析API无法提取视频URL，请尝试其他解析API或检查链接'
        }
        
        task.error = errorMsg
        task.completedAt = new Date()
        return task
      }

      onProgress?.(50, TaskStatus.PARSING)
      
      task.status = TaskStatus.UPLOADING
      onProgress?.(60, TaskStatus.UPLOADING)

      const filePath = await this.uploadToWebDAV(
        task.parsedVideoInfo!, 
        webdavConfig
      )

      task.status = TaskStatus.SUCCESS
      task.completedAt = new Date()
      task.uploadResult = {
        success: true,
        filePath
      }

      onProgress?.(100, TaskStatus.SUCCESS)

      await CleanupService.cleanupAfterTaskCompletion(task)
      return task
    } catch (error) {
      task.status = TaskStatus.FAILED
      task.completedAt = new Date()
      task.error = error instanceof Error ? error.message : '转存过程中发生未知错误'
      task.uploadResult = {
        success: false,
        error: task.error
      }

      await CleanupService.cleanupAfterTaskCompletion(task)
      onProgress?.(0, TaskStatus.FAILED)

      return task
    }
  }

  // 仅解析视频链接（不上传）
  static async parseOnly(videoUrl: string, parserConfig: VideoParserConfig): Promise<ParsedVideoInfo> {
    return await this.parseVideo(videoUrl, parserConfig)
  }

  // 上传已解析的媒体（基于预览数据）
  static async uploadParsedMedia(
    parsedInfo: ParsedVideoInfo,
    webdavConfig: WebDAVConfig,
    folderPath?: string
  ): Promise<string> {
    console.log(`[上传] 开始上传已解析的媒体: ${parsedInfo.title}`)
    return await this.uploadToWebDAV(parsedInfo, webdavConfig, folderPath)
  }

  // 解析视频链接
  static async parseVideo(videoUrl: string, parserConfig: VideoParserConfig): Promise<ParsedVideoInfo> {
    if (!videoUrl || typeof videoUrl !== 'string' || !videoUrl.trim()) {
      throw new Error('视频URL为空')
    }
    
    if (!parserConfig || !parserConfig.apiUrl) {
      throw new Error('解析API配置无效')
    }
    
    const extractedUrl = this.extractRealUrl(videoUrl)
    const cacheKey = this.buildParseCacheKey(extractedUrl, parserConfig)

    const cached = this.getParseCache(cacheKey)
    if (cached) {
      console.log('[转存] 命中解析缓存')
      return cached
    }

    const inFlight = this.parseInFlight.get(cacheKey)
    if (inFlight) {
      return await inFlight
    }

    const parsePromise = (async () => {
      try {
        console.log(`[转存] 提取到URL: ${extractedUrl}`)
        console.log(`[转存] 发送解析请求，URL: ${extractedUrl.substring(0, 50)}...`)

        const response = await fetch('/api/proxy/parser', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            videoUrl: extractedUrl,
            parserConfig
          })
        })

        const responseText = await response.text()
        console.log(`[转存] 解析API响应状态: ${response.status}, 内容长度: ${responseText.length}`)

        if (!responseText.trim()) {
          throw new Error(`解析服务器返回空响应 (HTTP ${response.status})`)
        }

        if (!response.ok) {
          const upstreamError = ConversionService.extractErrorMessageFromResponse(responseText)
          throw new Error(upstreamError
            ? `解析接口调用失败 (${response.status}): ${upstreamError}`
            : `解析接口调用失败 (HTTP ${response.status})`)
        }

        let result: VideoParseResponse
        try {
          result = JSON.parse(responseText)
        } catch (parseError) {
          console.error('[转存] 无法解析解析API响应JSON:', parseError)
          const snippet = responseText.substring(0, 300)
          throw new Error(`解析服务返回了无法解析的内容: ${snippet}`)
        }

        if (!result.success) {
          throw new Error(result.error || '视频解析失败')
        }

        if (!result.data) {
          throw new Error('API返回的数据为空')
        }

        if (result.data.mediaType === MediaType.VIDEO && !result.data.url) {
          throw new Error('视频解析成功但未返回有效的视频URL')
        }

        if (result.data.mediaType === MediaType.VIDEO && result.data.url) {
          try {
            new URL(result.data.url)
          } catch {
            throw new Error(`返回的URL无效: ${result.data.url}`)
          }
        }

        if (result.data.mediaType === MediaType.IMAGE_ALBUM) {
          if (!result.data.images || result.data.images.length === 0) {
            throw new Error('图集解析成功但没有找到任何图片')
          }
          console.log(`[转存] 图集解析成功，包含 ${result.data.images.length} 张图片`)
        }

        this.setParseCache(cacheKey, result.data)
        console.log(`[转存] 解析成功，获取到${result.data.mediaType === MediaType.VIDEO ? '视频' : '图集'}: ${result.data.title}`)
        return this.cloneParsedInfo(result.data)
      } catch (error) {
        console.error('[转存] 视频解析错误:', error)
        throw error
      }
    })()

    this.parseInFlight.set(cacheKey, parsePromise)

    try {
      return await parsePromise
    } finally {
      this.parseInFlight.delete(cacheKey)
    }
  }

  // 生成文件名
  private static generateFileName(title: string, format: string): string {
    console.log(`[文件名生成] 原始标题: "${title}"`)
    
    const specialChars = FilenameSanitizer.detectSpecialChars(title)
    if (specialChars.length > 0) {
      console.log(`[文件名生成] 检测到特殊字符: ${specialChars.join(', ')}`)
    }
    
    const sanitizedTitle = FilenameSanitizer.sanitize(title, {
      replacement: '_',
      maxLength: 80,
      preserveExtension: false,
      addTimestamp: true
    })

    const nameWithoutExt = sanitizedTitle.replace(/\.[^.]*$/, '')
    const finalName = `${nameWithoutExt}.${format}`
    
    console.log(`[文件名生成] 最终文件名: "${finalName}"`)
    return finalName
  }

  // 生成文件夹名（用于图集）
  private static generateFolderName(title: string): string {
    return FilenameSanitizer.sanitize(title, {
      replacement: '_',
      maxLength: 100,
      preserveExtension: false,
      addTimestamp: false
    })
  }

  // 智能视频格式推断方法
  private static inferVideoFormat(providedFormat: string | undefined, videoUrl?: string): string {
    const validFormats = [
      'mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv', 'm4v',
      '3gp', 'f4v', 'asf', 'rm', 'rmvb', 'vob', 'ogv', 'm2ts', 'mts'
    ]
    
    if (providedFormat && validFormats.includes(providedFormat.toLowerCase())) {
      return providedFormat.toLowerCase()
    }
    
    if (videoUrl) {
      const urlFormat = this.extractFormatFromUrl(videoUrl)
      if (urlFormat && validFormats.includes(urlFormat.toLowerCase())) {
        return urlFormat.toLowerCase()
      }
    }
    
    return 'mp4'
  }
  
  // 从URL提取格式扩展名
  private static extractFormatFromUrl(url: string): string | null {
    try {
      const urlObj = new URL(url)
      const pathname = urlObj.pathname
      const lastDotIndex = pathname.lastIndexOf('.')
      
      if (lastDotIndex !== -1) {
        const extension = pathname.substring(lastDotIndex + 1)
        return extension.toLowerCase()
      }
    } catch (e) {
      // URL解析失败，忽略错误
    }
    
    return null
  }

  private static extractErrorMessageFromResponse(body: string): string | null {
    if (!body) {
      return null
    }

    try {
      const parsed = JSON.parse(body)
      if (parsed && typeof parsed === 'object') {
        const fields = ['error', 'message', 'msg', 'detail', 'reason'] as const
        for (const field of fields) {
          const value = (parsed as Record<string, unknown>)[field]
          if (typeof value === 'string' && value.trim()) {
            return value.trim()
          }
        }
      }
    } catch (error) {
      // body不是JSON，忽略解析错误
    }

    const sanitized = body.replace(/\s+/g, ' ').trim()
    if (!sanitized) {
      return null
    }

    return sanitized.length > 300 ? `${sanitized.substring(0, 300)}…` : sanitized
  }
}
