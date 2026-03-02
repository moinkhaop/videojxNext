'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, BarChart3, Clock3, RefreshCw, TrendingUp, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ConfigManager, HistoryManager } from '@/lib/storage'
import { getAllParserHealthSnapshots } from '@/lib/parser-health'
import { computeInsightsSummary, type InsightsRange, type InsightsRecommendation, type InsightsSummary } from '@/lib/insights'

function toDisplayText(summary: InsightsSummary | null, fallback = '-') {
  if (!summary) return fallback
  return `${summary.successRate}%`
}

export default function InsightsPage() {
  const [range, setRange] = useState<InsightsRange>('7d')
  const [localSummary, setLocalSummary] = useState<InsightsSummary | null>(null)
  const [remoteSummary, setRemoteSummary] = useState<InsightsSummary | null>(null)
  const [loadingRemote, setLoadingRemote] = useState(false)
  const [notice, setNotice] = useState('')
  const [noticeType, setNoticeType] = useState<'success' | 'error' | ''>('')
  const [applyingId, setApplyingId] = useState('')

  const loadLocalSummary = () => {
    const localHistory = HistoryManager.getHistory() as any[]
    setLocalSummary(computeInsightsSummary(localHistory, range))
  }

  const loadRemoteSummary = async () => {
    setLoadingRemote(true)
    try {
      const response = await fetch(`/api/insights/summary?range=${range}`, {
        method: 'GET',
        credentials: 'include',
      })
      const payload = await response.json().catch(() => ({}))
      if (response.status === 401) {
        setRemoteSummary(null)
        return
      }
      if (!response.ok || payload?.success === false || !payload?.data) {
        throw new Error(payload?.error || '读取云端洞察失败')
      }
      setRemoteSummary(payload.data as InsightsSummary)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '读取云端洞察失败')
      setNoticeType('error')
      setRemoteSummary(null)
    } finally {
      setLoadingRemote(false)
    }
  }

  useEffect(() => {
    loadLocalSummary()
    void loadRemoteSummary()
  }, [range])

  const summary = remoteSummary || localSummary

  const parserLatencyMap = useMemo(() => {
    const snapshots = getAllParserHealthSnapshots()
    const map = new Map<string, number>()
    for (const snapshot of Object.values(snapshots)) {
      const parserName = String(snapshot?.parserName || '').trim()
      if (!parserName) continue
      const latency = Number(snapshot?.lastLatencyMs || 0)
      if (latency > 0) {
        map.set(parserName, latency)
      }
    }
    return map
  }, [summary?.generatedAt])

  const applyRecommendation = async (recommendation: InsightsRecommendation) => {
    setApplyingId(recommendation.id)
    setNotice('')
    setNoticeType('')

    try {
      const actions: Array<{ id: string; payload: Record<string, unknown> }> = []

      if (recommendation.id === 'set_default_parser') {
        const parserName = recommendation.payload.parserName
        const parser = ConfigManager.getParsers().find(item => item.name === parserName)
        if (!parser) {
          throw new Error(`未找到解析器：${parserName}`)
        }
        ConfigManager.updateParser(parser.id, { isDefault: true })
        actions.push({
          id: 'set_default_parser',
          payload: {
            parserId: parser.id,
            parserName: parser.name,
          },
        })
      }

      if (recommendation.id === 'set_retry_policy') {
        ConfigManager.saveRetryPolicyConfig(recommendation.payload)
        actions.push({
          id: 'set_retry_policy',
          payload: recommendation.payload,
        })
      }

      if (recommendation.id === 'set_template_profile') {
        const profiles = ConfigManager.getTemplateProfilesConfig()
        if (!profiles.profiles.some(item => item.id === recommendation.payload.profileId)) {
          throw new Error(`模板不存在：${recommendation.payload.profileId}`)
        }
        ConfigManager.saveTemplateProfilesConfig({
          ...profiles,
          activeProfileId: recommendation.payload.profileId,
        })
        actions.push({
          id: 'set_template_profile',
          payload: recommendation.payload,
        })
      }

      await fetch('/api/insights/recommendations/apply', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ actions }),
      }).catch(() => null)

      loadLocalSummary()
      setNotice('建议已应用')
      setNoticeType('success')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '应用建议失败')
      setNoticeType('error')
    } finally {
      setApplyingId('')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="container mx-auto max-w-6xl px-4 py-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <Link href="/settings">
              <Button variant="ghost" size="sm" className="mb-3">
                <ArrowLeft className="mr-2 h-4 w-4" />
                返回设置
              </Button>
            </Link>
            <h1 className="text-3xl font-bold text-foreground">效率洞察</h1>
            <p className="mt-1 text-sm text-muted-foreground">本地优先聚合统计，云端数据异步校准。</p>
          </div>
          <div className="flex gap-2">
            <Button variant={range === '7d' ? 'default' : 'outline'} onClick={() => setRange('7d')}>
              近 7 天
            </Button>
            <Button variant={range === '30d' ? 'default' : 'outline'} onClick={() => setRange('30d')}>
              近 30 天
            </Button>
            <Button variant="outline" onClick={() => { loadLocalSummary(); void loadRemoteSummary() }}>
              <RefreshCw className="mr-2 h-4 w-4" />
              刷新
            </Button>
          </div>
        </div>

        {notice && (
          <Alert className={`mb-4 ${noticeType === 'error' ? 'border-red-300 dark:border-red-800' : 'border-emerald-300 dark:border-emerald-800'}`}>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}

        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>成功率</CardDescription>
              <CardTitle>{toDisplayText(summary)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>完成任务</CardDescription>
              <CardTitle>{summary?.completed ?? 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>失败任务</CardDescription>
              <CardTitle>{summary?.failed ?? 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>节省操作估算</CardDescription>
              <CardTitle>{summary?.operationSavings.estimatedSavedSteps ?? 0} 步</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                解析器对比
              </CardTitle>
              <CardDescription>结合任务成功率与最近健康快照耗时。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(summary?.parserInsights || []).length === 0 && (
                <div className="text-sm text-muted-foreground">暂无可用解析器统计</div>
              )}
              {(summary?.parserInsights || []).map((item) => (
                <div key={item.parserName} className="rounded-md border p-3">
                  <div className="mb-1 flex items-center justify-between">
                    <div className="font-medium">{item.parserName}</div>
                    <Badge variant="outline">{item.successRate}%</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    成功 {item.success} / 失败 {item.failed} / 样本 {item.total}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    平均耗时：{item.avgLatencyMs > 0 ? `${item.avgLatencyMs}ms` : '-'}
                    {parserLatencyMap.has(item.parserName) ? `（健康快照 ${parserLatencyMap.get(item.parserName)}ms）` : ''}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock3 className="h-5 w-5" />
                失败 Top
              </CardTitle>
              <CardDescription>失败分类用于重试策略优化。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {(summary?.topFailures || []).length === 0 && (
                <div className="text-sm text-muted-foreground">暂无失败记录</div>
              )}
              {(summary?.topFailures || []).map(item => (
                <div key={item.class} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                  <span>{item.class}</span>
                  <Badge variant="outline">{item.count}</Badge>
                </div>
              ))}
              <div className="pt-2 text-xs text-muted-foreground">
                预计节省时长：{summary?.operationSavings.estimatedSavedMinutes ?? 0} 分钟
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5" />
              可操作建议
            </CardTitle>
            <CardDescription>建议可一键应用到本地配置，并尝试回写云端。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(summary?.suggested || []).length === 0 && (
              <div className="text-sm text-muted-foreground">暂无建议</div>
            )}
            {(summary?.suggested || []).map(item => (
              <div key={item.id} className="rounded-md border p-3">
                <div className="mb-1 flex items-center justify-between">
                  <div className="font-medium">{item.title}</div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={applyingId === item.id}
                    onClick={() => void applyRecommendation(item)}
                  >
                    {applyingId === item.id ? '应用中...' : '一键应用'}
                  </Button>
                </div>
                <div className="text-sm text-muted-foreground">{item.description}</div>
              </div>
            ))}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5" />
              数据来源：本地优先{loadingRemote ? '，云端校准中...' : (remoteSummary ? '，云端已校准' : '，云端不可用')}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
