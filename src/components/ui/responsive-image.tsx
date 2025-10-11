'use client'

import { useState, useRef, useEffect } from 'react'
import { ImageIcon, X } from 'lucide-react'

interface ResponsiveImageProps {
  src: string
  alt: string
  className?: string
  aspectRatio?: 'square' | 'video' | 'auto'
  loading?: 'lazy' | 'eager'
  onLoad?: () => void
  onError?: () => void
  onClick?: () => void
  quality?: 'low' | 'medium' | 'high'
  sizes?: string
  priority?: boolean
}

// {{ AURA: Add - 生成不同质量的图片URL }}
function generateImageUrl(src: string, quality: 'low' | 'medium' | 'high' = 'medium'): string {
  // 如果是外部URL，直接返回
  if (src.startsWith('http://') || src.startsWith('https://')) {
    return src
  }
  
  // 如果有查询参数，可以用来设置压缩质量
  const url = new URL(src, window.location.origin)
  
  switch (quality) {
    case 'low':
      url.searchParams.set('q', '60')
      url.searchParams.set('w', '400')
      break
    case 'medium':
      url.searchParams.set('q', '80')
      url.searchParams.set('w', '800')
      break
    case 'high':
      url.searchParams.set('q', '95')
      break
  }
  
  return url.toString()
}

export function ResponsiveImage({
  src,
  alt,
  className = '',
  aspectRatio = 'auto',
  loading = 'lazy',
  onLoad,
  onError,
  onClick,
  quality = 'medium',
  sizes = '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw',
  priority = false
}: ResponsiveImageProps) {
  const [isLoaded, setIsLoaded] = useState(false)
  const [isError, setIsError] = useState(false)
  const [isInView, setIsInView] = useState(priority) // 优先级图片立即加载
  const imgRef = useRef<HTMLDivElement>(null)

  // {{ AURA: Add - 交叉观察器实现懒加载 }}
  useEffect(() => {
    if (priority || isInView) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true)
          observer.disconnect()
        }
      },
      { 
        threshold: 0.1,
        rootMargin: '50px' // 提前50px开始加载
      }
    )

    if (imgRef.current) {
      observer.observe(imgRef.current)
    }

    return () => observer.disconnect()
  }, [priority, isInView])

  const handleLoad = () => {
    setIsLoaded(true)
    onLoad?.()
  }

  const handleError = () => {
    setIsError(true)
    onError?.()
  }

  const getAspectRatioClass = () => {
    switch (aspectRatio) {
      case 'square':
        return 'aspect-square'
      case 'video':
        return 'aspect-video'
      default:
        return ''
    }
  }

  const imageUrl = generateImageUrl(src, quality)

  return (
    <div 
      ref={imgRef} 
      className={`relative overflow-hidden ${getAspectRatioClass()} ${className}`}
      onClick={onClick}
    >
      {/* 加载占位符 */}
      {!isLoaded && !isError && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 animate-pulse">
          {isInView ? (
            <div className="w-6 h-6 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <ImageIcon className="w-8 h-8 text-gray-400" />
          )}
        </div>
      )}

      {/* 错误状态 */}
      {isError && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
          <div className="text-center">
            <X className="w-8 h-8 text-red-400 mx-auto mb-2" />
            <p className="text-xs text-red-500">加载失败</p>
          </div>
        </div>
      )}

      {/* 实际图片 */}
      {isInView && !isError && (
        <img
          src={imageUrl}
          alt={alt}
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            isLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          loading={loading}
          sizes={sizes}
          onLoad={handleLoad}
          onError={handleError}
          draggable={false}
        />
      )}

      {/* 图片叠加效果 */}
      {onClick && (
        <div className="absolute inset-0 bg-black/0 hover:bg-black/10 transition-colors duration-200 cursor-pointer" />
      )}
    </div>
  )
}

export default ResponsiveImage
