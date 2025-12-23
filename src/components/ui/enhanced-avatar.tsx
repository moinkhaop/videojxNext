'use client'

import * as React from "react"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

interface EnhancedAvatarProps {
  src?: string
  alt?: string
  fallbackText?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  showBorder?: boolean
  onClick?: () => void
}

export function EnhancedAvatar({ 
  src, 
  alt, 
  fallbackText, 
  size = 'md',
  className,
  showBorder = false,
  onClick
}: EnhancedAvatarProps) {
  const [imageError, setImageError] = React.useState(false)
  const [isLoading, setIsLoading] = React.useState(true)

  // 根据尺寸设置样式
  const sizeClasses = {
    sm: "h-8 w-8 text-sm",
    md: "h-10 w-10 text-base",
    lg: "h-12 w-12 text-lg",
    xl: "h-32 w-32 text-2xl"  // 修改为与 profile 页面容器匹配的尺寸
  }

  // 处理图片加载错误
  const handleImageError = () => {
    setImageError(true)
    setIsLoading(false)
  }

  // 处理图片加载成功
  const handleImageLoad = () => {
    setImageError(false)
    setIsLoading(false)
  }

  // 重置错误状态当src改变时
  React.useEffect(() => {
    if (src) {
      setImageError(false)
      setIsLoading(true)
    }
  }, [src])

  // 如果没有提供src或者图片加载出错，显示fallback
  const shouldShowFallback = !src || imageError

  return (
    <div 
      className={cn(
        "relative inline-flex shrink-0",
        sizeClasses[size],
        onClick && "cursor-pointer",
        className
      )}
      onClick={onClick}
    >
      <Avatar 
        className={cn(
          "h-full w-full",
          showBorder && "ring-2 ring-ring ring-offset-2 ring-offset-background"
        )}
      >
        {!shouldShowFallback && (
          <AvatarImage 
            src={src} 
            alt={alt}
            onError={handleImageError}
            onLoad={handleImageLoad}
            className="object-cover"
          />
        )}
        <AvatarFallback 
          className={cn(
            "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground font-semibold select-none",
            sizeClasses[size],
            isLoading && "animate-pulse"
          )}
        >
          {fallbackText || (alt ? alt.charAt(0).toUpperCase() : 'U')}
        </AvatarFallback>
      </Avatar>
      
      {/* 加载状态指示器 */}
      {isLoading && !shouldShowFallback && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/20 rounded-full">
          <div className="h-1/2 w-1/2 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
        </div>
      )}
    </div>
  )
}