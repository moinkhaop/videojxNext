'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  Code,
  Plus,
  Trash2,
  Edit,
  Eye,
  EyeOff,
  CheckCircle,
  XCircle,
  Zap,
  Save,
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
    // 添加一个测试用的解析器配置
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

    // {{ AURA: Modify - 解析JSON字符串并添加新的自定义参数支持 }}
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
      isDefault: configs.length === 0 // 第一个配置自动设为默认
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
      // 使用一个测试视频链接
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

  const getStatusColor = (isDefault?: boolean) => {
    return isDefault ? 'text-green-600' : 'text-gray-400'
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">解析器配置</h1>
        <p className="text-muted-foreground">
          管理您的视频解析API配置，用于解析各种平台的视频链接
        </p>
      </div>

      {/* 新建/编辑配置表单 */}
      {(isNewConfig || editingConfig) && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Code className="w-5 h-5" />
              <span>{isNewConfig ? '新建解析器配置' : '编辑解析器配置'}</span>
            </CardTitle>
            <CardDescription>
              填写您的视频解析API信息
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium mb-2">解析器名称</label>
                <Input
                  placeholder="例如：哔哩哔哩解析器"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">API 地址</label>
                <Input
                  placeholder="https://api.example.com/parse"
                  value={formData.apiUrl}
                  onChange={(e) => setFormData({ ...formData, apiUrl: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">请求方法</label>
                <Select value={formData.requestMethod} onValueChange={(value: 'GET' | 'POST') => setFormData({ ...formData, requestMethod: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择请求方法" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="POST">POST</SelectItem>
                    <SelectItem value="GET">GET</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">URL参数名称（GET请求时使用）</label>
                <Input
                  placeholder="url"
                  value={formData.urlParamName}
                  onChange={(e) => setFormData({ ...formData, urlParamName: e.target.value })}
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-2">API 密钥（可选）</label>
                <div className="relative">
                  <Input
                    type={showApiKey.new ? 'text' : 'password'}
                    placeholder="API密钥，如不需要请留空"
                    value={formData.apiKey}
                    onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute inset-y-0 right-0 px-3"
                    onClick={() => toggleApiKeyVisibility('new')}
                  >
                    {showApiKey.new ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-2">自定义请求头（JSON格式）</label>
                <Textarea
                  placeholder='{"accept": "application/json", "x-requested-with": "XMLHttpRequest"}'
                  value={formData.customHeaders}
                  onChange={(e) => setFormData({ ...formData, customHeaders: e.target.value })}
                  className="min-h-[80px] font-mono text-sm"
                />
              </div>

              {formData.requestMethod === 'POST' && (
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-2">自定义POST参数（JSON格式）</label>
                  <Textarea
                    placeholder='{"platform": "douyin", "params": "value"}'
                    value={formData.customBodyParams}
                    onChange={(e) => setFormData({ ...formData, customBodyParams: e.target.value })}
                    className="min-h-[80px] font-mono text-sm"
                  />
                </div>
              )}

              {formData.requestMethod === 'GET' && (
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-2">自定义GET参数（JSON格式）</label>
                  <Textarea
                    placeholder='{"platform": "douyin", "version": "1.0"}'
                    value={formData.customQueryParams}
                    onChange={(e) => setFormData({ ...formData, customQueryParams: e.target.value })}
                    className="min-h-[80px] font-mono text-sm"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center space-x-3">
              <Button onClick={handleSaveConfig}>
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
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">现有配置</h2>
          {!isNewConfig && !editingConfig && (
            <div className="flex space-x-2">
              <Button onClick={handleAddTestParser} variant="outline">
                <TestTube className="w-4 h-4 mr-2" />
                添加测试解析器
              </Button>
              <Button onClick={handleNewConfig}>
                <Plus className="w-4 h-4 mr-2" />
                新建配置
              </Button>
            </div>
          )}
        </div>

        {configs.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center text-muted-foreground">
                <Code className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-medium mb-2">还没有解析器配置</h3>
                <p>点击"新建配置"添加您的第一个视频解析API</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {configs.map((config) => (
              <Card key={config.id}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-3">
                        <div className="flex items-center space-x-2">
                          <Code className="w-5 h-5 text-primary" />
                          <h3 className="font-semibold text-lg">{config.name}</h3>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          {config.isDefault && (
                            <Badge key={`parser-config-badge-${config.id}`} variant="default">默认</Badge>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-muted-foreground">
                        <div>
                          <span className="font-medium">API地址:</span> {config.apiUrl}
                        </div>
                        <div>
                          <span className="font-medium">API密钥:</span> 
                          {config.apiKey ? (
                            <span className="ml-1">
                              {showApiKey[config.id] ? config.apiKey : '••••••••'}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="ml-1 h-auto p-0"
                                onClick={() => toggleApiKeyVisibility(config.id)}
                              >
                                {showApiKey[config.id] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                              </Button>
                            </span>
                          ) : (
                            '未设置'
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 ml-4">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleTestParser(config)}
                        disabled={testingId === config.id}
                      >
                        {testingId === config.id ? (
                          <div className="flex items-center">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary mr-2"></div>
                            测试中
                          </div>
                        ) : (
                          <>
                            <TestTube className="w-4 h-4 mr-2" />
                            测试解析
                          </>
                        )}
                      </Button>

                      {!config.isDefault && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSetDefault(config.id)}
                        >
                          设为默认
                        </Button>
                      )}

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEditConfig(config)}
                        disabled={isNewConfig || editingConfig?.id === config.id}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDeleteConfig(config.id)}
                        className="text-red-600 hover:text-red-700"
                        disabled={isNewConfig || editingConfig?.id === config.id}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* 使用说明 */}
      <Card>
        <CardHeader>
          <CardTitle>使用说明</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p key="parser-help-1"><strong>解析器名称：</strong>为您的解析API起一个便于识别的名称</p>
            <p key="parser-help-2"><strong>API地址：</strong>视频解析服务的完整API地址</p>
            <p key="parser-help-3"><strong>API密钥：</strong>如果解析服务需要认证，请填写对应的密钥</p>
            <p key="parser-help-4"><strong>默认配置：</strong>进行视频解析时会优先使用默认配置</p>
            <p key="parser-help-5"><strong>测试解析：</strong>点击测试按钮验证解析器是否正常工作</p>
            <p key="parser-help-6"><strong>测试模式：</strong>当常规解析失败时，系统会自动尝试使用测试模式</p>
            <p key="parser-help-7"><strong>分享文本：</strong>支持直接粘贴抖音等平台的分享文本，会自动提取链接</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
