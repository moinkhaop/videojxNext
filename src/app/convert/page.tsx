'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  Play, 
  Download, 
  CheckCircle, 
  XCircle, 
  Loader2, 
  Settings,
  Link as LinkIcon 
} from 'lucide-react'
import { ConversionTask, TaskStatus, VideoParserConfig, WebDAVConfig } from '@/types'
import { ConfigManager, HistoryManager } from '@/lib/storage'
import { ConversionService } from '@/lib/conversion'
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
    // 改进的URL正则表达式，能够更好地匹配各种分享文本中的URL
    const urlRegex = /(https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&=\/=]*))/g
    const matches = input.match(urlRegex)
    return matches && matches.length > 0 ? matches[0].replace(/\/$/, '') : input.trim()
  }
  
  const handleConvert = async () => {
    if (!videoUrl.trim()) {
      alert('请输入视频链接')
      return
    }
    
    // 提取输入文本中的URL
    const extractedUrl = extractVideoLink(videoUrl)

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

    setIsConverting(true)
    setProgress(0)

    // 如果提取出了URL，显示提示
    if (extractedUrl !== videoUrl.trim()) {
      console.log(`[转存] 从分享文本中提取到URL: ${extractedUrl}`)
    }
    
    // 创建转存任务
    const task: ConversionTask = {
      id: ConversionService.generateTaskId(),
      videoUrl: extractedUrl, // 使用提取后的URL
      status: TaskStatus.PENDING,
      createdAt: new Date()
    }

    setCurrentTask(task)

    try {
      // 执行转存
      const updatedTask = await ConversionService.convertSingle(
        task,
        parser,
        webdav,
        (progress, status) => {
          setProgress(progress)
          setCurrentTask(prev => prev ? { ...prev, status } : null)
        }
      )

      setCurrentTask(updatedTask)
      
      // 判断任务是否失败
      if (updatedTask.status === TaskStatus.FAILED) {
        console.error('转存失败:', updatedTask.error)
      } else {
        console.log('转存成功:', updatedTask.uploadResult?.filePath)
      }

      // 无论成功失败都保存到历史记录
      HistoryManager.addRecord({
        id: ConversionService.generateTaskId(),
        type: 'single',
        task: updatedTask,
        createdAt: new Date()
      })

    } catch (error) {
      console.error('转存过程出现异常:', error)
      // 更新当前任务状态为失败
      setCurrentTask(prev => {
        if (!prev) return null
        return {
          ...prev,
          status: TaskStatus.FAILED,
          error: error instanceof Error ? error.message : '转存过程发生未知错误',
          completedAt: new Date()
        }
      })
    } finally {
      setIsConverting(false)
    }
  }

  const resetForm = () => {
    setVideoUrl('')
    setCurrentTask(null)
    setProgress(0)
    setIsConverting(false)
  }

  const getStatusIcon = (status: TaskStatus) => {
    switch (status) {
      case TaskStatus.PENDING:
        return <Loader2 className="w-4 h-4 animate-spin" />
      case TaskStatus.PARSING:
        return <Loader2 className="w-4 h-4 animate-spin" />
      case TaskStatus.UPLOADING:
        return <Download className="w-4 h-4" />
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

  const getStatusColor = (status: TaskStatus) => {
    switch (status) {
      case TaskStatus.SUCCESS:
        return 'bg-green-500'
      case TaskStatus.FAILED:
        return 'bg-red-500'
      case TaskStatus.PARSING:
      case TaskStatus.UPLOADING:
        return 'bg-blue-500'
      default:
        return 'bg-gray-500'
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">单链接转存</h1>
        <p className="text-muted-foreground">
          输入视频分享链接，选择解析API和WebDAV服务器，快速完成视频转存
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 输入表单 */}
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
                          <Badge key={`convert-parser-badge-${parser.id}`} variant="secondary" className="ml-2">默认</Badge>
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
                          <Badge key={`convert-server-badge-${server.id}`} variant="secondary" className="ml-2">默认</Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex space-x-2">
              <Button 
                onClick={handleConvert} 
                disabled={isConverting || !videoUrl.trim() || !selectedParser || !selectedWebDAV}
                className="flex-1"
              >
                {isConverting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    转存中...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    开始转存
                  </>
                )}
              </Button>
              
              {currentTask && (
                <Button variant="outline" onClick={resetForm}>
                  重置
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 任务状态 */}
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
                <Play className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>点击"开始转存"开始处理视频</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* 基本信息 */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">任务状态</span>
                    <Badge key={`convert-task-badge-${currentTask.id}`} className={getStatusColor(currentTask.status)}>
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

                {/* 视频信息 */}
                {currentTask.parsedVideoInfo && (
                  <div className="space-y-2">
                    <h4 className="font-medium">视频信息</h4>
                    <div className="text-sm space-y-1">
                      <p><span className="text-muted-foreground">标题:</span> {currentTask.parsedVideoInfo.title}</p>
                      {currentTask.parsedVideoInfo.duration && (
                        <p><span className="text-muted-foreground">时长:</span> {ConversionService.formatDuration(currentTask.parsedVideoInfo.duration)}</p>
                      )}
                      {currentTask.parsedVideoInfo.fileSize && (
                        <p><span className="text-muted-foreground">大小:</span> {ConversionService.formatFileSize(currentTask.parsedVideoInfo.fileSize)}</p>
                      )}
                      <p><span className="text-muted-foreground">格式:</span> {currentTask.parsedVideoInfo.format}</p>
                    </div>
                  </div>
                )}

                {/* 错误信息 */}
                {currentTask.error && (
                  <Alert className="border-red-200 bg-red-50">
                    <XCircle className="h-4 w-4 text-red-500" />
                    <AlertDescription className="text-red-700 space-y-2">
                      <p><strong>错误信息:</strong> {currentTask.error}</p>
                      {currentTask.error.includes('URL为空') && (
                        <>
                          <p><strong>可能的原因:</strong></p>
                          <ul className="list-disc pl-5">
                            <li>解析API返回的数据格式不兼容</li>
                            <li>视频链接可能无效或已过期</li>
                            <li>解析API可能暂时不可用</li>
                          </ul>
                          <p><strong>建议:</strong> 尝试更换解析API或检查视频链接是否有效</p>
                        </>
                      )}
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

                {/* 任务时间 */}
                <div className="text-xs text-muted-foreground pt-4 border-t">
                  <p>创建时间: {currentTask.createdAt.toLocaleString()}</p>
                  {currentTask.completedAt && (
                    <p>完成时间: {currentTask.completedAt.toLocaleString()}</p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
