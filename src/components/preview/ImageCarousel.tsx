'use client'

import { useState, useRef } from 'react'
import { ChevronLeft, ChevronRight, Download, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ImageInfo } from '@/types'

interface ImageCarouselProps {
  images: ImageInfo[]
  title?: string
  className?: string
  onImageClick?: (index: number) => void
}

export function ImageCarousel({ images, title, className = '', onImageClick }: ImageCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isImageLoaded, setIsImageLoaded] = useState<boolean[]>(new Array(images.length).fill(false))
  const [touchStart, setTouchStart] = useState<number | null>(null)
  const [touchEnd, setTouchEnd] = useState<number | null>(null)
  const carouselRef = useRef<HTMLDivElement>(null)

  const goToPrevious = () => {
    setCurrentIndex((prevIndex) => 
      prevIndex === 0 ? images.length - 1 : prevIndex - 1
    )
  }

  const goToNext = () => {
    setCurrentIndex((prevIndex) => 
      prevIndex === images.length - 1 ? 0 : prevIndex + 1
    )
  }

  const goToSlide = (index: number) => {
    setCurrentIndex(index)
  }

  const handleImageLoad = (index: number) => {
    setIsImageLoaded(prev => {
      const newState = [...prev]
      newState[index] = true
      return newState
    })
  }

  const handleImageError = (index: number) => {
    console.error(`图片加载失败: ${images[index]?.url}`)
  }

  // 触摸滑动处理
  const minSwipeDistance = 50

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null)
    setTouchStart(e.targetTouches[0].clientX)
  }

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX)
  }

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return
    
    const distance = touchStart - touchEnd
    const isLeftSwipe = distance > minSwipeDistance
    const isRightSwipe = distance < -minSwipeDistance

    if (isLeftSwipe) {
      goToNext()
    } else if (isRightSwipe) {
      goToPrevious()
    }
  }

  // 点击放大预览
  const handleImageClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onImageClick?.(currentIndex)
  }

  if (!images || images.length === 0) {
    return (
      <div className={`flex items-center justify-center h-48 bg-gray-100 rounded-lg ${className}`}>
        <div className="text-center">
          <Eye className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <p className="text-gray-500">暂无图片预览</p>
        </div>
      </div>
    )
  }

  const currentImage = images[currentIndex]

  return (
    <div 
      ref={carouselRef}
      className={`relative bg-gray-100 rounded-lg overflow-hidden ${className}`}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* 图片显示区域 - 采用aspect-ratio确保正确比例 */}
      <div className="relative w-full bg-gray-50 aspect-video">
        {/* 当前图片容器 */}
        <div
          className="absolute inset-0 flex items-center justify-center cursor-pointer"
          onClick={handleImageClick}
        >
          <img
            src={currentImage.url}
            alt={`图片 ${currentIndex + 1}`}
            className="max-w-full max-h-full object-contain transition-transform duration-200 hover:scale-[1.02] rounded shadow-sm"
            onLoad={() => handleImageLoad(currentIndex)}
            onError={() => handleImageError(currentIndex)}
            draggable={false}
          />
          
          {/* 加载指示器 */}
          {!isImageLoaded[currentIndex] && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-200 rounded">
              <div className="w-8 h-8 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
            </div>
          )}
        </div>

        {/* 导航按钮 - 左右切换，多图片时显示 */}
        {images.length > 1 && (
          <>
            {/* 左侧按钮 */}
            {/* {{ AURA: Modify - 改进导航控件样式 }} */}
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full w-10 h-10 hover:bg-black/70 transition-all duration-200 opacity-60 hover:opacity-100 focus:ring-2 focus:ring-white focus:ring-offset-2"
              onClick={(e) => {
                e.stopPropagation()
                goToPrevious()
              }}
            >
              <ChevronLeft className="w-6 h-6" />
            </Button>
            
            {/* 右侧按钮 */}
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full w-10 h-10 hover:bg-black/70 transition-all duration-200 opacity-60 hover:opacity-100 focus:ring-2 focus:ring-white focus:ring-offset-2"
              onClick={(e) => {
                e.stopPropagation()
                goToNext()
              }}
            >
              <ChevronRight className="w-6 h-6" />
            </Button>
          </>
        )}

        {/* 图片计数标签 */}
        {/* {{ AURA: Modify - 增加位置指示器样式 }} */}
        <Badge
          variant="secondary"
          className="absolute bottom-2 right-2 bg-black/60 text-white text-sm font-medium py-1 px-3 rounded-full z-10"
        >
          {currentIndex + 1} / {images.length}
        </Badge>
      </div>

      {/* 底部信息和控制栏 */}
      <div className="p-3 bg-white">
        <div className="flex items-center justify-between mb-2">
          <div className="flex-1 min-w-0">
            {title && (
              <h4 className="font-medium text-sm mb-1 truncate">{title}</h4>
            )}
            <p className="text-xs text-gray-500 truncate">
              图片 {currentIndex + 1}/{images.length}
              {currentImage.filename && ` • ${currentImage.filename}`}
              {currentImage.fileSize && ` • ${(currentImage.fileSize / 1024).toFixed(1)}KB`}
            </p>
          </div>
          
          {/* 操作按钮 */}
          <div className="flex items-center space-x-1 ml-2 flex-shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={(e) => {
                e.stopPropagation()
                window.open(currentImage.url, '_blank')
              }}
              title="新窗口打开"
            >
              <Eye className="w-3 h-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={(e) => {
                e.stopPropagation()
                const link = document.createElement('a')
                link.href = currentImage.url
                link.download = currentImage.filename || `image_${currentIndex + 1}.jpg`
                link.click()
              }}
              title="下载图片"
            >
              <Download className="w-3 h-3" />
            </Button>
          </div>
        </div>

        {/* 缩略图导航 - 仅在图片数量适中时显示 */}
        {images.length > 1 && images.length <= 8 && (
          <div className="flex space-x-2 overflow-x-auto pb-1">
            {images.map((image, index) => (
              <button
                key={index}
                className={`flex-shrink-0 w-16 h-16 rounded-md border-2 overflow-hidden transition-all duration-200 transform hover:scale-105 ${
                  index === currentIndex
                    ? 'border-blue-600 ring-2 ring-blue-300'
                    : 'border-gray-300 hover:border-blue-400'
                }`}
                onClick={(e) => {
                  e.stopPropagation()
                  goToSlide(index)
                }}
              >
                <img
                  src={image.url}
                  alt={`缩略图 ${index + 1}`}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        )}

        {/* 轮播指示器 - 用于大量图片 */}
        {images.length > 8 && (
          <div className="flex justify-center space-x-1">
            {Array.from({ length: Math.min(images.length, 15) }).map((_, index) => (
              <button
                key={index}
                className={`w-1.5 h-1.5 rounded-full transition-all duration-200 ${
                  index === currentIndex 
                    ? 'bg-blue-500' 
                    : 'bg-gray-300 hover:bg-gray-400'
                }`}
                onClick={(e) => {
                  e.stopPropagation()
                  goToSlide(index)
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}