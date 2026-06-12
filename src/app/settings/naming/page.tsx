'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, RefreshCw, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ConfigManager, HistoryManager } from '@/lib/storage'
import { FilenameSanitizer } from '@/lib/filename-sanitizer'
import type { NamingTemplateProfile, TemplateProfilesConfig } from '@/types'

const TOKENS = ['author', 'title', 'awemeId', 'date', 'mediaType', 'index'] as const
const TOKEN_SET = new Set<string>(TOKENS)
const ILLEGAL_FOLDER = /[<>:"\\|?*\x00-\x1F]/
const ILLEGAL_FILE = /[<>:"/\\|?*\x00-\x1F]/

type Sample = {
  author: string
  title: string
  awemeId: string
  date: string
  mediaType: string
  index: string
}

const BUILTIN_PROFILES: NamingTemplateProfile[] = [
  { id: 'safe', name: '保守模式', folderTemplate: '{author}', fileTemplate: '{title}' },
  { id: 'balanced', name: '信息丰富', folderTemplate: '{author}', fileTemplate: '{awemeId}_{title}' },
  { id: 'by_date', name: '按日期归档', folderTemplate: '{date}/{author}', fileTemplate: '{awemeId}_{title}' },
]

function toDateToken(value: unknown) {
  const parsed = Date.parse(String(value || ''))
  const date = Number.isFinite(parsed) ? new Date(parsed) : new Date()
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function detectUnknownTokens(template: string) {
  const unknown: string[] = []
  const matched = template.match(/\{([a-zA-Z0-9_]+)\}/g) || []
  for (const raw of matched) {
    const key = raw.slice(1, -1)
    if (!TOKEN_SET.has(key) && !unknown.includes(key)) {
      unknown.push(key)
    }
  }
  return unknown
}

function resolveTemplate(template: string, sample: Sample) {
  return String(template || '').replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => {
    const value = (sample as Record<string, string>)[key]
    return String(value ?? '')
  })
}

function sanitizeFolderPath(pathLike: string) {
  return String(pathLike || '')
    .split(/[\\/]+/)
    .map(item => FilenameSanitizer.sanitize(item, { preserveExtension: false, replacement: '_', maxLength: 50 }))
    .filter(Boolean)
    .join('/')
}

function sanitizeFileName(fileLike: string) {
  return FilenameSanitizer.sanitize(fileLike, {
    preserveExtension: false,
    replacement: '_',
    maxLength: 100,
  })
}

function validateTemplate(folderTemplate: string, fileTemplate: string, sample: Sample) {
  const errors: string[] = []
  if (!String(folderTemplate || '').trim()) {
    errors.push('目录模板不能为空')
  }
  if (!String(fileTemplate || '').trim()) {
    errors.push('文件模板不能为空')
  }
  if (ILLEGAL_FOLDER.test(folderTemplate)) {
    errors.push('目录模板包含非法字符')
  }
  if (ILLEGAL_FILE.test(fileTemplate)) {
    errors.push('文件模板包含非法字符')
  }
  const folderUnknown = detectUnknownTokens(folderTemplate)
  const fileUnknown = detectUnknownTokens(fileTemplate)
  if (folderUnknown.length > 0 || fileUnknown.length > 0) {
    const unknown = Array.from(new Set(folderUnknown.concat(fileUnknown)))
    errors.push(`存在未支持 token：${unknown.join(', ')}`)
  }

  const resolvedFolder = resolveTemplate(folderTemplate, sample)
  const resolvedFile = resolveTemplate(fileTemplate, sample)
  const folderPath = sanitizeFolderPath(resolvedFolder || 'unknown')
  const fileName = sanitizeFileName(resolvedFile || 'untitled')
  if (folderPath.length > 180) {
    errors.push('目录结果过长，请缩短模板')
  }
  if (fileName.length > 100) {
    errors.push('文件名结果过长，请缩短模板')
  }
  return errors
}

function buildSample(): Sample {
  const history = HistoryManager.getHistory() as any[]
  for (const row of history) {
    const detail = row && typeof row.detail === 'object' ? row.detail : {}
    const task = row && typeof row.task === 'object' ? row.task : {}
    const parsed = task && typeof task.parsedVideoInfo === 'object' ? task.parsedVideoInfo : {}
    const author = String(detail.author || parsed.author || '').trim()
    const title = String(row?.title || task.videoTitle || parsed.title || '').trim()
    const awemeId = String(detail.awemeId || '').trim()
    if (!author && !title && !awemeId) {
      continue
    }
    return {
      author: author || 'unknown',
      title: title || 'untitled',
      awemeId: awemeId || 'unknown',
      date: toDateToken(row?.createdAt || Date.now()),
      mediaType: String(detail.mediaType || parsed.mediaType || 'video'),
      index: '1',
    }
  }
  return {
    author: 'unknown',
    title: 'untitled',
    awemeId: 'unknown',
    date: toDateToken(Date.now()),
    mediaType: 'video',
    index: '1',
  }
}

export default function NamingWorkbenchPage() {
  const folderRef = useRef<HTMLInputElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const [profilesConfig, setProfilesConfig] = useState<TemplateProfilesConfig | null>(null)
  const [activeProfileId, setActiveProfileId] = useState('balanced')
  const [folderTemplate, setFolderTemplate] = useState('{author}')
  const [fileTemplate, setFileTemplate] = useState('{awemeId}_{title}')
  const [focusedField, setFocusedField] = useState<'folder' | 'file'>('file')
  const [sample, setSample] = useState<Sample>(buildSample())
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'success' | 'error' | ''>('')

  useEffect(() => {
    const nextConfig = ConfigManager.getTemplateProfilesConfig()
    setProfilesConfig(nextConfig)
    setActiveProfileId(nextConfig.activeProfileId)
    const active = nextConfig.profiles.find(item => item.id === nextConfig.activeProfileId) || nextConfig.profiles[0]
    if (active) {
      setFolderTemplate(active.folderTemplate)
      setFileTemplate(active.fileTemplate)
    }
    setSample(buildSample())
  }, [])

  const validationErrors = useMemo(
    () => validateTemplate(folderTemplate, fileTemplate, sample),
    [folderTemplate, fileTemplate, sample]
  )

  const preview = useMemo(() => {
    const resolvedFolder = resolveTemplate(folderTemplate, sample)
    const resolvedFile = resolveTemplate(fileTemplate, sample)
    const folderPath = sanitizeFolderPath(resolvedFolder || 'unknown')
    const fileName = sanitizeFileName(resolvedFile || 'untitled')
    const warn: string[] = []
    if (folderPath.length > 180) {
      warn.push('目录预览过长，建议精简')
    }
    if (fileName.length > 100) {
      warn.push('文件名预览过长，建议精简')
    }
    return {
      folderPath,
      fileName,
      warn,
    }
  }, [folderTemplate, fileTemplate, sample])

  const insertToken = (token: string) => {
    const target = focusedField === 'folder' ? folderRef.current : fileRef.current
    if (!target) return
    const value = target.value
    const start = target.selectionStart ?? value.length
    const end = target.selectionEnd ?? value.length
    const next = `${value.slice(0, start)}{${token}}${value.slice(end)}`
    if (focusedField === 'folder') {
      setFolderTemplate(next)
    } else {
      setFileTemplate(next)
    }
    requestAnimationFrame(() => {
      target.focus()
      const pos = start + token.length + 2
      target.setSelectionRange(pos, pos)
    })
  }

  const applyBuiltinProfile = (profileId: string) => {
    const profile = BUILTIN_PROFILES.find(item => item.id === profileId)
    if (!profile) return
    setActiveProfileId(profile.id)
    setFolderTemplate(profile.folderTemplate)
    setFileTemplate(profile.fileTemplate)
    setMessage('')
    setMessageType('')
  }

  const updateActiveProfile = (config: TemplateProfilesConfig) => {
    const profiles = [...config.profiles]
    const idx = profiles.findIndex(item => item.id === activeProfileId)
    const nextProfile: NamingTemplateProfile = {
      id: activeProfileId || `profile_${Date.now()}`,
      name: profiles[idx]?.name || '自定义模板',
      folderTemplate,
      fileTemplate,
    }
    if (idx >= 0) {
      profiles[idx] = { ...profiles[idx], ...nextProfile }
    } else {
      profiles.unshift(nextProfile)
    }
    return {
      activeProfileId: nextProfile.id,
      profiles,
    }
  }

  const saveTemplate = () => {
    if (validationErrors.length > 0) {
      setMessage(validationErrors[0])
      setMessageType('error')
      return
    }
    const baseConfig = profilesConfig || ConfigManager.getTemplateProfilesConfig()
    const next = updateActiveProfile(baseConfig)
    ConfigManager.saveTemplateProfilesConfig(next)
    setProfilesConfig(ConfigManager.getTemplateProfilesConfig())
    setMessage('模板已保存并生效')
    setMessageType('success')
  }

  const resetDefaults = () => {
    ConfigManager.resetTemplateProfilesToDefault()
    const nextConfig = ConfigManager.getTemplateProfilesConfig()
    setProfilesConfig(nextConfig)
    setActiveProfileId(nextConfig.activeProfileId)
    const active = nextConfig.profiles.find(item => item.id === nextConfig.activeProfileId) || nextConfig.profiles[0]
    setFolderTemplate(active?.folderTemplate || '{author}')
    setFileTemplate(active?.fileTemplate || '{awemeId}_{title}')
    setMessage('已恢复默认模板')
    setMessageType('success')
  }

  const allProfiles = profilesConfig?.profiles || BUILTIN_PROFILES

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="container mx-auto px-4 py-6 max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <Link href="/settings">
              <Button variant="ghost" size="sm" className="mb-3">
                <ArrowLeft className="mr-2 h-4 w-4" />
                返回设置
              </Button>
            </Link>
            <h1 className="text-3xl font-bold text-foreground">命名模板工作台</h1>
            <p className="mt-1 text-sm text-muted-foreground">实时预览目录与文件名，保存前自动校验规则。</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setSample(buildSample())}>
              <RefreshCw className="mr-2 h-4 w-4" />
              刷新样本
            </Button>
            <Button variant="outline" onClick={resetDefaults}>恢复默认</Button>
            <Button onClick={saveTemplate}>
              <Save className="mr-2 h-4 w-4" />
              保存模板
            </Button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>模板编辑</CardTitle>
              <CardDescription>支持 token：{TOKENS.map(item => `{${item}}`).join(' ')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex flex-wrap gap-2">
                {BUILTIN_PROFILES.map(profile => (
                  <Button
                    key={profile.id}
                    size="sm"
                    variant={activeProfileId === profile.id ? 'default' : 'outline'}
                    onClick={() => applyBuiltinProfile(profile.id)}
                  >
                    {profile.name}
                  </Button>
                ))}
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">当前配置</div>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={activeProfileId}
                  onChange={(event) => {
                    const nextId = event.target.value
                    setActiveProfileId(nextId)
                    const profile = allProfiles.find(item => item.id === nextId)
                    if (profile) {
                      setFolderTemplate(profile.folderTemplate)
                      setFileTemplate(profile.fileTemplate)
                    }
                  }}
                >
                  {allProfiles.map(profile => (
                    <option value={profile.id} key={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">目录模板</div>
                <Input
                  ref={folderRef}
                  value={folderTemplate}
                  onFocus={() => setFocusedField('folder')}
                  onChange={(event) => setFolderTemplate(event.target.value)}
                  placeholder="{author}"
                />
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">文件模板</div>
                <Input
                  ref={fileRef}
                  value={fileTemplate}
                  onFocus={() => setFocusedField('file')}
                  onChange={(event) => setFileTemplate(event.target.value)}
                  placeholder="{awemeId}_{title}"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {TOKENS.map(token => (
                  <Button key={token} size="sm" variant="outline" onClick={() => insertToken(token)}>
                    {`{${token}}`}
                  </Button>
                ))}
              </div>

              {validationErrors.length > 0 && (
                <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/20 dark:text-red-300">
                  {validationErrors.map(item => (
                    <div key={item}>- {item}</div>
                  ))}
                </div>
              )}

              {message && (
                <div className={`rounded-md border p-3 text-sm ${messageType === 'success' ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300' : 'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/20 dark:text-red-300'}`}>
                  {messageType === 'success' && <CheckCircle2 className="mr-2 inline h-4 w-4" />}
                  {message}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>实时预览</CardTitle>
              <CardDescription>预览结果与保存后的实际路径保持一致。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <div className="text-muted-foreground">样本作者</div>
                <div>{sample.author}</div>
              </div>
              <div>
                <div className="text-muted-foreground">样本标题</div>
                <div className="line-clamp-2">{sample.title}</div>
              </div>
              <div>
                <div className="text-muted-foreground">预览目录</div>
                <code className="block rounded bg-muted p-2 text-xs">{preview.folderPath || '-'}</code>
              </div>
              <div>
                <div className="text-muted-foreground">预览文件名</div>
                <code className="block rounded bg-muted p-2 text-xs">{preview.fileName || '-'}</code>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{`awemeId=${sample.awemeId}`}</Badge>
                <Badge variant="outline">{`date=${sample.date}`}</Badge>
              </div>
              {preview.warn.map(item => (
                <div key={item} className="text-xs text-amber-600 dark:text-amber-400">
                  {item}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
