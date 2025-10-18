/**
 * 高级数据分析服务
 *
 * 功能：
 * 1. 下载趋势分析
 * 2. 平台分布统计
 * 3. 作者排行榜
 * 4. 时间分布分析
 * 5. 成功率趋势
 * 6. 存储空间统计
 */

import { HistoryRecord, ConversionTask, TaskStatus, ParsedVideoInfo } from '@/types'
import { HistoryManager } from './storage'

// 时间范围枚举
export enum TimeRange {
  TODAY = 'today',
  WEEK = 'week',
  MONTH = 'month',
  QUARTER = 'quarter',
  YEAR = 'year',
  ALL = 'all'
}

// 时间序列数据点
export interface TimeSeriesDataPoint {
  date: string                        // YYYY-MM-DD
  count: number
  successCount: number
  failedCount: number
  successRate: number                 // 百分比
}

// 平台统计数据
export interface PlatformStats {
  platform: string
  count: number
  percentage: number
  successCount: number
  failedCount: number
  totalSize: number                   // 字节
}

// 作者统计数据
export interface AuthorStats {
  author: string
  avatar?: string
  videoCount: number
  totalViews: number
  totalLikes: number
  averageViews: number
  mostPopularVideo?: {
    title: string
    views: number
    likes: number
  }
}

// 下载时段分析
export interface HourlyDistribution {
  hour: number                        // 0-23
  count: number
  percentage: number
}

// 综合分析报告
export interface AnalyticsReport {
  timeRange: TimeRange
  generatedAt: Date

  // 总体统计
  totalDownloads: number
  successfulDownloads: number
  failedDownloads: number
  successRate: number

  // 趋势数据
  timeSeries: TimeSeriesDataPoint[]

  // 平台分布
  platformStats: PlatformStats[]

  // 作者排行
  topAuthors: AuthorStats[]

  // 时间分布
  hourlyDistribution: HourlyDistribution[]

  // 存储统计
  totalStorageUsed: number            // 字节
  averageFileSize: number             // 字节
  largestFile: {
    title: string
    size: number
  } | null

  // 增长趋势
  growthRate: number                  // 相对于上一周期的增长率
  downloadVelocity: number            // 每天平均下载数
}

export class AnalyticsService {
  // 获取时间范围的开始日期
  private static getStartDate(range: TimeRange): Date {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    switch (range) {
      case TimeRange.TODAY:
        return today
      case TimeRange.WEEK:
        const weekAgo = new Date(today)
        weekAgo.setDate(today.getDate() - 7)
        return weekAgo
      case TimeRange.MONTH:
        const monthAgo = new Date(today)
        monthAgo.setMonth(today.getMonth() - 1)
        return monthAgo
      case TimeRange.QUARTER:
        const quarterAgo = new Date(today)
        quarterAgo.setMonth(today.getMonth() - 3)
        return quarterAgo
      case TimeRange.YEAR:
        const yearAgo = new Date(today)
        yearAgo.setFullYear(today.getFullYear() - 1)
        return yearAgo
      case TimeRange.ALL:
        return new Date(0) // 从1970年开始
    }
  }

  // 筛选时间范围内的记录
  private static filterByTimeRange(records: HistoryRecord[], range: TimeRange): HistoryRecord[] {
    const startDate = this.getStartDate(range)
    return records.filter(record => new Date(record.createdAt) >= startDate)
  }

  // 检测平台
  private static detectPlatform(url: string): string {
    if (!url) return '未知'

    const platformPatterns: Record<string, RegExp> = {
      '抖音': /douyin\.com|iesdouyin\.com/i,
      '快手': /kuaishou\.com|gifshow\.com/i,
      'B站': /bilibili\.com|b23\.tv/i,
      '小红书': /xiaohongshu\.com|xhslink\.com/i,
      '微博': /weibo\.com/i,
      '知乎': /zhihu\.com/i,
      'YouTube': /youtube\.com|youtu\.be/i,
      'TikTok': /tiktok\.com/i,
      'Instagram': /instagram\.com/i,
      'Twitter': /twitter\.com|x\.com/i
    }

    for (const [platform, pattern] of Object.entries(platformPatterns)) {
      if (pattern.test(url)) {
        return platform
      }
    }

    return '其他'
  }

  // 生成时间序列数据
  private static generateTimeSeries(records: HistoryRecord[], range: TimeRange): TimeSeriesDataPoint[] {
    const startDate = this.getStartDate(range)
    const endDate = new Date()
    const dataPoints: Map<string, TimeSeriesDataPoint> = new Map()

    // 初始化所有日期的数据点
    const currentDate = new Date(startDate)
    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split('T')[0]
      dataPoints.set(dateStr, {
        date: dateStr,
        count: 0,
        successCount: 0,
        failedCount: 0,
        successRate: 0
      })
      currentDate.setDate(currentDate.getDate() + 1)
    }

    // 填充实际数据
    records.forEach(record => {
      const dateStr = new Date(record.createdAt).toISOString().split('T')[0]
      const dataPoint = dataPoints.get(dateStr)

      if (dataPoint) {
        dataPoint.count++
        const task = record.task as ConversionTask
        if (task.status === TaskStatus.SUCCESS) {
          dataPoint.successCount++
        } else if (task.status === TaskStatus.FAILED) {
          dataPoint.failedCount++
        }
      }
    })

    // 计算成功率
    dataPoints.forEach(point => {
      if (point.count > 0) {
        point.successRate = Math.round((point.successCount / point.count) * 100)
      }
    })

    return Array.from(dataPoints.values()).sort((a, b) => a.date.localeCompare(b.date))
  }

  // 生成平台统计
  private static generatePlatformStats(records: HistoryRecord[]): PlatformStats[] {
    const platformMap: Map<string, PlatformStats> = new Map()

    records.forEach(record => {
      const task = record.task as ConversionTask
      const platform = this.detectPlatform(task.videoUrl || '')

      if (!platformMap.has(platform)) {
        platformMap.set(platform, {
          platform,
          count: 0,
          percentage: 0,
          successCount: 0,
          failedCount: 0,
          totalSize: 0
        })
      }

      const stats = platformMap.get(platform)!
      stats.count++

      if (task.status === TaskStatus.SUCCESS) {
        stats.successCount++
      } else if (task.status === TaskStatus.FAILED) {
        stats.failedCount++
      }

      if (task.parsedVideoInfo?.fileSize) {
        stats.totalSize += task.parsedVideoInfo.fileSize
      }
    })

    // 计算百分比
    const total = records.length
    platformMap.forEach(stats => {
      stats.percentage = Math.round((stats.count / total) * 100)
    })

    return Array.from(platformMap.values()).sort((a, b) => b.count - a.count)
  }

  // 生成作者统计
  private static generateAuthorStats(records: HistoryRecord[], topN: number = 10): AuthorStats[] {
    const authorMap: Map<string, AuthorStats> = new Map()

    records.forEach(record => {
      const task = record.task as ConversionTask
      const info = task.parsedVideoInfo

      if (!info || !info.author) return

      const author = info.author

      if (!authorMap.has(author)) {
        authorMap.set(author, {
          author,
          avatar: info.avatar,
          videoCount: 0,
          totalViews: 0,
          totalLikes: 0,
          averageViews: 0,
          mostPopularVideo: undefined
        })
      }

      const stats = authorMap.get(author)!
      stats.videoCount++

      // 累加观看数和点赞数
      const views = this.parseCount(info.viewCount)
      const likes = info.like || 0

      stats.totalViews += views
      stats.totalLikes += likes

      // 更新最受欢迎的视频
      if (!stats.mostPopularVideo || views > stats.mostPopularVideo.views) {
        stats.mostPopularVideo = {
          title: info.title,
          views,
          likes
        }
      }
    })

    // 计算平均值
    authorMap.forEach(stats => {
      stats.averageViews = stats.videoCount > 0 ? Math.round(stats.totalViews / stats.videoCount) : 0
    })

    return Array.from(authorMap.values())
      .sort((a, b) => b.videoCount - a.videoCount)
      .slice(0, topN)
  }

  // 解析观看数字符串（如 "1.2万"）
  private static parseCount(countStr: string | undefined): number {
    if (!countStr) return 0

    const str = countStr.toString().trim()

    // 处理中文单位
    if (str.includes('万')) {
      const num = parseFloat(str.replace('万', ''))
      return Math.round(num * 10000)
    }
    if (str.includes('亿')) {
      const num = parseFloat(str.replace('亿', ''))
      return Math.round(num * 100000000)
    }

    // 处理英文单位
    if (str.toUpperCase().includes('K')) {
      const num = parseFloat(str.replace(/[Kk]/g, ''))
      return Math.round(num * 1000)
    }
    if (str.toUpperCase().includes('M')) {
      const num = parseFloat(str.replace(/[Mm]/g, ''))
      return Math.round(num * 1000000)
    }

    return parseInt(str.replace(/[^0-9]/g, '')) || 0
  }

  // 生成时段分布
  private static generateHourlyDistribution(records: HistoryRecord[]): HourlyDistribution[] {
    const hourMap: Map<number, number> = new Map()

    // 初始化24小时
    for (let i = 0; i < 24; i++) {
      hourMap.set(i, 0)
    }

    records.forEach(record => {
      const hour = new Date(record.createdAt).getHours()
      hourMap.set(hour, (hourMap.get(hour) || 0) + 1)
    })

    const total = records.length

    return Array.from(hourMap.entries()).map(([hour, count]) => ({
      hour,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0
    }))
  }

  // 计算存储统计
  private static calculateStorageStats(records: HistoryRecord[]): {
    totalSize: number
    averageSize: number
    largest: { title: string; size: number } | null
  } {
    let totalSize = 0
    let count = 0
    let largest: { title: string; size: number } | null = null

    records.forEach(record => {
      const task = record.task as ConversionTask
      const size = task.parsedVideoInfo?.fileSize

      if (size) {
        totalSize += size
        count++

        if (!largest || size > largest.size) {
          largest = {
            title: task.videoTitle || '未知',
            size
          }
        }
      }
    })

    return {
      totalSize,
      averageSize: count > 0 ? Math.round(totalSize / count) : 0,
      largest
    }
  }

  // 计算增长率
  private static calculateGrowthRate(records: HistoryRecord[], range: TimeRange): number {
    const endDate = new Date()
    const midDate = new Date(endDate)

    switch (range) {
      case TimeRange.WEEK:
        midDate.setDate(endDate.getDate() - 3.5)
        break
      case TimeRange.MONTH:
        midDate.setDate(endDate.getDate() - 15)
        break
      case TimeRange.QUARTER:
        midDate.setDate(endDate.getDate() - 45)
        break
      case TimeRange.YEAR:
        midDate.setDate(endDate.getDate() - 182.5)
        break
      default:
        return 0
    }

    const recentRecords = records.filter(r => new Date(r.createdAt) >= midDate)
    const olderRecords = records.filter(r => new Date(r.createdAt) < midDate)

    if (olderRecords.length === 0) return 100

    return Math.round(((recentRecords.length - olderRecords.length) / olderRecords.length) * 100)
  }

  // 生成完整分析报告
  static generateReport(range: TimeRange = TimeRange.MONTH): AnalyticsReport {
    const allRecords = HistoryManager.getHistory()
    const records = this.filterByTimeRange(allRecords, range)

    const successfulDownloads = records.filter(r => (r.task as ConversionTask).status === TaskStatus.SUCCESS).length
    const failedDownloads = records.filter(r => (r.task as ConversionTask).status === TaskStatus.FAILED).length
    const successRate = records.length > 0 ? Math.round((successfulDownloads / records.length) * 100) : 0

    const storageStats = this.calculateStorageStats(records)
    const growthRate = this.calculateGrowthRate(records, range)

    // 计算下载速度
    const days = Math.max(1, Math.ceil((new Date().getTime() - this.getStartDate(range).getTime()) / (1000 * 60 * 60 * 24)))
    const downloadVelocity = parseFloat((records.length / days).toFixed(2))

    return {
      timeRange: range,
      generatedAt: new Date(),

      totalDownloads: records.length,
      successfulDownloads,
      failedDownloads,
      successRate,

      timeSeries: this.generateTimeSeries(records, range),
      platformStats: this.generatePlatformStats(records),
      topAuthors: this.generateAuthorStats(records),
      hourlyDistribution: this.generateHourlyDistribution(records),

      totalStorageUsed: storageStats.totalSize,
      averageFileSize: storageStats.averageSize,
      largestFile: storageStats.largest,

      growthRate,
      downloadVelocity
    }
  }

  // 导出报告为JSON
  static exportReportAsJSON(report: AnalyticsReport): string {
    return JSON.stringify(report, null, 2)
  }

  // 导出报告为CSV
  static exportReportAsCSV(report: AnalyticsReport): string {
    const lines: string[] = []

    // 总体统计
    lines.push('# 总体统计')
    lines.push('指标,数值')
    lines.push(`总下载数,${report.totalDownloads}`)
    lines.push(`成功下载,${report.successfulDownloads}`)
    lines.push(`失败下载,${report.failedDownloads}`)
    lines.push(`成功率,${report.successRate}%`)
    lines.push('')

    // 平台统计
    lines.push('# 平台分布')
    lines.push('平台,下载数,百分比,成功数,失败数')
    report.platformStats.forEach(stat => {
      lines.push(`${stat.platform},${stat.count},${stat.percentage}%,${stat.successCount},${stat.failedCount}`)
    })
    lines.push('')

    // 作者统计
    lines.push('# 作者排行')
    lines.push('作者,视频数,总观看数,总点赞数,平均观看数')
    report.topAuthors.forEach(author => {
      lines.push(`${author.author},${author.videoCount},${author.totalViews},${author.totalLikes},${author.averageViews}`)
    })

    return lines.join('\n')
  }

  // 格式化文件大小
  static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'

    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const k = 1024
    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`
  }

  // 格式化数字（添加千位分隔符）
  static formatNumber(num: number): string {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  }
}
