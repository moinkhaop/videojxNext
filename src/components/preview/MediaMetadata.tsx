'use client'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Clock, User, Image, Video, FileText, Calendar } from 'lucide-react'
import { ParsedVideoInfo, MediaType } from '@/types'
import { ConversionService } from '@/lib/conversion'

interface MediaMetadataProps {
  mediaInfo: ParsedVideoInfo
  className?: string
}

export function MediaMetadata({ mediaInfo, className = '' }: MediaMetadataProps) {
  const isVideo = mediaInfo.mediaType === MediaType.VIDEO
  const isImageAlbum = mediaInfo.mediaType === MediaType.IMAGE_ALBUM

  return (
    <Card className={`${className}`}>
      <CardContent className="p-4">
        {/* 标题和类型 */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-foreground mb-1 truncate">
              {mediaInfo.title || '未知标题'}
            </h3>
            <div className="flex items-center gap-2">
              <Badge 
                variant={isVideo ? "default" : "secondary"}
                className="flex items-center gap-1"
              >
                {isVideo ? (
                  <>
                    <Video className="w-3 h-3" />
                    视频
                  </>
                ) : (
                  <>
                    <Image className="w-3 h-3" />
                    图集
                  </>
                )}
              </Badge>
              {mediaInfo.format && isVideo && (
                <Badge variant="outline" className="text-xs">
                  {mediaInfo.format.toUpperCase()}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* 作者信息 */}
        {mediaInfo.author && (
          <div className="flex items-center gap-2 mb-3 text-sm text-muted-foreground">
            <User className="w-4 h-4" />
            <span>作者: {mediaInfo.author}</span>
          </div>
        )}

        {/* 媒体信息 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          {/* 视频专有信息 */}
          {isVideo && (
            <>
              {mediaInfo.duration && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  <span>时长: {ConversionService.formatDuration(mediaInfo.duration)}</span>
                </div>
              )}
              {mediaInfo.fileSize && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileText className="w-4 h-4" />
                  <span>大小: {ConversionService.formatFileSize(mediaInfo.fileSize)}</span>
                </div>
              )}
            </>
          )}

          {/* 图集专有信息 */}
          {isImageAlbum && (
            <>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Image className="w-4 h-4" />
                <span>图片数量: {mediaInfo.imageCount || mediaInfo.images?.length || 0}</span>
              </div>
              {mediaInfo.images && mediaInfo.images.length > 0 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileText className="w-4 h-4" />
                  <span>
                    总大小: {ConversionService.formatFileSize(
                      mediaInfo.images.reduce((total, img) => total + (img.fileSize || 0), 0)
                    )}
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* 描述信息 */}
        {mediaInfo.description && (
          <div className="mb-3">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">描述</span>
            </div>
            <p className="text-sm text-foreground bg-gray-50 p-3 rounded-md border">
              {mediaInfo.description}
            </p>
          </div>
        )}

        {/* 技术信息（可折叠的高级信息） */}
        <details className="group">
          <summary className="flex items-center gap-2 text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
            <Calendar className="w-4 h-4" />
            <span>技术信息</span>
            <span className="ml-auto group-open:rotate-180 transition-transform">▼</span>
          </summary>
          
          <div className="mt-2 pl-6 space-y-2 text-xs text-muted-foreground">
            <div className="grid grid-cols-2 gap-2">
              <span>媒体类型:</span>
              <span>{isVideo ? '视频文件' : '图片集合'}</span>
              
              {isVideo && mediaInfo.url && (
                <>
                  <span>视频URL:</span>
                  <span className="truncate" title={mediaInfo.url}>
                    {mediaInfo.url.substring(0, 50)}...
                  </span>
                </>
              )}
              
              {isVideo && mediaInfo.format && (
                <>
                  <span>视频格式:</span>
                  <span>{mediaInfo.format}</span>
                </>
              )}
              
              {isImageAlbum && mediaInfo.images && (
                <>
                  <span>图片格式:</span>
                  <span>JPEG/PNG/GIF</span>
                  <span>平均尺寸:</span>
                  <span>自适应</span>
                </>
              )}
            </div>
          </div>
        </details>

        {/* 操作提示 */}
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
          <p className="text-sm text-blue-700">
            <span className="font-medium">预览确认：</span>
            请确认{isVideo ? '视频' : '图集'}内容无误后，点击下方"确认并上传"按钮完成转存。
          </p>
        </div>
      </CardContent>
    </Card>
  )
}