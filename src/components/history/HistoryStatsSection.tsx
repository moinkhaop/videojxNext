'use client'

import { memo } from 'react'
import { BarChart3, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { HistoryStats } from '@/types'

interface HistoryStatsSectionProps {
  stats: HistoryStats | null
  showStats: boolean
  onHideStats: () => void
  onShowStats: () => void
}

const renderOverviewStat = (
  label: string,
  value: string | number,
  accentClass = 'text-foreground'
) => (
  <div className="rounded-2xl border border-border/70 bg-background/80 px-4 py-3">
    <div className={`text-xl font-semibold ${accentClass}`}>{value}</div>
    <div className="mt-1 text-xs text-muted-foreground">{label}</div>
  </div>
)

function HistoryStatsSectionComponent({
  stats,
  showStats,
  onHideStats,
  onShowStats,
}: HistoryStatsSectionProps) {
  if (!stats) {
    return null
  }

  return (
    <>
      {showStats ? (
        <Card className="mb-6 border-2 shadow-lg">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-emerald-600" />
                <CardTitle className="text-lg">数据统计</CardTitle>
              </div>
              <Button variant="ghost" size="sm" onClick={onHideStats}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
              <div className="rounded-lg bg-muted p-4 text-center">
                <p className="text-2xl font-bold">{stats.totalRecords}</p>
                <p className="mt-1 text-xs text-muted-foreground">总记录</p>
              </div>
              <div className="rounded-lg bg-muted p-4 text-center">
                <p className="text-2xl font-bold text-green-600">{stats.successRate}%</p>
                <p className="mt-1 text-xs text-muted-foreground">成功率</p>
              </div>
              <div className="rounded-lg bg-muted p-4 text-center">
                <p className="text-2xl font-bold text-green-600">{stats.totalSuccess}</p>
                <p className="mt-1 text-xs text-muted-foreground">成功</p>
              </div>
              <div className="rounded-lg bg-muted p-4 text-center">
                <p className="text-2xl font-bold text-red-600">{stats.totalFailed}</p>
                <p className="mt-1 text-xs text-muted-foreground">失败</p>
              </div>
              <div className="rounded-lg bg-muted p-4 text-center">
                <p className="text-2xl font-bold text-yellow-600">{stats.favoriteCount}</p>
                <p className="mt-1 text-xs text-muted-foreground">收藏</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="mb-6">
          <Button variant="outline" size="sm" onClick={onShowStats}>
            <BarChart3 className="mr-2 h-4 w-4" />
            展开统计概览
          </Button>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {renderOverviewStat('总记录', stats.totalRecords)}
        {renderOverviewStat('成功率', `${stats.successRate}%`, 'text-emerald-600')}
        {renderOverviewStat('成功', stats.totalSuccess, 'text-emerald-600')}
        {renderOverviewStat('失败', stats.totalFailed, 'text-red-600')}
        {renderOverviewStat('收藏', stats.favoriteCount, 'text-amber-600')}
      </div>
    </>
  )
}

export const HistoryStatsSection = memo(HistoryStatsSectionComponent)
