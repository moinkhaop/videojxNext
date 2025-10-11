import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Video, Settings, History, Plus, Sparkles, Zap, Shield, Layers } from 'lucide-react'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* 页面标题 */}
        <div className="text-center mb-16 pt-8">
          <div className="inline-block mb-6">
            <div className="p-4 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl shadow-xl">
              <Video className="w-16 h-16 text-white" />
            </div>
          </div>
          <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent mb-6">
            视频分享链接转存工具
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            现代化的视频分享链接转存工具，支持多种解析API和WebDAV服务器，轻松实现视频链接的批量处理和云端存储
          </p>
        </div>

        {/* 主功能卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto mb-16">
          {/* 单链接转存 */}
          <Card className="group relative overflow-hidden border-none shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
            <CardContent className="p-6 relative">
              <div className="flex items-center mb-4">
                <div className="p-3 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl mr-3 group-hover:scale-110 transition-transform shadow-md">
                  <Video className="w-7 h-7 text-white" />
                </div>
                <h2 className="text-xl font-bold">单链接转存</h2>
              </div>
              <p className="text-muted-foreground mb-6 min-h-[48px]">
                输入单个视频分享链接，快速解析并上传到指定的WebDAV服务器
              </p>
              <Link href="/convert">
                <Button className="w-full bg-blue-600 hover:bg-blue-700 shadow-md">
                  开始转存
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* 批量转存 */}
          <Card className="group relative overflow-hidden border-none shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
            <CardContent className="p-6 relative">
              <div className="flex items-center mb-4">
                <div className="p-3 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl mr-3 group-hover:scale-110 transition-transform shadow-md">
                  <Plus className="w-7 h-7 text-white" />
                </div>
                <h2 className="text-xl font-bold">批量转存</h2>
              </div>
              <p className="text-muted-foreground mb-6 min-h-[48px]">
                一次性处理多个视频链接，自动队列管理，支持进度跟踪
              </p>
              <Link href="/batch">
                <Button className="w-full bg-purple-600 hover:bg-purple-700 shadow-md">
                  批量处理
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* 历史记录 */}
          <Card className="group relative overflow-hidden border-none shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
            <CardContent className="p-6 relative">
              <div className="flex items-center mb-4">
                <div className="p-3 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl mr-3 group-hover:scale-110 transition-transform shadow-md">
                  <History className="w-7 h-7 text-white" />
                </div>
                <h2 className="text-xl font-bold">历史记录</h2>
              </div>
              <p className="text-muted-foreground mb-6 min-h-[48px]">
                查看所有转存记录，管理历史任务，支持数据导出导入
              </p>
              <Link href="/history">
                <Button className="w-full bg-emerald-600 hover:bg-emerald-700 shadow-md">
                  查看记录
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* 设置配置 */}
          <Card className="group relative overflow-hidden border-none shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 md:col-span-2 lg:col-span-3 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
            <CardContent className="p-6 relative">
              <div className="flex items-center mb-4">
                <div className="p-3 bg-gradient-to-br from-orange-500 to-amber-500 rounded-xl mr-3 group-hover:scale-110 transition-transform shadow-md">
                  <Settings className="w-7 h-7 text-white" />
                </div>
                <h2 className="text-xl font-bold">设置与配置</h2>
              </div>
              <p className="text-muted-foreground mb-6">
                管理WebDAV服务器配置、视频解析API设置，个性化您的转存体验
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href="/settings">
                  <Button variant="outline" className="hover:bg-orange-50 hover:text-orange-700 hover:border-orange-300 dark:hover:bg-orange-950/20">
                    应用设置
                  </Button>
                </Link>
                <Link href="/settings/webdav">
                  <Button variant="outline" className="hover:bg-orange-50 hover:text-orange-700 hover:border-orange-300 dark:hover:bg-orange-950/20">
                    WebDAV配置
                  </Button>
                </Link>
                <Link href="/settings/parsers">
                  <Button variant="outline" className="hover:bg-orange-50 hover:text-orange-700 hover:border-orange-300 dark:hover:bg-orange-950/20">
                    解析API配置
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 核心特性 */}
        <div className="max-w-6xl mx-auto mb-16">
          <div className="text-center mb-12">
            <h3 className="text-3xl font-bold mb-3 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">核心特性</h3>
            <p className="text-muted-foreground">强大功能，简单易用</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="border-none shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
              <CardContent className="p-6 text-center">
                <div className="inline-block p-3 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl mb-4 shadow-md">
                  <Layers className="w-8 h-8 text-white" />
                </div>
                <h4 className="text-lg font-bold mb-2">多平台支持</h4>
                <p className="text-sm text-muted-foreground">
                  支持多种视频分享平台的链接解析，统一的处理流程
                </p>
              </CardContent>
            </Card>

            <Card className="border-none shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
              <CardContent className="p-6 text-center">
                <div className="inline-block p-3 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl mb-4 shadow-md">
                  <Zap className="w-8 h-8 text-white" />
                </div>
                <h4 className="text-lg font-bold mb-2">批量处理</h4>
                <p className="text-sm text-muted-foreground">
                  智能队列管理，支持大量链接的批量处理和进度跟踪
                </p>
              </CardContent>
            </Card>

            <Card className="border-none shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
              <CardContent className="p-6 text-center">
                <div className="inline-block p-3 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl mb-4 shadow-md">
                  <Shield className="w-8 h-8 text-white" />
                </div>
                <h4 className="text-lg font-bold mb-2">数据持久化</h4>
                <p className="text-sm text-muted-foreground">
                  本地存储配置和历史记录，支持数据导出导入
                </p>
              </CardContent>
            </Card>

            <Card className="border-none shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
              <CardContent className="p-6 text-center">
                <div className="inline-block p-3 bg-gradient-to-br from-orange-500 to-amber-500 rounded-xl mb-4 shadow-md">
                  <Sparkles className="w-8 h-8 text-white" />
                </div>
                <h4 className="text-lg font-bold mb-2">现代化界面</h4>
                <p className="text-sm text-muted-foreground">
                  基于Next.js和TailwindCSS构建的响应式现代界面
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* 自动清理功能 */}
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h3 className="text-3xl font-bold mb-3 bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">自动清理功能</h3>
            <p className="text-muted-foreground">智能管理，保持整洁</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="border-none shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
              <CardContent className="p-6 text-center">
                <div className="inline-block p-3 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl mb-4 shadow-md">
                  <Sparkles className="w-8 h-8 text-white" />
                </div>
                <h4 className="text-lg font-bold mb-2">智能清理</h4>
                <p className="text-sm text-muted-foreground">
                  自动检测并清理过期的临时文件和缓存数据，释放设备存储空间
                </p>
              </CardContent>
            </Card>

            <Card className="border-none shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
              <CardContent className="p-6 text-center">
                <div className="inline-block p-3 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl mb-4 shadow-md">
                  <Settings className="w-8 h-8 text-white" />
                </div>
                <h4 className="text-lg font-bold mb-2">可配置策略</h4>
                <p className="text-sm text-muted-foreground">
                  支持自定义保留策略，灵活控制文件保留时间和类型
                </p>
              </CardContent>
            </Card>

            <Card className="border-none shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
              <CardContent className="p-6 text-center">
                <div className="inline-block p-3 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl mb-4 shadow-md">
                  <History className="w-8 h-8 text-white" />
                </div>
                <h4 className="text-lg font-bold mb-2">日志记录</h4>
                <p className="text-sm text-muted-foreground">
                  详细记录每次清理操作，便于追踪和审计
                </p>
              </CardContent>
            </Card>

            <Card className="border-none shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
              <CardContent className="p-6 text-center">
                <div className="inline-block p-3 bg-gradient-to-br from-orange-500 to-amber-500 rounded-xl mb-4 shadow-md">
                  <Zap className="w-8 h-8 text-white" />
                </div>
                <h4 className="text-lg font-bold mb-2">定时执行</h4>
                <p className="text-sm text-muted-foreground">
                  支持定时自动清理，无需手动干预
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
