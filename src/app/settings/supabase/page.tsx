'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/contexts/auth-context'
import { SUPABASE_ENABLED } from '@/lib/supabase/enabled'
import { createClient } from '@/lib/supabase/client'
import { ConfigManager, HistoryManager, TagManager } from '@/lib/storage'
import { readSyncStatus } from '@/lib/supabase/sync-status'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

type TestResult = {
  ok: boolean
  title: string
  details?: string
}

function formatError(error: any) {
  if (!error) return ''
  if (typeof error === 'string') return error
  const message = error?.message ?? String(error)
  const code = error?.code ? `code=${error.code}` : ''
  const hint = error?.hint ? `hint=${error.hint}` : ''
  const details = error?.details ? `details=${error.details}` : ''
  return [message, code, hint, details].filter(Boolean).join(' | ')
}

export default function SupabaseSettingsPage() {
  const { user, session, loading } = useAuth()
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<TestResult[]>([])
  const [syncStatus, setSyncStatus] = useState(() => readSyncStatus())

  const envInfo = useMemo(() => {
    return {
      enabled: SUPABASE_ENABLED,
      url: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'set' : 'missing',
      anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'set' : 'missing',
    }
  }, [])

  const runTests = async () => {
    setRunning(true)
    setResults([])
    try {
      if (!SUPABASE_ENABLED) {
        setResults([{ ok: false, title: 'Supabase 未启用', details: '请检查环境变量/开关' }])
        return
      }

      const supabase = createClient()
      const currentUserId = user?.id ?? session?.user?.id
      if (!currentUserId) {
        setResults([{ ok: false, title: '未登录', details: '请先登录再测试读写' }])
        return
      }

      const nextResults: TestResult[] = []

      // 1) 基本查询（用于判断表是否存在 / RLS 是否允许 SELECT）
      {
        const { data, error } = await supabase
          .from('user_configs')
          .select('id, updated_at')
          .eq('user_id', currentUserId)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        nextResults.push({
          ok: !error,
          title: 'user_configs SELECT',
          details: error ? formatError(error) : (data ? 'ok' : 'no rows (will insert on sync)'),
        })
      }

      // 2) 写入配置（用于判断 INSERT/UPDATE policy 是否生效）
      {
        const { updateUserConfig } = await import('@/lib/supabase/database')
        const local = {
          ...ConfigManager.getAppConfig(),
          parsers: ConfigManager.getParsers(),
          webdavServers: ConfigManager.getWebDAVServers(),
          _lastSyncTestAt: new Date().toISOString(),
        }

        try {
          await updateUserConfig(local)
          nextResults.push({ ok: true, title: 'user_configs 写入', details: 'ok' })
        } catch (error) {
          nextResults.push({ ok: false, title: 'user_configs 写入', details: formatError(error) })
        }
      }

      // 3) 写入一条历史记录（用于判断 history_records 写入是否被 UUID / RLS / 表缺失拦住）
      {
        const { addHistoryRecord } = await import('@/lib/supabase/database')
        const id = globalThis.crypto?.randomUUID?.() ?? `tmp_${Date.now()}`
        const nowIso = new Date().toISOString()
        const record = {
          id,
          type: 'single',
          task: {
            id,
            videoUrl: 'https://example.invalid',
            status: 'success',
            createdAt: nowIso,
            completedAt: nowIso,
          },
          createdAt: nowIso,
        }

        try {
          await addHistoryRecord(record)
          nextResults.push({ ok: true, title: 'history_records 写入', details: 'ok' })
        } catch (error) {
          nextResults.push({ ok: false, title: 'history_records 写入', details: formatError(error) })
        }
      }

      // 4) 读取 history_records 数量（确认写入落库）
      {
        const { count, error } = await supabase
          .from('history_records')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', currentUserId)

        nextResults.push({
          ok: !error,
          title: 'history_records COUNT',
          details: error ? formatError(error) : `count=${count ?? 0}`,
        })
      }

      // 5) 触发一次“本地 -> 云端”推送（如果你本地已有历史/标签/配置）
      {
        const { updateUserConfig, addHistoryRecord, addTag } = await import('@/lib/supabase/database')

        const payload = {
          ...ConfigManager.getAppConfig(),
          parsers: ConfigManager.getParsers(),
          webdavServers: ConfigManager.getWebDAVServers(),
        }
        await updateUserConfig(payload)

        const localHistory = HistoryManager.getHistory().slice(0, 50)
        for (const r of localHistory) {
          await addHistoryRecord(r)
        }

        const localTags = TagManager.getTags()
        for (const t of localTags) {
          await addTag(t)
        }

        nextResults.push({
          ok: true,
          title: '触发本地数据推送',
          details: `history=${localHistory.length}, tags=${localTags.length}`,
        })
      }

      setResults(nextResults)
      setSyncStatus(readSyncStatus())
    } catch (error) {
      setResults(prev => prev.concat([{ ok: false, title: '测试异常', details: formatError(error) }]))
      setSyncStatus(readSyncStatus())
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Supabase 同步诊断</h1>
            <p className="text-sm text-muted-foreground mt-1">
              用于排查：配置/历史记录为什么没有写入数据库
            </p>
          </div>
          <Link href="/settings">
            <Button variant="outline" size="sm">返回设置</Button>
          </Link>
        </div>

        {!SUPABASE_ENABLED && (
          <Alert className="mb-4">
            <AlertDescription>
              Supabase 当前为禁用状态（或缺少环境变量）。请在部署平台配置 `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`，
              并确保构建时注入。
            </AlertDescription>
          </Alert>
        )}

        <Card className="border-none shadow-lg bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>当前状态</CardTitle>
            <CardDescription>快速确认环境变量、登录态、以及是否能读写表</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm">
              <div>SUPABASE_ENABLED: {String(envInfo.enabled)}</div>
              <div>NEXT_PUBLIC_SUPABASE_URL: {envInfo.url}</div>
              <div>NEXT_PUBLIC_SUPABASE_ANON_KEY: {envInfo.anonKey}</div>
              <div>Auth loading: {String(loading)}</div>
              <div>User: {user?.id ? user.id : 'null'}</div>
            </div>

            <div className="text-xs text-muted-foreground">
              <div>Last sync (config): {syncStatus.config.okAt ?? syncStatus.config.errorAt ?? '-'}</div>
              <div>Last sync (history): {syncStatus.history.okAt ?? syncStatus.history.errorAt ?? '-'}</div>
              <div>Last sync (tags): {syncStatus.tags.okAt ?? syncStatus.tags.errorAt ?? '-'}</div>
              <div>Last hydrate: {syncStatus.hydrate.okAt ?? syncStatus.hydrate.errorAt ?? '-'}</div>
              {syncStatus.config.error && <div>config error: {syncStatus.config.error}</div>}
              {syncStatus.history.error && <div>history error: {syncStatus.history.error}</div>}
              {syncStatus.tags.error && <div>tags error: {syncStatus.tags.error}</div>}
            </div>

            <Button onClick={runTests} disabled={running || loading}>
              {running ? '测试中...' : '开始读写测试 + 推送本地数据'}
            </Button>

            {results.length > 0 && (
              <div className="space-y-2">
                {results.map((r, idx) => (
                  <div
                    key={idx}
                    className={`rounded-md border px-3 py-2 text-sm ${r.ok ? 'border-emerald-300/60 bg-emerald-50/60 dark:bg-emerald-950/20' : 'border-red-300/60 bg-red-50/60 dark:bg-red-950/20'}`}
                  >
                    <div className="font-medium">{r.ok ? '✅' : '❌'} {r.title}</div>
                    {r.details && <div className="text-muted-foreground mt-0.5 break-words">{r.details}</div>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
