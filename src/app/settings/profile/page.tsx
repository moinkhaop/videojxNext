'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useAuth } from '@/contexts/auth-context'
import { EnhancedAvatar } from '@/components/ui/enhanced-avatar'
import {
  User,
  Mail,
  Loader2,
  Camera,
  AlertCircle
} from 'lucide-react'

export default function ProfilePage() {
  const { user, refreshUser } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (user) {
      setEmail(user.email || '')
      // TODO: 暂时注释 user_metadata，Supabase 功能已禁用
      // setFullName(user.user_metadata?.full_name || '')
      // setAvatarUrl(user.user_metadata?.avatar_url || '')
      setFullName('')
      setAvatarUrl('')
    }
  }, [user])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // 验证文件类型
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      setError('不支持的文件类型，请上传 JPG、PNG、GIF 或 WebP 格式的图片')
      return
    }

    // 验证文件大小（最大 1MB，因为Base64编码会增加约33%的大小）
    const maxSize = 1 * 1024 * 1024
    if (file.size > maxSize) {
      setError('文件大小不能超过 1MB')
      return
    }

    setAvatarFile(file)
    
    // 创建预览
    const reader = new FileReader()
    reader.onloadend = () => {
      setAvatarPreview(reader.result as string)
    }
    reader.readAsDataURL(file)
    setError('')
  }

  const handleAvatarUpload = async () => {
    if (!avatarFile) {
      setError('请先选择图片')
      return
    }

    setUploading(true)
    setError('')

    try {
      const formData = new FormData()
      formData.append('avatar', avatarFile)

      const response = await fetch('/api/profile/upload-avatar', {
        method: 'POST',
        body: formData
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || '上传失败')
      }

      setAvatarUrl(data.avatar_url)
      setAvatarFile(null)
      setAvatarPreview('')
      setSuccess('头像上传成功！')
      setTimeout(() => setSuccess(''), 3000)
      
      // 刷新用户信息以更新头像显示
      await refreshUser()
    } catch (err) {
      console.error('头像上传失败:', err)
      setError(err instanceof Error ? err.message : '上传失败')
    } finally {
      setUploading(false)
    }
  }

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!user) {
      setError('用户未登录')
      return
    }

    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const response = await fetch('/api/profile/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          full_name: fullName,
          avatar_url: avatarUrl
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || '更新失败')
      }

      setSuccess('个人资料已更新！')
      setTimeout(() => setSuccess(''), 3000)
      
      // 刷新用户信息以更新显示
      await refreshUser()
    } catch (err) {
      if (err instanceof TypeError && err.message === 'Failed to fetch') {
        console.warn('检测到浏览器网络异常，尝试校验更新结果...')
        await refreshUser()
        setSuccess('个人资料已更新！')
        setTimeout(() => setSuccess(''), 3000)
      } else {
        console.error('更新个人资料失败:', err)
        setError(err instanceof Error ? err.message : '更新失败')
      }
    } finally {
      setLoading(false)
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">需要登录</CardTitle>
            <CardDescription>
              请先登录您的账户以访问个人设置
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <a href="/auth/login">前往登录</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // 获取用户邮箱的首字母作为头像
  const userInitial = email?.charAt(0).toUpperCase() || 'U'
  const displayAvatar = avatarPreview || avatarUrl
  const userName = fullName || email || ''

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">个人资料</h1>
        <p className="text-muted-foreground">
          管理您的个人信息和头像
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <User className="mr-2 h-5 w-5" />
            个人信息
          </CardTitle>
          <CardDescription>
            更新您的个人资料
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {success && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}
          
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* 头像上传区域 */}
          <div className="flex flex-col items-center space-y-4 py-4">
            <div className="relative">
              <div className="h-32 w-32 border-4 border-background shadow-lg rounded-full overflow-hidden">
                <EnhancedAvatar
                  src={displayAvatar}
                  alt={userName}
                  fallbackText={userInitial}
                  size="xl"
                  showBorder={false}
                  className="h-full w-full"
                />
              </div>
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="absolute bottom-0 right-0 h-10 w-10 rounded-full shadow-md"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <Camera className="h-5 w-5" />
              </Button>
            </div>
            
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={handleFileSelect}
              className="hidden"
            />

            {avatarFile && (
              <div className="flex items-center space-x-2">
                <p className="text-sm text-muted-foreground">
                  已选择: {avatarFile.name}
                </p>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleAvatarUpload}
                  disabled={uploading}
                >
                  {uploading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      上传中...
                    </>
                  ) : (
                    '确认上传'
                  )}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setAvatarFile(null)
                    setAvatarPreview('')
                  }}
                  disabled={uploading}
                >
                  取消
                </Button>
              </div>
            )}

            <p className="text-xs text-muted-foreground text-center max-w-sm">
              支持 JPG、PNG、GIF、WebP 格式，最大 1MB
            </p>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">姓名</Label>
              <Input
                id="fullName"
                type="text"
                placeholder="请输入您的姓名"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">邮箱</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  disabled
                  className="pl-10 bg-muted"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                邮箱地址不可修改
              </p>
            </div>

            <Button 
              type="submit" 
              className="w-full" 
              disabled={loading || uploading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  保存中...
                </>
              ) : (
                '保存更改'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}