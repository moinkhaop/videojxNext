import type { ParserErrorClass } from '@/types'
import { classifyParserFailure } from '@/lib/parser-health'

export type InsightsRange = '7d' | '30d'

export type ParserInsight = {
  parserName: string
  total: number
  success: number
  failed: number
  partial: number
  successRate: number
  avgLatencyMs: number
}

export type FailureInsight = {
  class: ParserErrorClass
  count: number
}

export type InsightsSummary = {
  range: InsightsRange
  generatedAt: string
  total: number
  completed: number
  success: number
  failed: number
  partial: number
  successRate: number
  topFailures: FailureInsight[]
  parserInsights: ParserInsight[]
  operationSavings: {
    estimatedSavedSteps: number
    estimatedSavedMinutes: number
  }
  suggested: InsightsRecommendation[]
}

export type InsightsRecommendation =
  | {
      id: 'set_default_parser'
      title: string
      description: string
      payload: {
        parserName: string
      }
    }
  | {
      id: 'set_retry_policy'
      title: string
      description: string
      payload: {
        retryableClasses: ParserErrorClass[]
        maxRetries: number
        baseDelayMs: number
        maxDelayMs: number
      }
    }
  | {
      id: 'set_template_profile'
      title: string
      description: string
      payload: {
        profileId: string
      }
    }

type NormalizedRecord = {
  createdAtMs: number
  status: 'success' | 'failed' | 'partial' | 'other'
  parserName: string
  failureClass: ParserErrorClass | null
  latencyMs: number
  author: string
}

function toMs(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  const parsed = Date.parse(String(value || ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function asRecord(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, any>
}

function readRawStatus(input: Record<string, any>) {
  const direct = String(input.status || '').trim().toLowerCase()
  if (direct) return direct
  const task = asRecord(input.task)
  return String(task.status || '').trim().toLowerCase()
}

function normalizeStatus(rawStatus: string): NormalizedRecord['status'] {
  if (rawStatus === 'success' || rawStatus === 'completed') return 'success'
  if (rawStatus === 'failed' || rawStatus === 'error') return 'failed'
  if (rawStatus === 'partial') return 'partial'
  return 'other'
}

function readParserName(input: Record<string, any>): string {
  const detail = asRecord(input.detail)
  const task = asRecord(input.task)
  const taskParser = asRecord(task.parserConfig)
  return String(
    detail.parserName ||
      taskParser.name ||
      task.parserName ||
      '-'
  ).trim() || '-'
}

function readFailureClass(input: Record<string, any>, status: NormalizedRecord['status']): ParserErrorClass | null {
  if (status !== 'failed') return null
  const detail = asRecord(input.detail)
  const task = asRecord(input.task)
  const taskError = String(task.error || '')
  const detailError = String(detail.error || '')
  const directClass = String(detail.failureClass || input.failureClass || '').trim() as ParserErrorClass
  if (directClass) {
    return directClass
  }
  return classifyParserFailure({
    status: detail.status,
    message: detailError || taskError,
  })
}

function readLatencyMs(input: Record<string, any>): number {
  const detail = asRecord(input.detail)
  const task = asRecord(input.task)
  const direct = Number(detail.latencyMs ?? task.latencyMs ?? 0)
  if (Number.isFinite(direct) && direct > 0) {
    return Math.floor(direct)
  }
  return 0
}

function readAuthor(input: Record<string, any>): string {
  const detail = asRecord(input.detail)
  const task = asRecord(input.task)
  const parsed = asRecord(task.parsedVideoInfo)
  return String(detail.author || parsed.author || '').trim()
}

function normalizeHistoryRecord(row: unknown): NormalizedRecord {
  const input = asRecord(row)
  const createdAtMs = toMs(input.createdAt || input.updatedAt || Date.now())
  const status = normalizeStatus(readRawStatus(input))
  return {
    createdAtMs,
    status,
    parserName: readParserName(input),
    failureClass: readFailureClass(input, status),
    latencyMs: readLatencyMs(input),
    author: readAuthor(input),
  }
}

export function computeInsightsSummary(records: unknown[], range: InsightsRange, now = Date.now()): InsightsSummary {
  const durationMs = range === '30d' ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000
  const fromMs = now - durationMs
  const normalized = (Array.isArray(records) ? records : [])
    .map(normalizeHistoryRecord)
    .filter(item => item.createdAtMs >= fromMs)

  const success = normalized.filter(item => item.status === 'success').length
  const failed = normalized.filter(item => item.status === 'failed').length
  const partial = normalized.filter(item => item.status === 'partial').length
  const completed = success + failed + partial
  const successRate = completed > 0 ? Math.round((success / completed) * 1000) / 10 : 0

  const failureStats = new Map<ParserErrorClass, number>()
  for (const item of normalized) {
    if (item.status !== 'failed' || !item.failureClass) continue
    failureStats.set(item.failureClass, (failureStats.get(item.failureClass) || 0) + 1)
  }
  const topFailures: FailureInsight[] = Array.from(failureStats.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([clazz, count]) => ({ class: clazz, count }))

  const parserMap = new Map<string, { total: number; success: number; failed: number; partial: number; latency: number; latencyCount: number }>()
  for (const item of normalized) {
    if (!parserMap.has(item.parserName)) {
      parserMap.set(item.parserName, {
        total: 0,
        success: 0,
        failed: 0,
        partial: 0,
        latency: 0,
        latencyCount: 0,
      })
    }
    const current = parserMap.get(item.parserName)!
    current.total += 1
    if (item.status === 'success') current.success += 1
    if (item.status === 'failed') current.failed += 1
    if (item.status === 'partial') current.partial += 1
    if (item.latencyMs > 0) {
      current.latency += item.latencyMs
      current.latencyCount += 1
    }
  }
  const parserInsights: ParserInsight[] = Array.from(parserMap.entries())
    .map(([parserName, item]) => ({
      parserName,
      total: item.total,
      success: item.success,
      failed: item.failed,
      partial: item.partial,
      successRate: item.total > 0 ? Math.round((item.success / item.total) * 1000) / 10 : 0,
      avgLatencyMs: item.latencyCount > 0 ? Math.round(item.latency / item.latencyCount) : 0,
    }))
    .sort((a, b) => {
      if (b.successRate !== a.successRate) return b.successRate - a.successRate
      return b.total - a.total
    })

  const authorsKnown = normalized.filter(item => item.author.length > 0).length
  const authorMissingRatio = normalized.length > 0 ? (normalized.length - authorsKnown) / normalized.length : 0
  const estimatedSavedSteps = Math.max(0, success * 4)
  const estimatedSavedMinutes = Math.round((estimatedSavedSteps * 2.5) / 60 * 10) / 10

  const suggested: InsightsRecommendation[] = []
  const bestParser = parserInsights.find(item => item.total >= 3 && item.parserName !== '-')
  if (bestParser) {
    suggested.push({
      id: 'set_default_parser',
      title: `推荐默认解析器：${bestParser.parserName}`,
      description: `近 ${range} 成功率 ${bestParser.successRate}%（样本 ${bestParser.total}）`,
      payload: {
        parserName: bestParser.parserName,
      },
    })
  }

  const topFailure = topFailures[0]
  if (topFailure && ['timeout', 'network', 'http5xx'].includes(topFailure.class)) {
    suggested.push({
      id: 'set_retry_policy',
      title: '推荐重试策略：偏向可恢复错误',
      description: `当前主要失败类型为 ${topFailure.class}，建议仅重试可恢复错误并保持指数退避`,
      payload: {
        retryableClasses: ['timeout', 'network', 'http5xx'],
        maxRetries: 2,
        baseDelayMs: 600,
        maxDelayMs: 12000,
      },
    })
  }

  const profileId = normalized.length > 30
    ? 'by_date'
    : (authorMissingRatio > 0.4 ? 'safe' : 'balanced')
  suggested.push({
    id: 'set_template_profile',
    title: `推荐命名模板：${profileId}`,
    description: profileId === 'by_date'
      ? '近期任务量较高，建议按日期归档以降低目录冲突'
      : (profileId === 'safe'
        ? '作者信息缺失较多，建议使用更稳健的保守模板'
        : '标题与 awemeId 信息较完整，建议使用信息丰富模板'),
    payload: {
      profileId,
    },
  })

  return {
    range,
    generatedAt: new Date(now).toISOString(),
    total: normalized.length,
    completed,
    success,
    failed,
    partial,
    successRate,
    topFailures,
    parserInsights,
    operationSavings: {
      estimatedSavedSteps,
      estimatedSavedMinutes,
    },
    suggested,
  }
}
