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

        <div className="space-y-6">
          {/* 输入与配置 */}
          <Card className="border-none shadow-lg bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl shadow-md">
                  <List className="w-5 h-5 text-white" />
                </div>
                <div>
                  <CardTitle className="text-lg font-bold">输入与配置</CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    粘贴视频链接列表或用户主页链接
                  </CardDescription>
                </div>
              </div>
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
            <div className="pt-4">
              {!isProcessing ? (
                <Button
                  onClick={handleStartBatch}
                  disabled={urlCount === 0 || !selectedParser || !selectedWebDAV}
                  className="w-full h-12 text-base font-semibold bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 shadow-lg hover:shadow-xl transition-all"
                  size="lg"
                >
                  <Play className="w-5 h-5 mr-2" />
                  {inputMode === BatchInputMode.DOUYIN_USER
                    ? `解析抖音用户并批量转存 (${videoLimit}个视频)`
                    : `开始批量转存 (${urlCount}个链接)`
                  }
                </Button>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setIsPaused(!isPaused)}
                    className="h-12 border-2"
                    disabled
                  >
                    {isPaused ? (
                      <><Play className="w-5 h-5 mr-2" />继续</>
                    ) : (
                      <><Pause className="w-5 h-5 mr-2" />暂停</>
                    )}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={resetBatch}
                    className="h-12 shadow-md hover:shadow-lg transition-all"
                  >
                    <Square className="w-5 h-5 mr-2" />
                    停止并重置
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

          {/* 任务进度 */}
          {currentBatch && (
            <Card className="border-none shadow-lg bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl shadow-md">
                    <Play className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-lg font-bold">任务进度</CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      实时显示批量转存进度和任务状态
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
            <CardContent className="space-y-6">
              {/* 总体进度 */}
              <div className="p-4 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 rounded-lg border border-blue-100 dark:border-blue-900">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-gray-900 dark:text-white">总体进度</h4>
                  <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                    {currentBatch.completedTasks}/{currentBatch.totalTasks} 完成
                  </span>
                </div>
                <Progress value={overallProgress} className="h-3 mb-3" />
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div className="text-center p-2 bg-white dark:bg-gray-900 rounded-lg">
                    <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">进度</div>
                    <div className="font-bold text-blue-600 dark:text-blue-400">{overallProgress.toFixed(1)}%</div>
                  </div>
                  <div className="text-center p-2 bg-white dark:bg-gray-900 rounded-lg">
                    <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">成功</div>
                    <div className="font-bold text-green-600 dark:text-green-400">
                      {currentBatch.tasks.filter(t => t.status === TaskStatus.SUCCESS).length}
                    </div>
                  </div>
                  <div className="text-center p-2 bg-white dark:bg-gray-900 rounded-lg">
                    <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">失败</div>
                    <div className="font-bold text-red-600 dark:text-red-400">
                      {currentBatch.tasks.filter(t => t.status === TaskStatus.FAILED).length}
                    </div>
                  </div>
                </div>
              </div>

              {/* 任务列表 */}
              <div className="space-y-3">
                <h4 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <div className="w-1 h-5 bg-gradient-to-b from-emerald-500 to-teal-500 rounded-full"></div>
                  任务详情
                </h4>
                <div className="max-h-[500px] overflow-y-auto space-y-2 pr-2">
                  {currentBatch.tasks.map((task, index) => (
                    <div key={task.id} className="group p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-800 hover:shadow-md transition-all">
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 mt-0.5">{getStatusIcon(task.status)}</div>
                        <div className="flex-grow min-w-0">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-semibold text-gray-900 dark:text-white">
                              任务 {index + 1}
                            </span>
                            <Badge className={`text-xs ${getStatusBadgeColor(task.status)}`} variant="outline">
                              {getStatusText(task.status)}
                            </Badge>
                          </div>
                          {task.videoTitle && (
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate mb-1" title={task.videoTitle}>
                              {task.videoTitle}
                            </p>
                          )}
                          <p className="text-xs text-gray-600 dark:text-gray-400 truncate" title={task.videoUrl}>
                            {task.videoUrl}
                          </p>
                          {task.error && (
                            <div className="mt-2 p-2 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded">
                              <p className="text-xs text-red-700 dark:text-red-300" title={task.error}>
                                <span className="font-semibold">错误:</span> {task.error}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 批量任务信息 */}
              <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600 dark:text-gray-400">任务名称</span>
                    <span className="font-medium text-gray-900 dark:text-white">{currentBatch.name}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600 dark:text-gray-400">创建时间</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {currentBatch.createdAt.toLocaleString()}
                    </span>
                  </div>
                  {currentBatch.completedAt && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600 dark:text-gray-400">完成时间</span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {currentBatch.completedAt.toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
