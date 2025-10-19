'use client'

import { ParsedVideoInfo, MediaType, ConversionTask, TaskStatus } from '@/types'
import { VideoPreview } from './VideoPreview'
import { ImageCarousel } from './ImageCarousel'
import { ImageGallery } from './ImageGallery'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Play,
  Image,
  AlertTriangle,
  Upload,
  RotateCcw,
  Eye,
  Download,
  Loader2,
  Copy,
  ExternalLink,
  FileVideo,
  ImageIcon,
  Clock,
  HardDrive,
  CheckCircle,
  XCircle,
  Grid,
  List,
  Heart
} from 'lucide-react'

interface TwoColumnPreviewProps {
  mediaInfo: ParsedVideoInfo
  isUploading?: boolean
  onConfirmUpload: () => void
  onReparse: () => void
  onReset?: () => void
  className?: string
  currentTask: ConversionTask | null
  progress: number
}

// {{ AURA: Add - 从 convert/page.tsx 移入状态显示相关函数 }}
const getStatusIcon = (status: TaskStatus) => {
  switch (status) {
    case TaskStatus.PENDING:
      return <Loader2 className="w-4 h-4 animate-spin" />
    case TaskStatus.PARSING:
      return <Loader2 className="w-4 h-4 animate-spin" />
    case TaskStatus.PARSED:
      return <Eye className="w-4 h-4" />
    case TaskStatus.UPLOADING:
      return <Upload className="w-4 h-4 animate-bounce" />
    case TaskStatus.SUCCESS:
      return <CheckCircle className="w-4 h-4" />
    case TaskStatus.FAILED:
      return <XCircle className="w-4 h-4" />
    default:
      return null
  }
}

const getStatusText = (status: TaskStatus) => {
  switch (status) {
    case TaskStatus.PENDING:
      return '等待处理'
    case TaskStatus.PARSING:
      return '正在解析'
    case TaskStatus.PARSED:
      return '解析完成'
    case TaskStatus.UPLOADING:
      return '正在上传'
    case TaskStatus.SUCCESS:
      return '转存成功'
    case TaskStatus.FAILED:
      return '处理失败'
    default:
      return '状态未知'
  }
}

const getStatusColor = (status: TaskStatus) => {
  switch (status) {
    case TaskStatus.SUCCESS:
      return 'bg-green-500 text-white shadow-sm'
    case TaskStatus.FAILED:
      return 'bg-red-500 text-white shadow-sm'
    case TaskStatus.PARSED:
      return 'bg-blue-500 text-white shadow-sm'
    case TaskStatus.PARSING:
      return 'bg-orange-500 text-white shadow-sm animate-pulse'
    case TaskStatus.UPLOADING:
      return 'bg-purple-500 text-white shadow-sm animate-pulse'
    case TaskStatus.PENDING:
      return 'bg-gray-500 text-white shadow-sm'
    default:
      return 'bg-gray-400 text-white shadow-sm'
  }
}


export function TwoColumnPreview({
  mediaInfo,
  isUploading = false,
  onConfirmUpload,
  onReparse,
  onReset,
  className = '',
  currentTask,
  progress,
}: TwoColumnPreviewProps) {
  const isVideo = mediaInfo.mediaType === MediaType.VIDEO
  const isImageAlbum = mediaInfo.mediaType === MediaType.IMAGE_ALBUM
  
  // {{ AURA: Add - 智能显示模式选择 }}
  const useEnhancedGallery = isImageAlbum && mediaInfo.images && mediaInfo.images.length > 3

  // 复制链接到剪贴板
  const handleCopyLink = async () => {
    if (mediaInfo.url) {
      try {
        await navigator.clipboard.writeText(mediaInfo.url)
        // 这里可以添加toast提示
        console.log('链接已复制到剪贴板')
      } catch (err) {
        console.error('复制失败:', err)
      }
    }
  }

  // 在新标签页打开
  const handleOpenInNewTab = () => {
    if (isVideo && mediaInfo.url) {
      window.open(mediaInfo.url, '_blank')
    } else if (isImageAlbum && mediaInfo.images && mediaInfo.images.length > 0) {
      window.open(mediaInfo.images[0].url, '_blank')
    }
  }

  // 下载媒体
  const handleDownload = () => {
    if (isVideo && mediaInfo.url) {
      const link = document.createElement('a')
      link.href = mediaInfo.url
      link.download = `${mediaInfo.title || 'video'}.${mediaInfo.format || 'mp4'}`
      link.click()
    } else if (isImageAlbum && mediaInfo.images) {
      mediaInfo.images.forEach((image, index) => {
        setTimeout(() => {
          const link = document.createElement('a')
          link.href = image.url
          link.download = image.filename || `image_${index + 1}.jpg`
          link.click()
        }, index * 500)
      })
    }
  }

  // 格式化文件大小
  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '未知'
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`
    }
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  return (
    <div className={`w-full space-y-4 ${className}`}>
      {/* 主内容区域 - 改进的网格布局 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:items-stretch">

        {/* 左侧：媒体预览区域 */}
        <div className={useEnhancedGallery ? "lg:col-span-12" : "lg:col-span-5"}>
          {useEnhancedGallery ? (
            // 图集增强模式 - 使用ImageGallery组件
            <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800">
              <ImageGallery
                images={mediaInfo.images!}
                title={mediaInfo.title}
                autoSelectMode={true}
                className="w-full"
              />
            </div>
          ) : (
            // 标准视频/图集预览 - 自适应高度
            <div className="h-full flex flex-col">
              <div className="flex-1 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800 shadow-md">
                {isVideo && mediaInfo.url ? (
                  <VideoPreview
                    key={mediaInfo.url}
                    videoUrl={mediaInfo.url}
                    thumbnail={mediaInfo.thumbnail}
                    title={mediaInfo.title}
                    className="w-full h-full"
                  />
                ) : isImageAlbum && mediaInfo.images && mediaInfo.images.length > 0 ? (
                  <ImageCarousel
                    images={mediaInfo.images}
                    title={mediaInfo.title}
                    className="h-full"
                  />
                ) : (
                  // 错误状态
                  <div className="h-full flex items-center justify-center bg-black">
                    <div className="text-center text-white px-4">
                      <AlertTriangle className="w-16 h-16 mx-auto mb-4 opacity-60" />
                      <p className="text-lg font-medium mb-2">无法预览内容</p>
                      <p className="text-sm opacity-75">
                        {isVideo ? '视频URL无效或不可访问' : '图集为空或加载失败'}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* 描述信息 - 移到预览下方 */}
              {mediaInfo.description && (
                <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-800">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-1 h-4 bg-gradient-to-b from-blue-500 to-purple-500 rounded-full"></div>
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">描述</h4>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed line-clamp-3">
                    {mediaInfo.description}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 右侧：信息和操作区域 */}
        <div className={useEnhancedGallery ? "lg:col-span-12 mt-4" : "lg:col-span-7 space-y-4"}>
          <div className={useEnhancedGallery ? "grid grid-cols-1 md:grid-cols-2 gap-4" : "space-y-4"}>

          {/* 媒体详细信息 */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-900 shadow-sm">
            {/* 标题头部 */}
            <div className="p-4 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-start gap-3">
                {/* 作者头像或媒体类型图标 */}
                {mediaInfo.avatar ? (
                  <img
                    src={mediaInfo.avatar}
                    alt={mediaInfo.author || '作者头像'}
                    className="w-12 h-12 rounded-full object-cover shadow-md flex-shrink-0 ring-2 ring-white dark:ring-gray-700"
                  />
                ) : (
                  <div className={`p-2.5 rounded-xl shadow-md flex-shrink-0 ${
                    isVideo
                      ? 'bg-gradient-to-br from-blue-500 to-cyan-500'
                      : 'bg-gradient-to-br from-green-500 to-emerald-500'
                  }`}>
                    {isVideo ? (
                      <FileVideo className="w-5 h-5 text-white" />
                    ) : (
                      <ImageIcon className="w-5 h-5 text-white" />
                    )}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-base font-bold text-gray-900 dark:text-white line-clamp-2 flex-1">
                      {mediaInfo.title || '未知标题'}
                    </h3>
                    <Badge variant={isVideo ? "default" : "secondary"} className="font-medium flex-shrink-0 text-xs">
                      {isVideo ? '视频' : '图集'}
                    </Badge>
                  </div>
                  {mediaInfo.author && (
                    <p className="text-sm text-gray-900 dark:text-white font-medium mb-0.5">
                      {mediaInfo.author}
                    </p>
                  )}
                  {mediaInfo.signature && (
                    <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-1">
                      {mediaInfo.signature}
                    </p>
                  )}
                  {(mediaInfo.uid || mediaInfo.short_id) && (
                    <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 dark:text-gray-500">
                      {mediaInfo.uid && <span>UID: {mediaInfo.uid}</span>}
                      {mediaInfo.short_id && <span>ID: {mediaInfo.short_id}</span>}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 基本信息 */}
            <div className="p-4">
              <div className="grid grid-cols-2 gap-3">
                {/* 时长/图片数量 */}
                {isVideo && mediaInfo.duration && (
                  <div className="flex flex-col p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-100 dark:border-blue-900">
                    <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 mb-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span className="text-xs font-medium">时长</span>
                    </div>
                    <span className="text-sm font-bold text-gray-900 dark:text-white">{mediaInfo.duration}</span>
                  </div>
                )}
                {isImageAlbum && (
                  <div className="flex flex-col p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-100 dark:border-green-900">
                    <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400 mb-1">
                      <ImageIcon className="w-3.5 h-3.5" />
                      <span className="text-xs font-medium">图片</span>
                    </div>
                    <span className="text-sm font-bold text-gray-900 dark:text-white">
                      {mediaInfo.imageCount || mediaInfo.images?.length || 0} 张
                    </span>
                  </div>
                )}

                {/* 点赞数 */}
                {mediaInfo.like !== undefined && (
                  <div className="flex flex-col p-3 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-100 dark:border-red-900">
                    <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400 mb-1">
                      <Heart className="w-3.5 h-3.5 fill-current" />
                      <span className="text-xs font-medium">点赞</span>
                    </div>
                    <span className="text-sm font-bold text-gray-900 dark:text-white">
                      {mediaInfo.like.toLocaleString()}
                    </span>
                  </div>
                )}

                {/* 文件大小 */}
                {mediaInfo.fileSize && (
                  <div className="flex flex-col p-3 bg-purple-50 dark:bg-purple-950/20 rounded-lg border border-purple-100 dark:border-purple-900">
                    <div className="flex items-center gap-1.5 text-purple-600 dark:text-purple-400 mb-1">
                      <HardDrive className="w-3.5 h-3.5" />
                      <span className="text-xs font-medium">大小</span>
                    </div>
                    <span className="text-sm font-bold text-gray-900 dark:text-white">{formatFileSize(mediaInfo.fileSize)}</span>
                  </div>
                )}

                {/* 格式 */}
                {isVideo && mediaInfo.format && (
                  <div className="flex flex-col p-3 bg-orange-50 dark:bg-orange-950/20 rounded-lg border border-orange-100 dark:border-orange-900">
                    <div className="flex items-center gap-1.5 text-orange-600 dark:text-orange-400 mb-1">
                      <FileVideo className="w-3.5 h-3.5" />
                      <span className="text-xs font-medium">格式</span>
                    </div>
                    <span className="text-sm font-bold text-gray-900 dark:text-white uppercase">{mediaInfo.format}</span>
                  </div>
                )}
              </div>

              {/* 详细信息列表 */}
              {(mediaInfo.viewCount || mediaInfo.uploadDate || mediaInfo.time) && (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 space-y-2">
                  {/* 观看次数 */}
                  {mediaInfo.viewCount && (
                    <div className="flex items-center justify-between py-1.5 px-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded transition-colors">
                      <span className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-2">
                        <Eye className="w-3.5 h-3.5" />
                        观看次数
                      </span>
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">{mediaInfo.viewCount}</span>
                    </div>
                  )}

                  {/* 发布时间 */}
                  {mediaInfo.time && (
                    <div className="flex items-center justify-between py-1.5 px-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded transition-colors">
                      <span className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5" />
                        发布时间
                      </span>
                      <span className="text-xs font-medium text-gray-900 dark:text-white">
                        {typeof mediaInfo.time === 'string' ? mediaInfo.time : new Date(mediaInfo.time).toLocaleString()}
                      </span>
                    </div>
                  )}

                  {/* 上传日期 */}
                  {mediaInfo.uploadDate && !mediaInfo.time && (
                    <div className="flex items-center justify-between py-1.5 px-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded transition-colors">
                      <span className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5" />
                        上传日期
                      </span>
                      <span className="text-xs font-medium text-gray-900 dark:text-white">{mediaInfo.uploadDate}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 操作按钮区域 */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-900 shadow-sm">
            {/* 头部标题 */}
            <div className="px-4 py-3 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 border-b border-gray-200 dark:border-gray-700">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <div className="w-1 h-4 bg-gradient-to-b from-blue-500 to-purple-500 rounded-full"></div>
                操作选项
              </h4>
            </div>

            <div className="p-4 space-y-3">
              {/* 主要操作 - 确认上传或成功状态 */}
              {currentTask?.status === TaskStatus.SUCCESS ? (
                <>
                  {/* 上传成功状态 */}
                  <Button
                    disabled
                    className="w-full h-12 text-base font-semibold bg-gradient-to-r from-green-600 to-emerald-600 shadow-lg cursor-default"
                    size="lg"
                  >
                    <CheckCircle className="w-5 h-5 mr-2" />
                    上传成功
                  </Button>

                  {/* 开始新的转存按钮 */}
                  {onReset && (
                    <Button
                      onClick={onReset}
                      variant="outline"
                      className="w-full h-10 text-sm font-medium border-2 border-blue-500 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-all"
                      size="lg"
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      开始新的转存
                    </Button>
                  )}
                </>
              ) : (
                /* 正常上传按钮 */
                <Button
                  onClick={onConfirmUpload}
                  disabled={isUploading}
                  className="w-full h-12 text-base font-semibold bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 shadow-lg hover:shadow-xl transition-all"
                  size="lg"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      上传中...
                    </>
                  ) : (
                    <>
                      <Upload className="w-5 h-5 mr-2" />
                      确认并上传
                    </>
                  )}
                </Button>
              )}

              {/* 次要操作按钮组 */}
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onReparse}
                    disabled={isUploading}
                    className="h-10 border-gray-300 dark:border-gray-600 hover:bg-blue-50 dark:hover:bg-blue-950/20 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
                  >
                    <RotateCcw className="w-4 h-4 mr-1.5" />
                    重新解析
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownload}
                    className="h-10 border-gray-300 dark:border-gray-600 hover:bg-green-50 dark:hover:bg-green-950/20 hover:border-green-300 dark:hover:border-green-700 transition-colors"
                  >
                    <Download className="w-4 h-4 mr-1.5" />
                    下载
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyLink}
                    className="h-10 border-gray-300 dark:border-gray-600 hover:bg-purple-50 dark:hover:bg-purple-950/20 hover:border-purple-300 dark:hover:border-purple-700 transition-colors"
                  >
                    <Copy className="w-4 h-4 mr-1.5" />
                    复制链接
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleOpenInNewTab}
                    className="h-10 border-gray-300 dark:border-gray-600 hover:bg-orange-50 dark:hover:bg-orange-950/20 hover:border-orange-300 dark:hover:border-orange-700 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4 mr-1.5" />
                    新窗口
                  </Button>
                </div>
              </div>
            </div>
          </div>

          </div>
        </div>
      </div>
    </div>
  )
}