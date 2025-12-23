'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useAuth } from '@/contexts/auth-context'
import { 
  Shield, 
  Eye, 
  EyeOff, 
  Key,
  AlertTriangle
} from 'lucide-react'

export default function SecurityPage() {
  const { user, signOut } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!user) {
      setError('用户未登录')
      return
    }

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('请填写所有密码字段')
      return
    }

    if (newPassword.length < 6) {
      setError('新密码长度至少为6位')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致')
      return
    }

    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const response = await fetch('/api/profile/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || '更新密码失败')
      }

      setSuccess('密码已成功更新！')
      
      // 清空表单
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setShowCurrentPassword(false)
      setShowNewPassword(false)
      setShowConfirmPassword(false)
      
      // 3秒后清除成功消息
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      console.error('更新密码失败:', err)
      setError(err instanceof Error ? err.message : '更新密码失败')
    } finally {
      setLoading(false)
    }
  }

  const handleSignOut = async () => {
    try {
      await signOut()
      // 登出后会自动重定向到登录页面
    } catch (err) {
      console.error('登出失败:', err)
      setError(err instanceof Error ? err.message : '登出失败')
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">需要登录</CardTitle>
            <CardDescription>
              请先登录您的账户以访问安全设置
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">安全设置</h1>
          <p className="text-muted-foreground mb-6">
            管理您的账户安全和密码设置
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 密码修改卡片 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Key className="mr-2 h-5 w-5" />
                修改密码
              </CardTitle>
              <CardDescription>
                更新您的账户密码以增强安全性
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {success && (
                <Alert className="mb-4">
                  <AlertDescription>{success}</AlertDescription>
                </Alert>
              )}
              
              {error && (
                <Alert variant="destructive" className="mb-4">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <form onSubmit={handlePasswordChange} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">当前密码</Label>
                  <div className="relative">
                    <Input
                      id="currentPassword"
                      type={showCurrentPassword ? 'text' : 'password'}
                      placeholder="请输入当前密码"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    >
                      {showCurrentPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="newPassword">新密码</Label>
                  <div className="relative">
                    <Input
                      id="newPassword"
                      type={showNewPassword ? 'text' : 'password'}
                      placeholder="请输入新密码（至少6位）"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                    >
                      {showNewPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">确认新密码</Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder="请再次输入新密码"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={loading}
                >
                  {loading ? '更新中...' : '更新密码'}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* 账户安全卡片 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Shield className="mr-2 h-5 w-5" />
                账户安全
              </CardTitle>
              <CardDescription>
                查看和管理您的账户安全状态
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">邮箱验证状态</div>
                  <div className="text-sm">
                    {user.email_confirmed_at ? (
                      <span className="text-green-600">已验证</span>
                    ) : (
                      <span className="text-orange-600">未验证</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">注册时间</div>
                  <div className="text-sm">
                    {user.created_at ? new Date(user.created_at).toLocaleString() : '未知'}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">最后登录时间</div>
                  <div className="text-sm">
                    {user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : '未知'}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">登录IP地址</div>
                  <div className="text-sm">
                    {/* 这里应该显示用户的登录IP，但 Supabase 可能不提供此信息 */}
                    <span className="text-muted-foreground">暂无记录</span>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t">
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="ml-2">
                    安全提示：请定期更新密码，并使用强密码以保护您的账户安全
                  </AlertDescription>
                </Alert>
              </div>

              <div className="pt-4">
                <Button 
                  variant="outline" 
                  className="w-full" 
                  onClick={handleSignOut}
                >
                  退出登录
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}