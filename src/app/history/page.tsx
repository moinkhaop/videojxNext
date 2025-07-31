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
  RefreshCw,
  ArrowRight,
  ExternalLink,
  Copy,
  FileText,
  User,
  Play,
  Eye
} from 'lucide-react'
import { HistoryRecord, TaskStatus, ConversionTask, BatchTask } from '@/types'
import { HistoryManager } from '@/lib/storage'
import { ConversionService } from '@/lib/conversion'
import { useRouter } from 'next/navigation'

export default function HistoryPage() {
  const router = useRouter()
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

  // {{ AURA: Add - 点击历史记录自动填充到单链接转存页面 }}
  const handleAutoFillFromHistory = (record: HistoryRecord) => {
    if (record.type === 'single') {
      const task = record.task as ConversionTask
      const encodedUrl = encodeURIComponent(task.videoUrl)
      router.push(`/convert?url=${encodedUrl}`)
    }
  }

  // {{ AURA: Add - 复制链接到剪贴板 }}
  const handleCopyUrl = async (url: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(url)
      alert('链接已复制到剪贴板')
    } catch (err) {
      console.error('复制失败:', err)
      alert('复制失败，请手动复制')
    }
  }

  // {{ AURA: Add - 在新窗口打开链接 }}
  const handleOpenUrl = (url: string, e: React.MouseEvent) => {
    e.stopPropagation()
    window.open(url, '_blank')
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
      <Card key={record.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => handleAutoFillFromHistory(record)}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-4 flex-grow">
              <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${getTypeBadgeColor('single')}`}>
                <Video className="w-5 h-5 text-blue-800" />
              </div>
              <div className="flex-grow min-w-0">
                <h3 className="font-medium truncate" title={task.videoTitle || '视频转存任务'}>
                  {task.videoTitle || '视频转存任务'}
                </h3>
                <p className="text-xs text-muted-foreground truncate" title={task.videoUrl}>
                  {task.videoUrl}
                </p>
                <div className="flex items-center space-x-2 mt-2">
                  <Badge key={`history-single-status-badge-${record.id}`} className={`text-xs ${getStatusBadgeColor(task.status)}`} variant="outline">
                    <div className="flex items-center space-x-1">
                      {getStatusIcon(task.status)}
                      <span>{formatStatus(task.status)}</span>
                    </div>
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    <Calendar className="w-3 h-3 inline-block mr-1" />
                    {record.createdAt.toLocaleDateString()}
                  </span>
                </div>
              </div>
              <div className="flex-shrink-0 flex items-center space-x-2">
                <Button size="sm" variant="ghost" className="text-blue-600 hover:text-blue-800" title="自动填充到转存页面">
                  <ArrowRight className="w-4 h-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); handleDeleteRecord(record.id); }} className="text-muted-foreground hover:text-red-600">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t space-y-1 text-xs text-muted-foreground">
            {task.uploadResult?.filePath && (
              <p className="text-green-600 break-all">
                <strong className="font-semibold">文件路径:</strong> {decodeURIComponent(task.uploadResult.filePath)}
              </p>
            )}
            {task.error && (
              <p className="text-red-600">
                <strong className="font-semibold">错误:</strong> {task.error}
              </p>
            )}
            {task.completedAt && <p><strong>完成于:</strong> {task.completedAt.toLocaleString()}</p>}
          </div>
        </CardContent>
      </Card>
    )
  }

  const renderBatchTaskRecord = (record: HistoryRecord) => {
    const batch = record.task as BatchTask
    
    return (
      <Card key={record.id} className="hover:shadow-md transition-shadow">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-4">
              <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${getTypeBadgeColor('batch')}`}>
                <List className="w-5 h-5 text-purple-800" />
              </div>
              <div className="flex-grow min-w-0">
                <h3 className="font-medium truncate" title={batch.name}>{batch.name}</h3>
                <p className="text-xs text-muted-foreground">
                  总任务: {batch.totalTasks} | 成功: {batch.tasks.filter(t => t.status === TaskStatus.SUCCESS).length} | 失败: {batch.tasks.filter(t => t.status === TaskStatus.FAILED).length}
                </p>
                <div className="flex items-center space-x-2 mt-2">
                  <Badge key={`history-batch-status-badge-${record.id}`} className={`text-xs ${getStatusBadgeColor(batch.status)}`} variant="outline">
                    <div className="flex items-center space-x-1">
                      {getStatusIcon(batch.status)}
                      <span>{formatStatus(batch.status)}</span>
                    </div>
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    <Calendar className="w-3 h-3 inline-block mr-1" />
                    {record.createdAt.toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => handleDeleteRecord(record.id)} className="text-muted-foreground hover:text-red-600">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
          <div className="mt-3 pt-3 border-t">
            <details>
              <summary className="text-xs font-medium cursor-pointer hover:text-primary">查看任务详情</summary>
              <div className="mt-2 max-h-40 overflow-y-auto space-y-1 pr-2">
                {batch.tasks.map((task, index) => (
                  <div key={task.id} className="text-xs text-muted-foreground flex items-center justify-between p-1.5 bg-muted/50 rounded">
                    <span className="truncate flex-1 mr-2" title={task.videoTitle || task.videoUrl}>
                      {index + 1}. {task.videoTitle || task.videoUrl}
                    </span>
                    {getStatusIcon(task.status)}
                  </div>
                ))}
              </div>
            </details>
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

      {/* {{ AURA: Modify - 重新设计筛选和操作栏 }} */}
      <div className="mb-6 bg-card border rounded-xl shadow-sm">
        <div className="p-5">
          {/* 搜索和筛选区域 */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            {/* 搜索框 */}
            <div className="md:col-span-2 relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-muted-foreground" />
              </div>
              <Input
                placeholder="搜索视频标题或链接..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 py-5 text-base"
              />
            </div>
            
            {/* 类型筛选 */}
            <div>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as any)}
                className="w-full h-10 px-3 py-2 text-sm bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
              >
                <option value="all">所有类型</option>
                <option value="single">单链接</option>
                <option value="batch">批量</option>
              </select>
            </div>
            
            {/* 状态筛选 */}
            <div>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="w-full h-10 px-3 py-2 text-sm bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
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
          
          {/* 结果统计和操作按钮 */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-4 border-t">
            <div className="flex items-center">
              <span className="text-sm text-muted-foreground">
                显示 <span className="font-medium text-foreground">{filteredRecords.length}</span> / <span className="font-medium text-foreground">{records.length}</span> 条记录
              </span>
              {searchTerm && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-2 h-6 px-2 text-xs"
                  onClick={() => setSearchTerm('')}
                >
                  清除搜索
                </Button>
              )}
            </div>
            
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={loadHistory}
                className="flex items-center"
              >
                <RefreshCw className="w-4 h-4 mr-1" />
                刷新
              </Button>
              {records.length > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleClearHistory}
                  className="flex items-center"
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  清空记录
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

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
