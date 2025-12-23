import './globals.css'
import type { Metadata, Viewport } from 'next'
// TODO: 暂时注释 Google Fonts，网络问题
// import { Inter } from 'next/font/google'
import { Navigation } from '@/components/navigation'
import { AuthProvider } from '@/contexts/auth-context'
import { StorageInitializer } from '@/components/storage-initializer'

// TODO: 暂时注释 Google Fonts
// const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: '视频分享链接转存工具',
  description: '现代化的视频分享链接转存工具，支持多种解析API和WebDAV服务器',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <body className="font-sans"> {/* 使用系统字体替代 Inter */}
        <AuthProvider>
          <StorageInitializer>
            <div className="min-h-screen bg-background">
              <Navigation />
              <main className="pb-16 md:pb-0">
                {children}
              </main>
            </div>
          </StorageInitializer>
        </AuthProvider>
      </body>
    </html>
  )
}
