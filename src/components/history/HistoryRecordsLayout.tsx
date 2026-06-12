'use client'

import { memo, type ReactNode } from 'react'
import { History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { HistoryViewMode } from '@/types'

interface HistoryRecordsLayoutProps {
  viewMode: HistoryViewMode
  recordsLength: number
  filteredRecordsLength: number
  listViewItems: ReactNode
  gridViewItems: ReactNode
  totalPages: number
  currentPage: number
  onPreviousPage: () => void
  onNextPage: () => void
  detailPanel: ReactNode
}

function HistoryRecordsLayoutComponent({
  viewMode,
  recordsLength,
  filteredRecordsLength,
  listViewItems,
  gridViewItems,
  totalPages,
  currentPage,
  onPreviousPage,
  onNextPage,
  detailPanel,
}: HistoryRecordsLayoutProps) {
  if (filteredRecordsLength === 0) {
    return (
      <Card className="border-2 shadow-lg">
        <CardContent className="py-16">
          <div className="text-center text-muted-foreground">
            <History className="mx-auto mb-4 h-16 w-16 opacity-30" />
            <h3 className="mb-2 text-lg font-medium">
              {recordsLength === 0 ? '还没有历史记录' : '没有符合条件的记录'}
            </h3>
            <p className="text-sm">
              {recordsLength === 0
                ? '开始使用转存功能后，历史记录会显示在这里'
                : '尝试调整搜索条件或筛选选项'}
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (viewMode === HistoryViewMode.LIST) {
    return (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="h-[calc(100vh-250px)] min-h-[600px] border-2 shadow-lg">
          <CardContent className="flex h-full flex-col p-0">
            <div className="border-b px-4 py-3">
              <div className="text-sm font-medium">记录列表</div>
              <div className="mt-1 text-xs text-muted-foreground">
                选择记录后，右侧会同步更新预览和详情。
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {listViewItems}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t p-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onPreviousPage}
                  disabled={currentPage === 1}
                >
                  上一页
                </Button>
                <span className="text-sm text-muted-foreground">
                  第 {currentPage} / {totalPages} 页
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onNextPage}
                  disabled={currentPage === totalPages}
                >
                  下一页
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="h-[calc(100vh-250px)] min-h-[600px] border-2 shadow-lg">
          <CardContent className="h-full p-0">
            {detailPanel}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4 rounded-2xl border border-border/70 bg-background/70 px-4 py-3 text-sm text-muted-foreground">
        网格视图更适合快速扫缩略图和封面。点击任意卡片即可在当前页锁定选中状态。
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {gridViewItems}
      </div>

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-4">
          <Button
            variant="outline"
            onClick={onPreviousPage}
            disabled={currentPage === 1}
          >
            上一页
          </Button>
          <span className="text-sm text-muted-foreground">
            第 {currentPage} / {totalPages} 页
          </span>
          <Button
            variant="outline"
            onClick={onNextPage}
            disabled={currentPage === totalPages}
          >
            下一页
          </Button>
        </div>
      )}
    </div>
  )
}

export const HistoryRecordsLayout = memo(HistoryRecordsLayoutComponent)
