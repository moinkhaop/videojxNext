'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { 
  ChevronLeft, 
  ChevronRight, 
  Download, 
  Eye, 
  Grid, 
  List, 
  Maximize2,
  ZoomIn,
  ZoomOut,
  RotateCw,
  X,
  Check,
  DownloadCloud,
  Image as ImageIcon
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { ImageInfo } from '@/types'
import { ImagePreviewModal } from './ImagePreviewModal'

// 显示模式枚举
export enum DisplayMode {
  CAROUSEL = 'carousel',    // 轮播模式
  GRID = 'grid',           // 网格模式
  MASONRY = 'masonry'      // 瀑布流模式
}

interface ImageGalleryProps {
  images: ImageInfo[]
  title?: string
  className?: string
  onImageClick?: (index: number) => void
  autoSelectMode?: boolean // 是否自动选择最佳显示模式
}

interface LazyImageProps {
  src: string
  alt: string
  className?: string
  onLoad?: () => void
  onError?: () => void
  onClick?: () => void
}

// {{ AURA: Add - 懒加载图片组件 }}
function LazyImage({ src, alt, className = '', onLoad, onError, onClick }: LazyImageProps) {
  const [isLoaded, setIsLoaded] = useState(false)
  const [isError, setIsError] = useState(false)
  const [isInView, setIsInView] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true)
          observer.disconnect()
        }
      },
      { threshold: 0.1 }
    )

    if (imgRef.current) {
      observer.observe(imgRef.current)
    }

    return () => observer.disconnect()
  }, [])

  const handleLoad = () => {
    setIsLoaded(true)
    onLoad?.()
  }

  const handleError = () => {
    setIsError(true)
    onError?.()
  }

  return (
    <div ref={imgRef} className={`relative ${className}`} onClick={onClick}>
      {/* 加载占位符 */}
      {!isLoaded && !isError && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded">
          {isInView ? (
            <div className="w-6 h-6 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <ImageIcon className="w-8 h-8 text-gray-400" />
          )}
        </div>
      )}

      {/* 错误状态 */}
      {isError && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded">
          <div className="text-center">
            <X className="w-8 h-8 text-red-400 mx-auto mb-2" />
            <p className="text-xs text-red-500">加载失败</p>
          </div>
        </div>
      )}

      {/* 实际图片 */}
      {isInView && (
        <img
          src={src}
          alt={alt}
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            isLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          onLoad={handleLoad}
          onError={handleError}
          draggable={false}
        />
      )}
    </div>
  )
}

export function ImageGallery({ 
  images, 
  title, 
  className = '', 
  onImageClick,
  autoSelectMode = true 
}: ImageGalleryProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [displayMode, setDisplayMode] = useState<DisplayMode>(DisplayMode.CAROUSEL)
  const [selectedImages, setSelectedImages] = useState<Set<number>>(new Set())
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [fullscreenIndex, setFullscreenIndex] = useState(0)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalIndex, setModalIndex] = useState(0)
  const [touchStart, setTouchStart] = useState<number | null>(null)
  const [touchEnd, setTouchEnd] = useState<number | null>(null)
  const galleryRef = useRef<HTMLDivElement>(null)
  const activeIndex = currentIndex >= images.length ? 0 : currentIndex

  // 当切换到另一条图集记录时，清空上一条记录的轮播索引与批量选择状态。
  useEffect(() => {
    setCurrentIndex(0)
    setFullscreenIndex(0)
    setSelectedImages(new Set())
    setIsModalOpen(false)
    setModalIndex(0)
  }, [images.length, images[0]?.url, images[images.length - 1]?.url])

  // {{ AURA: Add - 自动选择最佳显示模式 }}
  useEffect(() => {
    if (autoSelectMode) {
      if (images.length <= 3) {
        setDisplayMode(DisplayMode.CAROUSEL)
      } else if (images.length <= 12) {
        setDisplayMode(DisplayMode.GRID)
      } else {
        setDisplayMode(DisplayMode.MASONRY)
      }
    }
  }, [images.length, autoSelectMode])

  // {{ AURA: Add - 键盘导航支持 }}
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isFullscreen) {
        switch (e.key) {
          case 'ArrowLeft':
            e.preventDefault()
            goToPrevious()
            break
          case 'ArrowRight':
            e.preventDefault()
            goToNext()
            break
          case 'Escape':
            e.preventDefault()
            setIsFullscreen(false)
            break
        }
      }
    }

    if (isFullscreen) {
      document.addEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'auto'
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'auto'
    }
  }, [isFullscreen])

  const goToPrevious = useCallback(() => {
    if (isFullscreen) {
      setFullscreenIndex((prev) => prev === 0 ? images.length - 1 : prev - 1)
    } else {
      setCurrentIndex((prev) => prev === 0 ? images.length - 1 : prev - 1)
    }
  }, [images.length, isFullscreen])

  const goToNext = useCallback(() => {
    if (isFullscreen) {
      setFullscreenIndex((prev) => prev === images.length - 1 ? 0 : prev + 1)
    } else {
      setCurrentIndex((prev) => prev === images.length - 1 ? 0 : prev + 1)
    }
  }, [images.length, isFullscreen])

  const goToSlide = (index: number) => {
    if (isFullscreen) {
      setFullscreenIndex(index)
    } else {
      setCurrentIndex(index)
    }
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

  // 图片点击处理
  const handleImageClick = (index: number) => {
    setModalIndex(index)
    setIsModalOpen(true)
    onImageClick?.(index)
  }

  // 批量选择处理
  const toggleImageSelection = (index: number) => {
    const newSelected = new Set(selectedImages)
    if (newSelected.has(index)) {
      newSelected.delete(index)
    } else {
      newSelected.add(index)
    }
    setSelectedImages(newSelected)
  }

  // 批量下载
  const handleBatchDownload = () => {
    const selectedIndexes = Array.from(selectedImages)
    selectedIndexes.forEach((index, i) => {
      setTimeout(() => {
        const image = images[index]
        const link = document.createElement('a')
        link.href = image.url
        link.download = image.filename || `image_${index + 1}.jpg`
        link.click()
      }, i * 300)
    })
  }

  if (!images || images.length === 0) {
    return (
      <div className={`flex items-center justify-center h-48 bg-gray-100 rounded-lg ${className}`}>
        <div className="text-center">
          <ImageIcon className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <p className="text-gray-500">暂无图片预览</p>
        </div>
      </div>
    )
  }

  // {{ AURA: Add - 轮播模式渲染 }}
  const renderCarouselMode = () => (
    <div className="relative">
      {/* 主图片显示区域 */}
      <div 
        className="relative w-full bg-gray-50 aspect-video rounded-lg overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="absolute inset-0 flex items-center justify-center cursor-pointer">
          <LazyImage
            src={images[activeIndex].url}
            alt={`图片 ${activeIndex + 1}`}
            className="max-w-full max-h-full object-contain rounded shadow-sm transition-transform duration-200 hover:scale-[1.02]"
            onClick={() => handleImageClick(activeIndex)}
          />
        </div>

        {/* 导航按钮 */}
        {images.length > 1 && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full w-10 h-10 hover:bg-black/70 transition-all duration-200 opacity-60 hover:opacity-100"
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
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full w-10 h-10 hover:bg-black/70 transition-all duration-200 opacity-60 hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation()
                goToNext()
              }}
            >
              <ChevronRight className="w-6 h-6" />
            </Button>
          </>
        )}

        {/* 图片计数 */}
        <Badge className="absolute bottom-2 right-2 bg-black/60 text-white text-sm font-medium py-1 px-3 rounded-full z-10">
          {activeIndex + 1} / {images.length}
        </Badge>
      </div>

      {/* 增强的缩略图导航 */}
      {images.length > 1 && (
        <div className="mt-4 p-4 bg-white rounded-lg border">
          <div className="flex space-x-2 overflow-x-auto pb-2">
            {images.map((image, index) => (
              <button
                key={index}
                className={`flex-shrink-0 w-20 h-20 rounded-md border-2 overflow-hidden transition-all duration-200 transform hover:scale-105 ${
                  index === activeIndex
                    ? 'border-blue-600 ring-2 ring-blue-300'
                    : 'border-gray-300 hover:border-blue-400'
                }`}
                onClick={() => goToSlide(index)}
              >
                <LazyImage
                  src={image.url}
                  alt={`缩略图 ${index + 1}`}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  // {{ AURA: Add - 网格模式渲染 }}
  const renderGridMode = () => (
    <div className="space-y-4">
      {/* 批量操作栏 */}
      {selectedImages.size > 0 && (
        <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
          <span className="text-sm font-medium text-blue-700">
            已选择 {selectedImages.size} 张图片
          </span>
          <div className="flex space-x-2">
            <Button size="sm" onClick={handleBatchDownload} variant="outline">
              <DownloadCloud className="w-4 h-4 mr-1" />
              批量下载
            </Button>
            <Button size="sm" onClick={() => setSelectedImages(new Set())} variant="ghost">
              取消选择
            </Button>
          </div>
        </div>
      )}

      {/* 网格布局 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {images.map((image, index) => (
          <Card key={index} className="overflow-hidden group hover:shadow-lg transition-shadow duration-200">
            <CardContent className="p-0 relative">
              {/* 选择框 */}
              <button
                className="absolute top-2 left-2 z-10 w-6 h-6 rounded-full border-2 border-white bg-black/20 hover:bg-black/40 transition-colors duration-200 flex items-center justify-center"
                onClick={(e) => {
                  e.stopPropagation()
                  toggleImageSelection(index)
                }}
              >
                {selectedImages.has(index) && (
                  <Check className="w-4 h-4 text-white" />
                )}
              </button>

              {/* 图片 */}
              <div className="aspect-square relative overflow-hidden cursor-pointer">
                <LazyImage
                  src={image.url}
                  alt={`图片 ${index + 1}`}
                  className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                  onClick={() => handleImageClick(index)}
                />

                {/* 悬停操作按钮 */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-200 flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <div className="flex space-x-2">
                    <Button size="icon" variant="ghost" className="w-8 h-8 bg-white/80 hover:bg-white">
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="w-8 h-8 bg-white/80 hover:bg-white"
                      onClick={(e) => {
                        e.stopPropagation()
                        const link = document.createElement('a')
                        link.href = image.url
                        link.download = image.filename || `image_${index + 1}.jpg`
                        link.click()
                      }}
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* 图片信息 */}
              <div className="p-2">
                <p className="text-xs text-gray-600 truncate">
                  {image.filename || `图片 ${index + 1}`}
                </p>
                {image.fileSize && (
                  <p className="text-xs text-gray-400">
                    {(image.fileSize / 1024).toFixed(1)}KB
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )

  // {{ AURA: Add - 瀑布流模式渲染 }}
  const renderMasonryMode = () => (
    <div className="space-y-4">
      {/* 批量操作栏 */}
      {selectedImages.size > 0 && (
        <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
          <span className="text-sm font-medium text-blue-700">
            已选择 {selectedImages.size} 张图片
          </span>
          <div className="flex space-x-2">
            <Button size="sm" onClick={handleBatchDownload} variant="outline">
              <DownloadCloud className="w-4 h-4 mr-1" />
              批量下载
            </Button>
            <Button size="sm" onClick={() => setSelectedImages(new Set())} variant="ghost">
              取消选择
            </Button>
          </div>
        </div>
      )}

      {/* 瀑布流布局 */}
      <div className="columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4">
        {images.map((image, index) => (
          <Card key={index} className="break-inside-avoid mb-4 overflow-hidden group hover:shadow-lg transition-shadow duration-200">
            <CardContent className="p-0 relative">
              {/* 选择框 */}
              <button
                className="absolute top-2 left-2 z-10 w-6 h-6 rounded-full border-2 border-white bg-black/20 hover:bg-black/40 transition-colors duration-200 flex items-center justify-center"
                onClick={(e) => {
                  e.stopPropagation()
                  toggleImageSelection(index)
                }}
              >
                {selectedImages.has(index) && (
                  <Check className="w-4 h-4 text-white" />
                )}
              </button>

              {/* 图片 */}
              <div className="relative overflow-hidden cursor-pointer">
                <LazyImage
                  src={image.url}
                  alt={`图片 ${index + 1}`}
                  className="w-full object-cover transition-transform duration-200 group-hover:scale-105"
                  onClick={() => handleImageClick(index)}
                />

                {/* 悬停操作按钮 */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-200 flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <div className="flex space-x-2">
                    <Button size="icon" variant="ghost" className="w-8 h-8 bg-white/80 hover:bg-white">
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="w-8 h-8 bg-white/80 hover:bg-white"
                      onClick={(e) => {
                        e.stopPropagation()
                        const link = document.createElement('a')
                        link.href = image.url
                        link.download = image.filename || `image_${index + 1}.jpg`
                        link.click()
                      }}
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* 图片信息 */}
              <div className="p-2">
                <p className="text-xs text-gray-600 truncate">
                  {image.filename || `图片 ${index + 1}`}
                </p>
                {image.fileSize && (
                  <p className="text-xs text-gray-400">
                    {(image.fileSize / 1024).toFixed(1)}KB
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )

  return (
    <div ref={galleryRef} className={`w-full ${className}`}>
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between mb-4 p-3 bg-white rounded-lg border">
        <div className="flex items-center space-x-2">
          {title && (
            <h3 className="font-medium text-gray-900">{title}</h3>
          )}
          <Badge variant="secondary">{images.length} 张图片</Badge>
        </div>

        {/* 显示模式切换 */}
        <div className="flex items-center space-x-1 bg-gray-100 rounded-lg p-1">
          <Button
            size="sm"
            variant={displayMode === DisplayMode.CAROUSEL ? "default" : "ghost"}
            onClick={() => setDisplayMode(DisplayMode.CAROUSEL)}
            className="h-8 px-3"
          >
            <List className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant={displayMode === DisplayMode.GRID ? "default" : "ghost"}
            onClick={() => setDisplayMode(DisplayMode.GRID)}
            className="h-8 px-3"
          >
            <Grid className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant={displayMode === DisplayMode.MASONRY ? "default" : "ghost"}
            onClick={() => setDisplayMode(DisplayMode.MASONRY)}
            className="h-8 px-3"
          >
            <Maximize2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="min-h-[300px]">
        {displayMode === DisplayMode.CAROUSEL && renderCarouselMode()}
        {displayMode === DisplayMode.GRID && renderGridMode()}
        {displayMode === DisplayMode.MASONRY && renderMasonryMode()}
      </div>

      {/* {{ AURA: Add - 使用新的ImagePreviewModal替代全屏预览 }} */}
      <ImagePreviewModal
        images={images}
        currentIndex={modalIndex}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onIndexChange={setModalIndex}
      />
    </div>
  )
}
