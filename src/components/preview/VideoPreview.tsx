'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { Play, Pause, Volume2, VolumeX, Maximize, AlertCircle, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface VideoPreviewProps {
  videoUrl: string
  thumbnail?: string
  title?: string
  className?: string
  onClick?: () => void
  onError?: () => void // 添加错误回调
  useProxy?: boolean // 是否使用代理（默认true）
}

export function VideoPreview({ videoUrl, thumbnail, title, className = '', onClick, onError, useProxy = true }: VideoPreviewProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [showProxyTip, setShowProxyTip] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  // {{ AURA: Add - 当videoUrl改变时重置播放状态和视频元素 }}
  useEffect(() => {
    if (videoRef.current) {
      // 重置播放状态
      videoRef.current.currentTime = 0
      videoRef.current.pause()
      setIsPlaying(false)
      setHasError(false)
      setShowProxyTip(false)
      setIsMuted(false)
    }
  }, [videoUrl])

  // {{ AURA: Add - 生成代理URL，通过API代理解决直链访问问题 }}
  const proxiedVideoUrl = useMemo(() => {
    if (!videoUrl || !useProxy) return videoUrl
    
    try {
      const url = new URL(videoUrl)
      const isClient = typeof window !== 'undefined'
      const currentOrigin = isClient ? window.location.origin : ''
      
      // 如果已经是本地代理URL，直接返回
      if (url.origin === currentOrigin) {
        return videoUrl
      }
      
      // 将直链转换为代理URL
      const baseUrl = isClient ? window.location.origin : ''
      const proxyUrl = new URL('/api/proxy/video', baseUrl)
      proxyUrl.searchParams.set('url', videoUrl)
      return proxyUrl.toString()
    } catch {
      console.warn('[VideoPreview] 无效的视频URL，使用原始链接:', videoUrl)
      return videoUrl
    }
  }, [videoUrl, useProxy])

  const handleVideoError = () => {
    setHasError(true)
    // 如果已经使用了代理还是失败，显示提示
    if (useProxy) {
      setShowProxyTip(true)
    }
    if (onError) {
      onError()
    }
  }

  // {{ AURA: Add - 尝试不使用代理重新加载 }}
  const handleRetryWithoutProxy = () => {
    setHasError(false)
    setShowProxyTip(false)
    // 这需要通过prop重新渲染，或者可以在父组件中处理
  }

  // {{ AURA: Delete - 移除自定义控制逻辑，因为现在使用原生控件 }}

  return (
    <div className={`relative bg-black rounded-lg overflow-hidden ${className}`} onClick={onClick}>
      {/* 视频元素 */}
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        poster={thumbnail}
        preload="auto"
        controls
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onVolumeChange={(e) => setIsMuted((e.target as HTMLVideoElement).muted)}
        onError={handleVideoError}
      >
        <source src={proxiedVideoUrl} type="video/mp4" />
        <source src={proxiedVideoUrl} type="video/webm" />
        <source src={proxiedVideoUrl} type="video/ogg" />
        您的浏览器不支持视频播放。
      </video>

      {/* {{ AURA: Modify - 改进视频加载失败提示，增加代理和直链选项 }} */}
      {hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm rounded-lg">
          <div className="text-center text-white p-6 max-w-md">
            <div className="flex justify-center mb-4">
              <div className="bg-red-500/20 rounded-full p-3">
                <AlertCircle className="w-8 h-8 text-red-400" />
              </div>
            </div>
            
            <h3 className="text-lg font-semibold mb-4">视频加载失败</h3>
            
            {/* 当前使用的加载方式提示 */}
            <div className="bg-blue-900/30 border border-blue-500/30 rounded-lg p-3 mb-4">
              <div className="flex items-center justify-center gap-2 text-blue-200 text-sm mb-2">
                <Zap className="w-4 h-4" />
                {useProxy ? '当前使用代理加载' : '当前使用直链加载'}
              </div>
              <p className="text-xs text-blue-200/70">
                {useProxy 
                  ? '正在通过服务器代理访问视频。如问题仍未解决，请尝试直链模式。'
                  : '正在直接访问视频链接。某些视频可能需要服务器代理才能正常加载。'
                }
              </p>
            </div>
            
            {/* 原因说明 */}
            <div className="bg-amber-900/30 border border-amber-500/30 rounded-lg p-3 mb-4 text-left">
              <p className="text-sm text-amber-200 mb-2 font-medium">
                <strong>可能原因：</strong>
              </p>
              <ul className="text-xs text-amber-200/80 space-y-1 list-disc list-inside">
                <li>视频直链已过期（通常有时效性限制）</li>
                <li>网络连接不稳定或被限制</li>
                <li>浏览器不支持该视频格式</li>
                <li>服务器拒绝访问</li>
              </ul>
            </div>
            
            {/* 解决方案 */}
            <div className="bg-green-900/30 border border-green-500/30 rounded-lg p-3 text-left">
              <p className="text-sm text-green-200 mb-3 font-medium">
                <strong>请尝试以下方案：</strong>
              </p>
              <ol className="text-xs text-green-200/80 space-y-2">
                <li className="flex gap-2">
                  <span className="font-bold min-w-fit">1.</span>
                  <span>点击页面上方的"重新解析"按钮获取最新的视频链接</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold min-w-fit">2.</span>
                  <span>检查您的网络连接是否正常</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold min-w-fit">3.</span>
                  <span>如果问题仍未解决，可能是视频已被删除或不再可用</span>
                </li>
              </ol>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}