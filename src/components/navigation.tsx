import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Video, Home, Settings, History, Plus } from 'lucide-react'

export function Navigation() {
  return (
    <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center space-x-2">
            <Video className="h-6 w-6 text-primary" />
            <span className="font-bold text-xl">视频转存工具</span>
          </Link>
          
          <div className="flex items-center space-x-4">
            <Link href="/">
              <Button variant="ghost" size="sm" className="flex items-center space-x-2">
                <Home className="h-4 w-4" />
                <span>首页</span>
              </Button>
            </Link>
            
            <Link href="/convert">
              <Button variant="ghost" size="sm" className="flex items-center space-x-2">
                <Video className="h-4 w-4" />
                <span>单链接</span>
              </Button>
            </Link>
            
            <Link href="/batch">
              <Button variant="ghost" size="sm" className="flex items-center space-x-2">
                <Plus className="h-4 w-4" />
                <span>批量转存</span>
              </Button>
            </Link>
            
            <Link href="/history">
              <Button variant="ghost" size="sm" className="flex items-center space-x-2">
                <History className="h-4 w-4" />
                <span>历史记录</span>
              </Button>
            </Link>
            
            <Link href="/settings">
              <Button variant="ghost" size="sm" className="flex items-center space-x-2">
                <Settings className="h-4 w-4" />
                <span>设置</span>
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </nav>
  )
}
