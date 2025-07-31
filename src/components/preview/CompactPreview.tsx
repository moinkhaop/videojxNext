'use client'

import { useState } from 'react'
import { ParsedVideoInfo, MediaType } from '@/types'
import { VideoPreview } from './VideoPreview'
import { ImageCarousel } from './ImageCarousel'
import { FullscreenModal } from './FullscreenModal'
import { Play, Image, AlertTriangle } from 'lucide-react'

interface CompactPreviewProps {
  mediaInfo: ParsedVideoInfo
  className?: string
}

export function CompactPreview({ mediaInfo, className = '' }: CompactPreviewProps) {
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false)
  const [selectedImageIndex, setSelectedImageIndex] = useState(0)
  const isVideo = mediaInfo.mediaType === MediaType.VIDEO
  const isImageAlbum = mediaInfo.mediaType === MediaType.IMAGE_ALBUM

  // {{ AURA: Add - 处理视频点击放大 }}
  const handleVideoClick = () => {
    setIsFullscreenOpen(true)
  }

  // {{ AURA: Add - 处理图片点击放大 }}
  const handleImageClick = (index: number) => {
    setSelectedImageIndex(index)
    setIsFullscreenOpen(true)
  }

  // {{ AURA: Add - 关闭全屏预览 }}
  const handleCloseFullscreen = () => {
    setIsFullscreenOpen(false)
  }

  return (
    <div className={`w-full ${className}`}>
      {/* {{ AURA: Add - 紧凑预览标题 }} */}
      <div className="flex items-center space-x-2 mb-3">
        {isVideo ? (
          <Play className="w-4 h-4 text-blue-600" />
        ) : (
          <Image className="w-4 h-4 text-green-600" />
        )}
        <h4 className="text-sm font-medium">
          {isVideo ? '视频预览' : '图集预览'}
        </h4>
      </div>

      {/* {{ AURA: Add - 紧凑媒体预览区域 }} */}
      <div className="space-y-3">
        {/* {{ AURA: Modify - 添加点击放大功能的媒体预览 }} */}
        {/* 媒体内容预览 */}
        {isVideo && mediaInfo.url ? (
          <VideoPreview
            videoUrl={mediaInfo.url}
            thumbnail={mediaInfo.thumbnail}
            title={mediaInfo.title}
            className="w-full aspect-video rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
            onClick={handleVideoClick}
          />
        ) : isImageAlbum && mediaInfo.images && mediaInfo.images.length > 0 ? (
          <ImageCarousel
            images={mediaInfo.images}
            title={mediaInfo.title}
            className="w-full rounded-lg"
            onImageClick={handleImageClick}
          />
        ) : (
          // {{ AURA: Add - 错误状态展示 }}
          <div className="flex items-center justify-center h-32 bg-gray-100 rounded-lg">
            <div className="text-center">
              <div className="w-8 h-8 mx-auto mb-2 bg-gray-300 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-4 h-4 text-gray-500" />
              </div>
              <p className="text-xs text-gray-500 mb-1">无法预览内容</p>
              <p className="text-xs text-gray-400">
                {isVideo ? 'URL无效' : '图集为空'}
              </p>
            </div>
          </div>
        )}

        {/* {{ AURA: Modify - 展示更多详细信息 }} */}
        <div className="text-xs space-y-2 bg-gray-50 p-3 rounded">
          <div>
            <p className="font-medium text-gray-900 mb-1 leading-relaxed" title={mediaInfo.title}>
              {mediaInfo.title || '未知标题'}
            </p>
          </div>
          
          {/* 基本信息行 */}
          <div className="grid grid-cols-2 gap-2 text-gray-600">
            {mediaInfo.author && (
              <div>
                <span className="text-gray-400">作者:</span>
                <span className="ml-1 truncate">{mediaInfo.author}</span>
              </div>
            )}
            
            {mediaInfo.duration && (
              <div>
                <span className="text-gray-400">时长:</span>
                <span className="ml-1">{mediaInfo.duration}</span>
              </div>
            )}
            
            {isVideo && mediaInfo.format && (
              <div>
                <span className="text-gray-400">格式:</span>
                <span className="ml-1 uppercase">{mediaInfo.format}</span>
              </div>
            )}
            
            {isImageAlbum && (
              <div>
                <span className="text-gray-400">图片数量:</span>
                <span className="ml-1">{mediaInfo.imageCount || mediaInfo.images?.length || 0}张</span>
              </div>
            )}
            
            {mediaInfo.fileSize && (
              <div>
                <span className="text-gray-400">大小:</span>
                <span className="ml-1">{(mediaInfo.fileSize / 1024 / 1024).toFixed(1)}MB</span>
              </div>
            )}
          </div>
          
          {/* 描述信息 */}
          {mediaInfo.description && (
            <div className="pt-1 border-t border-gray-200">
              <p className="text-gray-400 mb-1">描述:</p>
              <p className="text-gray-600 text-xs leading-relaxed line-clamp-2" title={mediaInfo.description}>
                {mediaInfo.description}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* {{ AURA: Add - 全屏预览模态 }} */}
      <FullscreenModal
        isOpen={isFullscreenOpen}
        onClose={handleCloseFullscreen}
        mediaInfo={mediaInfo}
        initialImageIndex={selectedImageIndex}
      />
    </div>
  )
}