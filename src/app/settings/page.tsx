'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  Settings,
  Server,
  Puzzle,
  Database,
  Download,
  Upload,
  Trash2,
  Plus,
  CheckCircle,
  XCircle,
  ExternalLink
} from 'lucide-react'
import { VideoParserConfig, WebDAVConfig } from '@/types'
import { ConfigManager, DataManager } from '@/lib/storage'
import { ConversionService } from '@/lib/conversion'

export default function SettingsPage() {
  const [parsers, setParsers] = useState<VideoParserConfig[]>([])
  const [webdavServers, setWebdavServers] = useState<WebDAVConfig[]>([])
  const [testingWebDAV, setTestingWebDAV] = useState<string | null>(null)

  useEffect(() => {
    loadConfigs()
  }, [])

  const loadConfigs = () => {
    setParsers(ConfigManager.getParsers())
    setWebdavServers(ConfigManager.getWebDAVServers())
  }

  const handleTestWebDAV = async (server: WebDAVConfig) => {
    setTestingWebDAV(server.id)
    try {
      const result = await ConversionService.testWebDAVConnection(server)
      if (result.success) {
        alert('WebDAV连接测试成功！')
      } else {
        alert(`WebDAV连接测试失败：${result.message}`)
      }
    } catch (error) {
      alert('WebDAV连接测试失败：网络错误')
    } finally {
      setTestingWebDAV(null)
    }
  }

  const handleSetDefaultParser = (id: string) => {
    ConfigManager.updateParser(id, { isDefault: true })
    loadConfigs()
  }

  const handleSetDefaultWebDAV = (id: string) => {
    ConfigManager.updateWebDAVServer(id, { isDefault: true })
    loadConfigs()
  }

  const handleDeleteParser = (id: string) => {
    if (confirm('确定要删除这个解析器配置吗？')) {
      ConfigManager.deleteParser(id)
      loadConfigs()
    }
  }

  const handleDeleteWebDAV = (id: string) => {
    if (confirm('确定要删除这个WebDAV服务器配置吗？')) {
      ConfigManager.deleteWebDAVServer(id)
      loadConfigs()
    }
  }

  const handleExportData = () => {
    try {
      DataManager.downloadData()
    } catch (error) {
      alert('导出数据失败')
    }
  }

  const handleImportData = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) {
        const reader = new FileReader()
        reader.onload = (e) => {
          try {
            const jsonData = e.target?.result as string
            const result = DataManager.importData(jsonData)
            if (result.success) {
              alert('数据导入成功！')
              loadConfigs()
            } else {
              alert(`数据导入失败：${result.message}`)
            }
          } catch (error) {
            alert('数据导入失败：文件格式错误')
          }
        }
        reader.readAsText(file)
      }
    }
    input.click()
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">设置与配置</h1>
        <p className="text-muted-foreground">
          管理应用配置、WebDAV服务器和视频解析API设置
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* WebDAV服务器配置 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Server className="w-5 h-5" />
              <span>WebDAV服务器</span>
            </CardTitle>
            <CardDescription>
              配置用于存储转存视频的WebDAV服务器
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {webdavServers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Server className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>还没有配置WebDAV服务器</p>
                </div>
              ) : (
                webdavServers.map((server) => (
                  <div key={server.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <h4 className="font-medium">{server.name}</h4>
                        {server.isDefault && (
                          <Badge key={`settings-server-badge-${server.id}`} variant="secondary">默认</Badge>
                        )}
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleTestWebDAV(server)}
                          disabled={testingWebDAV === server.id}
                        >
                          {testingWebDAV === server.id ? (
                            <>
                              <Settings className="w-3 h-3 mr-1 animate-spin" />
                              测试中
                            </>
                          ) : (
                            <>
                              <CheckCircle className="w-3 h-3 mr-1" />
                              测试连接
                            </>
                          )}
                        </Button>
                        {!server.isDefault && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleSetDefaultWebDAV(server.id)}
                          >
                            设为默认
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteWebDAV(server.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <p>服务器: {server.url}</p>
                      <p>用户名: {server.username}</p>
                    </div>
                  </div>
                ))
              )}
              
              <Link href="/settings/webdav">
                <Button variant="outline" className="w-full">
                  <Plus className="w-4 h-4 mr-2" />
                  添加WebDAV服务器
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* 解析API配置 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Puzzle className="w-5 h-5" />
              <span>视频解析API</span>
            </CardTitle>
            <CardDescription>
              配置第三方视频解析API服务
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {parsers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Puzzle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>还没有配置解析API</p>
                </div>
              ) : (
                parsers.map((parser) => (
                  <div key={parser.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <h4 className="font-medium">{parser.name}</h4>
                        {parser.isDefault && (
                          <Badge key={`settings-parser-badge-${parser.id}`} variant="secondary">默认</Badge>
                        )}
                      </div>
                      <div className="flex items-center space-x-2">
                        {!parser.isDefault && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleSetDefaultParser(parser.id)}
                          >
                            设为默认
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteParser(parser.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <p>API地址: {parser.apiUrl}</p>
                      <p>API密钥: {parser.apiKey ? '已配置' : '未配置'}</p>
                    </div>
                  </div>
                ))
              )}
              
              <Link href="/settings/parsers">
                <Button variant="outline" className="w-full">
                  <Plus className="w-4 h-4 mr-2" />
                  添加解析API
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 数据管理 */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Database className="w-5 h-5" />
            <span>数据管理</span>
          </CardTitle>
          <CardDescription>
            备份和恢复应用配置和历史数据
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h4 className="font-medium">导出数据</h4>
              <p className="text-sm text-muted-foreground mb-3">
                导出所有配置和历史记录到JSON文件
              </p>
              <Button onClick={handleExportData} variant="outline" className="w-full">
                <Download className="w-4 h-4 mr-2" />
                导出数据
              </Button>
            </div>
            
            <div className="space-y-2">
              <h4 className="font-medium">导入数据</h4>
              <p className="text-sm text-muted-foreground mb-3">
                从JSON文件恢复配置和历史记录
              </p>
              <Button onClick={handleImportData} variant="outline" className="w-full">
                <Upload className="w-4 h-4 mr-2" />
                导入数据
              </Button>
            </div>
          </div>
          
          <Alert className="mt-4">
            <Database className="h-4 w-4" />
            <AlertDescription>
              建议定期备份数据。导入数据会覆盖当前的所有配置和历史记录。
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* 快捷链接 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href="/settings/webdav" key="shortcut-webdav">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <Server className="w-8 h-8 text-primary" />
                <div>
                  <h3 className="font-medium">WebDAV配置</h3>
                  <p className="text-sm text-muted-foreground">管理WebDAV服务器</p>
                </div>
                <ExternalLink className="w-4 h-4 ml-auto text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/settings/parsers" key="shortcut-parsers">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <Puzzle className="w-8 h-8 text-primary" />
                <div>
                  <h3 className="font-medium">解析API配置</h3>
                  <p className="text-sm text-muted-foreground">管理解析API服务</p>
                </div>
                <ExternalLink className="w-4 h-4 ml-auto text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/history" key="shortcut-history">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <Database className="w-8 h-8 text-primary" />
                <div>
                  <h3 className="font-medium">历史记录</h3>
                  <p className="text-sm text-muted-foreground">查看转存历史</p>
                </div>
                <ExternalLink className="w-4 h-4 ml-auto text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/settings/cleanup" key="shortcut-cleanup">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <Trash2 className="w-8 h-8 text-primary" />
                <div>
                  <h3 className="font-medium">清理设置</h3>
                  <p className="text-sm text-muted-foreground">配置自动清理选项</p>
                </div>
                <ExternalLink className="w-4 h-4 ml-auto text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
      
      {/* 最新功能提示 */}
      <Alert className="mb-6 bg-blue-50 border-blue-200">
        <CheckCircle className="h-4 w-4 text-blue-500" />
        <AlertDescription className="text-blue-700">
          <p className="font-medium">新功能更新</p>
          <ul className="list-disc pl-5 mt-2 space-y-1 text-sm">
            <li>现在支持直接粘贴抖音等平台的完整分享文本，系统会自动提取视频链接</li>
            <li>增强了视频解析的稳定性，增加了更多API适配和错误处理</li>
            <li>添加了测试模式解析器，当常规解析失败时可自动切换到测试模式</li>
            <li>优化了错误提示信息，使故障排查更加方便</li>
          </ul>
        </AlertDescription>
      </Alert>
    </div>
  )
}
