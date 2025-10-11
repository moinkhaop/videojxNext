'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  Puzzle,
  Plus,
  Trash2,
  Edit,
  Eye,
  EyeOff,
  CheckCircle,
  Save,
  X,
  ArrowLeft,
  Settings,
  TestTube
} from 'lucide-react'
import { VideoParserConfig } from '@/types'
import { ConfigManager } from '@/lib/storage'

export default function ParsersConfigPage() {
  const [configs, setConfigs] = useState<VideoParserConfig[]>([])
  const [editingConfig, setEditingConfig] = useState<VideoParserConfig | null>(null)
  const [isNewConfig, setIsNewConfig] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({})
  const [formData, setFormData] = useState({
    name: '',
    apiUrl: '',
    apiKey: '',
    requestMethod: 'POST' as 'GET' | 'POST',
    urlParamName: 'url',
    customHeaders: '{}',
    customBodyParams: '{}',
    customQueryParams: '{}'
  })

  useEffect(() => {
    loadConfigs()
  }, [])

  const loadConfigs = () => {
    const parsers = ConfigManager.getParsers()
    setConfigs(parsers)
  }

  const handleNewConfig = () => {
    setFormData({
      name: '',
      apiUrl: '',
      apiKey: '',
      requestMethod: 'POST' as 'GET' | 'POST',
      urlParamName: 'url',
      customHeaders: '{}',
      customBodyParams: '{}',
      customQueryParams: '{}'
    })
    setEditingConfig(null)
    setIsNewConfig(true)
  }

  const handleAddTestParser = () => {
    const testConfig: VideoParserConfig = {
      id: crypto.randomUUID(),
      name: "测试模式解析器",
      apiUrl: "/api/proxy/parser?test=true",
      apiKey: "",
      requestMethod: 'POST',
      urlParamName: 'url',
      isDefault: configs.length === 0
    }

    ConfigManager.addParser(testConfig)
    loadConfigs()

    alert("已添加测试模式解析器！此解析器仅用于功能测试，不会真正解析视频。")
  }

  const handleEditConfig = (config: VideoParserConfig) => {
    setFormData({
      name: config.name,
      apiUrl: config.apiUrl,
      apiKey: config.apiKey || '',
      requestMethod: config.requestMethod || 'POST',
      urlParamName: config.urlParamName || 'url',
      customHeaders: JSON.stringify(config.customHeaders || {}, null, 2),
      customBodyParams: JSON.stringify(config.customBodyParams || {}, null, 2),
      customQueryParams: JSON.stringify(config.customQueryParams || {}, null, 2)
    })
    setEditingConfig(config)
    setIsNewConfig(false)
  }

  const handleSaveConfig = () => {
    if (!formData.name.trim() || !formData.apiUrl.trim()) {
      alert('请填写解析器名称和API地址')
      return
    }

    let customHeaders = {}
    let customBodyParams = {}
    let customQueryParams = {}

    try {
      customHeaders = JSON.parse(formData.customHeaders)
    } catch (e) {
      alert('自定义请求头格式错误，请输入有效的JSON格式')
      return
    }

    try {
      customBodyParams = JSON.parse(formData.customBodyParams)
    } catch (e) {
      alert('自定义POST参数格式错误，请输入有效的JSON格式')
      return
    }

    try {
      customQueryParams = JSON.parse(formData.customQueryParams)
    } catch (e) {
      alert('自定义GET参数格式错误，请输入有效的JSON格式')
      return
    }

    const configData: Omit<VideoParserConfig, 'id'> = {
      name: formData.name.trim(),
      apiUrl: formData.apiUrl.trim(),
      apiKey: formData.apiKey.trim() || undefined,
      requestMethod: formData.requestMethod,
      urlParamName: formData.urlParamName.trim() || 'url',
      customHeaders: Object.keys(customHeaders).length > 0 ? customHeaders : undefined,
      customBodyParams: Object.keys(customBodyParams).length > 0 ? customBodyParams : undefined,
      customQueryParams: Object.keys(customQueryParams).length > 0 ? customQueryParams : undefined,
      isDefault: configs.length === 0
    }

    if (isNewConfig) {
      const newId = `parser_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      ConfigManager.addParser({ ...configData, id: newId })
    } else if (editingConfig) {
      ConfigManager.updateParser(editingConfig.id, configData)
    }

    loadConfigs()
    handleCancelEdit()
  }

  const handleCancelEdit = () => {
    setEditingConfig(null)
    setIsNewConfig(false)
    setFormData({
      name: '',
      apiUrl: '',
      apiKey: '',
      requestMethod: 'POST' as 'GET' | 'POST',
      urlParamName: 'url',
      customHeaders: '{}',
      customBodyParams: '{}',
      customQueryParams: '{}'
    })
  }

  const handleDeleteConfig = (id: string) => {
    if (confirm('确定要删除这个解析器配置吗？')) {
      ConfigManager.deleteParser(id)
      loadConfigs()
    }
  }

  const handleSetDefault = (id: string) => {
    ConfigManager.updateParser(id, { isDefault: true })
    loadConfigs()
  }

  const handleTestParser = async (config: VideoParserConfig) => {
    setTestingId(config.id)
    try {
      const testUrl = 'https://www.bilibili.com/video/BV1xx411c7mu'

      const response = await fetch('/api/proxy/parser', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          videoUrl: testUrl,
          parserConfig: config
        })
      })

      const result = await response.json()

      if (result.success) {
        alert('解析器测试成功！')
      } else {
        alert(`解析器测试失败：${result.error || '未知错误'}`)
      }
    } catch (error) {
      alert(`解析器测试出错：${error}`)
    } finally {
      setTestingId(null)
    }
  }

  const toggleApiKeyVisibility = (id: string) => {
    setShowApiKey(prev => ({
      ...prev,
      [id]: !prev[id]
    }))
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="container mx-auto px-4 py-6 max-w-5xl">
        {/* 顶部导航 */}
        <div className="mb-6">
          <Link href="/settings">
            <Button variant="ghost" size="sm" className="mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              返回设置
            </Button>
          </Link>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl shadow-lg">
                <Puzzle className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-foreground">视频解析 API</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  管理视频解析服务接口配置
                </p>
              </div>
            </div>

            {!isNewConfig && !editingConfig && (
              <div className="flex gap-2">
                <Button onClick={handleAddTestParser} variant="outline">
                  <TestTube className="w-4 h-4 mr-2" />
                  测试解析器
                </Button>
                <Button onClick={handleNewConfig} className="bg-purple-600 hover:bg-purple-700">
                  <Plus className="w-4 h-4 mr-2" />
                  新建配置
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* 新建/编辑配置表单 */}
        {(isNewConfig || editingConfig) && (
          <Card className="mb-6 border-none shadow-lg bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl shadow-md">
                    <Puzzle className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-bold">
                      {isNewConfig ? '新建解析器配置' : '编辑解析器配置'}
                    </CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      填写视频解析API信息
                    </CardDescription>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={handleCancelEdit}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">解析器名称 *</label>
                    <Input
                      placeholder="例如：哔哩哔哩解析器"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="h-10"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">API 地址 *</label>
                    <Input
                      placeholder="https://api.example.com/parse"
                      value={formData.apiUrl}
                      onChange={(e) => setFormData({ ...formData, apiUrl: e.target.value })}
                      className="h-10"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">请求方法</label>
                    <Select value={formData.requestMethod} onValueChange={(value: 'GET' | 'POST') => setFormData({ ...formData, requestMethod: value })}>
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="选择请求方法" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="POST">POST</SelectItem>
                        <SelectItem value="GET">GET</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">URL参数名称</label>
                    <Input
                      placeholder="url"
                      value={formData.urlParamName}
                      onChange={(e) => setFormData({ ...formData, urlParamName: e.target.value })}
                      className="h-10"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">API 密钥（可选）</label>
                  <div className="relative">
                    <Input
                      type={showApiKey.new ? 'text' : 'password'}
                      placeholder="API密钥，如不需要请留空"
                      value={formData.apiKey}
                      onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                      className="h-10 pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute inset-y-0 right-0 px-3 h-10"
                      onClick={() => toggleApiKeyVisibility('new')}
                    >
                      {showApiKey.new ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">自定义请求头（JSON）</label>
                  <Textarea
                    placeholder='{"accept": "application/json"}'
                    value={formData.customHeaders}
                    onChange={(e) => setFormData({ ...formData, customHeaders: e.target.value })}
                    className="min-h-[80px] font-mono text-sm"
                  />
                </div>

                {formData.requestMethod === 'POST' && (
                  <div>
                    <label className="block text-sm font-medium mb-2">自定义POST参数（JSON）</label>
                    <Textarea
                      placeholder='{"platform": "douyin"}'
                      value={formData.customBodyParams}
                      onChange={(e) => setFormData({ ...formData, customBodyParams: e.target.value })}
                      className="min-h-[80px] font-mono text-sm"
                    />
                  </div>
                )}

                {formData.requestMethod === 'GET' && (
                  <div>
                    <label className="block text-sm font-medium mb-2">自定义GET参数（JSON）</label>
                    <Textarea
                      placeholder='{"platform": "douyin"}'
                      value={formData.customQueryParams}
                      onChange={(e) => setFormData({ ...formData, customQueryParams: e.target.value })}
                      className="min-h-[80px] font-mono text-sm"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <Button onClick={handleSaveConfig} className="bg-purple-600 hover:bg-purple-700">
                  <Save className="w-4 h-4 mr-2" />
                  保存配置
                </Button>
                <Button variant="outline" onClick={handleCancelEdit}>
                  取消
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 配置列表 */}
        <Card className="mb-6 border-none shadow-lg bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl font-bold">已配置的解析器</CardTitle>
            <CardDescription className="text-xs mt-0.5">
              {configs.length} 个配置
            </CardDescription>
          </CardHeader>
          <CardContent>
            {configs.length === 0 ? (
              <div className="text-center py-12 px-4">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-purple-100 dark:bg-purple-900/30 mb-3">
                  <Puzzle className="w-8 h-8 text-purple-600 dark:text-purple-400" />
                </div>
                <p className="text-sm font-medium text-foreground mb-1">还没有解析器配置</p>
                <p className="text-xs text-muted-foreground">点击右上角按钮添加您的第一个视频解析API</p>
              </div>
            ) : (
              <div className="space-y-2">
                {configs.map((config) => (
                  <div
                    key={config.id}
                    className="group flex items-center justify-between p-4 rounded-lg border border-border hover:border-purple-300 dark:hover:border-purple-700 hover:bg-purple-50/50 dark:hover:bg-purple-950/20 transition-all"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-2 h-2 rounded-full bg-purple-500 flex-shrink-0"></div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold text-sm truncate">{config.name}</h4>
                          {config.isDefault && (
                            <Badge className="h-5 px-1.5 text-xs bg-purple-500 hover:bg-purple-500">
                              默认
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                          <p className="truncate">{config.apiUrl}</p>
                          <p>API密钥: {config.apiKey ? '已配置' : '未设置'}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-3">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleTestParser(config)}
                        disabled={testingId === config.id}
                        className="h-8 w-8 p-0"
                        title="测试解析"
                      >
                        {testingId === config.id ? (
                          <Settings className="w-4 h-4 animate-spin" />
                        ) : (
                          <TestTube className="w-4 h-4" />
                        )}
                      </Button>
                      {!config.isDefault && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleSetDefault(config.id)}
                          className="h-8 px-2 text-xs"
                          title="设为默认"
                        >
                          设为默认
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleEditConfig(config)}
                        disabled={isNewConfig || editingConfig?.id === config.id}
                        className="h-8 w-8 p-0"
                        title="编辑"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteConfig(config.id)}
                        className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                        disabled={isNewConfig || editingConfig?.id === config.id}
                        title="删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 使用说明 */}
        <Card className="border-none shadow-lg bg-gradient-to-br from-purple-500/10 via-pink-500/10 to-rose-500/10 dark:from-purple-500/20 dark:via-pink-500/20 dark:to-rose-500/20 backdrop-blur-sm">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 p-2.5 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl shadow-md">
                <CheckCircle className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold mb-3 text-foreground">配置说明</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-muted-foreground">
                  <div className="flex items-start gap-2">
                    <span className="text-purple-500 mt-0.5">•</span>
                    <span><strong>API地址：</strong>解析服务的完整API地址</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-pink-500 mt-0.5">•</span>
                    <span><strong>API密钥：</strong>如果服务需要认证请填写</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-rose-500 mt-0.5">•</span>
                    <span><strong>请求方法：</strong>GET或POST根据API要求</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-fuchsia-500 mt-0.5">•</span>
                    <span><strong>默认配置：</strong>解析时优先使用</span>
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
