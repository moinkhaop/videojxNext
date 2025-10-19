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
  RotateCcw,
  Clipboard,
  ClipboardCheck,
  X
} from 'lucide-react'
import { ConversionTask, TaskStatus, VideoParserConfig, WebDAVConfig, PreviewState, MediaType } from '@/types'
import { ConfigManager, HistoryManager } from '@/lib/storage'
import { ConversionService } from '@/lib/conversion'
import { TwoColumnPreview } from '@/components/preview'
import { ClipboardDetector } from '@/lib/clipboard'
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

  // 剪贴板检测状态
  const [clipboardEnabled, setClipboardEnabled] = useState(false)
  const [lastClipboardUrl, setLastClipboardUrl] = useState('')

  useEffect(() => {
    // 加载配置
    const loadConfiguration = () => {
      const loadedParsers = ConfigManager.getParsers()
      const loadedServers = ConfigManager.getWebDAVServers()

      setParsers(loadedParsers)
      setWebdavServers(loadedServers)

      // 设置默认选择
      const defaultParser = loadedParsers.find(p => p.isDefault) || loadedParsers[0]
      const defaultServer = loadedServers.find(s => s.isDefault) || loadedServers[0]

      if (defaultParser) setSelectedParser(defaultParser.id)
      if (defaultServer) setSelectedWebDAV(defaultServer.id)
    }

    loadConfiguration()

    // 监听解析器配置更新事件
    const handleConfigUpdate = () => {
      console.log('[单视频转换] 检测到解析器配置更新，重新加载配置')
      loadConfiguration()
    }

    window.addEventListener('parsers-config-updated', handleConfigUpdate)

    // 监听页面可见性变化
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[单视频转换] 页面重新可见，刷新配置')
        loadConfiguration()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('parsers-config-updated', handleConfigUpdate)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  // {{ AURA: Add - 处理URL参数自动填充 }}
  const searchParams = useSearchParams()

  useEffect(() => {
    const urlParam = searchParams.get('url')
    if (urlParam) {
      setVideoUrl(decodeURIComponent(urlParam))
    }
  }, [searchParams])

  // 剪贴板自动检测
  useEffect(() => {
    if (!clipboardEnabled) return

    const handleClipboardDetection = (url: string) => {
      // 如果正在转换或已在预览模式，不自动填充
      if (isConverting || previewState.isPreviewMode) return

      // 避免重复填充相同的URL
      if (url === lastClipboardUrl || url === videoUrl) return

      setLastClipboardUrl(url)
      setVideoUrl(url)
      console.log('从剪贴板检测到视频链接:', url)
    }

    ClipboardDetector.startMonitoring(handleClipboardDetection, 1000)

    return () => {
      ClipboardDetector.stopMonitoring()
    }
  }, [clipboardEnabled, isConverting, previewState.isPreviewMode, lastClipboardUrl, videoUrl])

  // 手动从剪贴板粘贴
  const handlePasteFromClipboard = async () => {
    try {
      const url = await ClipboardDetector.checkOnce()
      if (url) {
        setVideoUrl(url)
        setLastClipboardUrl(url)
        console.log('手动粘贴视频链接:', url)
      } else {
        alert('剪贴板中未检测到视频链接')
      }
    } catch (error) {
      console.error('读取剪贴板失败:', error)
      alert('无法读取剪贴板，请手动粘贴链接')
    }
  }

  // 切换剪贴板自动检测
  const toggleClipboardDetection = async () => {
    if (!clipboardEnabled) {
      // 启用前请求权限
      const hasPermission = await ClipboardDetector.requestPermission()
      if (hasPermission) {
        setClipboardEnabled(true)
      } else {
        alert('需要剪贴板权限才能启用自动检测功能')
      }
    } else {
      setClipboardEnabled(false)
      ClipboardDetector.reset()
    }
  }

  // 清空输入框
  const handleClearInput = () => {
    setVideoUrl('')
  }

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

        // 保持预览状态，让用户可以查看上传结果
        // setPreviewState 保持不变，继续显示预览

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

  // {{ AURA: Modify - 重新解析：自动重新发起解析请求，而不仅仅是清空状态 }}
  const handleReparse = () => {
    // 重置预览状态
    setPreviewState({
      isPreviewMode: false,
      showPreview: false,
      previewData: null
    })
    setCurrentTask(null)
    setProgress(0)
    
    // 自动重新解析（使用相同的链接和解析器）
    if (videoUrl.trim() && selectedParser) {
      // 使用setTimeout延迟执行，以确保状态已更新
      setTimeout(() => {
        handleParseAndPreview()
      }, 100)
    }
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {/* 配置检查 */}
        {(parsers.length === 0 || webdavServers.length === 0) && (
          <Alert className="mb-6 border border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/20">
            <Settings className="h-4 w-4 text-orange-600" />
            <AlertDescription className="text-sm">
              请先配置解析API和WebDAV服务器。
              <Link href="/settings" className="ml-2 text-primary hover:underline font-semibold">
                前往设置
              </Link>
            </AlertDescription>
          </Alert>
        )}

        {/* 主要内容区域 - 左右分栏布局 */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:items-stretch">
          {/* 左侧：输入与配置区域 */}
          <div className="flex lg:col-span-2">
            <Card className="border-none shadow-lg bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm flex flex-col w-full">
              <CardHeader className="pb-4 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl shadow-md">
                    <LinkIcon className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-lg font-bold">输入与配置</CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      粘贴链接并选择服务
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <div className="space-y-4 flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium">视频链接</label>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handlePasteFromClipboard}
                        disabled={isConverting || previewState.isPreviewMode}
                        className="h-7 text-xs"
                      >
                        <Clipboard className="w-3 h-3 mr-1" />
                        粘贴
                      </Button>
                      <Button
                        type="button"
                        variant={clipboardEnabled ? "default" : "outline"}
                        size="sm"
                        onClick={toggleClipboardDetection}
                        disabled={isConverting || previewState.isPreviewMode}
                        className="h-7 text-xs"
                      >
                        {clipboardEnabled ? (
                          <><ClipboardCheck className="w-3 h-3 mr-1" />检测中</>
                        ) : (
                          <><Clipboard className="w-3 h-3 mr-1" />自动</>
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleClearInput}
                        disabled={isConverting || previewState.isPreviewMode || !videoUrl.trim()}
                        className="h-7 text-xs"
                      >
                        <X className="w-3 h-3 mr-1" />
                        清空
                      </Button>
                    </div>
                  </div>
                  <Textarea
                    placeholder="请粘贴视频分享链接..."
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    className="min-h-[160px] text-sm"
                    disabled={isConverting || previewState.isPreviewMode}
                  />
                  {clipboardEnabled && (
                    <p className="text-xs text-muted-foreground mt-1">
                      ✓ 剪贴板自动检测已启用
                    </p>
                  )}

                  <div>
                    <label className="text-sm font-medium mb-2 block">解析API</label>
                    <Select value={selectedParser} onValueChange={setSelectedParser} disabled={isConverting || previewState.isPreviewMode}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="选择解析API" />
                      </SelectTrigger>
                      <SelectContent>
                        {parsers.map((parser) => (
                          <SelectItem key={parser.id} value={parser.id}>
                            <div className="flex items-center justify-between w-full">
                              <span>{parser.name}</span>
                              {parser.isDefault && <Badge variant="secondary" className="ml-2 text-xs">默认</Badge>}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">WebDAV服务器</label>
                    <Select value={selectedWebDAV} onValueChange={setSelectedWebDAV} disabled={isConverting}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="选择WebDAV服务器" />
                      </SelectTrigger>
                      <SelectContent>
                        {webdavServers.map((server) => (
                          <SelectItem key={server.id} value={server.id}>
                            <div className="flex items-center justify-between w-full">
                              <span>{server.name}</span>
                              {server.isDefault && <Badge variant="secondary" className="ml-2 text-xs">默认</Badge>}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* 解析按钮 - 始终显示在底部 */}
                <div className="pt-4">
                  <Button
                    onClick={handleParseAndPreview}
                    disabled={isConverting || !videoUrl.trim() || !selectedParser || previewState.isPreviewMode}
                    className="w-full bg-blue-600 hover:bg-blue-700"
                  >
                    {isConverting ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />解析中...</>
                    ) : (
                      <><Eye className="w-4 h-4 mr-2" />解析预览</>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 右侧：预览与结果区域 */}
          <div className="flex lg:col-span-3">
            <Card className="border-none shadow-lg bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm flex flex-col w-full">
              <CardHeader className="pb-4 flex-shrink-0">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl shadow-md">
                      <Eye className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-lg font-bold">预览与结果</CardTitle>
                      <CardDescription className="text-xs mt-0.5">
                        解析后的内容将在此展示
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* 进度条标签 */}
                    {(isConverting || currentTask?.status === TaskStatus.PARSING) && (
                      <Badge variant="outline" className="px-3 py-1.5 border-blue-300 bg-blue-50 dark:bg-blue-950/30">
                        <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                        <span className="text-sm">{progress}%</span>
                      </Badge>
                    )}
                    {/* 状态徽章 */}
                    {currentTask && (
                      <Badge className={getStatusColor(currentTask.status)}>
                        <div className="flex items-center gap-1.5">
                          {getStatusIcon(currentTask.status)}
                          <span>{getStatusText(currentTask.status)}</span>
                        </div>
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col overflow-auto">
                {/* 空状态提示 */}
                {!currentTask && (
                  <div className="flex flex-col items-center justify-center flex-1 text-center">
                    <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 mb-6 shadow-lg">
                      <Eye className="w-12 h-12 text-purple-600 dark:text-purple-400" />
                    </div>
                    <h3 className="text-xl font-bold mb-3 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                      等待解析
                    </h3>
                    <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
                      请在左侧输入视频链接并点击"解析预览"按钮，解析结果将在这里显示
                    </p>
                  </div>
                )}

                {/* 预览内容 */}
                {currentTask && (
                  <div className="space-y-4">
                    {/* 双栏预览布局 */}
                    {previewState.isPreviewMode && previewState.previewData && (
                      <TwoColumnPreview
                        mediaInfo={previewState.previewData}
                        isUploading={isConverting && currentTask?.status === TaskStatus.UPLOADING}
                        onConfirmUpload={handleConfirmUpload}
                        onReparse={handleReparse}
                        onReset={resetForm}
                        currentTask={currentTask}
                        progress={progress}
                      />
                    )}

                    {/* 错误信息 */}
                    {currentTask.error && (
                      <Alert className="border-red-200 dark:border-red-800 bg-red-50/80 dark:bg-red-950/30 shadow-sm">
                        <XCircle className="h-4 w-4 text-red-500" />
                        <AlertDescription className="text-red-700 dark:text-red-300">
                          <p className="font-medium"><strong>错误信息:</strong> {currentTask.error}</p>
                        </AlertDescription>
                      </Alert>
                    )}

                    {/* 成功信息 */}
                    {currentTask.status === TaskStatus.SUCCESS && currentTask.uploadResult?.filePath && (
                      <Alert className="border-green-200 dark:border-green-800 bg-green-50/80 dark:bg-green-950/30 shadow-sm">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <AlertDescription className="text-green-700 dark:text-green-300 text-sm">
                          <p className="text-xs break-all">
                            {decodeURIComponent(currentTask.uploadResult.filePath)}
                          </p>
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
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
