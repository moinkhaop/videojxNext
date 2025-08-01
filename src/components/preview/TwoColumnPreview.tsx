'use client'

import { ParsedVideoInfo, MediaType, ConversionTask, TaskStatus } from '@/types'
import { VideoPreview } from './VideoPreview'
import { ImageCarousel } from './ImageCarousel'
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
} from 'lucide-react'

interface TwoColumnPreviewProps {
  mediaInfo: ParsedVideoInfo
  isUploading?: boolean
  onConfirmUpload: () => void
  onReparse: () => void
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
  className = '',
  currentTask,
  progress,
}: TwoColumnPreviewProps) {
  const isVideo = mediaInfo.mediaType === MediaType.VIDEO
  const isImageAlbum = mediaInfo.mediaType === MediaType.IMAGE_ALBUM

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
    <div className={`w-full ${className}`}>
      {/* 主标题区域 */}
      <div className="flex items-center space-x-2 mb-6">
        {isVideo ? (
          <Play className="w-6 h-6 text-blue-600" />
        ) : (
          <Image className="w-6 h-6 text-green-600" />
        )}
        <h2 className="text-2xl font-bold text-gray-900">
          解析与预览
        </h2>
      </div>

      {/* 双栏布局容器 - 响应式设计 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        
        {/* 左侧：视频播放器区域 (2/3宽度) */}
        <div className="lg:col-span-2">
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              {/* 媒体播放区域 */}
              <div className="relative bg-black aspect-video">
                {isVideo && mediaInfo.url ? (
                  <VideoPreview
                    videoUrl={mediaInfo.url}
                    thumbnail={mediaInfo.thumbnail}
                    title={mediaInfo.title}
                    className="w-full h-full"
                  />
                ) : isImageAlbum && mediaInfo.images && mediaInfo.images.length > 0 ? (
                  <ImageCarousel
                    images={mediaInfo.images}
                    title={mediaInfo.title}
                    className="w-full h-full"
                  />
                ) : (
                  // 错误状态
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center text-white">
                      <AlertTriangle className="w-16 h-16 mx-auto mb-4 opacity-60" />
                      <p className="text-lg font-medium mb-2">无法预览内容</p>
                      <p className="text-sm opacity-75">
                        {isVideo ? '视频URL无效或不可访问' : '图集为空或加载失败'}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* 视频标题栏 */}
              <div className="p-4 bg-white border-t">
                <h3 className="text-lg font-semibold text-gray-900 line-clamp-2">
                  {mediaInfo.title || '未知标题'}
                </h3>
                {mediaInfo.author && (
                  <p className="text-sm text-gray-600 mt-1">
                    作者: {mediaInfo.author}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 右侧：信息和操作区域 (1/3宽度) */}
        <div className="lg:col-span-1">
          <div className="flex flex-col space-y-4">
            
            {/* {{ AURA: Add - 任务状态模块已移入此组件 }} */}
            {currentTask && (
              <Card className="flex-shrink-0">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <h4 className="font-semibold text-gray-900 flex-shrink-0">任务状态</h4>
                    <div className="min-w-0">
                      <Badge className={getStatusColor(currentTask.status)}>
                        <div className="flex items-center space-x-1">
                          {getStatusIcon(currentTask.status)}
                          <span className="truncate">{getStatusText(currentTask.status)}</span>
                        </div>
                      </Badge>
                    </div>
                  </div>
                  {(isUploading || currentTask.status === TaskStatus.PARSING) && (
                    <div className="space-y-2">
                      <Progress value={progress} className="w-full" />
                      {/* {{ AURA: Remove - 移除独立的百分比显示 }} */}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* 视频详细信息卡片 */}
            <Card>
              <CardContent className="p-4">
                <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
                  {isVideo ? (
                    <FileVideo className="w-4 h-4 mr-2" />
                  ) : (
                    <ImageIcon className="w-4 h-4 mr-2" />
                  )}
                  媒体信息
                </h4>
                
                <div className="space-y-3 text-sm">
                  {/* 媒体类型 */}
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">类型</span>
                    <Badge variant={isVideo ? "default" : "secondary"}>
                      {isVideo ? '视频' : '图集'}
                    </Badge>
                  </div>

                  {/* 分辨率/格式 */}
                  {isVideo && mediaInfo.format && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">格式</span>
                      <span className="font-medium uppercase">{mediaInfo.format}</span>
                    </div>
                  )}

                  {/* 时长 */}
                  {mediaInfo.duration && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600 flex items-center">
                        <Clock className="w-3 h-3 mr-1" />
                        时长
                      </span>
                      <span className="font-medium">{mediaInfo.duration}</span>
                    </div>
                  )}

                  {/* 文件大小 */}
                  {mediaInfo.fileSize && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600 flex items-center">
                        <HardDrive className="w-3 h-3 mr-1" />
                        大小
                      </span>
                      <span className="font-medium">{formatFileSize(mediaInfo.fileSize)}</span>
                    </div>
                  )}

                  {/* 图片数量 */}
                  {isImageAlbum && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">图片数量</span>
                      <span className="font-medium">
                        {mediaInfo.imageCount || mediaInfo.images?.length || 0} 张
                      </span>
                    </div>
                  )}

                  {/* 观看次数 */}
                  {mediaInfo.viewCount && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">观看次数</span>
                      <span className="font-medium">{mediaInfo.viewCount}</span>
                    </div>
                  )}

                  {/* 上传日期 */}
                  {mediaInfo.uploadDate && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">上传日期</span>
                      <span className="font-medium">{mediaInfo.uploadDate}</span>
                    </div>
                  )}
                </div>

                {/* 描述信息 */}
                {mediaInfo.description && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-xs text-gray-600 mb-2">描述</p>
                    <p className="text-sm text-gray-700 line-clamp-4 leading-relaxed">
                      {mediaInfo.description}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 操作按钮卡片 */}
            <Card>
              <CardContent className="p-4">
                <h4 className="font-semibold text-gray-900 mb-4">操作选项</h4>
                
                <div className="space-y-3">
                  {/* 主要操作 - 确认上传 */}
                  <Button 
                    onClick={onConfirmUpload} 
                    disabled={isUploading}
                    className="w-full h-11 text-base font-medium"
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

                  {/* 次要操作按钮组 */}
                  <div className="grid grid-cols-2 gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={onReparse}
                      disabled={isUploading}
                      className="h-9"
                    >
                      <RotateCcw className="w-4 h-4 mr-1" />
                      重新解析
                    </Button>

                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={handleDownload}
                      className="h-9"
                    >
                      <Download className="w-4 h-4 mr-1" />
                      下载
                    </Button>
                  </div>

                  {/* 工具按钮组 */}
                  <div className="grid grid-cols-2 gap-2">
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={handleCopyLink}
                      className="h-9 text-xs"
                    >
                      <Copy className="w-4 h-4 mr-1" />
                      复制链接
                    </Button>

                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={handleOpenInNewTab}
                      className="h-9 text-xs"
                    >
                      <ExternalLink className="w-4 h-4 mr-1" />
                      新窗口
                    </Button>
                  </div>
                </div>

                {/* 上传进度提示 */}
                {isUploading && (
                  <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center text-blue-700">
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      <span className="text-sm font-medium">
                        正在上传{isVideo ? '视频' : '图集'}到WebDAV服务器...
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

          </div>
        </div>
      </div>
    </div>
  )
}