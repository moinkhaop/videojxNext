'use client'

import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  History,
  Search,
  Trash2,
  CheckCircle,
  XCircle,
  Clock,
  Video,
  Calendar,
  RefreshCw,
  Copy,
  Star,
  StarOff,
  Download,
  Filter,
  BarChart3,
  X,
  Grid3x3,
  List,
  SortAsc,
  Tag as TagIcon,
  Plus,
  Edit2,
  Image as ImageIcon,
  Play,
  ExternalLink,
  RotateCcw,
  Maximize2
} from 'lucide-react'
import { HistoryRecord, TaskStatus, ConversionTask, BatchTask, ExtendedBatchTask, BatchInputMode, HistoryStats, Tag, HistoryViewMode, HistorySortOption, MediaType } from '@/types'
import { HistoryManager, TagManager } from '@/lib/storage'
import { useRouter } from 'next/navigation'
import { VideoPreview } from '@/components/preview/VideoPreview'
import { ImageCarousel } from '@/components/preview/ImageCarousel'

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

export default function HistoryPage() {
  const router = useRouter()

  // 基础状态
  const [records, setRecords] = useState<HistoryRecord[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [stats, setStats] = useState<HistoryStats | null>(null)

  // 视图状态
  const [viewMode, setViewMode] = useState<HistoryViewMode>(HistoryViewMode.LIST)
  const [selectedRecord, setSelectedRecord] = useState<HistoryRecord | null>(null)

  // 筛选和搜索状态
  const [searchTerm, setSearchTerm] = useState('')
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

  // 分页状态
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 20

  useEffect(() => {
    loadData()
  }, [])

  const loadData = () => {
    const history = HistoryManager.getHistory()
    const allTags = TagManager.getTags()
    const statistics = HistoryManager.getStatistics()

    setRecords(history)
    setTags(allTags)
    setStats(statistics)
  }

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
    if (searchTerm.trim()) {
      const lowerKeyword = searchTerm.toLowerCase()
      filtered = filtered.filter(record => {
        const task = record.task as any
        return (
          task.videoTitle?.toLowerCase().includes(lowerKeyword) ||
          task.videoUrl?.toLowerCase().includes(lowerKeyword) ||
          task.name?.toLowerCase().includes(lowerKeyword)
        )
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
  }, [records, searchTerm, filterType, filterStatus, selectedTags, showFavoritesOnly, sortOption])

  // 分页数据
  const paginatedRecords = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    return filteredAndSortedRecords.slice(startIndex, endIndex)
  }, [filteredAndSortedRecords, currentPage, itemsPerPage])

  const totalPages = Math.ceil(filteredAndSortedRecords.length / itemsPerPage)

  // 操作处理函数
  const handleDeleteRecord = (id: string) => {
    if (confirm('确定要删除这条历史记录吗？')) {
      HistoryManager.deleteRecord(id)
      if (selectedRecord?.id === id) {
        setSelectedRecord(null)
      }
      loadData()
    }
  }

  const handleToggleFavorite = (id: string) => {
    HistoryManager.toggleFavorite(id)
    loadData()
    if (selectedRecord?.id === id) {
      const updated = HistoryManager.getHistory().find(r => r.id === id)
      if (updated) setSelectedRecord(updated)
    }
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

  const handleRetryTask = (record: HistoryRecord) => {
    if (record.type === 'single') {
      const task = record.task as ConversionTask
      const encodedUrl = encodeURIComponent(task.videoUrl)
      router.push(`/convert?url=${encodedUrl}`)
    }
  }

  const handleRecordClick = (record: HistoryRecord) => {
    setSelectedRecord(record)
    HistoryManager.updateLastViewedAt(record.id)
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
    if (selectedRecord?.id === recordId) {
      const updated = HistoryManager.getHistory().find(r => r.id === recordId)
      if (updated) setSelectedRecord(updated)
    }
  }

  const handleClearFilters = () => {
    setSearchTerm('')
    setFilterType('all')
    setFilterStatus('all')
    setSelectedTags([])
    setShowFavoritesOnly(false)
    setCurrentPage(1)
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
      loadData()
      setSelectedRecord(null)
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

  // 渲染列表项
  const renderListItem = (record: HistoryRecord) => {
    const task = record.task as any
    const isSelected = selectedRecord?.id === record.id
    const thumbnail = getRecordThumbnail(record)
    const recordTags = tags.filter(t => record.tags?.includes(t.id))

    return (
      <div
        key={record.id}
        onClick={() => handleRecordClick(record)}
        className={`p-4 border-b cursor-pointer hover:bg-accent/50 transition-colors ${
          isSelected ? 'bg-accent' : ''
        }`}
      >
        <div className="flex items-start gap-3">
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
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-medium truncate">{getRecordTitle(record)}</h3>
                  {record.isFavorite && (
                    <Star className="w-4 h-4 text-yellow-500 fill-yellow-500 flex-shrink-0" />
                  )}
                </div>

                {record.type === 'single' && (
                  <p className="text-xs text-muted-foreground truncate">
                    {task.videoUrl}
                  </p>
                )}

                {task.parsedVideoInfo?.author && (
                  <p className="text-xs text-muted-foreground mt-1">
                    作者: {task.parsedVideoInfo.author}
                  </p>
                )}
              </div>

              {/* 状态 */}
              <Badge className={`${getStatusBadgeColor(task.status)} flex-shrink-0`} variant="outline">
                {formatStatus(task.status)}
              </Badge>
            </div>

            {/* 标签和日期 */}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
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
                {new Date(record.createdAt).toLocaleString()}
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
    const thumbnail = getRecordThumbnail(record)
    const recordTags = tags.filter(t => record.tags?.includes(t.id))

    return (
      <Card
        key={record.id}
        onClick={() => handleRecordClick(record)}
        className="cursor-pointer hover:shadow-lg transition-all hover:-translate-y-1"
      >
        <CardContent className="p-0">
          {/* 缩略图 */}
          <div className="relative w-full h-40 bg-muted">
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
            {record.isFavorite && (
              <div className="absolute top-2 left-2">
                <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
              </div>
            )}
          </div>

          {/* 信息 */}
          <div className="p-4">
            <h3 className="font-medium truncate mb-2">{getRecordTitle(record)}</h3>

            {task.parsedVideoInfo?.author && (
              <p className="text-xs text-muted-foreground mb-2">
                作者: {task.parsedVideoInfo.author}
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

            <p className="text-xs text-muted-foreground">
              {new Date(record.createdAt).toLocaleString()}
            </p>
          </div>
        </CardContent>
      </Card>
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
    const recordTags = tags.filter(t => selectedRecord.tags?.includes(t.id))
    const parsedInfo = task.parsedVideoInfo

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
            >
              <Maximize2 className="w-4 h-4" />
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
          <div className="mb-6">
            {parsedInfo.mediaType === MediaType.VIDEO && parsedInfo.url && (
              <div className="aspect-video rounded-lg overflow-hidden border border-border">
                <VideoPreview
                  videoUrl={parsedInfo.url}
                  thumbnail={parsedInfo.cover || parsedInfo.thumbnail}
                  title={parsedInfo.title}
                  className="w-full h-full"
                />
              </div>
            )}

            {parsedInfo.mediaType === MediaType.IMAGE_ALBUM && parsedInfo.images && (
              <div className="rounded-lg overflow-hidden border border-border">
                <ImageCarousel
                  images={parsedInfo.images}
                  title={parsedInfo.title}
                  className="w-full"
                />
              </div>
            )}

            {!parsedInfo.url && !parsedInfo.images && parsedInfo.cover && (
              <div className="aspect-video bg-muted rounded-lg overflow-hidden border border-border">
                <img src={parsedInfo.cover} alt="封面" className="w-full h-full object-cover" />
              </div>
            )}
          </div>
        )}

        {/* 状态 */}
        <div className="mb-6">
          <Badge className={getStatusBadgeColor(task.status)} variant="outline">
            <div className="flex items-center gap-1">
              {getStatusIcon(task.status)}
              <span>{formatStatus(task.status)}</span>
            </div>
          </Badge>
        </div>

        {/* 标签管理 */}
        <div className="mb-6">
          <h3 className="text-sm font-medium mb-2">标签</h3>
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
          <div>
            <h3 className="text-sm font-medium mb-2">基本信息</h3>
            <div className="space-y-2 text-sm">
              {parsedInfo?.author && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">作者:</span>
                  <span>{parsedInfo.author}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">创建时间:</span>
                <span>{new Date(selectedRecord.createdAt).toLocaleString()}</span>
              </div>
              {task.completedAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">完成时间:</span>
                  <span>{new Date(task.completedAt).toLocaleString()}</span>
                </div>
              )}
              {parsedInfo?.duration && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">时长:</span>
                  <span>{Math.floor(parsedInfo.duration / 60)}:{(parsedInfo.duration % 60).toString().padStart(2, '0')}</span>
                </div>
              )}
            </div>
          </div>

          {selectedRecord.type === 'single' && (
            <div>
              <h3 className="text-sm font-medium mb-2">视频链接</h3>
              <div className="flex items-center gap-2">
                <Input
                  value={task.videoUrl}
                  readOnly
                  className="flex-1 text-sm"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCopyUrl(task.videoUrl)}
                >
                  <Copy className="w-4 h-4" />
                </Button>
                {task.status === TaskStatus.FAILED && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRetryTask(selectedRecord)}
                  >
                    <RotateCcw className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* {{ AURA: Add - 批量任务信息显示 }} */}
          {selectedRecord.type === 'batch' && (
            <div>
              <h3 className="text-sm font-medium mb-2">批量任务信息</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">任务总数:</span>
                  <span>{task.totalTasks} 个视频</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">成功数量:</span>
                  <span className="text-green-600">{task.completedTasks} 个</span>
                </div>
                {task.sourceUrl && (
                  <div className="mt-3">
                    <span className="text-muted-foreground block mb-1">用户主页链接:</span>
                    <div className="flex items-center gap-2">
                      <Input
                        value={task.sourceUrl}
                        readOnly
                        className="flex-1 text-sm"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCopyUrl(task.sourceUrl)}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {task.uploadResult?.filePath && (
            <div>
              <h3 className="text-sm font-medium mb-2">文件路径</h3>
              <p className="text-sm text-green-600 dark:text-green-400 break-all">
                {decodeURIComponent(task.uploadResult.filePath)}
              </p>
            </div>
          )}

          {task.error && (
            <div>
              <h3 className="text-sm font-medium mb-2 text-red-600">错误信息</h3>
              <p className="text-sm text-red-600 dark:text-red-400">
                {task.error}
              </p>
            </div>
          )}
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
            <h1 className="text-4xl font-bold bg-gradient-to-r from-emerald-600 to-emerald-500 bg-clip-text text-transparent">
              历史记录
            </h1>
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

        {/* 工具栏 */}
        <Card className="mb-6 border-2">
          <CardContent className="p-4">
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

            {/* 操作按钮 */}
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
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

              <div className="flex items-center gap-2">
                <Dialog open={showTagDialog} onOpenChange={setShowTagDialog}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <TagIcon className="w-4 h-4 mr-1" />
                      管理标签
                    </Button>
                  </DialogTrigger>
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

                <Button variant="outline" size="sm" onClick={handleExportCSV}>
                  <Download className="w-4 h-4 mr-1" />
                  CSV
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportJSON}>
                  <Download className="w-4 h-4 mr-1" />
                  JSON
                </Button>
                <Button variant="outline" size="sm" onClick={() => loadData()}>
                  <RefreshCw className="w-4 h-4 mr-1" />
                  刷新
                </Button>
                {records.length > 0 && (
                  <Button variant="destructive" size="sm" onClick={handleClearHistory}>
                    <Trash2 className="w-4 h-4 mr-1" />
                    清空
                  </Button>
                )}
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
      </div>
    </div>
  )
}
