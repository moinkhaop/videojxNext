import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Video, Settings, History, Plus } from 'lucide-react'

export default function HomePage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-foreground mb-4">
          视频分享链接转存工具
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          现代化的视频分享链接转存工具，支持多种解析API和WebDAV服务器，轻松实现视频链接的批量处理和云端存储
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl mx-auto">
        {/* 单链接转存 */}
        <div className="bg-card p-6 rounded-lg border shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center mb-4">
            <div className="p-2 bg-primary/10 rounded-lg mr-3">
              <Video className="w-6 h-6 text-primary" />
            </div>
            <h2 className="text-xl font-semibold">单链接转存</h2>
          </div>
          <p className="text-muted-foreground mb-4">
            输入单个视频分享链接，快速解析并上传到指定的WebDAV服务器
          </p>
          <Link href="/convert">
            <Button className="w-full">
              开始转存
            </Button>
          </Link>
        </div>

        {/* 批量转存 */}
        <div className="bg-card p-6 rounded-lg border shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center mb-4">
            <div className="p-2 bg-secondary/10 rounded-lg mr-3">
              <Plus className="w-6 h-6 text-secondary-foreground" />
            </div>
            <h2 className="text-xl font-semibold">批量转存</h2>
          </div>
          <p className="text-muted-foreground mb-4">
            一次性处理多个视频链接，自动队列管理，支持进度跟踪
          </p>
          <Link href="/batch">
            <Button variant="secondary" className="w-full">
              批量处理
            </Button>
          </Link>
        </div>

        {/* 历史记录 */}
        <div className="bg-card p-6 rounded-lg border shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center mb-4">
            <div className="p-2 bg-accent/10 rounded-lg mr-3">
              <History className="w-6 h-6 text-accent-foreground" />
            </div>
            <h2 className="text-xl font-semibold">历史记录</h2>
          </div>
          <p className="text-muted-foreground mb-4">
            查看所有转存记录，管理历史任务，支持数据导出导入
          </p>
          <Link href="/history">
            <Button variant="outline" className="w-full">
              查看记录
            </Button>
          </Link>
        </div>

        {/* 设置配置 */}
        <div className="bg-card p-6 rounded-lg border shadow-sm hover:shadow-md transition-shadow md:col-span-2 lg:col-span-3">
          <div className="flex items-center mb-4">
            <div className="p-2 bg-muted/10 rounded-lg mr-3">
              <Settings className="w-6 h-6 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold">设置与配置</h2>
          </div>
          <p className="text-muted-foreground mb-4">
            管理WebDAV服务器配置、视频解析API设置，个性化您的转存体验
          </p>
          <div className="flex gap-3">
            <Link href="/settings">
              <Button variant="outline">
                应用设置
              </Button>
            </Link>
            <Link href="/settings/webdav">
              <Button variant="outline">
                WebDAV配置
              </Button>
            </Link>
            <Link href="/settings/parsers">
              <Button variant="outline">
                解析API配置
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* 特性说明 */}
      <div className="mt-16 max-w-4xl mx-auto">
        <h3 className="text-2xl font-semibold text-center mb-8">核心特性</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="text-center">
            <h4 className="text-lg font-medium mb-2">多平台支持</h4>
            <p className="text-muted-foreground">
              支持多种视频分享平台的链接解析，统一的处理流程
            </p>
          </div>
          <div className="text-center">
            <h4 className="text-lg font-medium mb-2">批量处理</h4>
            <p className="text-muted-foreground">
              智能队列管理，支持大量链接的批量处理和进度跟踪
            </p>
          </div>
          <div className="text-center">
            <h4 className="text-lg font-medium mb-2">数据持久化</h4>
            <p className="text-muted-foreground">
              本地存储配置和历史记录，支持数据导出导入
            </p>
          </div>
          <div className="text-center">
            <h4 className="text-lg font-medium mb-2">现代化界面</h4>
            <p className="text-muted-foreground">
              基于Next.js和TailwindCSS构建的响应式现代界面
            </p>
          </div>
        </div>
{/* 清理功能说明 */}
      <div className="mt-16 max-w-4xl mx-auto">
        <h3 className="text-2xl font-semibold text-center mb-8">自动清理功能</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="text-center">
            <h4 className="text-lg font-medium mb-2">智能清理</h4>
            <p className="text-muted-foreground">
              自动检测并清理过期的临时文件和缓存数据，释放设备存储空间
            </p>
          </div>
          <div className="text-center">
            <h4 className="text-lg font-medium mb-2">可配置策略</h4>
            <p className="text-muted-foreground">
              支持自定义保留策略，灵活控制文件保留时间和类型
            </p>
          </div>
          <div className="text-center">
            <h4 className="text-lg font-medium mb-2">日志记录</h4>
            <p className="text-muted-foreground">
              详细记录每次清理操作，便于追踪和审计
            </p>
          </div>
          <div className="text-center">
            <h4 className="text-lg font-medium mb-2">定时执行</h4>
            <p className="text-muted-foreground">
              支持定时自动清理，无需手动干预
            </p>
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}
