'use client'

import { useState, useEffect, useMemo, useCallback, useDeferredValue, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Grid3x3,
  List,
  Star,
  Video,
} from 'lucide-react'
import { HistoryRecord, TaskStatus, ConversionTask, HistoryStats, Tag, HistoryViewMode, HistorySortOption, MediaType, ImageInfo } from '@/types'
import { HistoryManager, TagManager } from '@/lib/storage'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import { CLOUD_STORAGE_SYNC_EVENT, hydrateFromSupabase } from '@/lib/storage/cloud-sync'
import { getMediaPreviewLabel } from '@/components/preview/media-helpers'
import {
  HistoryActiveFilterBadge,
  HistoryQuickFilterChip,
  HistorySelectedContextSummary,
  HistoryToolbar,
} from '@/components/history/HistoryToolbar'
import { HistoryPageHeader } from '@/components/history/HistoryPageHeader'
import { HistoryRecordsLayout } from '@/components/history/HistoryRecordsLayout'
import { HistoryStatsSection } from '@/components/history/HistoryStatsSection'

// 标签颜色映射
const TAG_COLORS = {
  blue: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300',
  green: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300',
  red: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300',
  yellow: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300',
  purple: 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300',
  pink: 'bg-pink-100 text-pink-800 border-pink-200 dark:bg-pink-900/30 dark:text-pink-300',
  gray: 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900/30 dark:text-gray-300',
  orange: 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300'
}

const ITEMS_PER_PAGE = 20

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const TagManagerDialog = dynamic(
  () => import('@/components/history/TagManagerDialog').then(mod => mod.TagManagerDialog)
)

const HistoryRecordJsonDialog = dynamic(
  () => import('@/components/history/HistoryRecordJsonDialog').then(mod => mod.HistoryRecordJsonDialog)
)

const HistoryDetailPanel = dynamic(
  () => import('@/components/history/HistoryDetailPanel').then(mod => mod.HistoryDetailPanel),
  {
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        详情面板加载中...
      </div>
    ),
  }
)

export default function HistoryPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()

  // 基础状态
  const [records, setRecords] = useState<HistoryRecord[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [stats, setStats] = useState<HistoryStats | null>(null)

  // 视图状态
  const [viewMode, setViewMode] = useState<HistoryViewMode>(HistoryViewMode.LIST)
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null)

  // 筛选和搜索状态
  const [searchTerm, setSearchTerm] = useState('')
  const deferredSearchTerm = useDeferredValue(searchTerm)
  const [filterType, setFilterType] = useState<'all' | 'single' | 'batch'>('all')
  const [filterStatus, setFilterStatus] = useState<'all' | TaskStatus>('all')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
  const [sortOption, setSortOption] = useState<HistorySortOption>(HistorySortOption.DATE_DESC)

  // UI状态
  const [showStats, setShowStats] = useState(true)
  const [showTagDialog, setShowTagDialog] = useState(false)
  const [showDetailDialog, setShowDetailDialog] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState('blue')
  const [batchSelectMode, setBatchSelectMode] = useState(false)
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([])
  const [refreshingCloud, setRefreshingCloud] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')

  // 分页状态
  const [currentPage, setCurrentPage] = useState(1)

  const loadData = useCallback(() => {
    const history = HistoryManager.getHistory()
    const allTags = TagManager.getTags()
    const statistics = HistoryManager.getStatistics(history)

    setRecords(history)
    setTags(allTags)
    setStats(statistics)
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    const handleCloudSynced = () => loadData()
    window.addEventListener(CLOUD_STORAGE_SYNC_EVENT, handleCloudSynced as EventListener)
    return () => {
      window.removeEventListener(CLOUD_STORAGE_SYNC_EVENT, handleCloudSynced as EventListener)
    }
  }, [loadData])

  // 筛选和排序逻辑
  const filteredAndSortedRecords = useMemo(() => {
    let filtered = records

    // 按收藏筛选
    if (showFavoritesOnly) {
      filtered = filtered.filter(record => record.isFavorite)
    }

    // 按类型筛选
    if (filterType !== 'all') {
      filtered = filtered.filter(record => record.type === filterType)
    }

    // 按状态筛选
    if (filterStatus !== 'all') {
      filtered = filtered.filter(record => record.task.status === filterStatus)
    }

    // 按标签筛选
    if (selectedTags.length > 0) {
      filtered = filtered.filter(record =>
        record.tags && selectedTags.every(tagId => record.tags!.includes(tagId))
      )
    }

    // 搜索筛选
    if (deferredSearchTerm.trim()) {
      const lowerKeyword = deferredSearchTerm.toLowerCase()
      filtered = filtered.filter(record => {
        return HistoryManager.matchesKeyword(record, lowerKeyword)
      })
    }

    // 排序
    const sorted = [...filtered]
    switch (sortOption) {
      case HistorySortOption.DATE_DESC:
        sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        break
      case HistorySortOption.DATE_ASC:
        sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        break
      case HistorySortOption.TITLE_ASC:
        sorted.sort((a, b) => {
          const titleA = (a.task as any).videoTitle || (a.task as any).name || ''
          const titleB = (b.task as any).videoTitle || (b.task as any).name || ''
          return titleA.localeCompare(titleB)
        })
        break
      case HistorySortOption.TITLE_DESC:
        sorted.sort((a, b) => {
          const titleA = (a.task as any).videoTitle || (a.task as any).name || ''
          const titleB = (b.task as any).videoTitle || (b.task as any).name || ''
          return titleB.localeCompare(titleA)
        })
        break
      case HistorySortOption.STATUS:
        sorted.sort((a, b) => a.task.status.localeCompare(b.task.status))
        break
    }

    return sorted
  }, [records, deferredSearchTerm, filterType, filterStatus, selectedTags, showFavoritesOnly, sortOption])

  useEffect(() => {
    setCurrentPage(1)
  }, [deferredSearchTerm, filterType, filterStatus, selectedTags, showFavoritesOnly, sortOption, viewMode])

  // 分页数据
  const paginatedRecords = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
    const endIndex = startIndex + ITEMS_PER_PAGE
    return filteredAndSortedRecords.slice(startIndex, endIndex)
  }, [filteredAndSortedRecords, currentPage])

  const selectedRecordIdSet = useMemo(() => new Set(selectedRecordIds), [selectedRecordIds])
  const tagMap = useMemo(() => new Map(tags.map(tag => [tag.id, tag])), [tags])
  const selectedRecord = useMemo(() => {
    if (!selectedRecordId) {
      return null
    }
    return records.find(record => record.id === selectedRecordId) ?? null
  }, [records, selectedRecordId])

  const totalPages = Math.max(1, Math.ceil(filteredAndSortedRecords.length / ITEMS_PER_PAGE))

  useEffect(() => {
    setCurrentPage(prev => Math.min(prev, totalPages))
  }, [totalPages])

  useEffect(() => {
    setSelectedRecordIds(prev => {
      const existingIds = new Set(records.map(record => record.id))
      return prev.filter(id => existingIds.has(id))
    })
  }, [records])

  useEffect(() => {
    if (!batchSelectMode) {
      setSelectedRecordIds([])
    }
  }, [batchSelectMode])

  useEffect(() => {
    setNoteDraft(selectedRecord?.notes || '')
  }, [selectedRecord?.notes, selectedRecordId])

  useEffect(() => {
    if (filteredAndSortedRecords.length === 0) {
      setSelectedRecordId(null)
      return
    }

    if (selectedRecordId && filteredAndSortedRecords.some(record => record.id === selectedRecordId)) {
      return
    }

    setSelectedRecordId(filteredAndSortedRecords[0].id)
  }, [filteredAndSortedRecords, selectedRecordId])

  const handleRefresh = useCallback(async () => {
    try {
      if (!authLoading && user?.id) {
        setRefreshingCloud(true)
        await hydrateFromSupabase()
      }
      loadData()
    } catch (error) {
      console.error('从云端刷新历史失败:', error)
      alert('从云端刷新历史失败，请稍后重试')
    } finally {
      setRefreshingCloud(false)
    }
  }, [authLoading, loadData, user?.id])

  // 操作处理函数
  const handleDeleteRecord = (id: string) => {
    if (confirm('确定要删除这条历史记录吗？')) {
      HistoryManager.deleteRecord(id)
      if (selectedRecordId === id) {
        setSelectedRecordId(null)
      }
      loadData()
    }
  }

  const handleToggleFavorite = (id: string) => {
    HistoryManager.toggleFavorite(id)
    loadData()
  }

  const handleCopyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      alert('链接已复制到剪贴板')
    } catch (err) {
      console.error('复制失败:', err)
      alert('复制失败，请手动复制')
    }
  }

  const handleOpenExternalLink = (url?: string) => {
    if (!url) return
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const handleRetryTask = (record: HistoryRecord) => {
    if (record.type === 'single') {
      const task = record.task as ConversionTask
      const encodedUrl = encodeURIComponent(task.videoUrl)
      router.push(`/convert?url=${encodedUrl}`)
    }
  }

  const handleRecordClick = useCallback((record: HistoryRecord) => {
    const viewedAt = new Date()
    setSelectedRecordId(record.id)
    setRecords(prev => prev.map(item => (
      item.id === record.id ? { ...item, lastViewedAt: viewedAt } : item
    )))
    HistoryManager.updateLastViewedAt(record.id, 30000)
  }, [])

  const handleAddTag = () => {
    if (!newTagName.trim()) return

    const newTag = TagManager.addTag({
      name: newTagName.trim(),
      color: newTagColor
    })

    setTags([...tags, newTag])
    setNewTagName('')
    setNewTagColor('blue')
    setShowTagDialog(false)
  }

  const handleDeleteTag = (tagId: string) => {
    if (confirm('确定要删除这个标签吗？所有记录中的此标签也会被移除。')) {
      TagManager.deleteTag(tagId)
      loadData()
    }
  }

  const handleToggleRecordTag = (recordId: string, tagId: string) => {
    const record = records.find(r => r.id === recordId)
    if (record?.tags?.includes(tagId)) {
      HistoryManager.removeTagFromRecord(recordId, tagId)
    } else {
      HistoryManager.addTagToRecord(recordId, tagId)
    }
    loadData()
  }

  const handleSaveNote = () => {
    if (!selectedRecord) return

    const normalizedNote = noteDraft.trim()
    HistoryManager.updateRecord(selectedRecord.id, {
      notes: normalizedNote || undefined,
    })
    loadData()
  }

  const handleClearFilters = () => {
    setSearchTerm('')
    setFilterType('all')
    setFilterStatus('all')
    setSelectedTags([])
    setShowFavoritesOnly(false)
    setCurrentPage(1)
  }

  const quickFilterChips = useMemo<HistoryQuickFilterChip[]>(() => {
    if (!stats) return []

    return [
      {
        key: 'favorites',
        label: `仅收藏 (${stats.favoriteCount})`,
        active: showFavoritesOnly,
        onClick: () => setShowFavoritesOnly(prev => !prev),
        hidden: stats.favoriteCount === 0,
      },
      {
        key: 'failed',
        label: `仅失败 (${stats.totalFailed})`,
        active: filterStatus === TaskStatus.FAILED,
        onClick: () => setFilterStatus(prev => prev === TaskStatus.FAILED ? 'all' : TaskStatus.FAILED),
        hidden: stats.totalFailed === 0,
      },
      {
        key: 'single',
        label: '单链接',
        active: filterType === 'single',
        onClick: () => setFilterType(prev => prev === 'single' ? 'all' : 'single'),
      },
      {
        key: 'batch',
        label: '批量任务',
        active: filterType === 'batch',
        onClick: () => setFilterType(prev => prev === 'batch' ? 'all' : 'batch'),
      },
    ]
  }, [stats, showFavoritesOnly, filterStatus, filterType])

  const handleToggleBatchSelect = () => {
    setBatchSelectMode(prev => !prev)
  }

  const toggleRecordSelection = useCallback((recordId: string) => {
    setSelectedRecordIds(prev => {
      if (prev.includes(recordId)) {
        return prev.filter(id => id !== recordId)
      }
      return [...prev, recordId]
    })
  }, [])

  const handleSelectCurrentPage = () => {
    const currentPageIds = paginatedRecords.map(record => record.id)
    setSelectedRecordIds(prev => {
      const merged = new Set([...prev, ...currentPageIds])
      return Array.from(merged)
    })
  }

  const handleClearSelection = () => {
    setSelectedRecordIds([])
  }

  const handleBatchDelete = () => {
    if (selectedRecordIds.length === 0) return
    if (!confirm(`确定要删除选中的 ${selectedRecordIds.length} 条记录吗？此操作不可恢复。`)) {
      return
    }

    HistoryManager.deleteRecords(selectedRecordIds)
    if (selectedRecordId && selectedRecordIdSet.has(selectedRecordId)) {
      setSelectedRecordId(null)
    }
    setSelectedRecordIds([])
    loadData()
  }

  const handleExportCSV = () => {
    const csv = HistoryManager.exportToCSV()
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `history-${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleExportJSON = () => {
    const json = HistoryManager.exportToJSON()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `history-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleClearHistory = () => {
    if (confirm('确定要清空所有历史记录吗？此操作不可恢复。')) {
      HistoryManager.clearHistory()
      setSelectedRecordId(null)
      loadData()
    }
  }

  // 辅助函数
  const getStatusBadgeColor = useCallback((status: TaskStatus) => {
    switch (status) {
      case TaskStatus.SUCCESS:
        return 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30'
      case TaskStatus.FAILED:
        return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900/30'
    }
  }, [])

  const formatStatus = useCallback((status: TaskStatus) => {
    const statusMap = {
      [TaskStatus.SUCCESS]: '成功',
      [TaskStatus.FAILED]: '失败',
      [TaskStatus.PENDING]: '等待中',
      [TaskStatus.PARSING]: '解析中',
      [TaskStatus.UPLOADING]: '上传中',
      [TaskStatus.PARSED]: '已解析',
      [TaskStatus.PREVIEWING]: '预览中'
    }
    return statusMap[status] || '未知'
  }, [])

  const getRecordTitle = useCallback((record: HistoryRecord) => {
    const task = record.task as any
    return task.videoTitle || task.name || '未命名任务'
  }, [])

  const getRecordThumbnail = useCallback((record: HistoryRecord) => {
    if (record.type === 'single') {
      const task = record.task as ConversionTask
      return task.parsedVideoInfo?.cover || task.parsedVideoInfo?.thumbnail
    }
    return null
  }, [])

  const getRecordAlbumImages = useCallback((record: HistoryRecord) => {
    if (record.type !== 'single') return []
    const task = record.task as ConversionTask
    if (task.parsedVideoInfo?.mediaType !== MediaType.IMAGE_ALBUM) return []
    return (task.parsedVideoInfo.images || []).filter((image: ImageInfo) => Boolean(image?.url))
  }, [])

  const renderRecordPreview = useCallback((record: HistoryRecord, variant: 'list' | 'grid') => {
    const thumbnail = getRecordThumbnail(record)
    const albumImages = getRecordAlbumImages(record)
    const task = record.task as any
    const parsedInfo = task.parsedVideoInfo
    const isAlbum = parsedInfo?.mediaType === MediaType.IMAGE_ALBUM && albumImages.length > 0
    const wrapperClass = variant === 'list' ? 'w-24 h-16 flex-shrink-0 rounded-xl' : 'w-full h-full'
    const placeholderIconClass = variant === 'list' ? 'w-8 h-8' : 'w-16 h-16'

    if (isAlbum) {
      const previewImages = albumImages.slice(0, 4)
      const totalImages = parsedInfo.imageCount || albumImages.length

      return (
        <div className={`${wrapperClass} relative overflow-hidden bg-slate-100`}>
          <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-0.5 bg-slate-200 p-0.5">
            {Array.from({ length: 4 }).map((_, index) => {
              const image = previewImages[index]

              return image ? (
                <img
                  key={`${record.id}-album-${index}`}
                  src={image.url}
                  alt={`图集缩略图 ${index + 1}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div
                  key={`${record.id}-album-placeholder-${index}`}
                  className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-400"
                >
                  <Grid3x3 className="h-3.5 w-3.5" />
                </div>
              )
            })}
          </div>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent" />
          <div className="absolute bottom-2 left-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
            图集
          </div>
          <div className="absolute bottom-2 right-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-slate-900 shadow-sm">
            {totalImages} 张
          </div>
        </div>
      )
    }

    if (thumbnail) {
      return (
        <div className={`${wrapperClass} overflow-hidden bg-muted`}>
          <img src={thumbnail} alt="thumbnail" className="h-full w-full object-cover" />
        </div>
      )
    }

    return (
      <div className={`${wrapperClass} flex items-center justify-center bg-muted`}>
        {record.type === 'single' ? (
          <Video className={`${placeholderIconClass} text-muted-foreground`} />
        ) : (
          <List className={`${placeholderIconClass} text-muted-foreground`} />
        )}
      </div>
    )
  }, [getRecordAlbumImages, getRecordThumbnail])

  const getRecordTags = useCallback((record: HistoryRecord) => {
    return (record.tags || [])
      .map(tagId => tagMap.get(tagId))
      .filter((tag): tag is Tag => Boolean(tag))
  }, [tagMap])

  const formatDateTime = useCallback((value: Date | string) => {
    return new Date(value).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }, [])

  const formatRelativeTime = useCallback((value: Date | string) => {
    const timestamp = new Date(value).getTime()
    const diffMs = Date.now() - timestamp
    const diffMinutes = Math.floor(diffMs / 60000)

    if (diffMinutes < 1) return '刚刚'
    if (diffMinutes < 60) return `${diffMinutes} 分钟前`

    const diffHours = Math.floor(diffMinutes / 60)
    if (diffHours < 24) return `${diffHours} 小时前`

    const diffDays = Math.floor(diffHours / 24)
    if (diffDays < 7) return `${diffDays} 天前`

    return formatDateTime(value)
  }, [formatDateTime])

  const activeFilterBadges = useMemo<HistoryActiveFilterBadge[]>(() => {
    const items: HistoryActiveFilterBadge[] = []

    if (searchTerm.trim()) {
      items.push({
        key: 'search',
        label: `搜索: ${searchTerm.trim()}`,
        onRemove: () => setSearchTerm(''),
      })
    }

    if (filterType !== 'all') {
      items.push({
        key: 'type',
        label: filterType === 'single' ? '单链接' : '批量任务',
        onRemove: () => setFilterType('all'),
      })
    }

    if (filterStatus !== 'all') {
      items.push({
        key: 'status',
        label: `状态: ${formatStatus(filterStatus)}`,
        onRemove: () => setFilterStatus('all'),
      })
    }

    if (showFavoritesOnly) {
      items.push({
        key: 'favorites',
        label: '仅收藏',
        onRemove: () => setShowFavoritesOnly(false),
      })
    }

    selectedTags.forEach(tagId => {
      const tag = tagMap.get(tagId)
      if (!tag) return
      items.push({
        key: `tag-${tagId}`,
        label: `标签: ${tag.name}`,
        onRemove: () => setSelectedTags(prev => prev.filter(id => id !== tagId)),
      })
    })

    return items
  }, [filterStatus, filterType, searchTerm, selectedTags, showFavoritesOnly, tagMap])

  const highlightText = useCallback((text: string | undefined, className?: string): ReactNode => {
    const source = String(text ?? '')
    const keyword = deferredSearchTerm.trim()

    if (!keyword || !source) {
      return <span className={className}>{source}</span>
    }

    const matcher = new RegExp(`(${escapeRegExp(keyword)})`, 'ig')
    const parts = source.split(matcher)

    return (
      <span className={className}>
        {parts.map((part, index) => {
          if (part.toLowerCase() === keyword.toLowerCase()) {
            return (
              <mark key={`${part}-${index}`} className="bg-yellow-200 dark:bg-yellow-500/30 rounded px-0.5">
                {part}
              </mark>
            )
          }
          return <span key={`${part}-${index}`}>{part}</span>
        })}
      </span>
    )
  }, [deferredSearchTerm])

  const selectedRecordJson = useMemo(() => {
    // 完整 JSON 可能较大，仅在详情弹窗真正打开时序列化，避免常态浏览反复消耗主线程。
    if (!showDetailDialog || !selectedRecord) {
      return '暂无记录'
    }

    return JSON.stringify(selectedRecord, null, 2)
  }, [showDetailDialog, selectedRecord])

  // 渲染列表项
  const renderListItem = useCallback((record: HistoryRecord) => {
    const task = record.task as any
    const isSelected = selectedRecordId === record.id
    const isChecked = selectedRecordIdSet.has(record.id)
    const recordTags = getRecordTags(record)
    const parsedInfo = task.parsedVideoInfo
    const mediaLabel = parsedInfo ? getMediaPreviewLabel(parsedInfo) : (record.type === 'batch' ? '批量任务' : '单链接')

    return (
      <div
        key={record.id}
        onClick={() => {
          if (batchSelectMode) {
            toggleRecordSelection(record.id)
          } else {
            handleRecordClick(record)
          }
        }}
        className={`border-b cursor-pointer transition-colors ${
          isSelected ? 'bg-emerald-50/80 dark:bg-emerald-950/20' : 'hover:bg-accent/40'
        }`}
        style={{
          contentVisibility: 'auto',
          containIntrinsicSize: '160px',
        }}
      >
        <div className="flex items-start gap-3 p-4">
          {batchSelectMode && (
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={isChecked}
              onClick={(e) => e.stopPropagation()}
              onChange={() => toggleRecordSelection(record.id)}
            />
          )}

          {/* 缩略图 */}
          {renderRecordPreview(record, 'list')}

          {/* 内容 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="mb-1 flex items-center gap-2 flex-wrap">
                  <h3 className="font-medium leading-5">{highlightText(getRecordTitle(record), 'line-clamp-1')}</h3>
                  {record.isFavorite && (
                    <Star className="w-4 h-4 text-yellow-500 fill-yellow-500 flex-shrink-0" />
                  )}
                  <Badge variant="outline" className="text-[11px]">
                    {mediaLabel}
                  </Badge>
                </div>

                {record.type === 'single' && (
                  <p className="text-xs text-muted-foreground truncate">
                    {highlightText(task.videoUrl)}
                  </p>
                )}

                {task.parsedVideoInfo?.author && (
                  <p className="text-xs text-muted-foreground mt-1">
                    作者: {highlightText(task.parsedVideoInfo.author)}
                  </p>
                )}
              </div>

              {/* 状态 */}
              <Badge className={`${getStatusBadgeColor(task.status)} flex-shrink-0`} variant="outline">
                {formatStatus(task.status)}
              </Badge>
            </div>

            {/* 标签和日期 */}
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              {recordTags.map(tag => (
                <Badge
                  key={tag.id}
                  className={`text-xs ${TAG_COLORS[tag.color as keyof typeof TAG_COLORS] || TAG_COLORS.gray}`}
                  variant="outline"
                >
                  {tag.name}
                </Badge>
              ))}
              <span className="text-xs text-muted-foreground">
                {formatRelativeTime(record.createdAt)}
              </span>
              <span className="text-xs text-muted-foreground/70">
                {formatDateTime(record.createdAt)}
              </span>
            </div>
          </div>
        </div>
      </div>
    )
  }, [
    batchSelectMode,
    formatDateTime,
    formatRelativeTime,
    formatStatus,
    getRecordTags,
    getRecordTitle,
    getStatusBadgeColor,
    handleRecordClick,
    highlightText,
    renderRecordPreview,
    selectedRecordId,
    selectedRecordIdSet,
    toggleRecordSelection,
  ])

  // 渲染网格项
  const renderGridItem = useCallback((record: HistoryRecord) => {
    const task = record.task as any
    const isSelected = selectedRecordId === record.id
    const isChecked = selectedRecordIdSet.has(record.id)
    const recordTags = getRecordTags(record)
    const parsedInfo = task.parsedVideoInfo
    const mediaLabel = parsedInfo ? getMediaPreviewLabel(parsedInfo) : (record.type === 'batch' ? '批量任务' : '单链接')

    return (
      <Card
        key={record.id}
        onClick={() => {
          if (batchSelectMode) {
            toggleRecordSelection(record.id)
          } else {
            handleRecordClick(record)
          }
        }}
        className={`cursor-pointer transition-all hover:-translate-y-1 hover:shadow-lg ${
          isSelected ? 'ring-2 ring-emerald-400 border-emerald-300 shadow-lg' : ''
        }`}
        style={{
          contentVisibility: 'auto',
          containIntrinsicSize: '360px',
        }}
      >
        <CardContent className="p-0">
          {/* 缩略图 */}
          <div className="relative w-full h-40 bg-muted">
            {batchSelectMode && (
              <div className="absolute top-2 left-2 z-10 bg-background/90 rounded px-1.5 py-1">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={isChecked}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => toggleRecordSelection(record.id)}
                />
              </div>
            )}

            {renderRecordPreview(record, 'grid')}

            {/* 状态徽章 */}
            <div className="absolute top-2 right-2">
              <Badge className={getStatusBadgeColor(task.status)} variant="outline">
                {formatStatus(task.status)}
              </Badge>
            </div>

            {/* 收藏图标 */}
            {record.isFavorite && !batchSelectMode && (
              <div className="absolute top-2 left-2">
                <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
              </div>
            )}
          </div>

          {/* 信息 */}
          <div className="p-4">
            <div className="mb-2 flex items-start justify-between gap-2">
              <h3 className="font-medium line-clamp-2">{highlightText(getRecordTitle(record))}</h3>
              <Badge variant="outline" className="text-[11px] flex-shrink-0">
                {mediaLabel}
              </Badge>
            </div>

            {task.parsedVideoInfo?.author && (
              <p className="text-xs text-muted-foreground mb-2">
                作者: {highlightText(task.parsedVideoInfo.author)}
              </p>
            )}

            {/* 标签 */}
            {recordTags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {recordTags.slice(0, 3).map(tag => (
                  <Badge
                    key={tag.id}
                    className={`text-xs ${TAG_COLORS[tag.color as keyof typeof TAG_COLORS] || TAG_COLORS.gray}`}
                    variant="outline"
                  >
                    {tag.name}
                  </Badge>
                ))}
                {recordTags.length > 3 && (
                  <Badge variant="outline" className="text-xs">
                    +{recordTags.length - 3}
                  </Badge>
                )}
              </div>
            )}

            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{formatRelativeTime(record.createdAt)}</span>
              <span>{formatDateTime(record.createdAt)}</span>
            </div>
            {!batchSelectMode && isSelected && (
              <div className="mt-3 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                当前已选中，详情已同步更新
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }, [
    batchSelectMode,
    formatDateTime,
    formatRelativeTime,
    formatStatus,
    getRecordTags,
    getRecordTitle,
    getStatusBadgeColor,
    handleRecordClick,
    highlightText,
    renderRecordPreview,
    selectedRecordId,
    selectedRecordIdSet,
    toggleRecordSelection,
  ])

  const listViewItems = useMemo(() => {
    return paginatedRecords.map(record => renderListItem(record))
  }, [paginatedRecords, renderListItem])

  const gridViewItems = useMemo(() => {
    return paginatedRecords.map(record => renderGridItem(record))
  }, [paginatedRecords, renderGridItem])

  const visibleQuickFilterChips = useMemo(() => {
    return quickFilterChips.filter(chip => !chip.hidden)
  }, [quickFilterChips])

  const selectedContextSummary = useMemo<HistorySelectedContextSummary | null>(() => {
    if (!selectedRecord) {
      return null
    }

    const task = selectedRecord.task as any
    const parsedInfo = task.parsedVideoInfo
    const mediaLabel = parsedInfo ? getMediaPreviewLabel(parsedInfo) : (selectedRecord.type === 'batch' ? '批量任务' : '单链接')

    return {
      kindLabel: selectedRecord.type === 'single' ? '单链接记录' : '批量任务',
      mediaLabel,
      statusLabel: formatStatus(task.status),
      statusBadgeClassName: getStatusBadgeColor(task.status),
      relativeTime: formatRelativeTime(selectedRecord.createdAt),
      title: getRecordTitle(selectedRecord),
    }
  }, [formatRelativeTime, formatStatus, getRecordTitle, getStatusBadgeColor, selectedRecord])

  const handlePreviousPage = useCallback(() => {
    setCurrentPage(prev => Math.max(1, prev - 1))
  }, [])

  const handleNextPage = useCallback(() => {
    setCurrentPage(prev => Math.min(totalPages, prev + 1))
  }, [totalPages])

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-emerald-50/20 dark:to-emerald-950/20">
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        <HistoryPageHeader />

        <HistoryStatsSection
          stats={stats}
          showStats={showStats}
          onHideStats={() => setShowStats(false)}
          onShowStats={() => setShowStats(true)}
        />

        <Card className="mb-6 border-2">
          <CardContent className="p-4">
            <HistoryToolbar
              selectedContext={selectedContextSummary}
              searchTerm={searchTerm}
              onSearchTermChange={setSearchTerm}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              filterType={filterType}
              onFilterTypeChange={setFilterType}
              filterStatus={filterStatus}
              onFilterStatusChange={setFilterStatus}
              sortOption={sortOption}
              onSortOptionChange={setSortOption}
              showFavoritesOnly={showFavoritesOnly}
              onToggleFavorites={() => setShowFavoritesOnly(prev => !prev)}
              tags={tags}
              selectedTags={selectedTags}
              onToggleTag={(tagId) => {
                if (selectedTags.includes(tagId)) {
                  setSelectedTags(selectedTags.filter(id => id !== tagId))
                } else {
                  setSelectedTags([...selectedTags, tagId])
                }
              }}
              tagColors={TAG_COLORS}
              quickFilterChips={visibleQuickFilterChips}
              activeFilterBadges={activeFilterBadges}
              filteredRecordsCount={filteredAndSortedRecords.length}
              totalRecordsCount={records.length}
              hasActiveFilters={Boolean(searchTerm || filterType !== 'all' || filterStatus !== 'all' || selectedTags.length > 0 || showFavoritesOnly)}
              onClearFilters={handleClearFilters}
              batchSelectMode={batchSelectMode}
              paginatedRecordsCount={paginatedRecords.length}
              selectedRecordCount={selectedRecordIds.length}
              onToggleBatchSelect={handleToggleBatchSelect}
              onSelectCurrentPage={handleSelectCurrentPage}
              onClearSelection={handleClearSelection}
              onBatchDelete={handleBatchDelete}
              onOpenTagDialog={() => setShowTagDialog(true)}
              onExportCSV={handleExportCSV}
              onExportJSON={handleExportJSON}
              onRefresh={handleRefresh}
              refreshingCloud={refreshingCloud}
              authLoading={authLoading}
              onClearHistory={handleClearHistory}
            />
          </CardContent>
        </Card>

        <HistoryRecordsLayout
          viewMode={viewMode}
          recordsLength={records.length}
          filteredRecordsLength={filteredAndSortedRecords.length}
          listViewItems={listViewItems}
          gridViewItems={gridViewItems}
          totalPages={totalPages}
          currentPage={currentPage}
          onPreviousPage={handlePreviousPage}
          onNextPage={handleNextPage}
          detailPanel={(
            <HistoryDetailPanel
              selectedRecord={selectedRecord}
              tags={tags}
              noteDraft={noteDraft}
              onNoteDraftChange={setNoteDraft}
              onSaveNote={handleSaveNote}
              onToggleFavorite={handleToggleFavorite}
              onOpenDetailDialog={() => setShowDetailDialog(true)}
              onDeleteRecord={handleDeleteRecord}
              onRetryTask={handleRetryTask}
              onToggleRecordTag={handleToggleRecordTag}
              onCopyUrl={handleCopyUrl}
              onOpenExternalLink={handleOpenExternalLink}
              tagColors={TAG_COLORS}
            />
          )}
        />

        <TagManagerDialog
          open={showTagDialog}
          onOpenChange={setShowTagDialog}
          tags={tags}
          tagColors={TAG_COLORS}
          newTagName={newTagName}
          newTagColor={newTagColor}
          onNewTagNameChange={setNewTagName}
          onNewTagColorChange={setNewTagColor}
          onDeleteTag={handleDeleteTag}
          onAddTag={handleAddTag}
        />

        <HistoryRecordJsonDialog
          open={showDetailDialog}
          onOpenChange={setShowDetailDialog}
          jsonText={selectedRecordJson}
        />
      </div>
    </div>
  )
}
