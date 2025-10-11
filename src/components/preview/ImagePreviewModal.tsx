'use client'

import { useState, useEffect, useRef } from 'react'
import { 
  X, 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  Download,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Share2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ImageInfo } from '@/types'

interface ImagePreviewModalProps {
  images: ImageInfo[]
  currentIndex: number
  isOpen: boolean
  onClose: () => void
  onIndexChange: (index: number) => void
}

export function ImagePreviewModal({
  images,
  currentIndex,
  isOpen,
  onClose,
  onIndexChange
}: ImagePreviewModalProps) {
  const [scale, setScale] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [isFullscreen, setIsFullscreen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // {{ AURA: Add - 重置图片状态当索引改变时 }}
  useEffect(() => {
    setScale(1)
    setRotation(0)
    setPosition({ x: 0, y: 0 })
  }, [currentIndex])

  // {{ AURA: Add - 键盘导航支持 }}
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          e.preventDefault()
          onClose()
          break
        case 'ArrowLeft':
          e.preventDefault()
          goToPrevious()
          break
        case 'ArrowRight':
          e.preventDefault()
          goToNext()
          break
        case '=':
        case '+':
          e.preventDefault()
          handleZoomIn()
          break
        case '-':
          e.preventDefault()
          handleZoomOut()
          break
        case 'r':
        case 'R':
          e.preventDefault()
          handleRotate()
          break
        case '0':
          e.preventDefault()
          resetTransform()
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'auto'
    }
  }, [isOpen, currentIndex])

  const goToPrevious = () => {
    const newIndex = currentIndex === 0 ? images.length - 1 : currentIndex - 1
    onIndexChange(newIndex)
  }

  const goToNext = () => {
    const newIndex = currentIndex === images.length - 1 ? 0 : currentIndex + 1
    onIndexChange(newIndex)
  }

  const handleZoomIn = () => {
    setScale(prev => Math.min(prev * 1.2, 5))
  }

  const handleZoomOut = () => {
    setScale(prev => Math.max(prev / 1.2, 0.1))
  }

  const handleRotate = () => {
    setRotation(prev => (prev + 90) % 360)
  }

  const resetTransform = () => {
    setScale(1)
    setRotation(0)
    setPosition({ x: 0, y: 0 })
  }

  const handleDownload = () => {
    const image = images[currentIndex]
    const link = document.createElement('a')
    link.href = image.url
    link.download = image.filename || `image_${currentIndex + 1}.jpg`
    link.click()
  }

  const handleShare = async () => {
    const image = images[currentIndex]
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: image.filename || `图片 ${currentIndex + 1}`,
          url: image.url
        })
      } catch (err) {
        console.log('分享取消或失败:', err)
      }
    } else {
      // 降级到复制链接
      try {
        await navigator.clipboard.writeText(image.url)
        // 这里可以添加 toast 提示
        console.log('链接已复制到剪贴板')
      } catch (err) {
        console.error('复制失败:', err)
      }
    }
  }

  // {{ AURA: Add - 拖拽功能 }}
  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1) return
    
    setIsDragging(true)
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || scale <= 1) return

    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  // 全屏功能
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }

  if (!isOpen || !images.length) return null

  const currentImage = images[currentIndex]

  return (
    <div 
      ref={containerRef}
      className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {/* 顶部工具栏 */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
        <div className="flex items-center space-x-2 bg-black/60 rounded-lg px-4 py-2">
          <Badge className="bg-white/20 text-white border-none">
            {currentIndex + 1} / {images.length}
          </Badge>
          {currentImage.filename && (
            <span className="text-white text-sm max-w-xs truncate">
              {currentImage.filename}
            </span>
          )}
        </div>
      </div>

      {/* 左侧导航 */}
      {images.length > 1 && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 w-12 h-12 z-10"
          onClick={goToPrevious}
        >
          <ChevronLeft className="w-8 h-8" />
        </Button>
      )}

      {/* 右侧导航 */}
      {images.length > 1 && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 w-12 h-12 z-10"
          onClick={goToNext}
        >
          <ChevronRight className="w-8 h-8" />
        </Button>
      )}

      {/* 顶部右侧工具按钮 */}
      <div className="absolute top-4 right-4 z-10 flex space-x-2">
        <Button
          variant="ghost"
          size="icon"
          className="text-white hover:bg-white/20"
          onClick={handleShare}
          title="分享"
        >
          <Share2 className="w-5 h-5" />
        </Button>
        
        <Button
          variant="ghost"
          size="icon"
          className="text-white hover:bg-white/20"
          onClick={handleDownload}
          title="下载"
        >
          <Download className="w-5 h-5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="text-white hover:bg-white/20"
          onClick={toggleFullscreen}
          title={isFullscreen ? "退出全屏" : "全屏"}
        >
          {isFullscreen ? (
            <Minimize2 className="w-5 h-5" />
          ) : (
            <Maximize2 className="w-5 h-5" />
          )}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="text-white hover:bg-white/20"
          onClick={onClose}
          title="关闭"
        >
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* 底部工具栏 */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
        <div className="flex items-center space-x-2 bg-black/60 rounded-lg px-4 py-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-white hover:bg-white/20 h-8"
            onClick={handleZoomOut}
            disabled={scale <= 0.1}
            title="缩小 (-)"
          >
            <ZoomOut className="w-4 h-4" />
          </Button>

          <span className="text-white text-sm min-w-[4rem] text-center">
            {Math.round(scale * 100)}%
          </span>

          <Button
            variant="ghost"
            size="sm"
            className="text-white hover:bg-white/20 h-8"
            onClick={handleZoomIn}
            disabled={scale >= 5}
            title="放大 (+)"
          >
            <ZoomIn className="w-4 h-4" />
          </Button>

          <div className="w-px h-6 bg-white/30 mx-2" />

          <Button
            variant="ghost"
            size="sm"
            className="text-white hover:bg-white/20 h-8"
            onClick={handleRotate}
            title="旋转 (R)"
          >
            <RotateCw className="w-4 h-4" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="text-white hover:bg-white/20 h-8 px-3"
            onClick={resetTransform}
            title="重置 (0)"
          >
            重置
          </Button>
        </div>
      </div>

      {/* 主图片区域 */}
      <div 
        className="relative max-w-[90vw] max-h-[90vh] flex items-center justify-center cursor-move"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{
          cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default'
        }}
      >
        <img
          src={currentImage.url}
          alt={currentImage.filename || `图片 ${currentIndex + 1}`}
          className="max-w-full max-h-full object-contain transition-transform duration-200 select-none"
          style={{
            transform: `scale(${scale}) rotate(${rotation}deg) translate(${position.x / scale}px, ${position.y / scale}px)`,
            transformOrigin: 'center center'
          }}
          draggable={false}
        />
      </div>

      {/* 使用说明提示 */}
      <div className="absolute bottom-4 left-4 z-10 bg-black/60 rounded-lg px-3 py-2 text-white text-xs opacity-60">
        <div>键盘：← → 切换，+ - 缩放，R 旋转，0 重置，ESC 关闭</div>
      </div>
    </div>
  )
}

export default ImagePreviewModal
