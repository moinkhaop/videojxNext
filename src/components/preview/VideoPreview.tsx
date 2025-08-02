'use client'

import { useState } from 'react'
import { Play, Pause, Volume2, VolumeX, Maximize } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface VideoPreviewProps {
  videoUrl: string
  thumbnail?: string
  title?: string
  className?: string
  onClick?: () => void // Add onClick prop
}

export function VideoPreview({ videoUrl, thumbnail, title, className = '', onClick }: VideoPreviewProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // {{ AURA: Delete - 移除自定义控制逻辑，因为现在使用原生控件 }}

  return (
    <div className={`relative bg-black rounded-lg overflow-hidden ${className}`} onClick={onClick}>
      {/* 视频元素 */}
      <video
        id="preview-video"
        className="w-full h-full object-contain"
        poster={thumbnail}
        preload="auto"
        controls // {{ AURA: Add - 添加原生控件 }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onVolumeChange={(e) => setIsMuted((e.target as HTMLVideoElement).muted)}
      >
        <source src={videoUrl} type="video/mp4" />
        <source src={videoUrl} type="video/webm" />
        <source src={videoUrl} type="video/ogg" />
        您的浏览器不支持视频播放。
      </video>

      {/* 加载指示器 (如果需要可以保留) */}
      {/* <div className="absolute inset-0 flex items-center justify-center bg-gray-900 opacity-0 transition-opacity duration-300" id="loading-overlay">
        <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
      </div> */}
    </div>
  )
}