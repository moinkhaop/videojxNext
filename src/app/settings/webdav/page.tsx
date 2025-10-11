'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import {
  Server,
  Plus,
  Trash2,
  Edit,
  Eye,
  EyeOff,
  CheckCircle,
  Save,
  X,
  ArrowLeft,
  Settings
} from 'lucide-react'
import { WebDAVConfig } from '@/types'
import { ConfigManager } from '@/lib/storage'
import { ConversionService } from '@/lib/conversion'

export default function WebDAVConfigPage() {
  const [configs, setConfigs] = useState<WebDAVConfig[]>([])
  const [editingConfig, setEditingConfig] = useState<WebDAVConfig | null>(null)
  const [isNewConfig, setIsNewConfig] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState<Record<string, boolean>>({})
  const [formData, setFormData] = useState({
    name: '',
    url: '',
    username: '',
    password: '',
    basePath: ''
  })

  useEffect(() => {
    loadConfigs()
  }, [])

  const loadConfigs = () => {
    const webdavConfigs = ConfigManager.getWebDAVConfigs()
    setConfigs(webdavConfigs)
  }

  const handleNewConfig = () => {
    setFormData({
      name: '',
      url: '',
      username: '',
      password: '',
      basePath: ''
    })
    setEditingConfig(null)
    setIsNewConfig(true)
  }

  const handleEditConfig = (config: WebDAVConfig) => {
    setFormData({
      name: config.name,
      url: config.url,
      username: config.username,
      password: config.password,
      basePath: config.basePath || ''
    })
    setEditingConfig(config)
    setIsNewConfig(false)
  }

  const handleSaveConfig = () => {
    if (!formData.name.trim() || !formData.url.trim()) {
      alert('请填写配置名称和WebDAV地址')
      return
    }

    const configData: WebDAVConfig = {
      id: crypto.randomUUID(),
      name: formData.name.trim(),
      url: formData.url.trim(),
      username: formData.username.trim(),
      password: formData.password,
      basePath: formData.basePath.trim(),
      isDefault: configs.length === 0
    }

    if (isNewConfig) {
      ConfigManager.addWebDAVConfig(configData)
    } else if (editingConfig) {
      ConfigManager.updateWebDAVConfig(editingConfig.id, configData)
    }

    loadConfigs()
    handleCancelEdit()
  }

  const handleCancelEdit = () => {
    setEditingConfig(null)
    setIsNewConfig(false)
    setFormData({
      name: '',
      url: '',
      username: '',
      password: '',
      basePath: ''
    })
  }

  const handleDeleteConfig = (id: string) => {
    if (confirm('确定要删除这个WebDAV配置吗？')) {
      ConfigManager.deleteWebDAVConfig(id)
      loadConfigs()
    }
  }

  const handleSetDefault = (id: string) => {
    ConfigManager.setDefaultWebDAVConfig(id)
    loadConfigs()
  }

  const handleTestConnection = async (config: WebDAVConfig) => {
    setTestingId(config.id)
    try {
      const result = await ConversionService.testWebDAVConnection(config)
      if (result.success) {
        alert('连接测试成功！')
      } else {
        alert(`连接测试失败：${result.message}`)
      }
    } catch (error) {
      alert(`连接测试出错：${error}`)
    } finally {
      setTestingId(null)
    }
  }

  const togglePasswordVisibility = (id: string) => {
    setShowPassword(prev => ({
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
              <div className="p-3 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl shadow-lg">
                <Server className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-foreground">WebDAV 服务器</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  管理视频文件存储服务器配置
                </p>
              </div>
            </div>

            {!isNewConfig && !editingConfig && (
              <Button onClick={handleNewConfig} className="bg-blue-600 hover:bg-blue-700">
                <Plus className="w-4 h-4 mr-2" />
                新建配置
              </Button>
            )}
          </div>
        </div>

        {/* 新建/编辑配置表单 */}
        {(isNewConfig || editingConfig) && (
          <Card className="mb-6 border-none shadow-lg bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl shadow-md">
                    <Server className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-bold">
                      {isNewConfig ? '新建 WebDAV 配置' : '编辑 WebDAV 配置'}
                    </CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      填写服务器连接信息
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
                    <label className="block text-sm font-medium mb-2">配置名称 *</label>
                    <Input
                      placeholder="例如：我的网盘"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="h-10"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">WebDAV 地址 *</label>
                    <Input
                      placeholder="https://dav.example.com"
                      value={formData.url}
                      onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                      className="h-10"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">用户名</label>
                    <Input
                      placeholder="用户名"
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                      className="h-10"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">密码</label>
                    <div className="relative">
                      <Input
                        type={showPassword.new ? 'text' : 'password'}
                        placeholder="密码"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        className="h-10 pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute inset-y-0 right-0 px-3 h-10"
                        onClick={() => togglePasswordVisibility('new')}
                      >
                        {showPassword.new ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">基础路径（可选）</label>
                  <Input
                    placeholder="/videos 或留空使用根目录"
                    value={formData.basePath}
                    onChange={(e) => setFormData({ ...formData, basePath: e.target.value })}
                    className="h-10"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button onClick={handleSaveConfig} className="bg-blue-600 hover:bg-blue-700">
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
            <CardTitle className="text-xl font-bold">已配置的服务器</CardTitle>
            <CardDescription className="text-xs mt-0.5">
              {configs.length} 个配置
            </CardDescription>
          </CardHeader>
          <CardContent>
            {configs.length === 0 ? (
              <div className="text-center py-12 px-4">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 mb-3">
                  <Server className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                </div>
                <p className="text-sm font-medium text-foreground mb-1">还没有 WebDAV 配置</p>
                <p className="text-xs text-muted-foreground">点击右上角按钮添加您的第一个服务器</p>
              </div>
            ) : (
              <div className="space-y-2">
                {configs.map((config) => (
                  <div
                    key={config.id}
                    className="group flex items-center justify-between p-4 rounded-lg border border-border hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-all"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0"></div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold text-sm truncate">{config.name}</h4>
                          {config.isDefault && (
                            <Badge className="h-5 px-1.5 text-xs bg-blue-500 hover:bg-blue-500">
                              默认
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                          <p className="truncate">{config.url}</p>
                          {config.username && <p>用户: {config.username}</p>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-3">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleTestConnection(config)}
                        disabled={testingId === config.id}
                        className="h-8 w-8 p-0"
                        title="测试连接"
                      >
                        {testingId === config.id ? (
                          <Settings className="w-4 h-4 animate-spin" />
                        ) : (
                          <CheckCircle className="w-4 h-4" />
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
        <Card className="border-none shadow-lg bg-gradient-to-br from-blue-500/10 via-cyan-500/10 to-teal-500/10 dark:from-blue-500/20 dark:via-cyan-500/20 dark:to-teal-500/20 backdrop-blur-sm">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 p-2.5 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-xl shadow-md">
                <CheckCircle className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold mb-3 text-foreground">配置说明</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-muted-foreground">
                  <div className="flex items-start gap-2">
                    <span className="text-blue-500 mt-0.5">•</span>
                    <span><strong>WebDAV 地址：</strong>服务器完整地址</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-cyan-500 mt-0.5">•</span>
                    <span><strong>用户名密码：</strong>服务器认证凭据</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-teal-500 mt-0.5">•</span>
                    <span><strong>基础路径：</strong>文件上传的基础目录</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-sky-500 mt-0.5">•</span>
                    <span><strong>默认配置：</strong>转存时优先使用</span>
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
