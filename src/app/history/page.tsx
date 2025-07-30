'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  History,
  Search,
  Filter,
  Trash2,
  CheckCircle,
  XCircle,
  Clock,
  Video,
  List,
  Download,
  Calendar,
  RefreshCw
} from 'lucide-react'
import { HistoryRecord, TaskStatus, ConversionTask, BatchTask } from '@/types'
import { HistoryManager } from '@/lib/storage'
import { ConversionService } from '@/lib/conversion'

export default function HistoryPage() {
  const [records, setRecords] = useState<HistoryRecord[]>([])
  const [filteredRecords, setFilteredRecords] = useState<HistoryRecord[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'single' | 'batch'>('all')
  const [filterStatus, setFilterStatus] = useState<'all' | TaskStatus>('all')

  useEffect(() => {
    loadHistory()
  }, [])

  useEffect(() => {
    filterRecords()
  }, [records, searchTerm, filterType, filterStatus])

  const loadHistory = () => {
    const history = HistoryManager.getHistory()
    setRecords(history)
  }

  const filterRecords = () => {
    let filtered = records

    // 按类型筛选
    if (filterType !== 'all') {
      filtered = filtered.filter(record => record.type === filterType)
    }

    // 按状态筛选
    if (filterStatus !== 'all') {
      filtered = filtered.filter(record => record.task.status === filterStatus)
    }

    // 搜索筛选
    if (searchTerm.trim()) {
      filtered = HistoryManager.searchHistory(searchTerm.trim())
      // 在搜索结果中应用其他筛选
      if (filterType !== 'all') {
        filtered = filtered.filter(record => record.type === filterType)
      }
      if (filterStatus !== 'all') {
        filtered = filtered.filter(record => record.task.status === filterStatus)
      }
    }

    setFilteredRecords(filtered)
  }

  const handleDeleteRecord = (id: string) => {
    if (confirm('确定要删除这条历史记录吗？')) {
      HistoryManager.deleteRecord(id)
      loadHistory()
    }
  }

  const handleClearHistory = () => {
    if (confirm('确定要清空所有历史记录吗？此操作不可恢复。')) {
      HistoryManager.clearHistory()
      loadHistory()
    }
  }

  const getStatusIcon = (status: TaskStatus) => {
    switch (status) {
      case TaskStatus.SUCCESS:
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case TaskStatus.FAILED:
        return <XCircle className="w-4 h-4 text-red-500" />
      default:
        return <Clock className="w-4 h-4 text-gray-500" />
    }
  }

  const getStatusBadgeColor = (status: TaskStatus) => {
    switch (status) {
      case TaskStatus.SUCCESS:
        return 'bg-green-100 text-green-800 border-green-200'
      case TaskStatus.FAILED:
        return 'bg-red-100 text-red-800 border-red-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getTypeBadgeColor = (type: 'single' | 'batch') => {
    return type === 'single' 
      ? 'bg-blue-100 text-blue-800 border-blue-200'
      : 'bg-purple-100 text-purple-800 border-purple-200'
  }

  const formatStatus = (status: TaskStatus) => {
    switch (status) {
      case TaskStatus.SUCCESS:
        return '成功'
      case TaskStatus.FAILED:
        return '失败'
      case TaskStatus.PENDING:
        return '等待中'
      case TaskStatus.PARSING:
        return '解析中'
      case TaskStatus.UPLOADING:
        return '上传中'
      default:
        return '未知'
    }
  }

  const renderSingleTaskRecord = (record: HistoryRecord) => {
    const task = record.task as ConversionTask
    
    return (
      <Card key={record.id} className="hover:shadow-md transition-shadow">
        <CardContent className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center space-x-3">
              <Video className="w-5 h-5 text-primary" />
              <div>
                <div className="flex items-center space-x-2 mb-1">
                  <Badge key={`history-single-type-badge-${record.id}`} className={getTypeBadgeColor('single')} variant="outline">
                    单链接
                  </Badge>
                  <Badge key={`history-single-status-badge-${record.id}`} className={getStatusBadgeColor(task.status)} variant="outline">
                    <div className="flex items-center space-x-1">
                      {getStatusIcon(task.status)}
                      <span>{formatStatus(task.status)}</span>
                    </div>
                  </Badge>
                </div>
                <h3 className="font-medium">
                  {task.videoTitle || '视频转存任务'}
                </h3>
              </div>
            </div>
            
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleDeleteRecord(record.id)}
              className="text-red-600 hover:text-red-700"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>

          <div className="space-y-2 text-sm text-muted-foreground">
            <p className="truncate">
              <span className="font-medium">链接:</span> {task.videoUrl}
            </p>
            
            {task.parsedVideoInfo && (
              <>
                {task.parsedVideoInfo.duration && (
                  <p>
                    <span className="font-medium">时长:</span> {ConversionService.formatDuration(task.parsedVideoInfo.duration)}
                  </p>
                )}
                {task.parsedVideoInfo.fileSize && (
                  <p>
                    <span className="font-medium">大小:</span> {ConversionService.formatFileSize(task.parsedVideoInfo.fileSize)}
                  </p>
                )}
              </>
            )}
            
            <p>
              <span className="font-medium">创建时间:</span> {record.createdAt.toLocaleString()}
            </p>
            
            {task.completedAt && (
              <p>
                <span className="font-medium">完成时间:</span> {task.completedAt.toLocaleString()}
              </p>
            )}
            
            {task.error && (
              <p className="text-red-600">
                <span className="font-medium">错误:</span> {task.error}
              </p>
            )}
            
            {task.uploadResult?.filePath && (
              <p className="text-green-600">
                <span className="font-medium">文件路径:</span> {task.uploadResult.filePath}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  const renderBatchTaskRecord = (record: HistoryRecord) => {
    const batch = record.task as BatchTask
    
    return (
      <Card key={record.id} className="hover:shadow-md transition-shadow">
        <CardContent className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center space-x-3">
              <List className="w-5 h-5 text-primary" />
              <div>
                <div className="flex items-center space-x-2 mb-1">
                  <Badge key={`history-batch-type-badge-${record.id}`} className={getTypeBadgeColor('batch')} variant="outline">
                    批量任务
                  </Badge>
                  <Badge key={`history-batch-status-badge-${record.id}`} className={getStatusBadgeColor(batch.status)} variant="outline">
                    <div className="flex items-center space-x-1">
                      {getStatusIcon(batch.status)}
                      <span>{formatStatus(batch.status)}</span>
                    </div>
                  </Badge>
                </div>
                <h3 className="font-medium">{batch.name}</h3>
              </div>
            </div>
            
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleDeleteRecord(record.id)}
              className="text-red-600 hover:text-red-700"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>

          <div className="space-y-2 text-sm text-muted-foreground mb-4">
            <div className="flex items-center justify-between">
              <span>总任务数: {batch.totalTasks}</span>
              <span>已完成: {batch.completedTasks}</span>
            </div>
            
            <div className="flex items-center justify-between">
              <span>成功: {batch.tasks.filter(t => t.status === TaskStatus.SUCCESS).length}</span>
              <span>失败: {batch.tasks.filter(t => t.status === TaskStatus.FAILED).length}</span>
            </div>
            
            <p>
              <span className="font-medium">创建时间:</span> {record.createdAt.toLocaleString()}
            </p>
            
            {batch.completedAt && (
              <p>
                <span className="font-medium">完成时间:</span> {batch.completedAt.toLocaleString()}
              </p>
            )}
          </div>

          {/* 任务预览 */}
          <div className="space-y-1">
            <h4 className="text-sm font-medium">任务详情:</h4>
            <div className="max-h-32 overflow-y-auto space-y-1">
              {batch.tasks.slice(0, 5).map((task, index) => (
                <div key={task.id} className="text-xs text-muted-foreground flex items-center justify-between p-2 bg-muted/30 rounded">
                  <span className="truncate flex-1 mr-2">
                    {index + 1}. {task.videoTitle || task.videoUrl}
                  </span>
                  {getStatusIcon(task.status)}
                </div>
              ))}
              {batch.tasks.length > 5 && (
                <p className="text-xs text-muted-foreground text-center">
                  还有 {batch.tasks.length - 5} 个任务...
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">历史记录</h1>
        <p className="text-muted-foreground">
          查看和管理所有转存任务的历史记录
        </p>
      </div>

      {/* 搜索和筛选 */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Filter className="w-5 h-5" />
            <span>搜索与筛选</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="搜索视频标题或链接..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as any)}
                className="w-full h-10 px-3 py-2 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <option value="all">所有类型</option>
                <option value="single">单链接转存</option>
                <option value="batch">批量转存</option>
              </select>
            </div>

            <div>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="w-full h-10 px-3 py-2 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <option value="all">所有状态</option>
                <option value={TaskStatus.SUCCESS}>成功</option>
                <option value={TaskStatus.FAILED}>失败</option>
                <option value={TaskStatus.PENDING}>等待中</option>
                <option value={TaskStatus.PARSING}>解析中</option>
                <option value={TaskStatus.UPLOADING}>上传中</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between mt-4">
            <div className="text-sm text-muted-foreground">
              显示 {filteredRecords.length} 条记录，共 {records.length} 条
            </div>
            
            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm" onClick={loadHistory}>
                <RefreshCw className="w-4 h-4 mr-2" />
                刷新
              </Button>
              
              {records.length > 0 && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleClearHistory}
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  清空历史
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 历史记录列表 */}
      {filteredRecords.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">
              <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium mb-2">
                {records.length === 0 ? '还没有历史记录' : '没有符合条件的记录'}
              </h3>
              <p>
                {records.length === 0 
                  ? '开始使用转存功能后，历史记录会显示在这里'
                  : '尝试调整搜索条件或筛选选项'
                }
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredRecords.map((record) => 
            <div key={record.id}>
              {record.type === 'single' 
                ? renderSingleTaskRecord(record)
                : renderBatchTaskRecord(record)
              }
            </div>
          )}
        </div>
      )}
    </div>
  )
}
