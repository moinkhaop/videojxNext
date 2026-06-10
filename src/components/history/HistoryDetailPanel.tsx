'use client'

import { useMemo } from 'react'
import {
  CheckCircle,
  Copy,
  ExternalLink,
  FileJson,
  FolderOpen,
  History,
  Link2,
  RotateCcw,
  Star,
  StarOff,
  StickyNote,
  Trash2,
  XCircle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ImageCarousel } from '@/components/preview/ImageCarousel'
import { ImageGallery } from '@/components/preview/ImageGallery'
import { VideoPreview } from '@/components/preview/VideoPreview'
import { getMediaPreviewLabel, getMediaStageHeightClass, isAnimatedImageMedia } from '@/components/preview/media-helpers'
import { HistoryRecord, ImageInfo, MediaType, Tag, TaskStatus } from '@/types'

interface HistoryDetailPanelProps {
  selectedRecord: HistoryRecord | null
  tags: Tag[]
  noteDraft: string
  onNoteDraftChange: (value: string) => void
  onSaveNote: () => void
  onToggleFavorite: (id: string) => void
  onOpenDetailDialog: () => void
  onDeleteRecord: (id: string) => void
  onRetryTask: (record: HistoryRecord) => void
  onToggleRecordTag: (recordId: string, tagId: string) => void
  onCopyUrl: (url: string) => void
  onOpenExternalLink: (url?: string) => void
  tagColors: Record<string, string>
}

const getStatusIcon = (status: TaskStatus) => {
  switch (status) {
    case TaskStatus.SUCCESS:
      return <CheckCircle className="w-4 h-4 text-green-500" />
    case TaskStatus.FAILED:
      return <XCircle className="w-4 h-4 text-red-500" />
    default:
      return <History className="w-4 h-4 text-gray-500" />
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
    [TaskStatus.PREVIEWING]: '预览中',
  }
  return statusMap[status] || '未知'
}

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

export function HistoryDetailPanel({
  selectedRecord,
  tags,
  noteDraft,
  onNoteDraftChange,
  onSaveNote,
  onToggleFavorite,
  onOpenDetailDialog,
  onDeleteRecord,
  onRetryTask,
  onToggleRecordTag,
  onCopyUrl,
  onOpenExternalLink,
  tagColors,
}: HistoryDetailPanelProps) {
  if (!selectedRecord) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <div className="text-center">
          <History className="mx-auto mb-4 h-16 w-16 opacity-30" />
          <p>选择一条记录查看详情</p>
        </div>
      </div>
    )
  }

  const task = selectedRecord.task as any
  const parsedInfo = task.parsedVideoInfo
  const recordTitle = task.videoTitle || task.name || '未命名任务'
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
  const albumImages: ImageInfo[] = parsedInfo?.mediaType === MediaType.IMAGE_ALBUM
    ? (parsedInfo.images || []).filter((image: ImageInfo) => Boolean(image?.url))
    : []
  const useEnhancedAlbumWorkspace = albumImages.length > 3
  const previewHint = isAnimatedImage
    ? '动图将保持固定舞台展示，避免切换播放状态时布局抖动。'
    : parsedInfo?.mediaType === MediaType.VIDEO
      ? '视频区域已固定高度，点击播放后不会再挤压详情布局。'
      : useEnhancedAlbumWorkspace
        ? '多图图集会切换到图集工作台，支持网格、瀑布流和弹窗放大查看。'
        : '图集区域保持固定预览舞台，并补充缩略导航便于快速定位图片。'

  const uploadFilePath = (() => {
    if (!task.uploadResult?.filePath) return ''
    try {
      return decodeURIComponent(task.uploadResult.filePath)
    } catch {
      return task.uploadResult.filePath
    }
  })()

  const recordTags = useMemo(() => {
    const tagMap = new Map(tags.map(tag => [tag.id, tag]))
    return (selectedRecord.tags || [])
      .map(tagId => tagMap.get(tagId))
      .filter((tag): tag is Tag => Boolean(tag))
  }, [selectedRecord.tags, tags])

  const summaryMetrics = useMemo(() => {
    const items: Array<{ label: string; value: string; helper?: string; accentClass?: string }> = [
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
      items.push({
        label: '内容时长',
        value: formatDuration(parsedInfo.duration),
        helper: parsedInfo.fileSize ? `文件大小：${formatFileSize(parsedInfo.fileSize)}` : undefined,
      })
    } else if (parsedInfo?.mediaType === MediaType.IMAGE_ALBUM) {
      items.push({
        label: '图片数量',
        value: `${parsedInfo.imageCount || parsedInfo.images?.length || 0} 张`,
        helper: parsedInfo.fileSize
          ? `内容大小：${formatFileSize(parsedInfo.fileSize)}`
          : useEnhancedAlbumWorkspace
            ? '支持拼贴预览、网格浏览和大图查看'
            : '支持固定舞台与缩略条快速定位',
      })
    } else if (selectedRecord.type === 'batch') {
      items.push({
        label: '批量进度',
        value: `${task.completedTasks || 0} / ${task.totalTasks || 0}`,
        helper: '用于快速确认整批任务完成情况',
      })
    } else {
      items.push({
        label: '内容摘要',
        value: parsedInfo?.fileSize ? formatFileSize(parsedInfo.fileSize) : '等待更多媒体元信息',
        helper: '记录支持标签、备注和重新进入解析流程',
      })
    }

    return items
  }, [
    lastViewedHelper,
    lastViewedLabel,
    mediaLabel,
    parsedInfo,
    selectedRecord.createdAt,
    selectedRecord.type,
    task.completedAt,
    task.completedTasks,
    task.status,
    task.totalTasks,
    useEnhancedAlbumWorkspace,
  ])

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold">{recordTitle}</h2>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onToggleFavorite(selectedRecord.id)}
          >
            {selectedRecord.isFavorite ? (
              <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
            ) : (
              <StarOff className="h-4 w-4" />
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onOpenDetailDialog}
            title="查看完整记录 JSON"
          >
            <FileJson className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onDeleteRecord(selectedRecord.id)}
            className="text-red-600"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

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
                onClick={() => onRetryTask(selectedRecord)}
              >
                <RotateCcw className="mr-1 h-3 w-3" />
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
                    onClick={() => onRetryTask(selectedRecord)}
                    className="h-7"
                  >
                    <RotateCcw className="mr-1 h-3 w-3" />
                    重新解析
                  </Button>
                </div>
              )}
            </div>
          )}

          {parsedInfo.mediaType === MediaType.IMAGE_ALBUM && albumImages.length > 0 && (
            useEnhancedAlbumWorkspace ? (
              <div className="rounded-2xl overflow-hidden border border-border bg-background/95 p-4">
                <ImageGallery
                  key={`${selectedRecord.id}-${albumImages.length}`}
                  images={albumImages}
                  title={parsedInfo.title}
                  className="w-full"
                  autoSelectMode={true}
                />
              </div>
            ) : (
              <div className={`rounded-2xl overflow-hidden border border-border bg-muted ${mediaStageHeightClass}`}>
                <ImageCarousel
                  key={`${selectedRecord.id}-${albumImages.length}`}
                  images={albumImages}
                  title={parsedInfo.title}
                  className="h-full w-full"
                  showThumbnailStrip={true}
                />
              </div>
            )
          )}

          {!parsedInfo.url && albumImages.length === 0 && parsedInfo.cover && (
            <div className={`bg-muted rounded-2xl overflow-hidden border border-border ${mediaStageHeightClass}`}>
              <img src={parsedInfo.cover} alt="封面" className="h-full w-full object-cover" />
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

      <div className="mb-6 rounded-2xl border border-border/70 bg-background/80 p-4">
        <h3 className="mb-3 text-sm font-medium">标签</h3>
        <div className="flex flex-wrap gap-2">
          {tags.map(tag => {
            const isActive = recordTags.some(item => item.id === tag.id)
            return (
              <Badge
                key={tag.id}
                onClick={() => onToggleRecordTag(selectedRecord.id, tag.id)}
                className={`cursor-pointer ${
                  isActive
                    ? tagColors[tag.color as keyof typeof tagColors] || tagColors.gray
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

      <div className="space-y-4">
        <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
          <h3 className="mb-3 text-sm font-medium">基本信息</h3>
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
            <Link2 className="h-4 w-4 text-emerald-600" />
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
                    onClick={() => onCopyUrl(sourceUrl)}
                    title="复制链接"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onOpenExternalLink(sourceUrl)}
                    title="新窗口打开"
                  >
                    <ExternalLink className="h-4 w-4" />
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
                    onClick={() => onCopyUrl(directMediaUrl)}
                    title="复制媒体链接"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onOpenExternalLink(directMediaUrl)}
                    title="打开媒体链接"
                  >
                    <ExternalLink className="h-4 w-4" />
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
            <h3 className="mb-3 text-sm font-medium">批量任务信息</h3>
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
              <FolderOpen className="h-4 w-4 text-emerald-600" />
              <h3 className="text-sm font-medium">上传结果路径</h3>
            </div>
            <div className="space-y-3">
              <p className="break-all text-sm text-green-600 dark:text-green-400">
                {uploadFilePath}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onCopyUrl(uploadFilePath)}
                >
                  <Copy className="mr-1 h-4 w-4" />
                  复制路径
                </Button>
              </div>
            </div>
          </div>
        )}

        {task.error && (
          <div className="rounded-2xl border border-red-200/70 bg-red-50/70 p-4 dark:border-red-900 dark:bg-red-950/20">
            <h3 className="mb-2 text-sm font-medium text-red-600">错误信息</h3>
            <p className="text-sm text-red-600 dark:text-red-400">
              {task.error}
            </p>
          </div>
        )}

        <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
          <div className="mb-3 flex items-center gap-2">
            <StickyNote className="h-4 w-4 text-emerald-600" />
            <h3 className="text-sm font-medium">备注</h3>
          </div>
          <Textarea
            value={noteDraft}
            onChange={(event) => onNoteDraftChange(event.target.value)}
            placeholder="补充这条记录的用途、问题现象、重试结果或后续待办。"
            className="min-h-[120px]"
          />
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              备注会随历史记录一起保存，适合记录复盘信息和问题上下文。
            </p>
            <Button size="sm" onClick={onSaveNote} disabled={!noteChanged}>
              保存备注
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
