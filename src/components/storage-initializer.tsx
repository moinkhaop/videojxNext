'use client'

import { useEffect } from 'react'

export function StorageInitializer({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // 简化的初始化逻辑，避免循环依赖
    console.log('[StorageInitializer] 初始化完成')
  }, [])

  return <>{children}</>
}