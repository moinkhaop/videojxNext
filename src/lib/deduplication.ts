/**
 * 智能去重系统
 *
 * 功能：
 * 1. URL去重检测
 * 2. 内容指纹去重（基于标题+作者+时长）
 * 3. 去重策略配置
 * 4. 去重记录管理
 */

import { HistoryRecord, ConversionTask, ParsedVideoInfo } from '@/types'
import { HistoryManager } from './storage'

// 去重策略枚举
export enum DeduplicationStrategy {
  URL_ONLY = 'url_only',              // 仅URL去重
  CONTENT_FINGERPRINT = 'content_fingerprint',  // 内容指纹去重
  STRICT = 'strict',                  // 严格模式（URL + 内容）
  DISABLED = 'disabled'               // 禁用去重
}

// 去重配置接口
export interface DeduplicationConfig {
  strategy: DeduplicationStrategy
  checkBeforeDownload: boolean        // 下载前检查
  autoSkipDuplicates: boolean         // 自动跳过重复项
  showDuplicateWarning: boolean       // 显示重复警告
  similarityThreshold: number         // 相似度阈值 (0-1)
}

// 去重检测结果
export interface DeduplicationResult {
  isDuplicate: boolean
  confidence: number                  // 置信度 (0-1)
  matchedRecord?: HistoryRecord       // 匹配的历史记录
  matchReason: string                 // 匹配原因
  suggestions: string[]               // 建议
}

// 内容指纹
export interface ContentFingerprint {
  titleHash: string
  authorHash: string
  durationHash: string
  compositeHash: string               // 组合哈希
}

export class DeduplicationService {
  private static readonly CONFIG_KEY = 'dyjx_deduplication_config'
  private static readonly DUPLICATE_LOG_KEY = 'dyjx_duplicate_log'

  // 获取去重配置
  static getConfig(): DeduplicationConfig {
    const defaultConfig: DeduplicationConfig = {
      strategy: DeduplicationStrategy.CONTENT_FINGERPRINT,
      checkBeforeDownload: true,
      autoSkipDuplicates: false,
      showDuplicateWarning: true,
      similarityThreshold: 0.85
    }

    try {
      const stored = localStorage.getItem(this.CONFIG_KEY)
      if (stored) {
        return { ...defaultConfig, ...JSON.parse(stored) }
      }
    } catch (error) {
      console.error('获取去重配置失败:', error)
    }

    return defaultConfig
  }

  // 保存去重配置
  static saveConfig(config: DeduplicationConfig): void {
    try {
      localStorage.setItem(this.CONFIG_KEY, JSON.stringify(config))
    } catch (error) {
      console.error('保存去重配置失败:', error)
    }
  }

  // 生成简单哈希
  private static simpleHash(str: string): string {
    if (!str) return ''

    // 规范化字符串
    const normalized = str.toLowerCase().trim().replace(/\s+/g, ' ')

    let hash = 0
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32bit integer
    }

    return Math.abs(hash).toString(36)
  }

  // 生成内容指纹
  static generateFingerprint(info: ParsedVideoInfo): ContentFingerprint {
    const titleHash = this.simpleHash(info.title || '')
    const authorHash = this.simpleHash(info.author || '')
    const durationHash = info.duration ? this.simpleHash(info.duration.toString()) : ''

    // 组合哈希
    const compositeHash = this.simpleHash(
      `${titleHash}:${authorHash}:${durationHash}`
    )

    return {
      titleHash,
      authorHash,
      durationHash,
      compositeHash
    }
  }

  // 规范化URL（去除查询参数和片段）
  private static normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url)
      return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`.toLowerCase()
    } catch {
      return url.toLowerCase().trim()
    }
  }

  // 检查URL是否重复
  private static checkUrlDuplication(url: string, history: HistoryRecord[]): DeduplicationResult {
    const normalizedUrl = this.normalizeUrl(url)

    for (const record of history) {
      const task = record.task as ConversionTask
      if (task.videoUrl) {
        const recordUrl = this.normalizeUrl(task.videoUrl)

        if (normalizedUrl === recordUrl) {
          return {
            isDuplicate: true,
            confidence: 1.0,
            matchedRecord: record,
            matchReason: 'URL完全匹配',
            suggestions: [
              '此视频链接已经下载过',
              `下载时间: ${record.createdAt.toLocaleString()}`,
              task.videoTitle ? `标题: ${task.videoTitle}` : ''
            ].filter(Boolean)
          }
        }
      }
    }

    return {
      isDuplicate: false,
      confidence: 0,
      matchReason: '未发现URL重复',
      suggestions: []
    }
  }

  // 检查内容指纹是否重复
  private static checkContentDuplication(
    info: ParsedVideoInfo,
    history: HistoryRecord[],
    threshold: number
  ): DeduplicationResult {
    const fingerprint = this.generateFingerprint(info)
    let bestMatch: { record: HistoryRecord; similarity: number } | null = null

    for (const record of history) {
      const task = record.task as ConversionTask
      if (task.parsedVideoInfo) {
        const recordFingerprint = this.generateFingerprint(task.parsedVideoInfo)
        const similarity = this.calculateSimilarity(fingerprint, recordFingerprint, info, task.parsedVideoInfo)

        if (similarity >= threshold) {
          if (!bestMatch || similarity > bestMatch.similarity) {
            bestMatch = { record, similarity }
          }
        }
      }
    }

    if (bestMatch) {
      const task = bestMatch.record.task as ConversionTask
      return {
        isDuplicate: true,
        confidence: bestMatch.similarity,
        matchedRecord: bestMatch.record,
        matchReason: '内容指纹相似',
        suggestions: [
          `相似度: ${(bestMatch.similarity * 100).toFixed(1)}%`,
          `可能是同一视频`,
          `历史记录标题: ${task.videoTitle || '未知'}`,
          `下载时间: ${bestMatch.record.createdAt.toLocaleString()}`
        ]
      }
    }

    return {
      isDuplicate: false,
      confidence: 0,
      matchReason: '未发现内容重复',
      suggestions: []
    }
  }

  // 计算内容相似度
  private static calculateSimilarity(
    fp1: ContentFingerprint,
    fp2: ContentFingerprint,
    info1: ParsedVideoInfo,
    info2: ParsedVideoInfo
  ): number {
    let score = 0
    let weight = 0

    // 标题相似度（权重最高）
    if (fp1.titleHash === fp2.titleHash) {
      score += 0.6
    } else {
      const titleSim = this.stringSimilarity(info1.title || '', info2.title || '')
      score += titleSim * 0.6
    }
    weight += 0.6

    // 作者相似度
    if (fp1.authorHash && fp2.authorHash) {
      if (fp1.authorHash === fp2.authorHash) {
        score += 0.3
      }
      weight += 0.3
    }

    // 时长相似度
    if (info1.duration && info2.duration) {
      const durationDiff = Math.abs(info1.duration - info2.duration)
      if (durationDiff <= 2) { // 2秒内视为相同
        score += 0.1
      }
      weight += 0.1
    }

    return weight > 0 ? score / weight : 0
  }

  // 字符串相似度（简化版Levenshtein距离）
  private static stringSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase().trim()
    const s2 = str2.toLowerCase().trim()

    if (s1 === s2) return 1.0
    if (s1.length === 0 || s2.length === 0) return 0

    // 简化版：基于公共子串
    const longer = s1.length > s2.length ? s1 : s2
    const shorter = s1.length > s2.length ? s2 : s1

    if (longer.includes(shorter)) {
      return shorter.length / longer.length
    }

    // 计算公共字符比例
    const s1Chars = new Set(s1)
    const s2Chars = new Set(s2)
    const commonChars = new Set(Array.from(s1Chars).filter(c => s2Chars.has(c)))

    return (commonChars.size * 2) / (s1Chars.size + s2Chars.size)
  }

  // 综合检查重复（主入口）
  static checkDuplication(
    url?: string,
    info?: ParsedVideoInfo
  ): DeduplicationResult {
    const config = this.getConfig()

    if (config.strategy === DeduplicationStrategy.DISABLED) {
      return {
        isDuplicate: false,
        confidence: 0,
        matchReason: '去重功能已禁用',
        suggestions: []
      }
    }

    const history = HistoryManager.getHistory()

    // URL检查
    if (url && (config.strategy === DeduplicationStrategy.URL_ONLY || config.strategy === DeduplicationStrategy.STRICT)) {
      const urlResult = this.checkUrlDuplication(url, history)
      if (urlResult.isDuplicate) {
        this.logDuplicate(url, urlResult)
        return urlResult
      }
    }

    // 内容指纹检查
    if (info && (config.strategy === DeduplicationStrategy.CONTENT_FINGERPRINT || config.strategy === DeduplicationStrategy.STRICT)) {
      const contentResult = this.checkContentDuplication(info, history, config.similarityThreshold)
      if (contentResult.isDuplicate) {
        this.logDuplicate(url, contentResult)
        return contentResult
      }
    }

    return {
      isDuplicate: false,
      confidence: 0,
      matchReason: '未检测到重复',
      suggestions: ['这是一个新的下载项']
    }
  }

  // 记录重复检测日志
  private static logDuplicate(url: string | undefined, result: DeduplicationResult): void {
    try {
      const logs = this.getDuplicateLogs()
      logs.unshift({
        timestamp: new Date().toISOString(),
        url: url || 'N/A',
        confidence: result.confidence,
        matchReason: result.matchReason
      })

      // 限制日志数量
      if (logs.length > 100) {
        logs.splice(100)
      }

      localStorage.setItem(this.DUPLICATE_LOG_KEY, JSON.stringify(logs))
    } catch (error) {
      console.error('记录去重日志失败:', error)
    }
  }

  // 获取重复检测日志
  static getDuplicateLogs(): any[] {
    try {
      const stored = localStorage.getItem(this.DUPLICATE_LOG_KEY)
      if (stored) {
        return JSON.parse(stored)
      }
    } catch (error) {
      console.error('获取去重日志失败:', error)
    }
    return []
  }

  // 清除重复检测日志
  static clearDuplicateLogs(): void {
    try {
      localStorage.removeItem(this.DUPLICATE_LOG_KEY)
    } catch (error) {
      console.error('清除去重日志失败:', error)
    }
  }

  // 批量去重检查
  static checkBatchDuplication(urls: string[]): Map<string, DeduplicationResult> {
    const results = new Map<string, DeduplicationResult>()

    for (const url of urls) {
      const result = this.checkDuplication(url)
      results.set(url, result)
    }

    return results
  }

  // 获取去重统计
  static getDeduplicationStats(): {
    totalChecks: number
    duplicatesFound: number
    avgConfidence: number
  } {
    const logs = this.getDuplicateLogs()

    if (logs.length === 0) {
      return {
        totalChecks: 0,
        duplicatesFound: 0,
        avgConfidence: 0
      }
    }

    const duplicatesFound = logs.length
    const avgConfidence = logs.reduce((sum, log) => sum + (log.confidence || 0), 0) / logs.length

    return {
      totalChecks: logs.length,
      duplicatesFound,
      avgConfidence
    }
  }
}
