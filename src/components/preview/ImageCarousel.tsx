'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, Download, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ImageInfo } from '@/types'

interface ImageCarouselProps {
  images: ImageInfo[]
  title?: string
  className?: string
}

export function ImageCarousel({ images, title, className = '' }: ImageCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isImageLoaded, setIsImageLoaded] = useState<boolean[]>(new Array(images.length).fill(false))

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

  if (!images || images.length === 0) {
    return (
      <div className={`flex items-center justify-center h-64 bg-gray-100 rounded-lg ${className}`}>
        <div className="text-center">
          <Eye className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <p className="text-gray-500">暂无图片预览</p>
        </div>
      </div>
    )
  }

  const currentImage = images[currentIndex]

  return (
    <div className={`relative bg-gray-100 rounded-lg overflow-hidden ${className}`}>
      {/* 主图显示区域 */}
      <div className="relative h-64 md:h-80 lg:h-96 flex items-center justify-center">
        {/* 当前图片 */}
        <div className="relative w-full h-full">
          <img
            src={currentImage.url}
            alt={`图片 ${currentIndex + 1}`}
            className="w-full h-full object-contain"
            onLoad={() => handleImageLoad(currentIndex)}
            onError={() => handleImageError(currentIndex)}
          />
          
          {/* 加载指示器 */}
          {!isImageLoaded[currentIndex] && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-200">
              <div className="w-8 h-8 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
            </div>
          )}
        </div>

        {/* 左右导航按钮 */}
        {images.length > 1 && (
          <>
            <Button
              variant="secondary"
              size="sm"
              className="absolute left-2 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 hover:bg-opacity-70 text-white border-0"
              onClick={goToPrevious}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            
            <Button
              variant="secondary"
              size="sm"
              className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 hover:bg-opacity-70 text-white border-0"
              onClick={goToNext}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </>
        )}

        {/* 图片计数标签 */}
        <Badge 
          variant="secondary" 
          className="absolute top-2 right-2 bg-black bg-opacity-50 text-white"
        >
          {currentIndex + 1} / {images.length}
        </Badge>
      </div>

      {/* 底部信息栏 */}
      <div className="p-3 bg-white border-t">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            {title && (
              <h4 className="font-medium text-sm mb-1 truncate">{title}</h4>
            )}
            <p className="text-xs text-gray-500">
              图片 {currentIndex + 1}/{images.length}
              {currentImage.filename && ` • ${currentImage.filename}`}
              {currentImage.fileSize && ` • ${(currentImage.fileSize / 1024).toFixed(1)}KB`}
            </p>
          </div>
          
          {/* 操作按钮 */}
          <div className="flex items-center space-x-1 ml-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => window.open(currentImage.url, '_blank')}
            >
              <Eye className="w-3 h-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => {
                const link = document.createElement('a')
                link.href = currentImage.url
                link.download = currentImage.filename || `image_${currentIndex + 1}.jpg`
                link.click()
              }}
            >
              <Download className="w-3 h-3" />
            </Button>
          </div>
        </div>

        {/* 缩略图导航 */}
        {images.length > 1 && images.length <= 10 && (
          <div className="flex space-x-1 mt-2 overflow-x-auto">
            {images.map((image, index) => (
              <button
                key={index}
                className={`flex-shrink-0 w-12 h-12 rounded border-2 overflow-hidden transition-all duration-200 ${
                  index === currentIndex 
                    ? 'border-blue-500 ring-2 ring-blue-200' 
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => goToSlide(index)}
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

        {/* 轮播指示器（用于大量图片） */}
        {images.length > 10 && (
          <div className="flex justify-center space-x-1 mt-2">
            {Array.from({ length: Math.min(images.length, 20) }).map((_, index) => (
              <button
                key={index}
                className={`w-2 h-2 rounded-full transition-all duration-200 ${
                  index === currentIndex 
                    ? 'bg-blue-500' 
                    : 'bg-gray-300 hover:bg-gray-400'
                }`}
                onClick={() => goToSlide(index)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}