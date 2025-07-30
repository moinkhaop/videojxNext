'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  CheckCircle, 
  XCircle, 
  Loader2, 
  Settings,
  Link as LinkIcon,
  Eye,
  Upload,
  RotateCcw
} from 'lucide-react'
import { ConversionTask, TaskStatus, VideoParserConfig, WebDAVConfig, PreviewState, MediaType } from '@/types'
import { ConfigManager, HistoryManager } from '@/lib/storage'
import { ConversionService } from '@/lib/conversion'
import { PreviewArea } from '@/components/preview'
import Link from 'next/link'

export default function ConvertPage() {
  const [videoUrl, setVideoUrl] = useState('')
  const [selectedParser, setSelectedParser] = useState<string>('')
  const [selectedWebDAV, setSelectedWebDAV] = useState<string>('')
  const [parsers, setParsers] = useState<VideoParserConfig[]>([])
  const [webdavServers, setWebdavServers] = useState<WebDAVConfig[]>([])
  const [currentTask, setCurrentTask] = useState<ConversionTask | null>(null)
  const [progress, setProgress] = useState(0)
  const [isConverting, setIsConverting] = useState(false)
  
  // 预览状态管理
  const [previewState, setPreviewState] = useState<PreviewState>({
    isPreviewMode: false,
    showPreview: false,
    previewData: null
  })

  useEffect(() => {
    // 加载配置
    const loadedParsers = ConfigManager.getParsers()
    const loadedServers = ConfigManager.getWebDAVServers()
    
    setParsers(loadedParsers)
    setWebdavServers(loadedServers)

    // 设置默认选择
    const defaultParser = loadedParsers.find(p => p.isDefault) || loadedParsers[0]
    const defaultServer = loadedServers.find(s => s.isDefault) || loadedServers[0]
    
    if (defaultParser) setSelectedParser(defaultParser.id)
    if (defaultServer) setSelectedWebDAV(defaultServer.id)
  }, [])

  // 提取视频链接
  const extractVideoLink = (input: string): string => {
    const urlRegex = /(https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&=\/=]*))/g
    const matches = input.match(urlRegex)
    return matches && matches.length > 0 ? matches[0].replace(/\/$/, '') : input.trim()
  }
  
  // 处理解析和预览
  const handleParseAndPreview = async () => {
    if (!videoUrl.trim()) {
      alert('请输入视频链接')
      return
    }
    
    const extractedUrl = extractVideoLink(videoUrl)

    if (!selectedParser) {
      alert('请选择解析API')
      return
    }

    const parser = parsers.find(p => p.id === selectedParser)

    if (!parser) {
      alert('解析API配置信息错误')
      return
    }

    setIsConverting(true)
    setProgress(0)

    if (extractedUrl !== videoUrl.trim()) {
      console.log(`[预览] 从分享文本中提取到URL: ${extractedUrl}`)
    }
    
    // 创建转存任务
    const task: ConversionTask = {
      id: ConversionService.generateTaskId(),
      videoUrl: extractedUrl,
      status: TaskStatus.PARSING,
      createdAt: new Date()
    }

    setCurrentTask(task)

    try {
      // 仅解析，不上传
      const parsedInfo = await ConversionService.parseOnly(extractedUrl, parser)
      
      // 更新预览状态
      setPreviewState({
        isPreviewMode: true,
        showPreview: true,
        previewData: parsedInfo
      })
      
      // 更新任务状态
      setCurrentTask(prev => prev ? {
        ...prev,
        status: TaskStatus.PARSED,
        parsedVideoInfo: parsedInfo,
        videoTitle: parsedInfo.title
      } : null)
      
      setProgress(100)
      console.log(`[预览] 解析成功: ${parsedInfo.title}`)

    } catch (error) {
      console.error('解析过程出现异常:', error)
      setCurrentTask(prev => {
        if (!prev) return null
        return {
          ...prev,
          status: TaskStatus.FAILED,
          error: error instanceof Error ? error.message : '解析过程发生未知错误',
          completedAt: new Date()
        }
      })
    } finally {
      setIsConverting(false)
    }
  }

  // 处理确认上传
  const handleConfirmUpload = async () => {
    if (!previewState.previewData || !selectedWebDAV) {
      alert('请选择WebDAV服务器')
      return
    }

    const webdav = webdavServers.find(s => s.id === selectedWebDAV)

    if (!webdav) {
      alert('WebDAV服务器配置信息错误')
      return
    }

    setIsConverting(true)
    setProgress(0)

    try {
      // 更新任务状态为上传中
      setCurrentTask(prev => prev ? { ...prev, status: TaskStatus.UPLOADING } : null)
      setProgress(50)

      // 基于已解析的数据进行上传
      const filePath = await ConversionService.uploadParsedMedia(
        previewState.previewData,
        webdav
      )

      // 更新任务状态为成功
      const finalTask = {
        ...currentTask!,
        status: TaskStatus.SUCCESS,
        completedAt: new Date(),
        uploadResult: {
          success: true,
          filePath
        }
      }

      setCurrentTask(finalTask)
      setProgress(100)

      console.log('上传成功:', filePath)

      // 保存到历史记录
      HistoryManager.addRecord({
        id: ConversionService.generateTaskId(),
        type: 'single',
        task: finalTask,
        createdAt: new Date()
      })

      // 重置预览状态
      setPreviewState({
        isPreviewMode: false,
        showPreview: false,
        previewData: null
      })

    } catch (error) {
      console.error('上传过程出现异常:', error)
      setCurrentTask(prev => {
        if (!prev) return null
        return {
          ...prev,
          status: TaskStatus.FAILED,
          error: error instanceof Error ? error.message : '上传过程发生未知错误',
          completedAt: new Date()
        }
      })
    } finally {
      setIsConverting(false)
    }
  }

  // 重新解析
  const handleReparse = () => {
    setPreviewState({
      isPreviewMode: false,
      showPreview: false,
      previewData: null
    })
    setCurrentTask(null)
    setProgress(0)
    setIsConverting(false)
  }

  const resetForm = () => {
    setVideoUrl('')
    setCurrentTask(null)
    setProgress(0)
    setIsConverting(false)
    setPreviewState({
      isPreviewMode: false,
      showPreview: false,
      previewData: null
    })
  }

  const getStatusIcon = (status: TaskStatus) => {
    switch (status) {
      case TaskStatus.PENDING:
        return <Loader2 className="w-4 h-4 animate-spin" />
      case TaskStatus.PARSING:
        return <Loader2 className="w-4 h-4 animate-spin" />
      case TaskStatus.PARSED:
        return <Eye className="w-4 h-4 text-blue-500" />
      case TaskStatus.UPLOADING:
        return <Upload className="w-4 h-4" />
      case TaskStatus.SUCCESS:
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case TaskStatus.FAILED:
        return <XCircle className="w-4 h-4 text-red-500" />
      default:
        return null
    }
  }

  const getStatusText = (status: TaskStatus) => {
    switch (status) {
      case TaskStatus.PENDING:
        return '等待中'
      case TaskStatus.PARSING:
        return '解析中'
      case TaskStatus.PARSED:
        return '已解析'
      case TaskStatus.UPLOADING:
        return '上传中'
      case TaskStatus.SUCCESS:
        return '成功'
      case TaskStatus.FAILED:
        return '失败'
      default:
        return '未知'
    }
  }

  const getStatusColor = (status: TaskStatus) => {
    switch (status) {
      case TaskStatus.SUCCESS:
        return 'bg-green-500'
      case TaskStatus.FAILED:
        return 'bg-red-500'
      case TaskStatus.PARSED:
        return 'bg-blue-500'
      case TaskStatus.PARSING:
      case TaskStatus.UPLOADING:
        return 'bg-blue-500'
      default:
        return 'bg-gray-500'
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* 页面标题 */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">单链接转存</h1>
        <p className="text-muted-foreground">
          输入视频分享链接，先解析预览内容，确认无误后再上传到WebDAV服务器
        </p>
      </div>

      {/* 配置检查 */}
      {(parsers.length === 0 || webdavServers.length === 0) && (
        <Alert className="mb-6">
          <Settings className="h-4 w-4" />
          <AlertDescription>
            请先配置解析API和WebDAV服务器。
            <Link href="/settings" className="ml-2 text-primary hover:underline">
              前往设置
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {/* 中间：操作区域（两列布局） */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* 左列：输入表单 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <LinkIcon className="w-5 h-5" />
              <span>视频链接</span>
            </CardTitle>
            <CardDescription>
              支持多种视频平台的分享链接
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">视频链接</label>
              <Textarea
                placeholder="请粘贴视频分享链接..."
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                className="min-h-[100px]"
                disabled={isConverting}
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">解析API</label>
              <Select value={selectedParser} onValueChange={setSelectedParser} disabled={isConverting}>
                <SelectTrigger>
                  <SelectValue placeholder="选择解析API" />
                </SelectTrigger>
                <SelectContent>
                  {parsers.map((parser) => (
                    <SelectItem key={parser.id} value={parser.id}>
                      <div className="flex items-center justify-between w-full">
                        <span>{parser.name}</span>
                        {parser.isDefault && (
                          <Badge variant="secondary" className="ml-2">默认</Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">WebDAV服务器</label>
              <Select value={selectedWebDAV} onValueChange={setSelectedWebDAV} disabled={isConverting}>
                <SelectTrigger>
                  <SelectValue placeholder="选择WebDAV服务器" />
                </SelectTrigger>
                <SelectContent>
                  {webdavServers.map((server) => (
                    <SelectItem key={server.id} value={server.id}>
                      <div className="flex items-center justify-between w-full">
                        <span>{server.name}</span>
                        {server.isDefault && (
                          <Badge variant="secondary" className="ml-2">默认</Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex space-x-2">
              {/* 主操作按钮：解析/预览 */}
              {!previewState.isPreviewMode ? (
                <Button 
                  onClick={handleParseAndPreview} 
                  disabled={isConverting || !videoUrl.trim() || !selectedParser}
                  className="flex-1"
                >
                  {isConverting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      解析中...
                    </>
                  ) : (
                    <>
                      <Eye className="w-4 h-4 mr-2" />
                      解析/预览
                    </>
                  )}
                </Button>
              ) : (
                <Button 
                  onClick={handleParseAndPreview} 
                  disabled={isConverting}
                  variant="outline"
                  className="flex-1"
                >
                  <Eye className="w-4 h-4 mr-2" />
                  重新解析
                </Button>
              )}
              
              {currentTask && (
                <Button variant="outline" onClick={resetForm}>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  重置
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 右列：任务状态（简化） */}
        <Card>
          <CardHeader>
            <CardTitle>转存状态</CardTitle>
            <CardDescription>
              实时显示转存进度和结果
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!currentTask ? (
              <div className="text-center text-muted-foreground py-8">
                <Eye className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>点击"解析/预览"开始处理视频</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* 基本信息 */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">任务状态</span>
                    <Badge className={getStatusColor(currentTask.status)}>
                      <div className="flex items-center space-x-1">
                        {getStatusIcon(currentTask.status)}
                        <span>{getStatusText(currentTask.status)}</span>
                      </div>
                    </Badge>
                  </div>
                  
                  {isConverting && (
                    <div className="space-y-2">
                      <Progress value={progress} className="w-full" />
                      <p className="text-xs text-muted-foreground text-center">
                        {progress.toFixed(0)}%
                      </p>
                    </div>
                  )}
                </div>

                {/* 简化的媒体信息 */}
                {currentTask.parsedVideoInfo && (
                  <div className="space-y-2">
                    <h4 className="font-medium">
                      {currentTask.parsedVideoInfo.mediaType === MediaType.VIDEO ? '视频信息' : '图集信息'}
                    </h4>
                    <div className="text-sm space-y-1">
                      <p><span className="text-muted-foreground">标题:</span> {currentTask.parsedVideoInfo.title}</p>
                      {currentTask.parsedVideoInfo.author && (
                        <p><span className="text-muted-foreground">作者:</span> {currentTask.parsedVideoInfo.author}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* 错误信息 */}
                {currentTask.error && (
                  <Alert className="border-red-200 bg-red-50">
                    <XCircle className="h-4 w-4 text-red-500" />
                    <AlertDescription className="text-red-700">
                      <p><strong>错误信息:</strong> {currentTask.error}</p>
                    </AlertDescription>
                  </Alert>
                )}

                {/* 成功信息 */}
                {currentTask.status === TaskStatus.SUCCESS && currentTask.uploadResult?.filePath && (
                  <Alert className="border-green-200 bg-green-50">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <AlertDescription className="text-green-700">
                      转存成功！文件已保存到: {currentTask.uploadResult.filePath}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 底部：预览区域（上下布局 - 符合需求6.3） */}
      {previewState.showPreview && previewState.previewData && (
        <PreviewArea
          mediaInfo={previewState.previewData}
          isUploading={isConverting && currentTask?.status === TaskStatus.UPLOADING}
          onConfirmUpload={handleConfirmUpload}
          onReparse={handleReparse}
        />
      )}
    </div>
  )
}
