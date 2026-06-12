import { 
  ConversionTask, 
  BatchTask, 
  TaskStatus, 
  VideoParserConfig, 
  EnhancedVideoParserConfig,
  WebDAVConfig, 
  ParsedVideoInfo, 
  MediaType, 
  PreviewParseResponse, 
  BatchInputMode, 
  ExtendedBatchTask, 
  DouyinUserParseRequest,
  ParserCapability,
  SupportedPlatform,
  ParserAttemptResult,
} from '@/types'
import { CleanupService } from './cleanup'
import { FilenameSanitizer } from './filename-sanitizer'
import { parserRouter } from './parser-router'
import { apiCapabilityDetector } from './capability-detector'
import { extractFirstUrlFromText } from './url/extract'
import { ConfigManager } from './storage'
import {
  classifyParserFailure,
  getParserHealthSnapshot,
  isParserCoolingDown,
  recordParserAttempt,
  scoreParserHealth,
} from './parser-health'
import {
  extractErrorMessageFromResponse,
  UploadCancelledError,
  type UploadRuntimeControl,
  uploadToWebDAV,
} from './conversion-upload'
import {
  buildFallbackFailureMessage,
  extractRealVideoUrl,
  isValidVideoInputUrl,
  parseVideoWithFallback,
} from './conversion-parse'
import {
  type BatchRuntimeCallbacks,
  convertBatchTask,
  convertDouyinUserBatchTask,
  convertSingleTask,
} from './conversion-batch'

export type { BatchPoolEvent, BatchPoolStage, BatchPoolState } from './conversion-batch'

export class ConversionCancelledError extends Error {
  constructor(message = '任务已停止') {
    super(message)
    this.name = 'ConversionCancelledError'
  }
}

export class ConversionService {
  private static readonly DEFAULT_BATCH_CONCURRENCY = 3
  private static readonly DEFAULT_DOUYIN_UPLOAD_CONCURRENCY = 2
  private static readonly DEFAULT_BATCH_TASK_DELAY_MS = 0
  private static readonly DEFAULT_PARSE_CACHE_TTL_MS = 5 * 60 * 1000
  private static readonly DEFAULT_PARSE_CACHE_MAX_ENTRIES = 300

  private static readonly BATCH_CONCURRENCY = (() => {
    const fromEnv = Number(process.env.NEXT_PUBLIC_BATCH_CONCURRENCY ?? String(this.DEFAULT_BATCH_CONCURRENCY))
    if (!Number.isFinite(fromEnv)) return this.DEFAULT_BATCH_CONCURRENCY
    return Math.max(1, Math.min(6, Math.floor(fromEnv)))
  })()

  private static readonly DOUYIN_UPLOAD_CONCURRENCY = (() => {
    const fromEnv = Number(
      process.env.NEXT_PUBLIC_DOUYIN_UPLOAD_CONCURRENCY ?? String(this.DEFAULT_DOUYIN_UPLOAD_CONCURRENCY)
    )
    if (!Number.isFinite(fromEnv)) return this.DEFAULT_DOUYIN_UPLOAD_CONCURRENCY
    return Math.max(1, Math.min(4, Math.floor(fromEnv)))
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

  static isCancellationError(error: unknown): boolean {
    if (error instanceof ConversionCancelledError) {
      return true
    }
    if (error instanceof UploadCancelledError) {
      return true
    }
    if (!(error instanceof Error)) {
      return false
    }
    if (error.name === UploadCancelledError.name) {
      return true
    }
    if (error.name === 'AbortError') {
      return true
    }
    const message = String(error.message || '').toLowerCase()
    return message.includes('abort') || message.includes('stopped')
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

  private static getBatchOrchestratorDeps() {
    return {
      batchConcurrency: this.BATCH_CONCURRENCY,
      douyinUploadConcurrency: this.DOUYIN_UPLOAD_CONCURRENCY,
      interTaskDelayMs: this.INTER_TASK_DELAY_MS,
      parseVideo: (videoUrl: string, parserConfig: VideoParserConfig) => this.parseVideo(videoUrl, parserConfig),
      parseDouyinUser: (
        userUrl: string,
        limit: number,
        parsers?: EnhancedVideoParserConfig[],
        preferredParserId?: string
      ) => this.parseDouyinUser(userUrl, limit, parsers, preferredParserId),
      uploadToWebDAV: (
        mediaInfo: ParsedVideoInfo,
        webdavConfig: WebDAVConfig,
        folderPath?: string,
        onProgress?: (progress: number, hint: string) => void,
        sourceUrl?: string,
        runtimeControl?: UploadRuntimeControl
      ) => this.uploadToWebDAV(mediaInfo, webdavConfig, folderPath, onProgress, sourceUrl, runtimeControl),
      extractRealUrl: extractRealVideoUrl,
      isValidVideoInputUrl,
      isCancellationError: (error: unknown) => this.isCancellationError(error),
      createCancellationError: (message?: string) => new ConversionCancelledError(message),
      cleanupAfterTaskCompletion: (task: ConversionTask | BatchTask | ExtendedBatchTask) =>
        CleanupService.cleanupAfterTaskCompletion(task),
      generateTaskId: () => this.generateTaskId(),
    }
  }

  // {{ AURA: Modify - 使用多API适配器系统的抖音用户主页解析方法 }}
  static async parseDouyinUser(
    userUrl: string, 
    limit: number = 20,
    parsers?: EnhancedVideoParserConfig[],
    preferredParserId?: string
  ): Promise<ParsedVideoInfo[]> {
    const traceId = this.generateTaskId()
    try {
      console.log(`[抖音用户解析] 开始解析用户主页: ${userUrl}, 限制: ${limit}`)

      let resolvedParsers = parsers
      if (!resolvedParsers || resolvedParsers.length === 0) {
        const localParsers = typeof window !== 'undefined' ? ConfigManager.getParsers() : []
        if (localParsers.length > 0) {
          try {
            resolvedParsers = await this.enhanceParserConfigs(localParsers)
          } catch {
            resolvedParsers = []
          }
        }
      }

      const safeParsers: EnhancedVideoParserConfig[] = [...(resolvedParsers ?? [])]
      const hasUserParser = safeParsers.some(parser =>
        parser.capabilities?.includes(ParserCapability.USER_PAGE)
      )
      if (!hasUserParser) {
        const userParser = this.getOrCreateDouyinUserParser(safeParsers)
        const existingIndex = safeParsers.findIndex(parser => parser.id === userParser.id)
        if (existingIndex === -1) {
          safeParsers.push(userParser)
        } else {
          const existing = safeParsers[existingIndex]
          safeParsers[existingIndex] = {
            ...existing,
            ...userParser,
            capabilities: Array.from(new Set([...(existing.capabilities || []), ...(userParser.capabilities || [])])),
            supportedPlatforms: Array.from(new Set([...(existing.supportedPlatforms || []), ...(userParser.supportedPlatforms || [])]))
          }
        }
      }
      resolvedParsers = safeParsers

      const routeResult = resolvedParsers && resolvedParsers.length > 0
        ? parserRouter.selectBestParser(
            BatchInputMode.DOUYIN_USER,
            SupportedPlatform.DOUYIN,
            resolvedParsers
          )
        : { primary: null, fallbacks: [] as EnhancedVideoParserConfig[] }

      const allUserParsers = (resolvedParsers ?? [])
        .filter(parser => parser.capabilities?.includes(ParserCapability.USER_PAGE))
      const preferredParser = preferredParserId
        ? allUserParsers.find(parser => parser.id === preferredParserId) || null
        : null
      const routedPrimary = routeResult.primary
        && routeResult.primary.capabilities?.includes(ParserCapability.USER_PAGE)
        ? routeResult.primary
        : null
      const primaryUserParser = preferredParser || routedPrimary
      const backupUserParser = allUserParsers
        .filter(parser => !primaryUserParser || parser.id !== primaryUserParser.id)
        .sort((a, b) => {
          const snapshotA = getParserHealthSnapshot(a.id)
          const snapshotB = getParserHealthSnapshot(b.id)
          return scoreParserHealth(snapshotB) - scoreParserHealth(snapshotA)
        })[0] || null
      const userCapableParsers = [primaryUserParser, backupUserParser]
        .filter((parser): parser is EnhancedVideoParserConfig => Boolean(parser))
      const primaryParserKey = primaryUserParser?.id || ''

      const attempts: ParserAttemptResult[] = []
      const normalizedUserUrl = this.normalizeDouyinUserUrl(userUrl)

      for (const parser of userCapableParsers) {
        if (primaryParserKey && parser.id !== primaryParserKey && isParserCoolingDown(parser.id)) {
          continue
        }

        const started = Date.now()
        try {
          console.log(`[抖音用户解析] 使用解析器: ${parser.name}`)
          const videos = await parserRouter.executeParseRequest(
            parser,
            normalizedUserUrl,
            ParserCapability.USER_PAGE,
            limit
          )

          const successAttempt: ParserAttemptResult = {
            parserId: parser.id,
            parserName: parser.name,
            parserUrl: parser.apiUrl,
            success: true,
            latencyMs: Date.now() - started,
            checkedAt: new Date().toISOString(),
            traceId,
          }
          attempts.push(successAttempt)
          recordParserAttempt(successAttempt)
          return videos
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          const failedAttempt: ParserAttemptResult = {
            parserId: parser.id,
            parserName: parser.name,
            parserUrl: parser.apiUrl,
            success: false,
            latencyMs: Date.now() - started,
            errorClass: classifyParserFailure({ error, message: errorMessage }),
            errorMessage,
            checkedAt: new Date().toISOString(),
            traceId,
          }
          attempts.push(failedAttempt)
          recordParserAttempt(failedAttempt)
          console.error(`[抖音用户解析] ${parser.name} 失败: ${errorMessage}`)
        }
      }

      const builtinStarted = Date.now()
      const response = await fetch('/api/douyin/user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: normalizedUserUrl,
          limit,
        } satisfies DouyinUserParseRequest)
      })
      
      if (!response.ok) {
        const errorMessage = `抖音用户解析API请求失败: ${response.status}`
        const failedAttempt: ParserAttemptResult = {
          parserId: 'builtin_douyin_user_route',
          parserName: '内置抖音用户解析接口',
          parserUrl: '/api/douyin/user',
          success: false,
          latencyMs: Date.now() - builtinStarted,
          status: response.status,
          errorClass: classifyParserFailure({ status: response.status, message: errorMessage }),
          errorMessage,
          checkedAt: new Date().toISOString(),
          traceId,
        }
        attempts.push(failedAttempt)
        recordParserAttempt(failedAttempt)
        throw new Error(buildFallbackFailureMessage(attempts))
      }
      
      const result = await response.json()
      
      if (!result.success) {
        const errorMessage = result.error || '抖音用户解析失败'
        const failedAttempt: ParserAttemptResult = {
          parserId: 'builtin_douyin_user_route',
          parserName: '内置抖音用户解析接口',
          parserUrl: '/api/douyin/user',
          success: false,
          latencyMs: Date.now() - builtinStarted,
          errorClass: classifyParserFailure({ message: errorMessage }),
          errorMessage,
          checkedAt: new Date().toISOString(),
          traceId,
        }
        attempts.push(failedAttempt)
        recordParserAttempt(failedAttempt)
        throw new Error(buildFallbackFailureMessage(attempts))
      }

      const successAttempt: ParserAttemptResult = {
        parserId: 'builtin_douyin_user_route',
        parserName: '内置抖音用户解析接口',
        parserUrl: '/api/douyin/user',
        success: true,
        latencyMs: Date.now() - builtinStarted,
        checkedAt: new Date().toISOString(),
        traceId,
      }
      attempts.push(successAttempt)
      recordParserAttempt(successAttempt)
      
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
    if (!trimmedInput) {
      return BatchInputMode.NORMAL
    }

    const firstUrl = extractFirstUrlFromText(trimmedInput)
    const normalizedInput = firstUrl || trimmedInput

    // 检查是否是抖音用户主页链接
    const douyinUserPatterns = [
      /douyin\.com\/user\//i,
      /iesdouyin\.com\/share\/user\//i,
      /douyin\.com\/share\/user\//i,
      /[?&]sec_uid=/i
    ]

    for (const pattern of douyinUserPatterns) {
      if (pattern.test(normalizedInput)) {
        return BatchInputMode.DOUYIN_USER
      }
    }

    // v.douyin.com 短链既可能是视频也可能是用户主页，自动模式下默认按普通模式，
    // 由页面“模式选择”允许用户显式切换到用户主页解析。
    if (/^https?:\/\/v\.douyin\.com\/[A-Za-z0-9_-]+\/?$/i.test(normalizedInput)) {
      return BatchInputMode.NORMAL
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
      return await convertDouyinUserBatchTask(
        batchTask,
        this.getBatchOrchestratorDeps(),
        onProgress,
        callbacks
      )
    } else {
      // 使用原有的批量转存方法
      const originalBatch = await this.convertBatch(batchTask, onProgress, callbacks)
      return {
        ...originalBatch,
        inputMode: BatchInputMode.NORMAL
      }
    }
  }

  // {{ AURA: Add - 解析器配置增强工具方法 }}
  static async enhanceParserConfigs(parsers: VideoParserConfig[]): Promise<EnhancedVideoParserConfig[]> {
    return await apiCapabilityDetector.updateParserCapabilities(parsers);
  }
  
  // {{ AURA: Add - 获取或创建抖音用户解析器 }}
  static getOrCreateDouyinUserParser(parsers: VideoParserConfig[]): EnhancedVideoParserConfig {
    // 检查是否已有用户主页解析器（优先复用）
    const existingUserParser = parsers.find(p =>
      p.capabilities?.includes(ParserCapability.USER_PAGE) ||
      /api\.mmp\.cc\/api\/dyhome/i.test(String(p.apiUrl || '')) ||
      /cenguigui\.cn\/api\/douyin\/user\.php/i.test(String(p.apiUrl || ''))
    )

    if (existingUserParser) {
      const isMmp = /api\.mmp\.cc\/api\/dyhome/i.test(String(existingUserParser.apiUrl || ''))
      return {
        ...existingUserParser,
        capabilities: [ParserCapability.USER_PAGE],
        supportedPlatforms: [SupportedPlatform.DOUYIN],
        responseAdapter: isMmp ? 'simplified_douyin_user_api' : 'douyin_user_api',
        userPageEndpoint: existingUserParser.userPageEndpoint || existingUserParser.apiUrl
      }
    }

    // 创建默认的抖音用户解析器
    return apiCapabilityDetector.createDouyinUserParser()
  }

  private static normalizeDouyinUserUrl(input: string): string {
    const extracted = extractFirstUrlFromText(String(input || '').trim()) || String(input || '').trim()
    if (!extracted) {
      return ''
    }

    const secUidFromPath = extracted.match(/\/user\/([A-Za-z0-9_-]{10,})/i)?.[1]
    const secUidFromQuery = (() => {
      try {
        const parsed = new URL(extracted)
        const secUid = parsed.searchParams.get('sec_uid')
        return secUid ? decodeURIComponent(secUid) : ''
      } catch {
        return ''
      }
    })()
    const secUid = secUidFromPath || secUidFromQuery

    if (secUid) {
      return `https://www.iesdouyin.com/share/user/${secUid}`
    }

    return extracted
  }

  // 解析视频链接列表
  static parseVideoUrls(text: string): string[] {
    const lines = text.split('\n')
    const urls: string[] = []
    
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed) {
        // 尝试从包含其他文字的输入中提取URL
        const extractedUrl = extractRealVideoUrl(trimmed)
        if (extractedUrl && isValidVideoInputUrl(extractedUrl)) {
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
        const message = extractErrorMessageFromResponse(responseText) ?? 'WebDAV测试返回非JSON响应'
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

  // 上传媒体到WebDAV
  static async uploadToWebDAV(
    mediaInfo: ParsedVideoInfo,
    webdavConfig: WebDAVConfig,
    folderPath?: string,
    onProgress?: (progress: number, hint: string) => void,
    sourceUrl?: string,
    runtimeControl?: UploadRuntimeControl
  ): Promise<string> {
    return await uploadToWebDAV(mediaInfo, webdavConfig, folderPath, onProgress, sourceUrl, runtimeControl)
  }

  // 批量转存
  static async convertBatch(
    batchTask: BatchTask,
    onProgress?: (batchProgress: number, currentTask?: ConversionTask) => void,
    callbacks?: BatchRuntimeCallbacks
  ): Promise<BatchTask> {
    return await convertBatchTask(batchTask, this.getBatchOrchestratorDeps(), onProgress, callbacks)
  }

  // 单个视频转存
  static async convertSingle(
    task: ConversionTask,
    parserConfig: VideoParserConfig,
    webdavConfig: WebDAVConfig,
    onProgress?: (progress: number, status: TaskStatus) => void,
    callbacks?: BatchRuntimeCallbacks
  ): Promise<ConversionTask> {
    return await convertSingleTask(
      task,
      parserConfig,
      webdavConfig,
      this.getBatchOrchestratorDeps(),
      onProgress,
      callbacks
    )
  }

  // 仅解析视频链接（不上传）
  static async parseOnly(videoUrl: string, parserConfig: VideoParserConfig): Promise<ParsedVideoInfo> {
    return await this.parseVideo(videoUrl, parserConfig)
  }

  // 上传已解析的媒体（基于预览数据）
  static async uploadParsedMedia(
    parsedInfo: ParsedVideoInfo,
    webdavConfig: WebDAVConfig,
    folderPath?: string,
    onProgress?: (progress: number, hint: string) => void,
    sourceUrl?: string
  ): Promise<string> {
    console.log(`[上传] 开始上传已解析的媒体: ${parsedInfo.title}`)
    return await this.uploadToWebDAV(parsedInfo, webdavConfig, folderPath, onProgress, sourceUrl)
  }

  // 解析视频链接
  static async parseVideo(videoUrl: string, parserConfig: VideoParserConfig): Promise<ParsedVideoInfo> {
    if (!videoUrl || typeof videoUrl !== 'string' || !videoUrl.trim()) {
      throw new Error('视频URL为空')
    }
    
    if (!parserConfig || !parserConfig.apiUrl) {
      throw new Error('解析API配置无效')
    }
    
    const extractedUrl = extractRealVideoUrl(videoUrl)
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
      const { parsedInfo, usedParser } = await parseVideoWithFallback(videoUrl, parserConfig)
      this.setParseCache(cacheKey, parsedInfo)

      if (usedParser.id !== parserConfig.id) {
        this.setParseCache(this.buildParseCacheKey(extractedUrl, usedParser), parsedInfo)
      }

      console.log(`[转存] 解析成功，获取到${parsedInfo.mediaType === MediaType.VIDEO ? '视频' : '图集'}: ${parsedInfo.title}`)
      return this.cloneParsedInfo(parsedInfo)
    })()

    this.parseInFlight.set(cacheKey, parsePromise)

    try {
      return await parsePromise
    } finally {
      this.parseInFlight.delete(cacheKey)
    }
  }
}
