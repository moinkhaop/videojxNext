'use client'

import { useState, useEffect } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ParsedVideoInfo, MediaType, ImageInfo } from '@/types'

interface FullscreenModalProps {
  isOpen: boolean
  onClose: () => void
  mediaInfo: ParsedVideoInfo
  initialImageIndex?: number
}

export function FullscreenModal({ isOpen, onClose, mediaInfo, initialImageIndex = 0 }: FullscreenModalProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(initialImageIndex)
  const isVideo = mediaInfo.mediaType === MediaType.VIDEO
  const isImageAlbum = mediaInfo.mediaType === MediaType.IMAGE_ALBUM

  useEffect(() => {
    setCurrentImageIndex(initialImageIndex)
  }, [initialImageIndex])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    const handleArrowKeys = (e: KeyboardEvent) => {
      if (!isImageAlbum || !mediaInfo.images) return
      
      if (e.key === 'ArrowLeft') {
        setCurrentImageIndex(prev => 
          prev === 0 ? mediaInfo.images!.length - 1 : prev - 1
        )
      } else if (e.key === 'ArrowRight') {
        setCurrentImageIndex(prev => 
          prev === mediaInfo.images!.length - 1 ? 0 : prev + 1
        )
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      document.addEventListener('keydown', handleArrowKeys)
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.removeEventListener('keydown', handleArrowKeys)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, onClose, isImageAlbum, mediaInfo.images])

  const goToPrevious = () => {
    if (!mediaInfo.images) return
    setCurrentImageIndex(prev => 
      prev === 0 ? mediaInfo.images!.length - 1 : prev - 1
    )
  }

  const goToNext = () => {
    if (!mediaInfo.images) return
    setCurrentImageIndex(prev => 
      prev === mediaInfo.images!.length - 1 ? 0 : prev + 1
    )
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-95 flex items-center justify-center">
      {/* {{ AURA: Add - 关闭按钮 }} */}
      <Button
        variant="ghost"
        size="sm"
        className="absolute top-4 right-4 z-10 text-white hover:bg-white hover:bg-opacity-20"
        onClick={onClose}
      >
        <X className="w-6 h-6" />
      </Button>

      {/* {{ AURA: Add - 全屏内容展示 }} */}
      <div className="w-full h-full flex items-center justify-center p-4">
        {isVideo && mediaInfo.url ? (
          // 视频全屏预览
          <video
            className="max-w-full max-h-full object-contain"
            controls
            autoPlay
            poster={mediaInfo.thumbnail}
          >
            <source src={mediaInfo.url} type="video/mp4" />
            <source src={mediaInfo.url} type="video/webm" />
            <source src={mediaInfo.url} type="video/ogg" />
            您的浏览器不支持视频播放。
          </video>
        ) : isImageAlbum && mediaInfo.images && mediaInfo.images.length > 0 ? (
          // 图集全屏预览
          <div className="relative w-full h-full flex items-center justify-center">
            <img
              src={mediaInfo.images[currentImageIndex]?.url}
              alt={`图片 ${currentImageIndex + 1}`}
              className="max-w-full max-h-full object-contain"
            />

            {/* {{ AURA: Add - 图集导航按钮 }} */}
            {mediaInfo.images.length > 1 && (
              <>
                <Button
                  variant="ghost"
                  size="lg"
                  className="absolute left-4 top-1/2 transform -translate-y-1/2 text-white hover:bg-white hover:bg-opacity-20"
                  onClick={goToPrevious}
                >
                  <ChevronLeft className="w-8 h-8" />
                </Button>
                
                <Button
                  variant="ghost"
                  size="lg"
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 text-white hover:bg-white hover:bg-opacity-20"
                  onClick={goToNext}
                >
                  <ChevronRight className="w-8 h-8" />
                </Button>

                {/* {{ AURA: Add - 图片索引指示器 }} */}
                <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-50 text-white px-3 py-1 rounded-full text-sm">
                  {currentImageIndex + 1} / {mediaInfo.images.length}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="text-white text-center">
            <p>无法显示预览内容</p>
          </div>
        )}
      </div>

      {/* {{ AURA: Add - 标题信息 }} */}
      {mediaInfo.title && (
        <div className="absolute bottom-4 left-4 bg-black bg-opacity-50 text-white px-4 py-2 rounded max-w-md">
          <h3 className="font-medium truncate">{mediaInfo.title}</h3>
          {mediaInfo.author && (
            <p className="text-sm text-gray-300 truncate">作者: {mediaInfo.author}</p>
          )}
        </div>
      )}
    </div>
  )
}