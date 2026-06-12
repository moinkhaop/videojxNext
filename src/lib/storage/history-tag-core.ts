import { HistoryRecord, HistoryStats, Tag, TaskStatus } from '../../types'
import { createUuid, getScopedStorageItem, isUuid, setScopedStorageItem } from './config-core'

function normalizeDate(value: unknown, fallback: Date): Date {
  const parsed = value instanceof Date ? value : new Date(value as any)
  return Number.isNaN(parsed.getTime()) ? fallback : parsed
}

export function normalizeHistoryRecord(record: any): HistoryRecord {
  const createdAt = normalizeDate(record?.createdAt, new Date())
  const rawTask = record?.task && typeof record.task === 'object' ? record.task : {}
  const taskCreatedAt = normalizeDate(rawTask.createdAt, createdAt)

  return {
    ...record,
    id: isUuid(record?.id) ? record.id : createUuid(),
    createdAt,
    task: {
      ...rawTask,
      createdAt: taskCreatedAt,
      completedAt: rawTask.completedAt
        ? normalizeDate(rawTask.completedAt, taskCreatedAt)
        : undefined,
    },
    lastViewedAt: record?.lastViewedAt
      ? normalizeDate(record.lastViewedAt, createdAt)
      : undefined,
  } as HistoryRecord
}

export function readHistoryRecords(storageKey: string): { changed: boolean; records: HistoryRecord[] } {
  const stored = getScopedStorageItem(storageKey)
  if (!stored) {
    return {
      changed: false,
      records: [],
    }
  }

  const records = JSON.parse(stored)
  if (!Array.isArray(records)) {
    return {
      changed: false,
      records: [],
    }
  }

  let changed = false
  const normalized = records.map((record: any) => {
    if (!isUuid(record?.id)) {
      changed = true
    }
    return normalizeHistoryRecord(record)
  })

  return {
    changed,
    records: normalized,
  }
}

export function writeHistoryRecords(storageKey: string, records: HistoryRecord[]): void {
  setScopedStorageItem(storageKey, JSON.stringify(records))
}

export function matchesHistoryRecordKeyword(record: HistoryRecord, keyword: string): boolean {
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

export function getHistoryStatistics(records: HistoryRecord[]): HistoryStats {
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

    if (task.status === TaskStatus.SUCCESS) totalSuccess++
    else if (task.status === TaskStatus.FAILED) totalFailed++
    else totalPending++

    const recordDate = new Date(record.createdAt)
    if (recordDate >= today) todayRecords++
    if (recordDate >= weekAgo) thisWeekRecords++
    if (recordDate >= monthStart) thisMonthRecords++

    if (record.isFavorite) favoriteCount++

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
    tagUsage,
  }
}

export function exportHistoryRecordsToCSV(records: HistoryRecord[]): string {
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
      task.uploadResult?.filePath || '',
    ].map(field => `"${String(field).replace(/"/g, '""')}"`)
  })

  return [headers.join(','), ...rows.map(row => row.join(','))].join('\n')
}

export function exportHistoryRecordsToJSON(records: HistoryRecord[]): string {
  return JSON.stringify(records, null, 2)
}

export function filterHistoryRecordsByDateRange(records: HistoryRecord[], startDate: Date, endDate: Date): HistoryRecord[] {
  return records.filter(record => {
    const recordDate = new Date(record.createdAt)
    return recordDate >= startDate && recordDate <= endDate
  })
}

export function filterHistoryRecordsByAuthor(records: HistoryRecord[], author: string): HistoryRecord[] {
  return records.filter(record => {
    const task = record.task as any
    return task.parsedVideoInfo?.author?.toLowerCase().includes(author.toLowerCase())
  })
}

export function filterFavoriteHistoryRecords(records: HistoryRecord[]): HistoryRecord[] {
  return records.filter(record => record.isFavorite)
}

export function filterHistoryRecordsByTag(records: HistoryRecord[], tagId: string): HistoryRecord[] {
  return records.filter(record => Array.isArray(record.tags) && record.tags.includes(tagId))
}

export function rewriteHistoryTagIds(records: HistoryRecord[], idMap: Map<string, string>): {
  changed: boolean
  records: HistoryRecord[]
} {
  let changed = false

  const updatedRecords = records.map(record => {
    if (!record.tags || record.tags.length === 0) {
      return record
    }

    const nextTags = record.tags.map(tagId => idMap.get(tagId) ?? tagId)
    const different = nextTags.some((value, index) => value !== record.tags![index])
    if (!different) {
      return record
    }

    changed = true
    return { ...record, tags: nextTags }
  })

  return {
    changed,
    records: updatedRecords,
  }
}

export function readStoredTags(storageKey: string): {
  changed: boolean
  idMap: Map<string, string>
  tags: Tag[] | null
} {
  const stored = getScopedStorageItem(storageKey)
  if (!stored) {
    return {
      changed: false,
      idMap: new Map<string, string>(),
      tags: null,
    }
  }

  const raw = JSON.parse(stored)
  if (!Array.isArray(raw)) {
    throw new Error('标签数据格式无效')
  }

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
      createdAt: new Date(tag.createdAt),
    }
  })

  return {
    changed,
    idMap,
    tags,
  }
}

export function createDefaultTags(): Tag[] {
  return [
    {
      id: createUuid(),
      name: '工作',
      color: 'blue',
      createdAt: new Date(),
    },
    {
      id: createUuid(),
      name: '个人',
      color: 'green',
      createdAt: new Date(),
    },
    {
      id: createUuid(),
      name: '重要',
      color: 'red',
      createdAt: new Date(),
    },
    {
      id: createUuid(),
      name: '归档',
      color: 'gray',
      createdAt: new Date(),
    },
  ]
}

export function writeTags(storageKey: string, tags: Tag[]): void {
  setScopedStorageItem(storageKey, JSON.stringify(tags))
}

export function createTagRecord(tag: Omit<Tag, 'id' | 'createdAt'>): Tag {
  return {
    id: createUuid(),
    ...tag,
    createdAt: new Date(),
  }
}
