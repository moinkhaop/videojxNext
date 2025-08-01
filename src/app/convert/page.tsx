'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
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
import { TwoColumnPreview } from '@/components/preview'
import Link from 'next/link'

// {{ AURA: Add - Loading 组件用于 Suspense fallback }}
function Loading() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    </div>
  )
}

// {{ AURA: Add - 使用 Suspense 包裹页面内容 }}
function ConvertPageContent() {
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

  // {{ AURA: Add - 处理URL参数自动填充 }}
  const searchParams = useSearchParams()
  
  useEffect(() => {
    const urlParam = searchParams.get('url')
    if (urlParam) {
      setVideoUrl(decodeURIComponent(urlParam))
    }
  }, [searchParams])

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

  // {{ AURA: Modify - 优化上传函数以改善感知性能 }}
  const handleConfirmUpload = () => {
    if (!previewState.previewData || !selectedWebDAV) {
      alert('请选择WebDAV服务器')
      return
    }

    const webdav = webdavServers.find(s => s.id === selectedWebDAV)

    if (!webdav) {
      alert('WebDAV服务器配置信息错误')
      return
    }

    // 立即更新UI状态，显示加载动画
    setIsConverting(true)
    setProgress(0)
    setCurrentTask(prev => prev ? { ...prev, status: TaskStatus.UPLOADING } : null)

    // 使用setTimeout将网络请求延迟到下一个事件循环
    // 这可以确保UI渲染不会阻塞网络请求的发出
    setTimeout(async () => {
      try {
        setProgress(50)

        // 基于已解析的数据进行上传
        const filePath = await ConversionService.uploadParsedMedia(
          previewState.previewData!,
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
    }, 0)
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
        return <Eye className="w-4 h-4" />
      case TaskStatus.UPLOADING:
        return <Upload className="w-4 h-4 animate-bounce" />
      case TaskStatus.SUCCESS:
        return <CheckCircle className="w-4 h-4" />
      case TaskStatus.FAILED:
        return <XCircle className="w-4 h-4" />
      default:
        return null
    }
  }

  const getStatusText = (status: TaskStatus) => {
    switch (status) {
      case TaskStatus.PENDING:
        return '等待处理'
      case TaskStatus.PARSING:
        return '正在解析'
      case TaskStatus.PARSED:
        return '解析完成'
      case TaskStatus.UPLOADING:
        return '正在上传'
      case TaskStatus.SUCCESS:
        return '转存成功'
      case TaskStatus.FAILED:
        return '处理失败'
      default:
        return '状态未知'
    }
  }

  const getStatusColor = (status: TaskStatus) => {
    switch (status) {
      case TaskStatus.SUCCESS:
        return 'bg-green-500 text-white shadow-sm'
      case TaskStatus.FAILED:
        return 'bg-red-500 text-white shadow-sm'
      case TaskStatus.PARSED:
        return 'bg-blue-500 text-white shadow-sm'
      case TaskStatus.PARSING:
        return 'bg-orange-500 text-white shadow-sm animate-pulse'
      case TaskStatus.UPLOADING:
        return 'bg-purple-500 text-white shadow-sm animate-pulse'
      case TaskStatus.PENDING:
        return 'bg-gray-500 text-white shadow-sm'
      default:
        return 'bg-gray-400 text-white shadow-sm'
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
      <div className="space-y-6">
        {/* {{ AURA: Modify - 布局调整为单列流式布局 }} */}
        {/* 步骤一：输入与配置 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <LinkIcon className="w-5 h-5" />
              <span>输入链接与配置</span>
            </CardTitle>
            <CardDescription>
              粘贴视频分享链接，然后选择解析服务和存储位置。
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 左侧输入 */}
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">视频链接</label>
                <Textarea
                  placeholder="请粘贴视频分享链接..."
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  className="min-h-[120px]"
                  disabled={isConverting || previewState.isPreviewMode}
                />
              </div>
            </div>
            {/* 右侧选择 */}
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">解析API</label>
                <Select value={selectedParser} onValueChange={setSelectedParser} disabled={isConverting || previewState.isPreviewMode}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择解析API" />
                  </SelectTrigger>
                  <SelectContent>
                    {parsers.map((parser) => (
                      <SelectItem key={parser.id} value={parser.id}>
                        <div className="flex items-center justify-between w-full">
                          <span>{parser.name}</span>
                          {parser.isDefault && <Badge variant="secondary" className="ml-2">默认</Badge>}
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
                          {server.isDefault && <Badge variant="secondary" className="ml-2">默认</Badge>}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 步骤二：操作与预览 */}
        {/* {{ AURA: Modify - 将解析按钮和状态预览整合 }} */}
        <Card>
          <CardContent>
            {/* 主操作按钮区域 */}
            {!previewState.isPreviewMode && (
              <div className="text-center py-4">
                <Button
                  onClick={handleParseAndPreview}
                  disabled={isConverting || !videoUrl.trim() || !selectedParser}
                  size="lg"
                  className="w-full max-w-xs"
                >
                  {isConverting ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />解析中...</>
                  ) : (
                    <><Eye className="w-4 h-4 mr-2" />解析/预览</>
                  )}
                </Button>
              </div>
            )}

            {/* 状态和预览区域 */}
            {currentTask && (
              <div className="space-y-4 pt-4 border-t">
                {/* {{ AURA: Modify - 任务状态显示逻辑已移入 TwoColumnPreview 组件 }} */}
                {/* 双栏预览布局 */}
                {previewState.isPreviewMode && previewState.previewData && (
                  <div className="border-t pt-4">
                    <TwoColumnPreview
                      mediaInfo={previewState.previewData}
                      isUploading={isConverting && currentTask?.status === TaskStatus.UPLOADING}
                      onConfirmUpload={handleConfirmUpload}
                      onReparse={handleReparse}
                      currentTask={currentTask}
                      progress={progress}
                    />
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
                      转存成功！文件已保存到: {decodeURIComponent(currentTask.uploadResult.filePath)}
                    </AlertDescription>
                  </Alert>
                )}

                {/* 重置按钮 */}
                <div className="pt-4 border-t">
                  <Button variant="outline" onClick={resetForm} className="w-full">
                    <RotateCcw className="w-4 h-4 mr-2" />
                    开始新的转存
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* {{ AURA: Remove - 移除底部独立预览区域，预览功能已集成到右侧状态区域 }} */}
    </div>
  )
}

// {{ AURA: Modify - 使用 Suspense 包裹页面内容以解决部署错误 }}
export default function ConvertPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ConvertPageContent />
    </Suspense>
  )
}
