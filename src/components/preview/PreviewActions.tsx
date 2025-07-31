'use client'

import { Button } from '@/components/ui/button'
import { Upload, RotateCcw, Eye, Download, Loader2 } from 'lucide-react'
import { ParsedVideoInfo, MediaType } from '@/types'

interface PreviewActionsProps {
  mediaInfo: ParsedVideoInfo
  isUploading?: boolean
  onConfirmUpload: () => void
  onReparse: () => void
  className?: string
}

export function PreviewActions({ 
  mediaInfo, 
  isUploading = false, 
  onConfirmUpload, 
  onReparse,
  className = '' 
}: PreviewActionsProps) {
  const isVideo = mediaInfo.mediaType === MediaType.VIDEO
  const isImageAlbum = mediaInfo.mediaType === MediaType.IMAGE_ALBUM

  const handlePreviewInNewTab = () => {
    if (isVideo && mediaInfo.url) {
      window.open(mediaInfo.url, '_blank')
    } else if (isImageAlbum && mediaInfo.images && mediaInfo.images.length > 0) {
      // 打开第一张图片
      window.open(mediaInfo.images[0].url, '_blank')
    }
  }

  const handleDownloadAll = () => {
    if (isVideo && mediaInfo.url) {
      // 创建下载链接
      const link = document.createElement('a')
      link.href = mediaInfo.url
      link.download = `${mediaInfo.title || 'video'}.${mediaInfo.format || 'mp4'}`
      link.click()
    } else if (isImageAlbum && mediaInfo.images) {
      // 批量下载图片
      mediaInfo.images.forEach((image, index) => {
        setTimeout(() => {
          const link = document.createElement('a')
          link.href = image.url
          link.download = image.filename || `image_${index + 1}.jpg`
          link.click()
        }, index * 500) // 延迟下载避免浏览器阻止
      })
    }
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* 主要操作按钮 */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* 确认并上传按钮 */}
        <Button 
          onClick={onConfirmUpload} 
          disabled={isUploading}
          className="flex-1 min-h-[44px] text-base font-medium"
          size="lg"
        >
          {isUploading ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              上传中...
            </>
          ) : (
            <>
              <Upload className="w-5 h-5 mr-2" />
              确认并上传到WebDAV
            </>
          )}
        </Button>

        {/* 重新解析按钮 */}
        <Button 
          variant="outline" 
          onClick={onReparse}
          disabled={isUploading}
          className="sm:w-auto"
        >
          <RotateCcw className="w-4 h-4 mr-2" />
          重新解析
        </Button>
      </div>

      {/* 次要操作按钮 */}
      <div className="flex flex-wrap gap-2">
        {/* 在新标签页预览 */}
        <Button 
          variant="ghost" 
          size="sm"
          onClick={handlePreviewInNewTab}
          className="text-sm"
        >
          <Eye className="w-4 h-4 mr-1" />
          新窗口预览
        </Button>

        {/* 下载按钮 */}
        <Button 
          variant="ghost" 
          size="sm"
          onClick={handleDownloadAll}
          className="text-sm"
        >
          <Download className="w-4 h-4 mr-1" />
          {isVideo ? '下载视频' : '下载图片'}
        </Button>
      </div>

      {/* {{ AURA: Remove - 移除操作说明，简化界面 }} */}

      {/* 上传进度提示 */}
      {isUploading && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
          <div className="flex items-center">
            <Loader2 className="w-4 h-4 mr-2 animate-spin text-yellow-600" />
            <span className="text-sm text-yellow-700 font-medium">
              正在上传{isVideo ? '视频' : '图集'}到WebDAV服务器，请勿关闭页面...
            </span>
          </div>
        </div>
      )}
    </div>
  )
}