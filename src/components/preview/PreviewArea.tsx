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
    <div className={`space-y-6 max-w-4xl mx-auto ${className}`}>
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
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">
              {mediaInfo.title || '未知标题'}
            </CardTitle>
            {/* {{ AURA: Add - 显示代理加载状态提示 }} */}
            {isVideo && mediaInfo.url && (
              <div className="flex items-center gap-1 px-2 py-1 bg-blue-50 dark:bg-blue-950/30 rounded text-xs text-blue-600 dark:text-blue-400">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                通过代理加载
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* 媒体内容预览 */}
            {isVideo && mediaInfo.url ? (
              <VideoPreview
                key={mediaInfo.url}
                videoUrl={mediaInfo.url}
                thumbnail={mediaInfo.thumbnail}
                title={mediaInfo.title}
                format={mediaInfo.format}
                className="w-full aspect-video"
                useProxy={true}
              />
            ) : isImageAlbum && mediaInfo.images && mediaInfo.images.length > 0 ? (
              <ImageCarousel
                images={mediaInfo.images}
                title={mediaInfo.title}
                className="w-full"
              />
            ) : (
              // {{ AURA: Modify - 改进无内容提示，提供更详细的指导 }}
              // 错误状态或无内容
              <div className="flex items-center justify-center h-64 bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-700">
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto mb-4 bg-gray-300 dark:bg-gray-600 rounded-full flex items-center justify-center">
                    <AlertTriangle className="w-8 h-8 text-gray-500 dark:text-gray-400" />
                  </div>
                  <p className="text-gray-600 dark:text-gray-300 mb-2 font-medium">无法预览内容</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                    {isVideo ? '视频URL无效或不可访问，请尝试重新解析' : '图集为空或加载失败'}
                  </p>
                  {isVideo && (
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      视频直链可能已过期，点击下方"重新解析"按钮获取新链接
                    </p>
                  )}
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
