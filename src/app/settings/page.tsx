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

  // 获取要显示的WebDAV服务器列表（仅显示默认）
  const displayedWebDAVServers = webdavServers.filter(server => server.isDefault)

  // 获取要显示的解析器列表（仅显示默认）
  const displayedParsers = parsers.filter(parser => parser.isDefault)

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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="container mx-auto px-4 py-6 max-w-6xl">
        {/* 顶部标题栏 */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl shadow-lg">
                <Settings className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-foreground">系统设置</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  配置和管理应用程序
                </p>
              </div>
            </div>
          </div>

          {/* 统计卡片 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-blue-500/10 to-blue-600/10 dark:from-blue-500/20 dark:to-blue-600/20 backdrop-blur-sm rounded-xl p-4 border border-blue-200/50 dark:border-blue-800/50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">WebDAV 服务器</p>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{webdavServers.length}</p>
                </div>
                <Server className="w-8 h-8 text-blue-500/30" />
              </div>
            </div>

            <div className="bg-gradient-to-br from-purple-500/10 to-purple-600/10 dark:from-purple-500/20 dark:to-purple-600/20 backdrop-blur-sm rounded-xl p-4 border border-purple-200/50 dark:border-purple-800/50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">解析 API</p>
                  <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{parsers.length}</p>
                </div>
                <Puzzle className="w-8 h-8 text-purple-500/30" />
              </div>
            </div>

            <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/10 dark:from-emerald-500/20 dark:to-emerald-600/20 backdrop-blur-sm rounded-xl p-4 border border-emerald-200/50 dark:border-emerald-800/50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">默认配置</p>
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                    {webdavServers.filter(s => s.isDefault).length + parsers.filter(p => p.isDefault).length}
                  </p>
                </div>
                <CheckCircle className="w-8 h-8 text-emerald-500/30" />
              </div>
            </div>

            <div className="bg-gradient-to-br from-orange-500/10 to-orange-600/10 dark:from-orange-500/20 dark:to-orange-600/20 backdrop-blur-sm rounded-xl p-4 border border-orange-200/50 dark:border-orange-800/50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">总配置</p>
                  <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                    {webdavServers.length + parsers.length}
                  </p>
                </div>
                <Database className="w-8 h-8 text-orange-500/30" />
              </div>
            </div>
          </div>
        </div>

        {/* 主要配置区域 */}
        <div className="space-y-6 mb-6">
          {/* WebDAV服务器配置 */}
          <Card className="border-none shadow-lg bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl shadow-md">
                    <Server className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-bold flex items-center gap-2">
                      WebDAV 服务器
                      <Badge variant="outline" className="font-normal text-xs">
                        默认
                      </Badge>
                    </CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      管理视频文件存储服务器
                    </CardDescription>
                  </div>
                </div>
                <Link href="/settings/webdav">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 h-9"
                  >
                    <Settings className="w-4 h-4" />
                    管理
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {displayedWebDAVServers.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 mb-3">
                    <Server className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                  </div>
                  <p className="text-sm font-medium text-foreground mb-1">
                    {webdavServers.length === 0 ? '还没有配置 WebDAV 服务器' : '还没有设置默认服务器'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {webdavServers.length === 0 ? '点击右上角添加按钮开始配置' : '点击管理按钮查看所有服务器'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {displayedWebDAVServers.map((server) => {
                    const isBuiltin = ConfigManager.isBuiltinWebDAVServer(server.id)
                    return (
                      <div
                        key={server.id}
                        className="group flex items-center justify-between p-3 rounded-lg border border-border hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-all"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0"></div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-semibold text-sm truncate">{server.name}</h4>
                              {server.isDefault && (
                                <Badge className="h-5 px-1.5 text-xs bg-blue-500 hover:bg-blue-500">
                                  默认
                                </Badge>
                              )}
                              {isBuiltin && (
                                <Badge className="h-5 px-1.5 text-xs bg-gray-500 hover:bg-gray-500">
                                  内置
                                </Badge>
                              )}
                            </div>
                            {!isBuiltin && (
                              <p className="text-xs text-muted-foreground truncate">{server.url}</p>
                            )}
                            {/* {isBuiltin && (
                              <p className="text-xs text-muted-foreground truncate">内置默认配置（详细信息已隐藏）</p>
                            )} */}
                          </div>
                        </div>
                      <div className="flex items-center gap-1 ml-3">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleTestWebDAV(server)}
                          disabled={testingWebDAV === server.id}
                          className="h-8 w-8 p-0"
                          title="测试连接"
                        >
                          {testingWebDAV === server.id ? (
                            <Settings className="w-4 h-4 animate-spin" />
                          ) : (
                            <CheckCircle className="w-4 h-4" />
                          )}
                        </Button>
                        {!server.isDefault && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleSetDefaultWebDAV(server.id)}
                            className="h-8 px-2 text-xs"
                            title="设为默认"
                          >
                            设为默认
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteWebDAV(server.id)}
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                          title="删除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 解析API配置 */}
          <Card className="border-none shadow-lg bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl shadow-md">
                    <Puzzle className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-bold flex items-center gap-2">
                      视频解析 API
                      <Badge variant="outline" className="font-normal text-xs">
                        默认
                      </Badge>
                    </CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      管理视频解析服务接口
                    </CardDescription>
                  </div>
                </div>
                <Link href="/settings/parsers">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 h-9"
                  >
                    <Settings className="w-4 h-4" />
                    管理
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {displayedParsers.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-purple-100 dark:bg-purple-900/30 mb-3">
                    <Puzzle className="w-8 h-8 text-purple-600 dark:text-purple-400" />
                  </div>
                  <p className="text-sm font-medium text-foreground mb-1">
                    {parsers.length === 0 ? '还没有配置解析 API' : '还没有设置默认解析器'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {parsers.length === 0 ? '点击右上角添加按钮开始配置' : '点击管理按钮查看所有解析器'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {displayedParsers.map((parser) => {
                    const isBuiltin = ConfigManager.isBuiltinParser(parser.id)
                    return (
                      <div
                        key={parser.id}
                        className="group flex items-center justify-between p-3 rounded-lg border border-border hover:border-purple-300 dark:hover:border-purple-700 hover:bg-purple-50/50 dark:hover:bg-purple-950/20 transition-all"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-2 h-2 rounded-full bg-purple-500 flex-shrink-0"></div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-semibold text-sm truncate">{parser.name}</h4>
                              {parser.isDefault && (
                                <Badge className="h-5 px-1.5 text-xs bg-purple-500 hover:bg-purple-500">
                                  默认
                                </Badge>
                              )}
                              {isBuiltin && (
                                <Badge className="h-5 px-1.5 text-xs bg-gray-500 hover:bg-gray-500">
                                  内置
                                </Badge>
                              )}
                            </div>
                            {!isBuiltin && (
                              <p className="text-xs text-muted-foreground truncate">{parser.apiUrl}</p>
                            )}
                            {/* {isBuiltin && (
                              <p className="text-xs text-muted-foreground truncate">内置默认配置（详细信息已隐藏）</p>
                            )} */}
                          </div>
                        </div>
                      <div className="flex items-center gap-1 ml-3">
                        {!parser.isDefault && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleSetDefaultParser(parser.id)}
                            className="h-8 px-2 text-xs"
                            title="设为默认"
                          >
                            设为默认
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteParser(parser.id)}
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                          title="删除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 数据管理和快捷访问 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          {/* 数据管理 */}
          <Card className="md:col-span-2 border-none shadow-lg bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl shadow-md">
                  <Database className="w-5 h-5 text-white" />
                </div>
                <div>
                  <CardTitle className="text-xl font-bold">数据管理</CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    备份和恢复配置数据
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  onClick={handleExportData}
                  className="group flex items-center gap-4 p-4 rounded-xl border border-border hover:border-emerald-300 dark:hover:border-emerald-700 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 transition-all text-left"
                >
                  <div className="flex-shrink-0 p-3 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg group-hover:scale-110 transition-transform">
                    <Download className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-sm mb-1">导出数据</h4>
                    <p className="text-xs text-muted-foreground">
                      导出所有配置为 JSON
                    </p>
                  </div>
                </button>

                <button
                  onClick={handleImportData}
                  className="group flex items-center gap-4 p-4 rounded-xl border border-border hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-all text-left"
                >
                  <div className="flex-shrink-0 p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg group-hover:scale-110 transition-transform">
                    <Upload className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-sm mb-1">导入数据</h4>
                    <p className="text-xs text-muted-foreground">
                      从 JSON 文件恢复
                    </p>
                  </div>
                </button>
              </div>

              <Alert className="mt-4 border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
                <AlertDescription className="text-xs flex items-start gap-2">
                  <span className="text-amber-600 dark:text-amber-400 mt-0.5">⚠️</span>
                  <span className="text-amber-800 dark:text-amber-200">
                    导入数据会覆盖当前所有配置，请谨慎操作
                  </span>
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          {/* 快捷访问 */}
          <Card className="border-none shadow-lg bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <ExternalLink className="w-4 h-4" />
                快捷访问
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Link href="/history">
                  <button className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:border-emerald-300 dark:hover:border-emerald-700 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 transition-all text-left">
                    <Database className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                    <span className="text-sm font-medium">历史记录</span>
                  </button>
                </Link>

                <Link href="/settings/cleanup">
                  <button className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:border-orange-300 dark:hover:border-orange-700 hover:bg-orange-50/50 dark:hover:bg-orange-950/20 transition-all text-left">
                    <Trash2 className="w-4 h-4 text-orange-600 dark:text-orange-400 flex-shrink-0" />
                    <span className="text-sm font-medium">清理设置</span>
                  </button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 功能更新提示 */}
        <Card className="border-none shadow-lg bg-gradient-to-br from-blue-500/10 via-indigo-500/10 to-purple-500/10 dark:from-blue-500/20 dark:via-indigo-500/20 dark:to-purple-500/20 backdrop-blur-sm">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 p-2.5 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-md">
                <CheckCircle className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold mb-3 text-foreground">最新功能更新</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div className="flex items-start gap-2 text-sm">
                    <span className="text-blue-500 mt-0.5">•</span>
                    <span className="text-muted-foreground">支持直接粘贴完整分享文本，自动提取链接</span>
                  </div>
                  <div className="flex items-start gap-2 text-sm">
                    <span className="text-indigo-500 mt-0.5">•</span>
                    <span className="text-muted-foreground">增强视频解析稳定性，支持更多API适配</span>
                  </div>
                  <div className="flex items-start gap-2 text-sm">
                    <span className="text-purple-500 mt-0.5">•</span>
                    <span className="text-muted-foreground">添加测试模式，解析失败时自动切换</span>
                  </div>
                  <div className="flex items-start gap-2 text-sm">
                    <span className="text-pink-500 mt-0.5">•</span>
                    <span className="text-muted-foreground">优化错误提示，便于快速排查故障</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
