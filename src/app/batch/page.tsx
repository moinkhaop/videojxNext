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
  Download
} from 'lucide-react'
import { BatchTask, ConversionTask, TaskStatus, VideoParserConfig, WebDAVConfig } from '@/types'
import { ConfigManager, HistoryManager } from '@/lib/storage'
import { ConversionService } from '@/lib/conversion'
import Link from 'next/link'

export default function BatchPage() {
  const [videoUrls, setVideoUrls] = useState('')
  const [selectedParser, setSelectedParser] = useState<string>('')
  const [selectedWebDAV, setSelectedWebDAV] = useState<string>('')
  const [parsers, setParsers] = useState<VideoParserConfig[]>([])
  const [webdavServers, setWebdavServers] = useState<WebDAVConfig[]>([])
  const [currentBatch, setCurrentBatch] = useState<BatchTask | null>(null)
  const [overallProgress, setOverallProgress] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isPaused, setIsPaused] = useState(false)

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

  const handleStartBatch = async () => {
    if (!videoUrls.trim()) {
      alert('请输入视频链接')
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

    // 解析URL列表
    const urls = ConversionService.parseVideoUrls(videoUrls.trim())
    if (urls.length === 0) {
      alert('没有找到有效的视频链接')
      return
    }

    setIsProcessing(true)
    setIsPaused(false)
    setOverallProgress(0)

    // 创建批量任务
    const batchTask: BatchTask = {
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
      createdAt: new Date()
    }

    setCurrentBatch(batchTask)

    try {
      // 执行批量转存
      const updatedBatch = await ConversionService.convertBatch(
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
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">批量转存</h1>
        <p className="text-muted-foreground">
          一次性处理多个视频链接，自动队列管理，支持进度跟踪
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 输入表单 */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <List className="w-5 h-5" />
                <span>批量输入</span>
              </CardTitle>
              <CardDescription>
                每行输入一个视频链接
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">
                  视频链接列表 {urlCount > 0 && <span className="text-muted-foreground">({urlCount} 个链接)</span>}
                </label>
                <Textarea
                  placeholder={`请输入视频链接，每行一个，例如：
https://example.com/video1
https://example.com/video2
https://example.com/video3`}
                  value={videoUrls}
                  onChange={(e) => setVideoUrls(e.target.value)}
                  className="min-h-[150px] font-mono text-sm"
                  disabled={isProcessing}
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">解析API</label>
                <Select value={selectedParser} onValueChange={setSelectedParser} disabled={isProcessing}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择解析API" />
                  </SelectTrigger>
                  <SelectContent>
                    {parsers.map((parser) => (
                      <SelectItem key={parser.id} value={parser.id}>
                        <div className="flex items-center justify-between w-full">
                          <span>{parser.name}</span>
                          {parser.isDefault && (
                            <Badge key={`batch-parser-badge-${parser.id}`} variant="secondary" className="ml-2">默认</Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">WebDAV服务器</label>
                <Select value={selectedWebDAV} onValueChange={setSelectedWebDAV} disabled={isProcessing}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择WebDAV服务器" />
                  </SelectTrigger>
                  <SelectContent>
                    {webdavServers.map((server) => (
                      <SelectItem key={server.id} value={server.id}>
                        <div className="flex items-center justify-between w-full">
                          <span>{server.name}</span>
                          {server.isDefault && (
                            <Badge key={`batch-server-badge-${server.id}`} variant="secondary" className="ml-2">默认</Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex space-x-2">
                {!isProcessing ? (
                  <Button 
                    onClick={handleStartBatch} 
                    disabled={urlCount === 0 || !selectedParser || !selectedWebDAV}
                    className="flex-1"
                  >
                    <Play className="w-4 h-4 mr-2" />
                    开始批量转存
                  </Button>
                ) : (
                  <Button 
                    variant="outline"
                    onClick={() => setIsPaused(!isPaused)}
                    className="flex-1"
                    disabled
                  >
                    {isPaused ? (
                      <>
                        <Play className="w-4 h-4 mr-2" />
                        继续
                      </>
                    ) : (
                      <>
                        <Pause className="w-4 h-4 mr-2" />
                        暂停
                      </>
                    )}
                  </Button>
                )}
                
                {currentBatch && (
                  <Button variant="outline" onClick={resetBatch}>
                    <Square className="w-4 h-4 mr-2" />
                    重置
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 批量任务状态 */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>批量任务状态</CardTitle>
              <CardDescription>
                实时显示批量转存进度和每个任务的状态
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!currentBatch ? (
                <div className="text-center text-muted-foreground py-8">
                  <List className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>输入视频链接并点击"开始批量转存"</p>
                </div>
              ) : (
                <div className="space-y-6">
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
                    <div className="max-h-96 overflow-y-auto space-y-2">
                      {currentBatch.tasks.map((task, index) => (
                        <div 
                          key={task.id}
                          className="flex items-center space-x-3 p-3 border rounded-lg bg-card"
                        >
                          <div className="flex-shrink-0">
                            {getStatusIcon(task.status)}
                          </div>
                          
                          <div className="flex-grow min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium">
                                任务 {index + 1}
                              </span>
                              <Badge 
                                key={`batch-task-badge-${task.id}`}
                                className={`text-xs ${getStatusBadgeColor(task.status)}`}
                                variant="outline"
                              >
                                {getStatusText(task.status)}
                              </Badge>
                            </div>
                            
                            <p className="text-xs text-muted-foreground truncate">
                              {task.videoUrl}
                            </p>
                            
                            {task.videoTitle && (
                              <p className="text-xs text-foreground truncate mt-1">
                                {task.videoTitle}
                              </p>
                            )}
                            
                            {task.error && (
                              <p className="text-xs text-red-600 mt-1">
                                错误: {task.error}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 批量任务信息 */}
                  <div className="text-xs text-muted-foreground pt-4 border-t space-y-1">
                    <p>任务名称: {currentBatch.name}</p>
                    <p>创建时间: {currentBatch.createdAt.toLocaleString()}</p>
                    {currentBatch.completedAt && (
                      <p>完成时间: {currentBatch.completedAt.toLocaleString()}</p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
