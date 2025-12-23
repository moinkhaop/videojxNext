'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EnhancedAvatar } from '@/components/ui/enhanced-avatar'
import { useAuth } from '@/contexts/auth-context'
import {
  User,
  Settings,
  LogOut,
  Mail,
  Shield
} from 'lucide-react'

export function UserMenu() {
  const { user, signOut, loading } = useAuth()
  const router = useRouter()
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const handleSignOut = async () => {
    if (isLoggingOut) return
    
    setIsLoggingOut(true)
    try {
      await signOut()
      router.push('/auth/login')
    } catch (error) {
      console.error('登出失败:', error)
    } finally {
      setIsLoggingOut(false)
    }
  }

  if (!user) {
    return (
      <div className="flex items-center space-x-2">
        <Link href="/auth/login">
          <Button variant="outline" size="sm">
            <User className="mr-2 h-4 w-4" />
            登录
          </Button>
        </Link>
        <Link href="/auth/register">
          <Button variant="default" size="sm">
            <Mail className="mr-2 h-4 w-4" />
            注册
          </Button>
        </Link>
      </div>
    )
  }

  // 获取用户邮箱的首字母作为头像
  const userInitial = user.email?.charAt(0).toUpperCase() || 'U'
  const userName = user.user_metadata?.full_name || user.email || ''

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="relative h-10 w-10 rounded-full border-2 border-primary hover:border-primary hover:bg-primary/5 transition-all shadow-sm hover:shadow-md p-0"
        >
          <EnhancedAvatar
            src={user.user_metadata?.avatar_url}
            alt={userName}
            fallbackText={userInitial}
            size="md"
            showBorder={false}
          />
          {/* 在线状态指示器 */}
          <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 border-2 border-background shadow-sm" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">
              {user.user_metadata?.full_name || user.email}
            </p>
            <p className="text-xs leading-none text-muted-foreground">
              {user.email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings/profile" className="flex items-center">
            <Settings className="mr-2 h-4 w-4" />
            <span>个人设置</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings/security" className="flex items-center">
            <Shield className="mr-2 h-4 w-4" />
            <span>安全设置</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem 
          className="flex items-center cursor-pointer"
          onClick={handleSignOut}
          disabled={isLoggingOut || loading}
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>{isLoggingOut ? '登出中...' : '退出登录'}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}