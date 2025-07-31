'use client'

import { ParsedVideoInfo, MediaType } from '@/types'
import { VideoPreview } from './VideoPreview'
import { ImageCarousel } from './ImageCarousel'
import { MediaMetadata } from './MediaMetadata'
import { PreviewActions } from './PreviewActions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Play, Image, AlertTriangle } from 'lucide-react'

interface PreviewAreaProps {
  mediaInfo: ParsedVideoInfo
  isUploading?: boolean
  onConfirmUpload: () => void
  onReparse: () => void
  className?: string
}

export function PreviewArea({ 
  mediaInfo, 
  isUploading = false, 
  onConfirmUpload, 
  onReparse,
  className = '' 
}: PreviewAreaProps) {
  const isVideo = mediaInfo.mediaType === MediaType.VIDEO
  const isImageAlbum = mediaInfo.mediaType === MediaType.IMAGE_ALBUM

  return (
    <div className={`space-y-6 ${className}`}>
      {/* 预览区域标题 */}
      <div className="flex items-center space-x-2">
        {isVideo ? (
          <Play className="w-5 h-5 text-blue-600" />
        ) : (
          <Image className="w-5 h-5 text-green-600" />
        )}
        <h2 className="text-xl font-semibold">
          {isVideo ? '视频预览' : '图集预览'}
        </h2>
      </div>

      {/* 上方：内容预览区 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {mediaInfo.title || '未知标题'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* 媒体内容预览 */}
            {isVideo && mediaInfo.url ? (
              <VideoPreview
                videoUrl={mediaInfo.url}
                thumbnail={mediaInfo.thumbnail}
                title={mediaInfo.title}
                className="w-full aspect-video"
              />
            ) : isImageAlbum && mediaInfo.images && mediaInfo.images.length > 0 ? (
              <ImageCarousel
                images={mediaInfo.images}
                title={mediaInfo.title}
                className="w-full"
              />
            ) : (
              // 错误状态或无内容
              <div className="flex items-center justify-center h-64 bg-gray-100 rounded-lg">
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto mb-4 bg-gray-300 rounded-full flex items-center justify-center">
                    <AlertTriangle className="w-8 h-8 text-gray-500" />
                  </div>
                  <p className="text-gray-500 mb-2">无法预览内容</p>
                  <p className="text-sm text-gray-400">
                    {isVideo ? '视频URL无效或不可访问' : '图集为空或加载失败'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 下方：元信息与操作区 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左侧：元数据展示 */}
        <div className="lg:col-span-2">
          <MediaMetadata 
            mediaInfo={mediaInfo}
          />
        </div>

        {/* 右侧：操作按钮 */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">操作选项</CardTitle>
            </CardHeader>
            <CardContent>
              <PreviewActions
                mediaInfo={mediaInfo}
                isUploading={isUploading}
                onConfirmUpload={onConfirmUpload}
                onReparse={onReparse}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 底部提示信息 */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <div className="flex-shrink-0">
            {isVideo ? (
              <Play className="w-5 h-5 text-blue-500 mt-0.5" />
            ) : (
              <Image className="w-5 h-5 text-green-500 mt-0.5" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-medium text-gray-900 mb-1">
              预览功能说明
            </h4>
            <div className="text-sm text-gray-600 space-y-1">
              {isVideo ? (
                <>
                  <p>• 视频预览支持在线播放，可全屏观看</p>
                  <p>• 确认内容无误后，视频将以 {mediaInfo.format?.toUpperCase() || 'MP4'} 格式上传</p>
                  <p>• 上传过程中请勿关闭浏览器窗口</p>
                </>
              ) : (
                <>
                  <p>• 图集支持轮播浏览，可查看所有 {mediaInfo.imageCount || mediaInfo.images?.length || 0} 张图片</p>
                  <p>• 确认内容无误后，将创建专用文件夹保存所有图片</p>
                  <p>• 支持批量下载预览</p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}