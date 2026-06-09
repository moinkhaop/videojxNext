'use client'

import { useState, useEffect, useMemo, useCallback, useDeferredValue, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import {
  History,
  Search,
  Trash2,
  CheckCircle,
  XCircle,
  Clock,
  Video,
  RefreshCw,
  Copy,
  Star,
  StarOff,
  Download,
  BarChart3,
  X,
  Grid3x3,
  List,
  Tag as TagIcon,
  RotateCcw,
  MoreHorizontal,
  StickyNote,
  FileJson,
  Link2,
  FolderOpen,
  ExternalLink
} from 'lucide-react'
import { HistoryRecord, TaskStatus, ConversionTask, HistoryStats, Tag, HistoryViewMode, HistorySortOption, MediaType } from '@/types'
import { HistoryManager, TagManager } from '@/lib/storage'
import { useRouter } from 'next/navigation'
import { VideoPreview } from '@/components/preview/VideoPreview'
import { ImageCarousel } from '@/components/preview/ImageCarousel'
import { useAuth } from '@/contexts/auth-context'
import { CLOUD_STORAGE_SYNC_EVENT, hydrateFromSupabase } from '@/lib/storage/cloud-sync'
import { getMediaPreviewLabel, getMediaStageHeightClass, isAnimatedImageMedia } from '@/components/preview/media-helpers'

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

export default function HistoryPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()

  // 基础状态
  const [records, setRecords] = useState<HistoryRecord[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [stats, setStats] = useState<HistoryStats | null>(null)

  // 视图状态
  const [viewMode, setViewMode] = useState<HistoryViewMode>(HistoryViewMode.LIST)
  const [selectedRecord, setSelectedRecord] = useState<HistoryRecord | null>(null)

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

  const loadData = useCallback((selectedId?: string | null) => {
    const history = HistoryManager.getHistory()
    const allTags = TagManager.getTags()
    const statistics = HistoryManager.getStatistics(history)

    setRecords(history)
    setTags(allTags)
    setStats(statistics)

    if (typeof selectedId !== 'undefined') {
      if (!selectedId) {
        setSelectedRecord(null)
      } else {
        const updatedRecord = history.find(record => record.id === selectedId)
        setSelectedRecord(updatedRecord ?? null)
      }
      return
    }

    setSelectedRecord(prev => {
      if (!prev) return prev
      const updatedRecord = history.find(record => record.id === prev.id)
      return updatedRecord ?? null
    })
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    const handleCloudSynced = () => {
      loadData(selectedRecord?.id ?? undefined)
    }

    window.addEventListener(CLOUD_STORAGE_SYNC_EVENT, handleCloudSynced as EventListener)
    return () => {
      window.removeEventListener(CLOUD_STORAGE_SYNC_EVENT, handleCloudSynced as EventListener)
    }
  }, [loadData, selectedRecord?.id])

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
  }, [selectedRecord?.id, selectedRecord?.notes])

  useEffect(() => {
    if (filteredAndSortedRecords.length === 0) {
      setSelectedRecord(null)
      return
    }

    setSelectedRecord(prev => {
      if (prev && filteredAndSortedRecords.some(record => record.id === prev.id)) {
        return prev
      }
      return filteredAndSortedRecords[0]
    })
  }, [filteredAndSortedRecords])

  const handleRefresh = useCallback(async () => {
    try {
      if (!authLoading && user?.id) {
        setRefreshingCloud(true)
        await hydrateFromSupabase()
      }
      loadData(selectedRecord?.id ?? undefined)
    } catch (error) {
      console.error('从云端刷新历史失败:', error)
      alert('从云端刷新历史失败，请稍后重试')
    } finally {
      setRefreshingCloud(false)
    }
  }, [authLoading, loadData, selectedRecord?.id, user?.id])

  // 操作处理函数
  const handleDeleteRecord = (id: string) => {
    if (confirm('确定要删除这条历史记录吗？')) {
      HistoryManager.deleteRecord(id)
      const nextSelectedId = selectedRecord?.id === id ? null : selectedRecord?.id
      loadData(nextSelectedId)
    }
  }

  const handleToggleFavorite = (id: string) => {
    HistoryManager.toggleFavorite(id)
    loadData(selectedRecord?.id ?? undefined)
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

  const handleRecordClick = (record: HistoryRecord) => {
    setSelectedRecord({ ...record, lastViewedAt: new Date() })
    HistoryManager.updateLastViewedAt(record.id, 30000)
  }

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
      loadData(selectedRecord?.id ?? undefined)
    }
  }

  const handleToggleRecordTag = (recordId: string, tagId: string) => {
    const record = records.find(r => r.id === recordId)
    if (record?.tags?.includes(tagId)) {
      HistoryManager.removeTagFromRecord(recordId, tagId)
    } else {
      HistoryManager.addTagToRecord(recordId, tagId)
    }
    loadData(selectedRecord?.id ?? undefined)
  }

  const handleSaveNote = () => {
    if (!selectedRecord) return

    const normalizedNote = noteDraft.trim()
    HistoryManager.updateRecord(selectedRecord.id, {
      notes: normalizedNote || undefined,
    })
    loadData(selectedRecord.id)
  }

  const handleClearFilters = () => {
    setSearchTerm('')
    setFilterType('all')
    setFilterStatus('all')
    setSelectedTags([])
    setShowFavoritesOnly(false)
    setCurrentPage(1)
  }

  const quickFilterChips = useMemo(() => {
    if (!stats) return [] as Array<{ key: string; label: string; active: boolean; onClick: () => void; hidden?: boolean }>

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

  const toggleRecordSelection = (recordId: string) => {
    setSelectedRecordIds(prev => {
      if (prev.includes(recordId)) {
        return prev.filter(id => id !== recordId)
      }
      return [...prev, recordId]
    })
  }

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
    const selectedId = selectedRecord?.id
    const nextSelectedId = selectedId && selectedRecordIdSet.has(selectedId) ? null : selectedId
    setSelectedRecordIds([])
    loadData(nextSelectedId)
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
      loadData(null)
    }
  }

  // 辅助函数
  const getStatusIcon = (status: TaskStatus) => {
    switch (status) {
      case TaskStatus.SUCCESS:
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case TaskStatus.FAILED:
        return <XCircle className="w-4 h-4 text-red-500" />
      default:
        return <Clock className="w-4 h-4 text-gray-500" />
    }
  }

  const getStatusBadgeColor = (status: TaskStatus) => {
    switch (status) {
      case TaskStatus.SUCCESS:
        return 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30'
      case TaskStatus.FAILED:
        return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900/30'
    }
  }

  const formatStatus = (status: TaskStatus) => {
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
  }

  const getRecordTitle = (record: HistoryRecord) => {
    const task = record.task as any
    return task.videoTitle || task.name || '未命名任务'
  }

  const getRecordThumbnail = (record: HistoryRecord) => {
    if (record.type === 'single') {
      const task = record.task as ConversionTask
      return task.parsedVideoInfo?.cover || task.parsedVideoInfo?.thumbnail
    }
    return null
  }

  const getRecordTags = useCallback((record: HistoryRecord) => {
    return (record.tags || [])
      .map(tagId => tagMap.get(tagId))
      .filter((tag): tag is Tag => Boolean(tag))
  }, [tagMap])

  const formatDateTime = (value: Date | string) => {
    return new Date(value).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatRelativeTime = (value: Date | string) => {
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
  }

  const formatDuration = (duration?: number) => {
    if (!duration || duration <= 0) return '未知'

    const totalSeconds = Math.floor(duration)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    }

    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  const formatFileSize = (bytes?: number) => {
    if (!bytes || bytes <= 0) return '未知'
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`
    }

    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  const activeFilterBadges = useMemo(() => {
    const items: Array<{ key: string; label: string; onRemove: () => void }> = []

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

  const highlightText = (text: string | undefined, className?: string): ReactNode => {
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
  }

  // 渲染列表项
  const renderListItem = (record: HistoryRecord) => {
    const task = record.task as any
    const isSelected = selectedRecord?.id === record.id
    const isChecked = selectedRecordIdSet.has(record.id)
    const thumbnail = getRecordThumbnail(record)
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
          {thumbnail ? (
            <div className="w-24 h-16 flex-shrink-0 rounded overflow-hidden bg-muted">
              <img src={thumbnail} alt="thumbnail" className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="w-24 h-16 flex-shrink-0 rounded bg-muted flex items-center justify-center">
              {record.type === 'single' ? (
                <Video className="w-8 h-8 text-muted-foreground" />
              ) : (
                <List className="w-8 h-8 text-muted-foreground" />
              )}
            </div>
          )}

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
  }

  // 渲染网格项
  const renderGridItem = (record: HistoryRecord) => {
    const task = record.task as any
    const isSelected = selectedRecord?.id === record.id
    const isChecked = selectedRecordIdSet.has(record.id)
    const thumbnail = getRecordThumbnail(record)
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

            {thumbnail ? (
              <img src={thumbnail} alt="thumbnail" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                {record.type === 'single' ? (
                  <Video className="w-16 h-16 text-muted-foreground" />
                ) : (
                  <List className="w-16 h-16 text-muted-foreground" />
                )}
              </div>
            )}

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
  }

  const renderOverviewStat = (
    label: string,
    value: string | number,
    accentClass = 'text-foreground'
  ) => (
    <div className="rounded-2xl border border-border/70 bg-background/80 px-4 py-3">
      <div className={`text-xl font-semibold ${accentClass}`}>{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  )

  const renderDetailStat = (
    label: string,
    value: string,
    helper?: string,
    accentClass = 'text-foreground'
  ) => (
    <div className="rounded-2xl border border-border/70 bg-background/80 px-4 py-3">
      <div className={`text-sm font-semibold ${accentClass}`}>{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
      {helper ? (
        <div className="mt-2 text-[11px] leading-5 text-muted-foreground/80">
          {helper}
        </div>
      ) : null}
    </div>
  )

  const renderSelectedContext = () => {
    if (!selectedRecord) {
      return (
        <div className="rounded-2xl border border-dashed border-border bg-background/70 px-4 py-3 text-sm text-muted-foreground">
          当前未选中记录。可从左侧列表或下方网格选择一条，右侧会显示预览和详情。
        </div>
      )
    }

    const task = selectedRecord.task as any
    const parsedInfo = task.parsedVideoInfo
    const mediaLabel = parsedInfo ? getMediaPreviewLabel(parsedInfo) : (selectedRecord.type === 'batch' ? '批量任务' : '单链接')

    return (
      <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/70 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950/20">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
            {selectedRecord.type === 'single' ? '单链接记录' : '批量任务'}
          </Badge>
          <Badge variant="outline">{mediaLabel}</Badge>
          <Badge className={getStatusBadgeColor(task.status)} variant="outline">
            {formatStatus(task.status)}
          </Badge>
          <span className="text-sm text-muted-foreground">{formatRelativeTime(selectedRecord.createdAt)}</span>
        </div>
        <div className="mt-2 text-sm font-medium line-clamp-1">
          {getRecordTitle(selectedRecord)}
        </div>
      </div>
    )
  }

  // 渲染预览面板
  const renderPreviewPanel = () => {
    if (!selectedRecord) {
      return (
        <div className="h-full flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <History className="w-16 h-16 mx-auto mb-4 opacity-30" />
            <p>选择一条记录查看详情</p>
          </div>
        </div>
      )
    }

    const task = selectedRecord.task as any
    const recordTags = getRecordTags(selectedRecord)
    const parsedInfo = task.parsedVideoInfo
    const mediaLabel = parsedInfo ? getMediaPreviewLabel(parsedInfo) : (selectedRecord.type === 'batch' ? '批量任务' : '单链接')
    const mediaStageHeightClass = parsedInfo
      ? getMediaStageHeightClass(parsedInfo)
      : 'h-[280px] sm:h-[320px] lg:h-[360px]'
    const lastViewedLabel = selectedRecord.lastViewedAt
      ? formatDateTime(selectedRecord.lastViewedAt)
      : '未记录'
    const lastViewedHelper = selectedRecord.lastViewedAt
      ? formatRelativeTime(selectedRecord.lastViewedAt)
      : '打开记录后会自动更新时间'
    const noteChanged = noteDraft.trim() !== (selectedRecord.notes?.trim() || '')
    const sourceUrl = selectedRecord.type === 'single' ? task.videoUrl : task.sourceUrl
    const directMediaUrl = parsedInfo?.url
    const isAnimatedImage = parsedInfo ? isAnimatedImageMedia(parsedInfo) : false
    const previewHint = isAnimatedImage
      ? '动图将保持固定舞台展示，避免切换播放状态时布局抖动。'
      : parsedInfo?.mediaType === MediaType.VIDEO
        ? '视频区域已固定高度，点击播放后不会再挤压详情布局。'
        : '图集区域保持固定预览舞台，方便连续切换记录查看。'
    const uploadFilePath = (() => {
      if (!task.uploadResult?.filePath) return ''
      try {
        return decodeURIComponent(task.uploadResult.filePath)
      } catch {
        return task.uploadResult.filePath
      }
    })()
    const summaryMetrics: Array<{ label: string; value: string; helper?: string; accentClass?: string }> = [
      {
        label: '状态',
        value: formatStatus(task.status),
        helper: selectedRecord.type === 'single' ? '单条解析/上传任务' : '批量解析任务',
        accentClass: task.status === TaskStatus.SUCCESS
          ? 'text-emerald-600'
          : task.status === TaskStatus.FAILED
            ? 'text-red-600'
            : 'text-foreground',
      },
      {
        label: '媒体类型',
        value: mediaLabel,
        helper: parsedInfo?.author ? `作者：${parsedInfo.author}` : undefined,
      },
      {
        label: '创建时间',
        value: formatDateTime(selectedRecord.createdAt),
        helper: formatRelativeTime(selectedRecord.createdAt),
      },
      {
        label: '完成时间',
        value: task.completedAt ? formatDateTime(task.completedAt) : '未完成',
        helper: task.completedAt ? formatRelativeTime(task.completedAt) : '任务仍在处理中或提前结束',
      },
      {
        label: '最近查看',
        value: lastViewedLabel,
        helper: lastViewedHelper,
      },
    ]

    if (selectedRecord.type === 'single' && parsedInfo?.duration) {
      summaryMetrics.push({
        label: '内容时长',
        value: formatDuration(parsedInfo.duration),
        helper: parsedInfo.fileSize ? `文件大小：${formatFileSize(parsedInfo.fileSize)}` : undefined,
      })
    } else if (parsedInfo?.mediaType === MediaType.IMAGE_ALBUM) {
      summaryMetrics.push({
        label: '图片数量',
        value: `${parsedInfo.imageCount || parsedInfo.images?.length || 0} 张`,
        helper: parsedInfo.fileSize ? `内容大小：${formatFileSize(parsedInfo.fileSize)}` : '图集记录支持轮播查看',
      })
    } else if (selectedRecord.type === 'batch') {
      summaryMetrics.push({
        label: '批量进度',
        value: `${task.completedTasks || 0} / ${task.totalTasks || 0}`,
        helper: '用于快速确认整批任务完成情况',
      })
    } else {
      summaryMetrics.push({
        label: '内容摘要',
        value: parsedInfo?.fileSize ? formatFileSize(parsedInfo.fileSize) : '等待更多媒体元信息',
        helper: '记录支持标签、备注和重新进入解析流程',
      })
    }

    return (
      <div className="h-full overflow-y-auto p-6">
        {/* 头部操作 */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">{getRecordTitle(selectedRecord)}</h2>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleToggleFavorite(selectedRecord.id)}
            >
              {selectedRecord.isFavorite ? (
                <Star className="w-4 h-4 fill-yellow-500 text-yellow-500" />
              ) : (
                <StarOff className="w-4 h-4" />
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowDetailDialog(true)}
              title="查看完整记录 JSON"
            >
              <FileJson className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleDeleteRecord(selectedRecord.id)}
              className="text-red-600"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* 媒体预览 */}
        {parsedInfo && (
          <div className="mb-6 rounded-2xl border border-border/70 bg-background/80 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{mediaLabel}</Badge>
                  {isAnimatedImage && (
                    <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                      动图直出
                    </Badge>
                  )}
                  <Badge className={getStatusBadgeColor(task.status)} variant="outline">
                    <div className="flex items-center gap-1">
                      {getStatusIcon(task.status)}
                      <span>{formatStatus(task.status)}</span>
                    </div>
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {previewHint}
                </p>
              </div>
              {selectedRecord.type === 'single' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleRetryTask(selectedRecord)}
                >
                  <RotateCcw className="w-3 h-3 mr-1" />
                  重新解析
                </Button>
              )}
            </div>

            {parsedInfo.mediaType === MediaType.VIDEO && parsedInfo.url && (
              <div className="space-y-3">
                <div className={`rounded-2xl overflow-hidden border border-border bg-slate-950 ${mediaStageHeightClass}`}>
                  <VideoPreview
                    key={`${selectedRecord.id}-${parsedInfo.url}`}
                    videoUrl={parsedInfo.url}
                    thumbnail={parsedInfo.cover || parsedInfo.thumbnail}
                    title={parsedInfo.title}
                    format={parsedInfo.format}
                    className="w-full h-full"
                  />
                </div>
                {selectedRecord.type === 'single' && (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200/70 bg-amber-50/80 px-3 py-2 text-xs dark:border-amber-900 dark:bg-amber-950/20">
                    <span className="text-amber-700 dark:text-amber-300">
                      资源直链可能有时效性，若预览失败可重新解析获取最新链接。
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRetryTask(selectedRecord)}
                      className="h-7"
                    >
                      <RotateCcw className="w-3 h-3 mr-1" />
                      重新解析
                    </Button>
                  </div>
                )}
              </div>
            )}

            {parsedInfo.mediaType === MediaType.IMAGE_ALBUM && parsedInfo.images && (
              <div className={`rounded-2xl overflow-hidden border border-border bg-muted ${mediaStageHeightClass}`}>
                <ImageCarousel
                  images={parsedInfo.images}
                  title={parsedInfo.title}
                  className="h-full w-full"
                />
              </div>
            )}

            {!parsedInfo.url && !parsedInfo.images && parsedInfo.cover && (
              <div className={`bg-muted rounded-2xl overflow-hidden border border-border ${mediaStageHeightClass}`}>
                <img src={parsedInfo.cover} alt="封面" className="w-full h-full object-cover" />
              </div>
            )}
          </div>
        )}

        <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {summaryMetrics.map(item => (
            <div key={item.label}>
              {renderDetailStat(item.label, item.value, item.helper, item.accentClass)}
            </div>
          ))}
        </div>

        {/* 标签管理 */}
        <div className="mb-6 rounded-2xl border border-border/70 bg-background/80 p-4">
          <h3 className="text-sm font-medium mb-3">标签</h3>
          <div className="flex flex-wrap gap-2">
            {tags.map(tag => {
              const isActive = recordTags.some(t => t.id === tag.id)
              return (
                <Badge
                  key={tag.id}
                  onClick={() => handleToggleRecordTag(selectedRecord.id, tag.id)}
                  className={`cursor-pointer ${
                    isActive
                      ? TAG_COLORS[tag.color as keyof typeof TAG_COLORS] || TAG_COLORS.gray
                      : 'bg-muted text-muted-foreground border-muted'
                  }`}
                  variant="outline"
                >
                  {tag.name}
                </Badge>
              )
            })}
          </div>
        </div>

        {/* 详细信息 */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
            <h3 className="text-sm font-medium mb-3">基本信息</h3>
            <div className="space-y-3 text-sm">
              {parsedInfo?.author && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">作者:</span>
                  <span className="text-right">{parsedInfo.author}</span>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">创建时间:</span>
                <span className="text-right">{formatDateTime(selectedRecord.createdAt)}</span>
              </div>
              {task.completedAt && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">完成时间:</span>
                  <span className="text-right">{formatDateTime(task.completedAt)}</span>
                </div>
              )}
              {parsedInfo?.duration && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">时长:</span>
                  <span className="text-right">{formatDuration(parsedInfo.duration)}</span>
                </div>
              )}
              {parsedInfo?.fileSize && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">文件大小:</span>
                  <span className="text-right">{formatFileSize(parsedInfo.fileSize)}</span>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Link2 className="w-4 h-4 text-emerald-600" />
              <h3 className="text-sm font-medium">链接与入口</h3>
            </div>
            <div className="space-y-3">
              {sourceUrl && (
                <div>
                  <div className="mb-2 text-xs font-medium text-muted-foreground">
                    {selectedRecord.type === 'single' ? '原始链接' : '用户主页链接'}
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      value={sourceUrl}
                      readOnly
                      className="flex-1 text-sm"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCopyUrl(sourceUrl)}
                      title="复制链接"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleOpenExternalLink(sourceUrl)}
                      title="新窗口打开"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}

              {directMediaUrl && (
                <div>
                  <div className="mb-2 text-xs font-medium text-muted-foreground">
                    可用媒体直链
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      value={directMediaUrl}
                      readOnly
                      className="flex-1 text-sm"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCopyUrl(directMediaUrl)}
                      title="复制媒体链接"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleOpenExternalLink(directMediaUrl)}
                      title="打开媒体链接"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}

              {selectedRecord.type === 'single' && task.status === TaskStatus.SUCCESS && parsedInfo?.url && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  提示：解析得到的视频直链通常存在时效，失效后请重新解析。
                </p>
              )}
            </div>
          </div>

          {selectedRecord.type === 'batch' && (
            <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
              <h3 className="text-sm font-medium mb-3">批量任务信息</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">任务总数:</span>
                  <span className="text-right">{task.totalTasks || 0} 个视频</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">成功数量:</span>
                  <span className="text-right text-green-600">{task.completedTasks || 0} 个</span>
                </div>
              </div>
            </div>
          )}

          {uploadFilePath && (
            <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
              <div className="mb-3 flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-medium">上传结果路径</h3>
              </div>
              <div className="space-y-3">
                <p className="text-sm text-green-600 dark:text-green-400 break-all">
                  {uploadFilePath}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleCopyUrl(uploadFilePath)}
                  >
                    <Copy className="w-4 h-4 mr-1" />
                    复制路径
                  </Button>
                </div>
              </div>
            </div>
          )}

          {task.error && (
            <div className="rounded-2xl border border-red-200/70 bg-red-50/70 p-4 dark:border-red-900 dark:bg-red-950/20">
              <h3 className="text-sm font-medium mb-2 text-red-600">错误信息</h3>
              <p className="text-sm text-red-600 dark:text-red-400">
                {task.error}
              </p>
            </div>
          )}

          <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
            <div className="mb-3 flex items-center gap-2">
              <StickyNote className="w-4 h-4 text-emerald-600" />
              <h3 className="text-sm font-medium">备注</h3>
            </div>
            <Textarea
              value={noteDraft}
              onChange={(event) => setNoteDraft(event.target.value)}
              placeholder="补充这条记录的用途、问题现象、重试结果或后续待办。"
              className="min-h-[120px]"
            />
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                备注会随历史记录一起保存，适合记录复盘信息和问题上下文。
              </p>
              <Button size="sm" onClick={handleSaveNote} disabled={!noteChanged}>
                保存备注
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-emerald-50/20 dark:to-emerald-950/20">
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {/* 页面标题 */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-gradient-to-br from-emerald-500/10 to-emerald-600/10 rounded-lg">
              <History className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-emerald-600 to-emerald-500 bg-clip-text text-transparent">
                历史记录
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                管理解析结果、回看失败原因、快速重新进入转存流程。
              </p>
            </div>
          </div>
        </div>

        {/* 数据统计 */}
        {stats && showStats && (
          <Card className="mb-6 border-2 shadow-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-emerald-600" />
                  <CardTitle className="text-lg">数据统计</CardTitle>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setShowStats(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="text-center p-4 bg-muted rounded-lg">
                  <p className="text-2xl font-bold">{stats.totalRecords}</p>
                  <p className="text-xs text-muted-foreground mt-1">总记录</p>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <p className="text-2xl font-bold text-green-600">{stats.successRate}%</p>
                  <p className="text-xs text-muted-foreground mt-1">成功率</p>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <p className="text-2xl font-bold text-green-600">{stats.totalSuccess}</p>
                  <p className="text-xs text-muted-foreground mt-1">成功</p>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <p className="text-2xl font-bold text-red-600">{stats.totalFailed}</p>
                  <p className="text-xs text-muted-foreground mt-1">失败</p>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <p className="text-2xl font-bold text-yellow-600">{stats.favoriteCount}</p>
                  <p className="text-xs text-muted-foreground mt-1">收藏</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {stats && !showStats && (
          <div className="mb-6">
            <Button variant="outline" size="sm" onClick={() => setShowStats(true)}>
              <BarChart3 className="w-4 h-4 mr-2" />
              展开统计概览
            </Button>
          </div>
        )}

        {stats && (
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
            {renderOverviewStat('总记录', stats.totalRecords)}
            {renderOverviewStat('成功率', `${stats.successRate}%`, 'text-emerald-600')}
            {renderOverviewStat('成功', stats.totalSuccess, 'text-emerald-600')}
            {renderOverviewStat('失败', stats.totalFailed, 'text-red-600')}
            {renderOverviewStat('收藏', stats.favoriteCount, 'text-amber-600')}
          </div>
        )}

        {/* 工具栏 */}
        <Card className="mb-6 border-2">
          <CardContent className="p-4">
            <div className="mb-4">
              {renderSelectedContext()}
            </div>

            {/* 搜索和视图切换 */}
            <div className="flex flex-col md:flex-row gap-3 mb-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="搜索视频标题或链接..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>

              <div className="flex gap-2">
                {/* 视图切换 */}
                <div className="flex border rounded-lg overflow-hidden">
                  <Button
                    variant={viewMode === HistoryViewMode.LIST ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode(HistoryViewMode.LIST)}
                    className="rounded-none"
                  >
                    <List className="w-4 h-4" />
                  </Button>
                  <Button
                    variant={viewMode === HistoryViewMode.GRID ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode(HistoryViewMode.GRID)}
                    className="rounded-none"
                  >
                    <Grid3x3 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* 筛选器 */}
            <div className="flex flex-wrap gap-2 mb-4">
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as any)}
                className="px-3 py-1.5 text-sm bg-background border rounded-lg"
              >
                <option value="all">所有类型</option>
                <option value="single">单链接</option>
                <option value="batch">批量</option>
              </select>

              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="px-3 py-1.5 text-sm bg-background border rounded-lg"
              >
                <option value="all">所有状态</option>
                <option value={TaskStatus.SUCCESS}>成功</option>
                <option value={TaskStatus.FAILED}>失败</option>
                <option value={TaskStatus.PENDING}>等待中</option>
              </select>

              <select
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value as any)}
                className="px-3 py-1.5 text-sm bg-background border rounded-lg"
              >
                <option value={HistorySortOption.DATE_DESC}>时间 (最新)</option>
                <option value={HistorySortOption.DATE_ASC}>时间 (最旧)</option>
                <option value={HistorySortOption.TITLE_ASC}>标题 (A-Z)</option>
                <option value={HistorySortOption.TITLE_DESC}>标题 (Z-A)</option>
                <option value={HistorySortOption.STATUS}>状态</option>
              </select>

              <Button
                variant={showFavoritesOnly ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
              >
                <Star className={`w-4 h-4 mr-1 ${showFavoritesOnly ? 'fill-current' : ''}`} />
                收藏
              </Button>

              {/* 标签筛选 */}
              {tags.map(tag => (
                <Badge
                  key={tag.id}
                  onClick={() => {
                    if (selectedTags.includes(tag.id)) {
                      setSelectedTags(selectedTags.filter(t => t !== tag.id))
                    } else {
                      setSelectedTags([...selectedTags, tag.id])
                    }
                  }}
                  className={`cursor-pointer ${
                    selectedTags.includes(tag.id)
                      ? TAG_COLORS[tag.color as keyof typeof TAG_COLORS] || TAG_COLORS.gray
                      : 'bg-muted text-muted-foreground'
                  }`}
                  variant="outline"
                >
                  {tag.name}
                </Badge>
              ))}
            </div>

            {/* 快捷筛选 */}
            {quickFilterChips.some(chip => !chip.hidden) && (
              <div className="flex flex-wrap gap-2 mb-4">
                {quickFilterChips.filter(chip => !chip.hidden).map(chip => (
                  <Button
                    key={chip.key}
                    variant={chip.active ? 'default' : 'outline'}
                    size="sm"
                    onClick={chip.onClick}
                    className="h-8"
                  >
                    {chip.label}
                  </Button>
                ))}
              </div>
            )}

            {activeFilterBadges.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {activeFilterBadges.map(item => (
                  <Badge key={item.key} variant="outline" className="gap-1 px-2 py-1 text-xs">
                    {item.label}
                    <button
                      type="button"
                      onClick={item.onRemove}
                      className="ml-1 rounded-sm text-muted-foreground hover:text-foreground"
                      aria-label={`移除筛选 ${item.label}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            {/* 操作按钮 */}
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>
                  显示 {filteredAndSortedRecords.length} / {records.length} 条记录
                </span>
                {(searchTerm || filterType !== 'all' || filterStatus !== 'all' || selectedTags.length > 0 || showFavoritesOnly) && (
                  <Button variant="ghost" size="sm" onClick={handleClearFilters}>
                    <X className="w-3 h-3 mr-1" />
                    清除筛选
                  </Button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button variant={batchSelectMode ? 'default' : 'outline'} size="sm" onClick={handleToggleBatchSelect}>
                  {batchSelectMode ? '退出多选' : '批量选择'}
                </Button>
                {batchSelectMode && (
                  <>
                    <Button variant="outline" size="sm" onClick={handleSelectCurrentPage}>
                      全选本页 ({paginatedRecords.length})
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleClearSelection}>
                      清空选择
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleBatchDelete}
                      disabled={selectedRecordIds.length === 0}
                    >
                      删除所选 ({selectedRecordIds.length})
                    </Button>
                  </>
                )}

                <Dialog open={showTagDialog} onOpenChange={setShowTagDialog}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>管理标签</DialogTitle>
                      <DialogDescription>
                        添加、编辑或删除标签
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>标签列表</Label>
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                          {tags.map(tag => (
                            <div key={tag.id} className="flex items-center justify-between p-2 border rounded">
                              <Badge
                                className={TAG_COLORS[tag.color as keyof typeof TAG_COLORS] || TAG_COLORS.gray}
                                variant="outline"
                              >
                                {tag.name}
                              </Badge>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteTag(tag.id)}
                                className="text-red-600"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>添加新标签</Label>
                        <Input
                          placeholder="标签名称"
                          value={newTagName}
                          onChange={(e) => setNewTagName(e.target.value)}
                        />
                        <div className="flex gap-2">
                          {Object.keys(TAG_COLORS).map(color => (
                            <button
                              type="button"
                              key={color}
                              onClick={() => setNewTagColor(color)}
                              className={`w-8 h-8 rounded border-2 ${
                                newTagColor === color ? 'border-black dark:border-white' : 'border-transparent'
                              } ${TAG_COLORS[color as keyof typeof TAG_COLORS]}`}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowTagDialog(false)}>
                        取消
                      </Button>
                      <Button onClick={handleAddTag}>添加标签</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <MoreHorizontal className="w-4 h-4 mr-1" />
                      更多操作
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>历史记录工具</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => setShowTagDialog(true)}>
                      <TagIcon className="w-4 h-4 mr-2" />
                      管理标签
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleExportCSV}>
                      <Download className="w-4 h-4 mr-2" />
                      导出 CSV
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleExportJSON}>
                      <FileJson className="w-4 h-4 mr-2" />
                      导出 JSON
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={handleRefresh}
                      disabled={refreshingCloud || authLoading}
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      {refreshingCloud ? '云端同步中...' : '刷新记录'}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={handleClearHistory}
                      disabled={records.length === 0}
                      className="text-red-600 focus:text-red-600"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      清空历史
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 主内容区 - 双栏/网格布局 */}
        {filteredAndSortedRecords.length === 0 ? (
          <Card className="border-2 shadow-lg">
            <CardContent className="py-16">
              <div className="text-center text-muted-foreground">
                <History className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <h3 className="text-lg font-medium mb-2">
                  {records.length === 0 ? '还没有历史记录' : '没有符合条件的记录'}
                </h3>
                <p className="text-sm">
                  {records.length === 0
                    ? '开始使用转存功能后，历史记录会显示在这里'
                    : '尝试调整搜索条件或筛选选项'
                  }
                </p>
              </div>
            </CardContent>
          </Card>
        ) : viewMode === HistoryViewMode.LIST ? (
          /* 双栏布局 */
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 左侧列表 */}
            <Card className="border-2 shadow-lg h-[calc(100vh-250px)] min-h-[600px]">
              <CardContent className="p-0 h-full flex flex-col">
                <div className="border-b px-4 py-3">
                  <div className="text-sm font-medium">记录列表</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    选择记录后，右侧会同步更新预览和详情。
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {paginatedRecords.map(record => renderListItem(record))}
                </div>

                {/* 分页 */}
                {totalPages > 1 && (
                  <div className="border-t p-4 flex items-center justify-between">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      上一页
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      第 {currentPage} / {totalPages} 页
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      下一页
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 右侧预览 */}
            <Card className="border-2 shadow-lg h-[calc(100vh-250px)] min-h-[600px]">
              <CardContent className="p-0 h-full">
                {renderPreviewPanel()}
              </CardContent>
            </Card>
          </div>
        ) : (
          /* 网格布局 */
          <div>
            <div className="mb-4 rounded-2xl border border-border/70 bg-background/70 px-4 py-3 text-sm text-muted-foreground">
              网格视图更适合快速扫缩略图和封面。点击任意卡片即可在当前页锁定选中状态。
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {paginatedRecords.map(record => renderGridItem(record))}
            </div>

            {/* 分页 */}
            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-center gap-4">
                <Button
                  variant="outline"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  上一页
                </Button>
                <span className="text-sm text-muted-foreground">
                  第 {currentPage} / {totalPages} 页
                </span>
                <Button
                  variant="outline"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  下一页
                </Button>
              </div>
            )}
          </div>
        )}

        <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle>记录详情</DialogTitle>
              <DialogDescription>
                查看完整历史记录数据（JSON）
              </DialogDescription>
            </DialogHeader>
            <div className="overflow-auto rounded-md border bg-muted/20 p-4">
              <pre className="text-xs leading-5 whitespace-pre-wrap break-all">
                {selectedRecord ? JSON.stringify(selectedRecord, null, 2) : '暂无记录'}
              </pre>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
