import { Metadata } from 'next'

export const metadata: Metadata = {
  title: '用户认证 - 视频转存工具',
  description: '登录或注册您的账户以访问视频转存工具',
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen">
      {children}
    </div>
  )
}