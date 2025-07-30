'use client'

import { useState, useEffect } from 'react'
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
  XCircle,
  Wifi,
  WifiOff,
  Save,
  TestTube
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
      id: crypto.randomUUID(), // 生成唯一ID
      name: formData.name.trim(),
      url: formData.url.trim(),
      username: formData.username.trim(),
      password: formData.password,
      basePath: formData.basePath.trim(),
      isDefault: configs.length === 0 // 第一个配置自动设为默认
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
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">WebDAV 配置</h1>
        <p className="text-muted-foreground">
          管理您的 WebDAV 服务器配置，用于存储转存的视频文件
        </p>
      </div>

      {/* 新建/编辑配置表单 */}
      {(isNewConfig || editingConfig) && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Server className="w-5 h-5" />
              <span>{isNewConfig ? '新建 WebDAV 配置' : '编辑 WebDAV 配置'}</span>
            </CardTitle>
            <CardDescription>
              填写您的 WebDAV 服务器连接信息
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium mb-2">配置名称</label>
                <Input
                  placeholder="例如：我的网盘"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">WebDAV 地址</label>
                <Input
                  placeholder="https://dav.example.com"
                  value={formData.url}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">用户名</label>
                <Input
                  placeholder="用户名"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
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
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute inset-y-0 right-0 px-3"
                    onClick={() => togglePasswordVisibility('new')}
                  >
                    {showPassword.new ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-2">基础路径（可选）</label>
                <Input
                  placeholder="/videos 或留空使用根目录"
                  value={formData.basePath}
                  onChange={(e) => setFormData({ ...formData, basePath: e.target.value })}
                />
              </div>
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
            <Button onClick={handleNewConfig}>
              <Plus className="w-4 h-4 mr-2" />
              新建配置
            </Button>
          )}
        </div>

        {configs.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center text-muted-foreground">
                <Server className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-medium mb-2">还没有 WebDAV 配置</h3>
                <p>点击"新建配置"添加您的第一个 WebDAV 服务器</p>
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
                          <Server className="w-5 h-5 text-primary" />
                          <h3 className="font-semibold text-lg">{config.name}</h3>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          {config.isDefault && (
                            <Badge key={`webdav-config-badge-${config.id}`} variant="default">默认</Badge>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-muted-foreground">
                        <div>
                          <span className="font-medium">地址:</span> {config.url}
                        </div>
                        <div>
                          <span className="font-medium">用户名:</span> {config.username || '未设置'}
                        </div>
                        {config.basePath && (
                          <div className="md:col-span-2">
                            <span className="font-medium">基础路径:</span> {config.basePath}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 ml-4">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleTestConnection(config)}
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
                            测试连接
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
            <p key="webdav-help-1"><strong>WebDAV 地址：</strong>输入您的 WebDAV 服务器完整地址，例如 https://dav.example.com</p>
            <p key="webdav-help-2"><strong>用户名和密码：</strong>用于 WebDAV 服务器认证的凭据</p>
            <p key="webdav-help-3"><strong>基础路径：</strong>可选，指定文件上传的基础目录，例如 /videos</p>
            <p key="webdav-help-4"><strong>默认配置：</strong>进行转存时会优先使用默认配置</p>
            <p key="webdav-help-5"><strong>测试连接：</strong>点击测试连接按钮验证配置是否正确</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
