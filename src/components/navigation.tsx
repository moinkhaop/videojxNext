'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Video, Home, Settings, History, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

// 导航项配置
const navigationItems = [
  {
    href: '/',
    icon: Home,
    label: '首页'
  },
  {
    href: '/convert',
    icon: Video,
    label: '单链接'
  },
  {
    href: '/batch',
    icon: Plus,
    label: '批量转存'
  },
  {
    href: '/history',
    icon: History,
    label: '历史记录'
  },
  {
    href: '/settings',
    icon: Settings,
    label: '设置'
  }
]

// 桌面端顶部导航组件
function DesktopNavigation() {
  const pathname = usePathname()
  
  return (
    <nav className="hidden md:block border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <Link 
            href="/" 
            className="flex items-center space-x-2 hover:opacity-80 transition-opacity duration-200"
          >
            <Video className="h-6 w-6 text-primary" />
            <span className="font-bold text-xl">视频转存工具</span>
          </Link>
          
          <div className="flex items-center space-x-1">
            {navigationItems.map(({ href, icon: Icon, label }) => {
              const isActive = pathname === href
              return (
                <Link key={href} href={href}>
                  <Button 
                    variant={isActive ? "default" : "ghost"} 
                    size="sm" 
                    className={cn(
                      "flex items-center space-x-2 transition-all duration-200 relative",
                      isActive && "bg-primary text-primary-foreground shadow-sm",
                      !isActive && "hover:bg-accent/50 hover:text-accent-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{label}</span>
                    {isActive && (
                      <div className="absolute -bottom-0.5 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-primary-foreground rounded-full" />
                    )}
                  </Button>
                </Link>
              )
            })}
          </div>
        </div>
      </div>
    </nav>
  )
}

// 移动端顶部头部组件（仅显示标题）
function MobileHeader() {
  return (
    <header className="md:hidden border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center justify-center px-4">
        <Link href="/" className="flex items-center space-x-2">
          <Video className="h-5 w-5 text-primary" />
          <span className="font-bold text-lg">视频转存工具</span>
        </Link>
      </div>
    </header>
  )
}

// 移动端底部标签栏组件
function MobileBottomNavigation() {
  const pathname = usePathname()
  
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center justify-around px-2 py-2" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
        {navigationItems.map(({ href, icon: Icon, label }) => {
          const isActive = pathname === href
          return (
            <Link 
              key={href} 
              href={href}
              className={cn(
                "flex flex-col items-center justify-center min-w-0 flex-1 py-2 px-1 rounded-lg transition-all duration-200 touch-manipulation",
                isActive ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              )}
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <Icon className={cn(
                "h-5 w-5 mb-1 transition-transform duration-200",
                isActive && "scale-110"
              )} />
              <span className={cn(
                "text-xs font-medium truncate",
                isActive && "font-semibold"
              )}>
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

// 主导航组件
export function Navigation() {
  return (
    <>
      {/* 桌面端导航 */}
      <DesktopNavigation />
      
      {/* 移动端头部 */}
      <MobileHeader />
      
      {/* 移动端底部导航 */}
      <MobileBottomNavigation />
    </>
  )
}
