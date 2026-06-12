'use client'

import { memo } from 'react'
import { History } from 'lucide-react'

function HistoryPageHeaderComponent() {
  return (
    <div className="mb-6">
      <div className="mb-3 flex items-center gap-3">
        <div className="rounded-lg bg-gradient-to-br from-emerald-500/10 to-emerald-600/10 p-2">
          <History className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <h1 className="bg-gradient-to-r from-emerald-600 to-emerald-500 bg-clip-text text-4xl font-bold text-transparent">
            历史记录
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            管理解析结果、回看失败原因、快速重新进入转存流程。
          </p>
        </div>
      </div>
    </div>
  )
}

export const HistoryPageHeader = memo(HistoryPageHeaderComponent)
