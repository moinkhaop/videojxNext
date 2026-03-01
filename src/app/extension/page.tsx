'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Download, ListChecks, PlayCircle, Puzzle, UploadCloud, ShieldCheck } from 'lucide-react'

const latestExtensionVersion = '0.1.17'
const latestExtensionFile = `/downloads/videojx-extension-${latestExtensionVersion}.zip`

export default function ExtensionGuidePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-cyan-50/40 to-blue-50/40 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="container mx-auto max-w-6xl px-4 py-8">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 rounded-full border bg-background/80 px-3 py-1 text-xs text-muted-foreground">
            <Puzzle className="h-3.5 w-3.5" />
            Chrome Extension
          </div>
          <h1 className="mt-3 text-3xl font-bold">VideoJX Next 插件使用说明</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            插件适合“边刷视频边排队转存”的场景。你可以先把任务加入队列，后台按顺序处理，不需要停留等待。
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2 border-none shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ListChecks className="h-5 w-5 text-primary" />
                核心功能
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-6 text-muted-foreground">
              <div className="rounded-lg border p-3">
                <div className="mb-1 flex items-center gap-2 font-medium text-foreground">
                  <PlayCircle className="h-4 w-4 text-emerald-600" />
                  单链接解析与上传
                </div>
                <p>支持从地址栏读取、分享取链、粘贴链接，解析后可预览视频/图集，再直接上传到 WebDAV。</p>
              </div>
              <div className="rounded-lg border p-3">
                <div className="mb-1 flex items-center gap-2 font-medium text-foreground">
                  <UploadCloud className="h-4 w-4 text-cyan-600" />
                  后台任务队列（新增）
                </div>
                <p>点击“加入任务队列”后，任务会进入列表并在后台顺序执行。你可以继续切换到其他视频继续添加任务。</p>
              </div>
              <div className="rounded-lg border p-3">
                <div className="mb-1 flex items-center gap-2 font-medium text-foreground">
                  <ShieldCheck className="h-4 w-4 text-blue-600" />
                  账号隔离与云端同步
                </div>
                <p>配置、历史按账号隔离。登录同一账号后，网站与插件可双向同步配置与历史数据。</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg">
            <CardHeader>
              <CardTitle className="text-lg">下载插件</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="outline">最新版本</Badge>
                <span className="text-sm font-medium">{latestExtensionVersion}</span>
              </div>
              <Link href={latestExtensionFile}>
                <Button className="w-full gap-2">
                  <Download className="h-4 w-4" />
                  下载 ZIP 安装包
                </Button>
              </Link>
              <div className="rounded-lg border p-3 text-xs text-muted-foreground">
                安装方式：Chrome 打开 <code>chrome://extensions</code>，启用开发者模式，选择“加载已解压的扩展程序”或使用 ZIP 解压后加载。
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="mt-6 border-none shadow-lg">
          <CardHeader>
            <CardTitle className="text-lg">快速上手</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm text-muted-foreground md:grid-cols-2">
            <div className="rounded-lg border p-3">
              <p className="font-medium text-foreground">1. 登录账号并同步配置</p>
              <p>在插件“账号”页登录后，点击“同步配置”或“刷新登录态”，拉取网站端解析器/WebDAV。</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="font-medium text-foreground">2. 选择解析器与 WebDAV</p>
              <p>在插件主页选择目标解析器和 WebDAV，确保默认项指向可用配置。</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="font-medium text-foreground">3. 加入任务队列</p>
              <p>粘贴链接后点击“加入任务队列”，任务会显示在插件队列列表里并后台处理。</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="font-medium text-foreground">4. 在网站查看历史</p>
              <p>完成后到网站“历史记录”页查看结果，支持筛选、标签、导出。</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
