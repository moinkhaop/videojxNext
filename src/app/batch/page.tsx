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
  Play,
  Pause,
  Square,
  CheckCircle,
  XCircle,
  Loader2,
  Settings,
  List,
  Clock,
  Download,
  Clipboard,
  ClipboardCheck
} from 'lucide-react'
import {
  BatchTask,
  ConversionTask,
  TaskStatus,
  VideoParserConfig,
  EnhancedVideoParserConfig,
  WebDAVConfig,
  BatchInputMode,
  ExtendedBatchTask,
  ParserCapability,
  SupportedPlatform
} from '@/types'
import { ConfigManager, HistoryManager } from '@/lib/storage'
import { ConversionService } from '@/lib/conversion'
import { ClipboardDetector } from '@/lib/clipboard'
import Link from 'next/link'

export default function BatchPage() {
  const [videoUrls, setVideoUrls] = useState('')
  const [selectedParser, setSelectedParser] = useState<string>('')
  const [selectedWebDAV, setSelectedWebDAV] = useState<string>('')
  const [parsers, setParsers] = useState<VideoParserConfig[]>([])
  const [enhancedParsers, setEnhancedParsers] = useState<EnhancedVideoParserConfig[]>([])
  const [webdavServers, setWebdavServers] = useState<WebDAVConfig[]>([])
  const [currentBatch, setCurrentBatch] = useState<ExtendedBatchTask | null>(null)
  const [overallProgress, setOverallProgress] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  // {{ AURA: Add - 新增抖音用户模式相关状态 }}
  const [inputMode, setInputMode] = useState<BatchInputMode>(BatchInputMode.NORMAL)
  const [videoLimit, setVideoLimit] = useState<number>(20)

  // 剪贴板检测状态
  const [clipboardEnabled, setClipboardEnabled] = useState(false)
  const [lastClipboardUrl, setLastClipboardUrl] = useState('')

  useEffect(() => {
    // 加载配置和增强解析器
    const loadConfiguration = async () => {
      const loadedParsers = ConfigManager.getParsers()
      const loadedServers = ConfigManager.getWebDAVServers()
      
      setParsers(loadedParsers)
      setWebdavServers(loadedServers)

      // {{ AURA: Add - 增强解析器能力检测 }}
      try {
        const enhanced = await ConversionService.enhanceParserConfigs(loadedParsers)
        
        // 如果没有抖音用户解析器，添加内置的
        const hasDouyinUserParser = enhanced.some(p =>
          p.capabilities?.includes(ParserCapability.USER_PAGE)
        )
        
        if (!hasDouyinUserParser) {
          const douyinUserParser = ConversionService.getOrCreateDouyinUserParser(loadedParsers)
          enhanced.push(douyinUserParser)
        }
        
        setEnhancedParsers(enhanced)
        console.log('[批量转存] 解析器能力检测完成:', enhanced.map(p => `${p.name}(${p.capabilities?.join('/')})`))
      } catch (error) {
        console.error('[批量转存] 解析器能力检测失败:', error)
        // 降级到原始解析器
        setEnhancedParsers(loadedParsers.map(p => ({
          ...p,
          capabilities: [ParserCapability.SINGLE_VIDEO],
          supportedPlatforms: [SupportedPlatform.UNIVERSAL],
          responseAdapter: 'universal_api'
        })))
      }

      // 设置默认选择
      const defaultParser = loadedParsers.find(p => p.isDefault) || loadedParsers[0]
      const defaultServer = loadedServers.find(s => s.isDefault) || loadedServers[0]
      
      if (defaultParser) setSelectedParser(defaultParser.id)
      if (defaultServer) setSelectedWebDAV(defaultServer.id)
    }
    
    loadConfiguration()
  }, [])

  // 剪贴板自动检测
  useEffect(() => {
    if (!clipboardEnabled) return

    const handleClipboardDetection = (url: string) => {
      // 如果正在处理，不自动添加
      if (isProcessing) return

      // 避免重复添加相同的URL
      if (url === lastClipboardUrl) return

      setLastClipboardUrl(url)

      // 添加到URL列表（追加模式）
      setVideoUrls(prev => {
        if (prev.trim()) {
          return prev + '\n' + url
        }
        return url
      })

      console.log('从剪贴板检测到视频链接并添加:', url)
    }

    ClipboardDetector.startMonitoring(handleClipboardDetection, 1000)

    return () => {
      ClipboardDetector.stopMonitoring()
    }
  }, [clipboardEnabled, isProcessing, lastClipboardUrl])

  // 手动从剪贴板粘贴
  const handlePasteFromClipboard = async () => {
    try {
      const url = await ClipboardDetector.checkOnce()
      if (url) {
        setVideoUrls(prev => {
          if (prev.trim()) {
            return prev + '\n' + url
          }
          return url
        })
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

  const handleStartBatch = async () => {
    if (!videoUrls.trim()) {
      alert('请输入视频链接或抖音用户主页链接')
      return
    }

    if (!selectedParser || !selectedWebDAV) {
      alert('请选择解析API和WebDAV服务器')
      return
    }

    const parser = parsers.find(p => p.id === selectedParser)
    const webdav = webdavServers.find(s => s.id === selectedWebDAV)

    if (!parser || !webdav) {
      alert('配置信息错误')
      return
    }

    // {{ AURA: Modify - 支持智能模式识别和抖音用户解析 }}
    // 自动检测输入模式
    const detectedMode = ConversionService.detectInputMode(videoUrls.trim())
    
    setIsProcessing(true)
    setIsPaused(false)
    setOverallProgress(0)

    let batchTask: ExtendedBatchTask

    if (detectedMode === BatchInputMode.DOUYIN_USER) {
      // 抖音用户模式
      const userUrl = videoUrls.trim()
      batchTask = {
        id: ConversionService.generateBatchId(),
        name: `抖音用户批量转存 - ${new Date().toLocaleString()}`,
        status: TaskStatus.PENDING,
        totalTasks: videoLimit,
        completedTasks: 0,
        tasks: [], // 初始为空，将在解析后填充
        parserConfig: parser,
        webdavConfig: webdav,
        createdAt: new Date(),
        inputMode: BatchInputMode.DOUYIN_USER,
        sourceUrl: userUrl,
        totalSourceVideos: 0
      }
    } else {
      // 普通批量模式
      const urls = ConversionService.parseVideoUrls(videoUrls.trim())
      if (urls.length === 0) {
        alert('没有找到有效的视频链接')
        setIsProcessing(false)
        return
      }

      batchTask = {
        id: ConversionService.generateBatchId(),
        name: `批量转存任务 - ${new Date().toLocaleString()}`,
        status: TaskStatus.PENDING,
        totalTasks: urls.length,
        completedTasks: 0,
        tasks: urls.map(url => ({
          id: ConversionService.generateTaskId(),
          videoUrl: url,
          status: TaskStatus.PENDING,
          createdAt: new Date()
        })),
        parserConfig: parser,
        webdavConfig: webdav,
        createdAt: new Date(),
        inputMode: BatchInputMode.NORMAL
      }
    }

    setCurrentBatch(batchTask)
    setInputMode(detectedMode)

    try {
      // 执行扩展的批量转存
      const updatedBatch = await ConversionService.convertExtendedBatch(
        batchTask,
        (progress, currentTask) => {
          setOverallProgress(progress)
          if (currentTask) {
            setCurrentBatch(prev => {
              if (!prev) return null
              const updatedTasks = prev.tasks.map(t =>
                t.id === currentTask.id ? currentTask : t
              )
              return {
                ...prev,
                tasks: updatedTasks,
                completedTasks: updatedTasks.filter(t => t.status === TaskStatus.SUCCESS).length
              }
            })
          } else {
            // 更新整体进度
            setCurrentBatch(prev => prev ? { ...prev, status: TaskStatus.PARSING } : null)
          }
        }
      )

      setCurrentBatch(updatedBatch)

      // 保存到历史记录
      HistoryManager.addRecord({
        id: ConversionService.generateTaskId(),
        type: 'batch',
        task: updatedBatch,
        createdAt: new Date()
      })

    } catch (error) {
      console.error('批量转存失败:', error)
      alert(`批量转存失败: ${error instanceof Error ? error.message : '未知错误'}`)
    } finally {
      setIsProcessing(false)
    }
  }

  const resetBatch = () => {
    setVideoUrls('')
    setCurrentBatch(null)
    setOverallProgress(0)
    setIsProcessing(false)
    setIsPaused(false)
  }

  const getStatusIcon = (status: TaskStatus) => {
    switch (status) {
      case TaskStatus.PENDING:
        return <Clock className="w-4 h-4 text-gray-500" />
      case TaskStatus.PARSING:
        return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
      case TaskStatus.UPLOADING:
        return <Download className="w-4 h-4 text-blue-500" />
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

  const getStatusBadgeColor = (status: TaskStatus) => {
    switch (status) {
      case TaskStatus.SUCCESS:
        return 'bg-green-100 text-green-800 border-green-200'
      case TaskStatus.FAILED:
        return 'bg-red-100 text-red-800 border-red-200'
      case TaskStatus.PARSING:
      case TaskStatus.UPLOADING:
        return 'bg-blue-100 text-blue-800 border-blue-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const urlCount = ConversionService.parseVideoUrls(videoUrls.trim()).length

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-purple-50/20 dark:to-purple-950/20">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-gradient-to-br from-purple-500/10 to-purple-600/10 rounded-lg">
              <List className="w-7 h-7 text-purple-600 dark:text-purple-400" />
            </div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-purple-500 bg-clip-text text-transparent">
              批量转存
            </h1>
          </div>
          <p className="text-muted-foreground ml-14">
            一次性处理多个视频链接，自动队列管理，支持进度跟踪
          </p>
        </div>

        {/* 配置检查 */}
        {(parsers.length === 0 || webdavServers.length === 0) && (
          <Alert className="mb-6 border-2 border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30">
            <Settings className="h-5 w-5 text-orange-600" />
            <AlertDescription>
              请先配置解析API和WebDAV服务器。
              <Link href="/settings" className="ml-2 text-primary hover:underline font-semibold">
                前往设置
              </Link>
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-6">
          {/* {{ AURA: Modify - 布局调整为单列流式布局 }} */}
          {/* 步骤一：输入与配置 */}
          <Card className="border-2 hover:border-purple-300 dark:hover:border-purple-700 transition-all duration-300 shadow-lg">
            <CardHeader className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30">
              <CardTitle className="flex items-center space-x-2">
                <div className="p-2 bg-purple-500/10 rounded-lg">
                  <List className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <span>1. 输入与配置</span>
              </CardTitle>
              <CardDescription>
                粘贴视频链接列表（每行一个），选择解析服务和存储位置。
              </CardDescription>
            </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">
                输入内容 {urlCount > 0 && (
                  <span className="text-muted-foreground">
                    ({urlCount} 个视频)
                    {inputMode === BatchInputMode.DOUYIN_USER && (
                      <Badge variant="secondary" className="ml-2 text-xs">
                        抖音用户模式
                      </Badge>
                    )}
                  </span>
                )}
              </label>
              <div className="flex items-center justify-end gap-2 mb-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handlePasteFromClipboard}
                  disabled={isProcessing}
                  className="h-7"
                >
                  <Clipboard className="w-3 h-3 mr-1" />
                  粘贴
                </Button>
                <Button
                  type="button"
                  variant={clipboardEnabled ? "default" : "outline"}
                  size="sm"
                  onClick={toggleClipboardDetection}
                  disabled={isProcessing}
                  className="h-7"
                >
                  {clipboardEnabled ? (
                    <><ClipboardCheck className="w-3 h-3 mr-1" />自动添加中</>
                  ) : (
                    <><Clipboard className="w-3 h-3 mr-1" />自动添加</>
                  )}
                </Button>
              </div>
              <Textarea
                placeholder={`支持两种输入模式：

1. 普通批量模式 - 每行一个视频链接：
https://example.com/video1
https://example.com/video2

2. 抖音用户模式 - 单个用户主页链接：
https://www.douyin.com/user/MS4w...
（将自动解析该用户的所有视频）`}
                value={videoUrls}
                onChange={(e) => setVideoUrls(e.target.value)}
                className="min-h-[200px] font-mono text-sm"
                disabled={isProcessing}
              />
              {clipboardEnabled && (
                <p className="text-xs text-muted-foreground mt-1">
                  ✓ 剪贴板自动添加已启用，复制的视频链接将自动追加到列表
                </p>
              )}
              {/* 抖音用户模式的数量限制设置 */}
              {inputMode === BatchInputMode.DOUYIN_USER && (
                <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-blue-900">解析数量限制</label>
                    <span className="text-sm text-blue-600">最多解析 {videoLimit} 个视频</span>
                  </div>
                  <div className="flex items-center space-x-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setVideoLimit(Math.max(5, videoLimit - 5))}
                      disabled={isProcessing || videoLimit <= 5}
                    >
                      -5
                    </Button>
                    <span className="px-4 py-2 bg-white border rounded text-center font-mono min-w-[60px]">
                      {videoLimit}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setVideoLimit(Math.min(50, videoLimit + 5))}
                      disabled={isProcessing || videoLimit >= 50}
                    >
                      +5
                    </Button>
                  </div>
                  <p className="text-xs text-blue-600 mt-2">
                    抖音用户模式将解析该用户的最新 {videoLimit} 个视频进行批量转存
                  </p>
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">解析API</label>
                <Select value={selectedParser} onValueChange={setSelectedParser} disabled={isProcessing}>
                  <SelectTrigger><SelectValue placeholder="选择解析API" /></SelectTrigger>
                  <SelectContent>
                    {enhancedParsers.map((parser) => {
                      const isCompatible = inputMode === BatchInputMode.DOUYIN_USER
                        ? parser.capabilities?.includes(ParserCapability.USER_PAGE)
                        : parser.capabilities?.includes(ParserCapability.SINGLE_VIDEO);
                      const isRecommended = isCompatible && (
                        inputMode === BatchInputMode.DOUYIN_USER
                          ? parser.responseAdapter === 'douyin_user_api'
                          : parser.isDefault
                      );
                      
                      return (
                        <SelectItem
                          key={parser.id}
                          value={parser.id}
                          disabled={!isCompatible}
                          className={!isCompatible ? 'opacity-50' : ''}
                        >
                          <div className="flex items-center justify-between w-full">
                            <div className="flex items-center space-x-2">
                              {/* 兼容性状态图标 */}
                              {isRecommended && <CheckCircle className="w-3 h-3 text-green-500" />}
                              {!isCompatible && <XCircle className="w-3 h-3 text-red-500" />}
                              
                              <span className={!isCompatible ? 'text-gray-400' : ''}>{parser.name}</span>
                              
                              {parser.isDefault && <Badge variant="secondary" className="text-xs">默认</Badge>}
                              {isRecommended && <Badge variant="outline" className="text-xs text-green-600 border-green-300">推荐</Badge>}
                            </div>
                            
                            {/* 能力徽章 */}
                            <div className="flex space-x-1">
                              {parser.capabilities?.includes(ParserCapability.SINGLE_VIDEO) && (
                                <Badge variant="outline" className="text-xs bg-blue-50 text-blue-600 border-blue-200">
                                  单视频
                                </Badge>
                              )}
                              {parser.capabilities?.includes(ParserCapability.USER_PAGE) && (
                                <Badge variant="outline" className="text-xs bg-green-50 text-green-600 border-green-200">
                                  用户主页
                                </Badge>
                              )}
                            </div>
                          </div>
                          
                          {/* 不兼容提示 */}
                          {!isCompatible && (
                            <div className="text-xs text-gray-500 mt-1">
                              此解析器不支持{inputMode === BatchInputMode.DOUYIN_USER ? '用户主页解析' : '当前功能'}
                            </div>
                          )}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">WebDAV服务器</label>
                <Select value={selectedWebDAV} onValueChange={setSelectedWebDAV} disabled={isProcessing}>
                  <SelectTrigger><SelectValue placeholder="选择WebDAV服务器" /></SelectTrigger>
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
            <div className="pt-2">
              {!isProcessing ? (
                <Button
                  onClick={handleStartBatch}
                  disabled={urlCount === 0 || !selectedParser || !selectedWebDAV}
                  className="w-full"
                  size="lg"
                >
                  <Play className="w-4 h-4 mr-2" />
                  {inputMode === BatchInputMode.DOUYIN_USER
                    ? `解析抖音用户并批量转存 (${videoLimit}个视频)`
                    : `开始批量转存 (${urlCount}个链接)`
                  }
                </Button>
              ) : (
                <div className="flex space-x-2">
                  <Button variant="outline" onClick={() => setIsPaused(!isPaused)} className="flex-1" disabled>
                    {isPaused ? <><Play className="w-4 h-4 mr-2" />继续</> : <><Pause className="w-4 h-4 mr-2" />暂停</>}
                  </Button>
                  <Button variant="destructive" onClick={resetBatch}>
                    <Square className="w-4 h-4 mr-2" />
                    停止并重置
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

          {/* 步骤二：任务进度 */}
          {currentBatch && (
            <Card className="border-2 hover:border-emerald-300 dark:hover:border-emerald-700 transition-all duration-300 shadow-lg">
              <CardHeader className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30">
                <div className="flex items-center space-x-2">
                  <div className="p-2 bg-emerald-500/10 rounded-lg">
                    <Play className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <CardTitle>2. 任务进度</CardTitle>
                </div>
                <CardDescription>
                  实时显示批量转存进度和每个任务的状态。
                </CardDescription>
              </CardHeader>
            <CardContent className="space-y-6">
              {/* 总体进度 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">总体进度</h4>
                  <span className="text-sm text-muted-foreground">
                    {currentBatch.completedTasks}/{currentBatch.totalTasks} 完成
                  </span>
                </div>
                <Progress value={overallProgress} className="w-full" />
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{overallProgress.toFixed(1)}%</span>
                  <span>
                    成功: {currentBatch.tasks.filter(t => t.status === TaskStatus.SUCCESS).length} |
                    失败: {currentBatch.tasks.filter(t => t.status === TaskStatus.FAILED).length}
                  </span>
                </div>
              </div>

              {/* 任务列表 */}
              <div className="space-y-2">
                <h4 className="font-medium">任务详情</h4>
                <div className="max-h-96 overflow-y-auto space-y-2 p-1">
                  {currentBatch.tasks.map((task, index) => (
                    <div key={task.id} className="flex items-center space-x-3 p-3 border rounded-lg bg-card hover:bg-muted/50">
                      <div className="flex-shrink-0">{getStatusIcon(task.status)}</div>
                      <div className="flex-grow min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium">任务 {index + 1}</span>
                          <Badge key={`batch-task-badge-${task.id}`} className={`text-xs ${getStatusBadgeColor(task.status)}`} variant="outline">
                            {getStatusText(task.status)}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate" title={task.videoUrl}>{task.videoUrl}</p>
                        {task.videoTitle && <p className="text-xs text-foreground truncate mt-1" title={task.videoTitle}>{task.videoTitle}</p>}
                        {task.error && <p className="text-xs text-red-600 mt-1" title={task.error}>错误: {task.error}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 批量任务信息 */}
              <div className="text-xs text-muted-foreground pt-4 border-t space-y-1">
                <p>任务名称: {currentBatch.name}</p>
                <p>创建时间: {currentBatch.createdAt.toLocaleString()}</p>
                {currentBatch.completedAt && <p>完成时间: {currentBatch.completedAt.toLocaleString()}</p>}
              </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
