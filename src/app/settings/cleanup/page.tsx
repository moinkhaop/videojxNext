'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Trash2,
  History,
  Calendar,
  FileText,
  Settings,
  CheckCircle,
  XCircle
} from 'lucide-react'
import { CleanupService } from '@/lib/cleanup'
import { CleanupConfig } from '@/types'

export default function CleanupSettingsPage() {
  const [config, setConfig] = useState<CleanupConfig>({
    enabled: true,
    retainDays: 7,
    retainSuccessfulTasks: true,
    retainFailedTasks: false,
    retainExtensions: ['.mp4', '.mov', '.avi', '.mkv', '.jpg', '.png', '.webp'],
    cleanupSchedule: '0 2 * * *'
  })
  
  const [logs, setLogs] = useState<any[]>([])
  const [newExtension, setNewExtension] = useState('')

  useEffect(() => {
    // 加载清理配置
    const cleanupConfig = CleanupService.getCleanupConfig()
    setConfig(cleanupConfig)
    
    // 加载清理日志
    const cleanupLogs = CleanupService.getCleanupLogs()
    setLogs(cleanupLogs)
  }, [])

  const handleSaveConfig = () => {
    CleanupService.saveCleanupConfig(config)
    alert('清理配置已保存')
  }

  const handleManualCleanup = async () => {
    const result = await CleanupService.manualCleanup()
    alert(result.message)
    
    // 刷新日志
    const updatedLogs = CleanupService.getCleanupLogs()
    setLogs(updatedLogs)
  }

  const handleClearLogs = () => {
    if (confirm('确定要清空所有清理日志吗？')) {
      CleanupService.clearCleanupLogs()
      setLogs([])
    }
  }

  const addExtension = () => {
    if (newExtension && !config.retainExtensions.includes(newExtension)) {
      setConfig({
        ...config,
        retainExtensions: [...config.retainExtensions, newExtension]
      })
      setNewExtension('')
    }
  }

  const removeExtension = (extension: string) => {
    setConfig({
      ...config,
      retainExtensions: config.retainExtensions.filter(ext => ext !== extension)
    })
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">清理设置</h1>
        <p className="text-muted-foreground">
          配置自动清理选项，管理临时文件和缓存数据
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 清理配置 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Settings className="w-5 h-5" />
              <span>清理配置</span>
            </CardTitle>
            <CardDescription>
              配置自动清理规则和保留策略
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">启用自动清理</h3>
                <p className="text-sm text-muted-foreground">
                  自动清理过期的临时文件和缓存数据
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.enabled}
                  onChange={(e) => 
                    setConfig({...config, enabled: e.target.checked})
                  }
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
              </label>
            </div>

            <div>
              <label htmlFor="retainDays" className="block text-sm font-medium mb-1">
                保留天数
              </label>
              <div className="flex items-center space-x-2">
                <Input
                  id="retainDays"
                  type="number"
                  min="0"
                  max="365"
                  value={config.retainDays}
                  onChange={(e) => 
                    setConfig({
                      ...config, 
                      retainDays: parseInt(e.target.value) || 0
                    })
                  }
                  className="w-24"
                />
                <span>天</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                0表示不保留，全部清理
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">保留成功任务</h3>
                  <p className="text-sm text-muted-foreground">
                    保留成功完成的转存任务记录
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.retainSuccessfulTasks}
                    onChange={(e) => 
                      setConfig({...config, retainSuccessfulTasks: e.target.checked})
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">保留失败任务</h3>
                  <p className="text-sm text-muted-foreground">
                    保留失败的转存任务记录
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.retainFailedTasks}
                    onChange={(e) => 
                      setConfig({...config, retainFailedTasks: e.target.checked})
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                保留文件扩展名
              </label>
              <div className="flex items-center space-x-2">
                <Input
                  value={newExtension}
                  onChange={(e) => setNewExtension(e.target.value)}
                  placeholder=".mp4"
                  className="flex-1"
                />
                <Button onClick={addExtension}>添加</Button>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {config.retainExtensions.map((ext) => (
                  <div 
                    key={ext} 
                    className="flex items-center bg-muted rounded-full px-3 py-1 text-sm"
                  >
                    <span>{ext}</span>
                    <button 
                      onClick={() => removeExtension(ext)}
                      className="ml-2 text-muted-foreground hover:text-foreground"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                指定要保留的文件类型
              </p>
            </div>

            <div>
              <label htmlFor="cleanupSchedule" className="block text-sm font-medium mb-1">
                清理时间
              </label>
              <Select 
                value={config.cleanupSchedule}
                onValueChange={(value) => 
                  setConfig({...config, cleanupSchedule: value})
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择清理时间" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0 2 * * *">每天凌晨2点</SelectItem>
                  <SelectItem value="0 3 * * 0">每周日凌晨3点</SelectItem>
                  <SelectItem value="0 4 1 * *">每月1号凌晨4点</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground mt-1">
                自动清理的执行时间（Cron格式）
              </p>
            </div>

            <Button onClick={handleSaveConfig} className="w-full">
              保存配置
            </Button>
          </CardContent>
        </Card>

        {/* 清理日志 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <History className="w-5 h-5" />
                <span>清理日志</span>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleClearLogs}
                className="text-red-600 hover:text-red-700"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                清空日志
              </Button>
            </CardTitle>
            <CardDescription>
              查看历史清理记录和统计信息
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex space-x-2">
                <Button onClick={handleManualCleanup} className="flex-1">
                  <Calendar className="w-4 h-4 mr-2" />
                  立即清理
                </Button>
              </div>

              {logs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>暂无清理记录</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {logs.map((log) => (
                    <div 
                      key={log.id} 
                      className="border rounded-lg p-3 text-sm"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium">
                          {new Date(log.timestamp).toLocaleString()}
                        </span>
                        <span className="text-muted-foreground">
                          {log.filesDeleted} 个文件
                        </span>
                      </div>
                      <p className="text-muted-foreground">
                        {log.details}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 说明信息 */}
      <Alert className="mt-6">
        <Settings className="h-4 w-4" />
        <AlertDescription>
          <p className="font-medium">清理机制说明</p>
          <ul className="list-disc pl-5 mt-2 space-y-1 text-sm">
            <li>自动清理会在指定时间运行，删除过期的临时文件和缓存数据</li>
            <li>根据配置保留指定天数内的任务记录和文件</li>
            <li>可以手动触发立即清理，释放存储空间</li>
            <li>清理日志记录每次清理的详细信息，便于追踪</li>
          </ul>
        </AlertDescription>
      </Alert>
    </div>
  )
}