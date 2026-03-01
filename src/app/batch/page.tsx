'use client'

import { useEffect, useMemo, useState } from 'react'
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
  ClipboardCheck,
  X
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
  SupportedPlatform,
  ParserErrorClass
} from '@/types'
import { ConfigManager, HistoryManager } from '@/lib/storage'
import { BatchPoolState, ConversionService } from '@/lib/conversion'
import { ClipboardDetector } from '@/lib/clipboard'
import { classifyParserFailure } from '@/lib/parser-health'
import Link from 'next/link'

export default function BatchPage() {
  const [videoUrls, setVideoUrls] = useState('')
  const [inputModePreference, setInputModePreference] = useState<'auto' | 'normal' | 'douyin_user'>('auto')
  const [selectedParser, setSelectedParser] = useState<string>('')
  const [selectedWebDAV, setSelectedWebDAV] = useState<string>('')
  const [parsers, setParsers] = useState<VideoParserConfig[]>([])
  const [enhancedParsers, setEnhancedParsers] = useState<EnhancedVideoParserConfig[]>([])
  const [webdavServers, setWebdavServers] = useState<WebDAVConfig[]>([])
  const [currentBatch, setCurrentBatch] = useState<ExtendedBatchTask | null>(null)
  const [overallProgress, setOverallProgress] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [poolState, setPoolState] = useState<BatchPoolState | null>(null)
  const [poolHint, setPoolHint] = useState('')
  // {{ AURA: Add - 新增抖音用户模式相关状态 }}
  const [inputMode, setInputMode] = useState<BatchInputMode>(BatchInputMode.NORMAL)
  const [videoLimit, setVideoLimit] = useState<number>(20)

  // 剪贴板检测状态
  const [clipboardEnabled, setClipboardEnabled] = useState(false)
  const [lastClipboardUrl, setLastClipboardUrl] = useState('')

  // 实时检测输入模式
  useEffect(() => {
    let nextMode: BatchInputMode = BatchInputMode.NORMAL

    if (inputModePreference === 'douyin_user') {
      nextMode = BatchInputMode.DOUYIN_USER
    } else if (inputModePreference === 'normal') {
      nextMode = BatchInputMode.NORMAL
    } else if (videoUrls.trim()) {
      nextMode = ConversionService.detectInputMode(videoUrls.trim())
    }

    if (nextMode !== inputMode) {
      setInputMode(nextMode)
      console.log('[批量转存] 输入模式切换:', nextMode === BatchInputMode.DOUYIN_USER ? '抖音用户模式' : '普通批量模式')
    }
  }, [videoUrls, inputMode, inputModePreference])

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

    // 监听解析器配置更新事件
    const handleConfigUpdate = () => {
      console.log('[批量转存] 检测��解析器配置更新，重新加载配置')
      loadConfiguration()
    }

    window.addEventListener('parsers-config-updated', handleConfigUpdate)

    // 监听页面可见性变化，当页面重新可见时刷新配置
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[批量转存] 页面重新可见，刷新配置')
        loadConfiguration()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('parsers-config-updated', handleConfigUpdate)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  useEffect(() => {
    if (enhancedParsers.length === 0) {
      return
    }

    const isCompatible = (parser: EnhancedVideoParserConfig) => (
      inputMode === BatchInputMode.DOUYIN_USER
        ? parser.capabilities?.includes(ParserCapability.USER_PAGE)
        : parser.capabilities?.includes(ParserCapability.SINGLE_VIDEO)
    )

    const selected = enhancedParsers.find(parser => parser.id === selectedParser)
    if (selected && isCompatible(selected)) {
      return
    }

    const fallback = enhancedParsers.find(isCompatible)
    if (fallback && fallback.id !== selectedParser) {
      setSelectedParser(fallback.id)
    }
  }, [enhancedParsers, inputMode, selectedParser])

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

  // 清空输入框
  const handleClearInput = () => {
    setVideoUrls('')
  }

  const parsedInputUrls = useMemo(
    () => ConversionService.parseVideoUrls(videoUrls.trim()),
    [videoUrls]
  )
  const uniqueInputUrls = useMemo(
    () => Array.from(new Set(parsedInputUrls)),
    [parsedInputUrls]
  )
  const hasSingleDouyinShortLink = useMemo(() => {
    if (inputModePreference !== 'auto') return false
    if (uniqueInputUrls.length !== 1) return false
    return /^https?:\/\/v\.douyin\.com\/[A-Za-z0-9_-]+\/?$/i.test(uniqueInputUrls[0] || '')
  }, [inputModePreference, uniqueInputUrls])
  const urlCount = parsedInputUrls.length
  const dedupedUrlCount = uniqueInputUrls.length
  const duplicateUrlCount = Math.max(0, urlCount - dedupedUrlCount)

  const failedTaskCount = currentBatch?.tasks.filter(t => t.status === TaskStatus.FAILED).length ?? 0
  const failureAggregation = useMemo(() => {
    const result: Partial<Record<ParserErrorClass, number>> = {}
    if (!currentBatch) return result

    for (const task of currentBatch.tasks) {
      if (task.status !== TaskStatus.FAILED || !task.error) continue
      const errorClass = classifyParserFailure({ message: task.error })
      result[errorClass] = (result[errorClass] ?? 0) + 1
    }
    return result
  }, [currentBatch])

  const handleStartBatch = async () => {
    if (!videoUrls.trim()) {
      alert('请输入视频链接或抖音用户主页链接')
      return
    }

    if (!selectedParser || !selectedWebDAV) {
      alert('请选择解析API和WebDAV服务器')
      return
    }

    const parser = parsers.find(p => p.id === selectedParser) || enhancedParsers.find(p => p.id === selectedParser)
    const webdav = webdavServers.find(s => s.id === selectedWebDAV)

    if (!parser || !webdav) {
      alert('配置信息错误')
      return
    }

    // {{ AURA: Modify - 支持智能模式识别和抖音用户解析 }}
    // 自动检测输入模式
    const detectedMode = inputModePreference === 'auto'
      ? ConversionService.detectInputMode(videoUrls.trim())
      : (inputModePreference === 'douyin_user' ? BatchInputMode.DOUYIN_USER : BatchInputMode.NORMAL)
    
    setIsProcessing(true)
    setIsPaused(false)
    setOverallProgress(0)
    setPoolState(null)
    setPoolHint('')

    let batchTask: ExtendedBatchTask

    if (detectedMode === BatchInputMode.DOUYIN_USER) {
      // 抖音用户模式
      const parsedUrls = ConversionService.parseVideoUrls(videoUrls.trim())
      const userUrl = parsedUrls[0] || videoUrls.trim()
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
      const uniqueUrls = Array.from(new Set(urls))
      if (urls.length === 0) {
        alert('没有找到有效的视频链接')
        setIsProcessing(false)
        return
      }
      if (uniqueUrls.length < urls.length) {
        setPoolHint(`已自动去重：输入 ${urls.length} 条，实际执行 ${uniqueUrls.length} 条`)
      }

      batchTask = {
        id: ConversionService.generateBatchId(),
        name: `批量转存任务 - ${new Date().toLocaleString()}`,
        status: TaskStatus.PENDING,
        totalTasks: uniqueUrls.length,
        completedTasks: 0,
        tasks: uniqueUrls.map(url => ({
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
        },
        {
          onPoolState: (state) => {
            setPoolState(state)
            if (state.event === 'scale_down') {
              setPoolHint(`检测到失败，自动降并发到 ${state.currentConcurrency}`)
            } else if (state.event === 'scale_up') {
              setPoolHint(`任务稳定，自动恢复并发到 ${state.currentConcurrency}`)
            }
          }
        }
      )

      setCurrentBatch(updatedBatch)

      // 保存到历史记录
      // {{ AURA: Modify - 对于抖音用户模式，简化历史记录，只保存用户主页链接和统计信息 }}
      const historyTask = updatedBatch.inputMode === BatchInputMode.DOUYIN_USER
        ? {
            ...updatedBatch,
            // 清空tasks数组，只保留统计信息，减少历史记录存储空间
            tasks: []
          }
        : updatedBatch;

      HistoryManager.addRecord({
        id: ConversionService.generateTaskId(),
        type: 'batch',
        task: historyTask,
        createdAt: new Date()
      })

    } catch (error) {
      console.error('批量转存失败:', error)
      alert(`批量转存失败: ${error instanceof Error ? error.message : '未知错误'}`)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleRetryFailedTasks = async () => {
    if (!currentBatch) return
    if (isProcessing) return

    const failedTasks = currentBatch.tasks.filter(task => task.status === TaskStatus.FAILED)
    if (failedTasks.length === 0) {
      alert('当前没有失败任务可重试')
      return
    }

    setIsProcessing(true)
    setIsPaused(false)
    setOverallProgress(0)
    setPoolHint(`正在重试失败任务（${failedTasks.length} 条）`)

    const retryBatch: ExtendedBatchTask = {
      ...currentBatch,
      id: ConversionService.generateBatchId(),
      name: `${currentBatch.name} - 失败重试`,
      status: TaskStatus.PENDING,
      totalTasks: failedTasks.length,
      completedTasks: 0,
      completedAt: undefined,
      inputMode: BatchInputMode.NORMAL,
      tasks: failedTasks.map(task => ({
        ...task,
        status: TaskStatus.PENDING,
        error: undefined,
        completedAt: undefined,
        uploadResult: undefined,
      })),
    }

    try {
      const retryResult = await ConversionService.convertExtendedBatch(
        retryBatch,
        (progress, currentTask) => {
          setOverallProgress(progress)
          if (!currentTask) return
          setCurrentBatch(prev => {
            if (!prev) return null
            const updatedTasks = prev.tasks.map(task => task.id === currentTask.id ? currentTask : task)
            return {
              ...prev,
              tasks: updatedTasks,
              completedTasks: updatedTasks.filter(task => task.status === TaskStatus.SUCCESS).length,
            }
          })
        },
        {
          onPoolState: (state) => {
            setPoolState(state)
            if (state.event === 'scale_down') {
              setPoolHint(`重试中自动降并发到 ${state.currentConcurrency}`)
            } else if (state.event === 'scale_up') {
              setPoolHint(`重试中自动恢复并发到 ${state.currentConcurrency}`)
            }
          },
        }
      )

      const retryMap = new Map(retryResult.tasks.map(task => [task.id, task]))
      setCurrentBatch(prev => {
        if (!prev) return null
        const mergedTasks = prev.tasks.map(task => retryMap.get(task.id) || task)
        const completed = mergedTasks.filter(task => task.status === TaskStatus.SUCCESS).length
        const failed = mergedTasks.filter(task => task.status === TaskStatus.FAILED).length
        return {
          ...prev,
          tasks: mergedTasks,
          completedTasks: completed,
          completedAt: new Date(),
          status: failed > 0 ? TaskStatus.FAILED : TaskStatus.SUCCESS,
        }
      })

      HistoryManager.addRecord({
        id: ConversionService.generateTaskId(),
        type: 'batch',
        task: retryResult,
        createdAt: new Date(),
      })
    } catch (error) {
      console.error('重试失败任务时出错:', error)
      alert(`重试失败任务出错: ${error instanceof Error ? error.message : '未知错误'}`)
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
    setPoolState(null)
    setPoolHint('')
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

  const getErrorClassLabel = (errorClass: ParserErrorClass) => {
    switch (errorClass) {
      case 'timeout':
        return '超时'
      case 'network':
        return '网络'
      case 'http4xx':
        return '上游4xx'
      case 'http5xx':
        return '上游5xx'
      case 'invalid_payload':
        return '响应异常'
      default:
        return '未知'
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

        {/* 主要内容区域 - 响应式左右分栏布局 */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* 左侧：配置控制面板 */}
          <div className="lg:col-span-6">
          <Card className="border-none shadow-lg bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto">
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
                    ({dedupedUrlCount} 个有效链接
                    {duplicateUrlCount > 0 ? `，${duplicateUrlCount} 个重复` : ''}
                    )
                    {inputMode === BatchInputMode.DOUYIN_USER && (
                      <Badge variant="secondary" className="ml-2 text-xs">
                        抖音用户模式
                      </Badge>
                    )}
                  </span>
                )}
              </label>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-muted-foreground">输入模式</span>
                <Button
                  type="button"
                  variant={inputModePreference === 'auto' ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={isProcessing}
                  onClick={() => setInputModePreference('auto')}
                >
                  自动识别
                </Button>
                <Button
                  type="button"
                  variant={inputModePreference === 'normal' ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={isProcessing}
                  onClick={() => setInputModePreference('normal')}
                >
                  普通批量
                </Button>
                <Button
                  type="button"
                  variant={inputModePreference === 'douyin_user' ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={isProcessing}
                  onClick={() => setInputModePreference('douyin_user')}
                >
                  抖音用户主页
                </Button>
              </div>
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
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleClearInput}
                  disabled={isProcessing || !videoUrls.trim()}
                  className="h-7"
                >
                  <X className="w-3 h-3 mr-1" />
                  清空
                </Button>
              </div>
              <Textarea
                placeholder={`支持两种输入模式：

1. 普通批量模式 - 每行一个视频链接：
https://example.com/video1
https://example.com/video2

2. 抖音用户模式 - 单个用户主页链接：
https://www.douyin.com/user/MS4w...
（将自动解析该用户的所有视频）

提示：如果粘贴的是 v.douyin.com 短链，请先在上方手动切换输入模式。`}
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
              {hasSingleDouyinShortLink && (
                <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                  检测到抖音短链，自动模式无法判断它是单视频还是用户主页。
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto px-1 py-0 text-xs text-amber-900"
                    disabled={isProcessing}
                    onClick={() => setInputModePreference('douyin_user')}
                  >
                    按用户主页解析
                  </Button>
                </div>
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
                          ? parser.responseAdapter === 'douyin_user_api' || parser.responseAdapter === 'simplified_douyin_user_api'
                          : parser.isDefault
                      );
                      
                      return (
                        <SelectItem
                          key={parser.id}
                          value={parser.id}
                          disabled={!isCompatible}
                          className={!isCompatible ? 'opacity-50' : ''}
                        >
                          <div className="flex items-center gap-2 w-full min-w-0">
                            {/* 兼容性状态图标 */}
                            {isRecommended && <CheckCircle className="w-3 h-3 text-green-500 flex-shrink-0" />}
                            {!isCompatible && <XCircle className="w-3 h-3 text-red-500 flex-shrink-0" />}

                            <span className={`truncate ${!isCompatible ? 'text-gray-400' : ''}`}>{parser.name}</span>

                            <div className="flex items-center gap-1 ml-auto flex-shrink-0">
                              {parser.isDefault && <Badge variant="secondary" className="text-xs">默认</Badge>}
                              {isRecommended && <Badge variant="outline" className="text-xs text-green-600 border-green-300">推荐</Badge>}
                            </div>
                          </div>
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
                  disabled={dedupedUrlCount === 0 || !selectedParser || !selectedWebDAV}
                  className="w-full h-12 text-base font-semibold bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 shadow-lg hover:shadow-xl transition-all"
                  size="lg"
                >
                  <Play className="w-5 h-5 mr-2" />
                  {inputMode === BatchInputMode.DOUYIN_USER
                    ? `解析抖音用户并批量转存 (${videoLimit}个视频)`
                    : `开始批量转存 (${dedupedUrlCount}个链接)`
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
          </div>

          {/* 右侧：进度和任务面板 */}
          <div className="lg:col-span-6">
            <div className="sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto">
          {currentBatch ? (
            <div className="space-y-6 pr-2">
              {/* 统计卡片组 */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 flex-shrink-0">
                {/* 总体进度卡片 */}
                <Card className="border-none shadow-md bg-gradient-to-br from-blue-500 to-cyan-500 text-white overflow-hidden relative">
                  <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -mr-10 -mt-10"></div>
                  <CardContent className="p-4 relative z-10">
                    <div className="text-xs font-medium opacity-90 mb-1">总体进度</div>
                    <div className="text-2xl font-bold mb-2">{overallProgress.toFixed(0)}%</div>
                    <Progress value={overallProgress} className="h-1.5 bg-white/30" />
                  </CardContent>
                </Card>

                {/* 任务总数卡片 */}
                <Card className="border-none shadow-md bg-gradient-to-br from-purple-500 to-pink-500 text-white overflow-hidden relative">
                  <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -mr-10 -mt-10"></div>
                  <CardContent className="p-4 relative z-10">
                    <div className="text-xs font-medium opacity-90 mb-1">任务总数</div>
                    <div className="text-2xl font-bold">{currentBatch.totalTasks}</div>
                    <div className="text-xs opacity-75 mt-1">已完成 {currentBatch.completedTasks}</div>
                  </CardContent>
                </Card>

                {/* 成功数量卡片 */}
                <Card className="border-none shadow-md bg-gradient-to-br from-green-500 to-emerald-500 text-white overflow-hidden relative">
                  <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -mr-10 -mt-10"></div>
                  <CardContent className="p-4 relative z-10">
                    <div className="text-xs font-medium opacity-90 mb-1 flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" />
                      成功
                    </div>
                    <div className="text-2xl font-bold">
                      {currentBatch.tasks.filter(t => t.status === TaskStatus.SUCCESS).length}
                    </div>
                    <div className="text-xs opacity-75 mt-1">
                      {currentBatch.totalTasks > 0 ? ((currentBatch.tasks.filter(t => t.status === TaskStatus.SUCCESS).length / currentBatch.totalTasks) * 100).toFixed(0) : 0}% 成功率
                    </div>
                  </CardContent>
                </Card>

                {/* 失败数量卡片 */}
                <Card className="border-none shadow-md bg-gradient-to-br from-red-500 to-rose-500 text-white overflow-hidden relative">
                  <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -mr-10 -mt-10"></div>
                  <CardContent className="p-4 relative z-10">
                    <div className="text-xs font-medium opacity-90 mb-1 flex items-center gap-1">
                      <XCircle className="w-3 h-3" />
                      失败
                    </div>
                    <div className="text-2xl font-bold">
                      {currentBatch.tasks.filter(t => t.status === TaskStatus.FAILED).length}
                    </div>
                    <div className="text-xs opacity-75 mt-1">需要重试</div>
                  </CardContent>
                </Card>
              </div>

              {failedTaskCount > 0 && (
                <Card className="border-none shadow-md bg-gradient-to-r from-rose-500/10 to-orange-500/10">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-gray-900 dark:text-white">失败归因</div>
                        <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          共 {failedTaskCount} 个失败任务，按错误类型统计
                        </div>
                      </div>
                      {!isProcessing && (
                        <Button size="sm" onClick={handleRetryFailedTasks}>
                          重试失败任务 ({failedTaskCount})
                        </Button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {Object.entries(failureAggregation).map(([errorClass, count]) => (
                        <Badge key={errorClass} variant="outline">
                          {getErrorClassLabel(errorClass as ParserErrorClass)}: {count}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {poolState && (
                <Card className="border-none shadow-md bg-gradient-to-r from-indigo-500/10 to-cyan-500/10">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <div>
                        <div className="font-semibold text-gray-900 dark:text-white">并发调度器</div>
                        <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          当前并发 {poolState.currentConcurrency} / {poolState.maxConcurrency}，
                          运行中 {poolState.inFlight}，已处理 {poolState.processed}/{poolState.total}
                        </div>
                        {poolHint && (
                          <div className="text-xs text-indigo-700 dark:text-indigo-300 mt-1">{poolHint}</div>
                        )}
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {poolState.stage === 'douyin_upload' ? '抖音上传池' : '批量任务池'}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* 任务列表卡片 */}
              <Card className="border-none shadow-lg bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl shadow-md">
                        <List className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <CardTitle className="text-lg font-bold">任务列表</CardTitle>
                        <CardDescription className="text-xs mt-0.5">
                          {currentBatch.tasks.length} 个任务
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!isProcessing && failedTaskCount > 0 && (
                        <Button size="sm" variant="outline" onClick={handleRetryFailedTasks}>
                          重试失败 ({failedTaskCount})
                        </Button>
                      )}
                      <Badge variant="outline" className="text-xs">
                        {isProcessing ? '处理中' : '已完成'}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>

                  {/* 任务列表滚动区域 */}
                  <div className="space-y-2">
                    {currentBatch.tasks.length === 0 ? (
                      <div className="text-center py-12 text-gray-500">
                        <Clock className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        <p className="text-sm">等待任务开始...</p>
                      </div>
                    ) : (
                      currentBatch.tasks.map((task, index) => (
                        <div
                          key={task.id}
                          className={`group p-3 border rounded-lg transition-all hover:shadow-md ${
                            task.status === TaskStatus.SUCCESS
                              ? 'bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 border-green-200 dark:border-green-900'
                              : task.status === TaskStatus.FAILED
                              ? 'bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-950/20 dark:to-rose-950/20 border-red-200 dark:border-red-900'
                              : task.status === TaskStatus.PARSING || task.status === TaskStatus.UPLOADING
                              ? 'bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/20 dark:to-cyan-950/20 border-blue-200 dark:border-blue-900'
                              : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            {/* 状态图标 */}
                            <div className="flex-shrink-0 mt-0.5">{getStatusIcon(task.status)}</div>

                            {/* 任务信息 */}
                            <div className="flex-grow min-w-0">
                              <div className="flex items-center justify-between gap-2 mb-1.5">
                                <span className="text-xs font-bold text-gray-500 dark:text-gray-400">
                                  #{index + 1}
                                </span>
                                <Badge className={`text-xs ${getStatusBadgeColor(task.status)}`} variant="outline">
                                  {getStatusText(task.status)}
                                </Badge>
                              </div>

                              {/* 视频标题 */}
                              {task.videoTitle && (
                                <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1 line-clamp-1" title={task.videoTitle}>
                                  {task.videoTitle}
                                </p>
                              )}

                              {/* 视频URL */}
                              <p className="text-xs text-gray-600 dark:text-gray-400 truncate mb-1" title={task.videoUrl}>
                                {task.videoUrl}
                              </p>

                              {/* 错误信息 */}
                              {task.error && (
                                <div className="mt-2 p-2 bg-red-100 dark:bg-red-950/40 border border-red-300 dark:border-red-800 rounded">
                                  <p className="text-xs text-red-800 dark:text-red-200 line-clamp-2" title={task.error}>
                                    <XCircle className="w-3 h-3 inline mr-1" />
                                    {task.error}
                                  </p>
                                </div>
                              )}

                              {/* 成功提示 */}
                              {task.status === TaskStatus.SUCCESS && task.uploadResult?.filePath && (
                                <div className="mt-1.5 text-xs text-green-700 dark:text-green-300">
                                  <CheckCircle className="w-3 h-3 inline mr-1" />
                                  已保存至: {task.uploadResult.filePath}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* 批量任务信息 */}
                  <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="p-3 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 rounded-lg space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600 dark:text-gray-400 font-medium">任务名称</span>
                        <span className="text-gray-900 dark:text-white font-semibold">{currentBatch.name}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600 dark:text-gray-400 font-medium">创建时间</span>
                        <span className="text-gray-900 dark:text-white">
                          {currentBatch.createdAt.toLocaleString()}
                        </span>
                      </div>
                      {currentBatch.completedAt && (
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600 dark:text-gray-400 font-medium">完成时间</span>
                          <span className="text-gray-900 dark:text-white">
                            {currentBatch.completedAt.toLocaleString()}
                          </span>
                        </div>
                      )}
                      {currentBatch.inputMode === BatchInputMode.DOUYIN_USER && currentBatch.sourceUrl && (
                        <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                          <span className="text-gray-600 dark:text-gray-400 font-medium">来源</span>
                          <p className="text-gray-900 dark:text-white mt-1 truncate" title={currentBatch.sourceUrl}>
                            {currentBatch.sourceUrl}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            // 空状态提示
            <Card className="border-none shadow-lg bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm h-full flex items-center justify-center">
              <CardContent className="py-16">
                <div className="text-center text-gray-500">
                  <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/20 dark:to-pink-900/20 rounded-2xl flex items-center justify-center">
                    <Play className="w-10 h-10 text-purple-500 dark:text-purple-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    准备就绪
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 max-w-sm mx-auto">
                    在左侧输入视频链接，选择解析器和WebDAV服务器，然后点击"开始批量转存"按钮
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
