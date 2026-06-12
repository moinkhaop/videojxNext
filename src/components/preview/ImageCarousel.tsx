'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronLeft, ChevronRight, ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ImageInfo } from '@/types'

interface ImageCarouselProps {
  images: ImageInfo[]
  title?: string
  className?: string
  onImageClick?: (index: number) => void
  showThumbnailStrip?: boolean
}

export function ImageCarousel({
  images,
  title,
  className = '',
  onImageClick,
  showThumbnailStrip,
}: ImageCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isImageLoaded, setIsImageLoaded] = useState<boolean[]>(new Array(images.length).fill(false))
  const [touchStart, setTouchStart] = useState<number | null>(null)
  const [touchEnd, setTouchEnd] = useState<number | null>(null)
  const [imageTransition, setImageTransition] = useState(false)
  const carouselRef = useRef<HTMLDivElement>(null)
  const thumbnailRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // 当图集切换到新的记录时，重置选中图片和加载状态，避免沿用上一条记录的游标。
    setCurrentIndex(0)
    setImageTransition(false)
    setIsImageLoaded(new Array(images.length).fill(false))
  }, [images.length, images[0]?.url, images[images.length - 1]?.url])

  const goToPrevious = () => {
    setImageTransition(true)
    setCurrentIndex((prevIndex) =>
      prevIndex === 0 ? images.length - 1 : prevIndex - 1
    )
  }

  const goToNext = () => {
    setImageTransition(true)
    setCurrentIndex((prevIndex) =>
      prevIndex === images.length - 1 ? 0 : prevIndex + 1
    )
  }

  const goToSlide = (index: number) => {
    setImageTransition(true)
    setCurrentIndex(index)
  }

  const activeIndex = currentIndex >= images.length ? 0 : currentIndex

  useEffect(() => {
    if (thumbnailRef.current && thumbnailRef.current.children[activeIndex]) {
      const thumbnail = thumbnailRef.current.children[activeIndex] as HTMLElement
      thumbnail.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center'
      })
    }
    const timer = setTimeout(() => setImageTransition(false), 300)
    return () => clearTimeout(timer)
  }, [activeIndex])

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

  const handleImageClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onImageClick?.(activeIndex)
  }

  if (!images || images.length === 0) {
    return (
      <div className={`flex items-center justify-center h-96 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 ${className}`}>
        <div className="text-center">
          <div className="w-20 h-20 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
            <ImageIcon className="w-10 h-10 text-gray-400" />
          </div>
          <p className="text-gray-600 font-medium">暂无图片</p>
        </div>
      </div>
    )
  }

  const currentImage = images[activeIndex]

  const isFullHeight = className?.includes('h-full')
  const shouldShowThumbnailStrip = images.length > 1 && (showThumbnailStrip ?? !isFullHeight)
  const rootClassName = isFullHeight && shouldShowThumbnailStrip
    ? `w-full h-full flex flex-col ${className || ''}`
    : `w-full ${className || ''}`
  const stageClassName = isFullHeight
    ? shouldShowThumbnailStrip
      ? 'relative bg-black overflow-hidden rounded-xl flex-1 min-h-0'
      : 'relative bg-black overflow-hidden h-full'
    : 'relative bg-black overflow-hidden rounded-xl'

  return (
    <div className={rootClassName}>
      {/* 固定媒体舞台和缩略导航拆分后，可在 h-full 场景下保留缩略条而不压缩主图区域。 */}
      <div
        ref={carouselRef}
        className={stageClassName}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className={`relative w-full ${isFullHeight ? 'h-full' : 'h-[550px] md:h-[650px] lg:h-[750px]'}`}>
          <div
            className={`absolute inset-0 flex items-center justify-center cursor-pointer transition-opacity duration-300 ${
              imageTransition ? 'opacity-0' : 'opacity-100'
            }`}
            onClick={handleImageClick}
          >
            <img
              src={currentImage.url}
              alt={`图片 ${activeIndex + 1}`}
              className={`max-w-full max-h-full object-contain transition-all duration-300 ${
                isImageLoaded[activeIndex] ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
              }`}
              onLoad={() => handleImageLoad(activeIndex)}
              onError={() => handleImageError(activeIndex)}
              draggable={false}
            />

            {!isImageLoaded[activeIndex] && (
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin mb-3"></div>
                <p className="text-sm text-white/70">加载中...</p>
              </div>
            )}
          </div>

          {images.length > 1 && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white text-gray-900 rounded-full w-11 h-11 shadow-xl hover:scale-110 transition-all duration-200"
                onClick={(e) => {
                  e.stopPropagation()
                  goToPrevious()
                }}
              >
                <ChevronLeft className="w-6 h-6" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white text-gray-900 rounded-full w-11 h-11 shadow-xl hover:scale-110 transition-all duration-200"
                onClick={(e) => {
                  e.stopPropagation()
                  goToNext()
                }}
              >
                <ChevronRight className="w-6 h-6" />
              </Button>

              <div className="absolute bottom-4 right-4">
                <Badge className="bg-black/60 text-white text-sm font-medium py-1.5 px-3 rounded-full backdrop-blur-sm">
                  {activeIndex + 1} / {images.length}
                </Badge>
              </div>
            </>
          )}
        </div>
      </div>

      {shouldShowThumbnailStrip && (
        <div className={isFullHeight ? 'mt-3 shrink-0' : 'mt-4'}>
          <div
            ref={thumbnailRef}
            className="flex gap-2 overflow-x-auto pb-2 scroll-smooth image-carousel-thumbnails"
          >
            {images.map((image, index) => (
              <button
                key={index}
                className={`relative flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-all duration-200 ${
                  index === activeIndex
                    ? 'border-blue-500 ring-2 ring-blue-200 shadow-md'
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
                  className={`w-full h-full object-cover transition-opacity duration-200 ${
                    index === activeIndex ? 'opacity-100' : 'opacity-60 hover:opacity-100'
                  }`}
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
