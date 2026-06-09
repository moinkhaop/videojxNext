import {
  AppConfig,
  NotificationSettings,
  RetryPolicyConfig,
  TemplateProfilesConfig,
  NamingTemplateProfile,
} from '../../types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const ACTIVE_USER_STORAGE_KEY = 'dyjx_active_user_id'
export const GUEST_STORAGE_SCOPE = 'guest'
export const DEFAULT_TEMPLATE_PROFILE_ID = 'balanced'
export const DEFAULT_UPLOAD_FOLDER_TEMPLATE = '{author}'
export const DEFAULT_UPLOAD_FILE_TEMPLATE = '{awemeId}_{title}'

export const DEFAULT_TEMPLATE_PROFILES: NamingTemplateProfile[] = [
  {
    id: 'safe',
    name: '保守模式',
    folderTemplate: '{author}',
    fileTemplate: '{title}',
  },
  {
    id: 'balanced',
    name: '信息丰富',
    folderTemplate: '{author}',
    fileTemplate: '{awemeId}_{title}',
  },
  {
    id: 'by_date',
    name: '按日期归档',
    folderTemplate: '{date}/{author}',
    fileTemplate: '{awemeId}_{title}',
  },
]

export const DEFAULT_RETRY_POLICY: RetryPolicyConfig = {
  retryableClasses: ['timeout', 'network', 'http5xx'],
  maxRetries: 2,
  baseDelayMs: 600,
  maxDelayMs: 12000,
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: true,
  success: false,
  failure: true,
  batchDone: true,
  quietHoursStart: '23:00',
  quietHoursEnd: '08:00',
}

export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID_RE.test(value)

export const createUuid = (): string => {
  const uuid = (globalThis as any)?.crypto?.randomUUID
  if (typeof uuid === 'function') {
    return uuid.call((globalThis as any).crypto)
  }

  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.map(b => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function asObject(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, any>
}

export function normalizeTemplateProfiles(input: unknown): TemplateProfilesConfig {
  const source = input && typeof input === 'object' ? (input as Record<string, any>) : {}
  const rawProfiles = Array.isArray(source.profiles) ? source.profiles : DEFAULT_TEMPLATE_PROFILES
  const profiles: NamingTemplateProfile[] = []
  const seen = new Set<string>()

  for (const raw of rawProfiles) {
    const id = String(raw?.id || '').trim() || createUuid()
    if (seen.has(id)) continue
    seen.add(id)
    profiles.push({
      id,
      name: String(raw?.name || '未命名模板').trim() || '未命名模板',
      folderTemplate: String(raw?.folderTemplate || DEFAULT_UPLOAD_FOLDER_TEMPLATE).trim() || DEFAULT_UPLOAD_FOLDER_TEMPLATE,
      fileTemplate: String(raw?.fileTemplate || DEFAULT_UPLOAD_FILE_TEMPLATE).trim() || DEFAULT_UPLOAD_FILE_TEMPLATE,
    })
  }

  const safeProfiles = profiles.length > 0 ? profiles : [...DEFAULT_TEMPLATE_PROFILES]
  const activeProfileId = String(source.activeProfileId || '').trim()
  const preferredActiveId = safeProfiles.some(item => item.id === DEFAULT_TEMPLATE_PROFILE_ID)
    ? DEFAULT_TEMPLATE_PROFILE_ID
    : safeProfiles[0].id
  const hasActive = safeProfiles.some(item => item.id === activeProfileId)
  return {
    activeProfileId: hasActive ? activeProfileId : preferredActiveId,
    profiles: safeProfiles,
  }
}

export function normalizeRetryPolicy(input: unknown): RetryPolicyConfig {
  const source = input && typeof input === 'object' ? (input as Record<string, any>) : {}
  const classes = Array.isArray(source.retryableClasses) ? source.retryableClasses : DEFAULT_RETRY_POLICY.retryableClasses
  const allowed = new Set(['timeout', 'network', 'http4xx', 'http5xx', 'invalid_payload', 'unknown'])
  const retryableClasses = Array.from(new Set(classes.map(item => String(item || '').trim()).filter(item => allowed.has(item))))
  return {
    retryableClasses: (retryableClasses.length > 0 ? retryableClasses : DEFAULT_RETRY_POLICY.retryableClasses) as RetryPolicyConfig['retryableClasses'],
    maxRetries: Math.max(0, Math.min(5, Number(source.maxRetries ?? DEFAULT_RETRY_POLICY.maxRetries))),
    baseDelayMs: Math.max(150, Math.min(60000, Number(source.baseDelayMs ?? DEFAULT_RETRY_POLICY.baseDelayMs))),
    maxDelayMs: Math.max(300, Math.min(120000, Number(source.maxDelayMs ?? DEFAULT_RETRY_POLICY.maxDelayMs))),
  }
}

export function normalizeNotificationSettings(input: unknown): NotificationSettings {
  const source = input && typeof input === 'object' ? (input as Record<string, any>) : {}
  const quietHoursStart = /^\d{2}:\d{2}$/.test(String(source.quietHoursStart || ''))
    ? String(source.quietHoursStart)
    : DEFAULT_NOTIFICATION_SETTINGS.quietHoursStart
  const quietHoursEnd = /^\d{2}:\d{2}$/.test(String(source.quietHoursEnd || ''))
    ? String(source.quietHoursEnd)
    : DEFAULT_NOTIFICATION_SETTINGS.quietHoursEnd
  return {
    enabled: source.enabled !== false,
    success: source.success === true,
    failure: source.failure !== false,
    batchDone: source.batchDone !== false,
    quietHoursStart,
    quietHoursEnd,
  }
}

function ensureTemplateProfile(
  config: TemplateProfilesConfig,
  profileId: string,
  folderTemplate: string,
  fileTemplate: string
): TemplateProfilesConfig {
  const next = normalizeTemplateProfiles(config)
  const targetIndex = next.profiles.findIndex(item => item.id === profileId)
  const patched = [...next.profiles]
  const nextProfile: NamingTemplateProfile = {
    id: profileId,
    name: targetIndex >= 0 ? patched[targetIndex].name : '当前模板',
    folderTemplate,
    fileTemplate,
  }
  if (targetIndex >= 0) {
    patched[targetIndex] = {
      ...patched[targetIndex],
      ...nextProfile,
    }
  } else {
    patched.unshift(nextProfile)
  }
  return normalizeTemplateProfiles({
    activeProfileId: profileId,
    profiles: patched,
  })
}

export function normalizeAppConfig(input: unknown): AppConfig {
  const source = asObject(input)
  const themeCandidate = String(source.theme || 'system')
  const theme: AppConfig['theme'] =
    themeCandidate === 'light' || themeCandidate === 'dark' || themeCandidate === 'system'
      ? themeCandidate
      : 'system'

  // 兼容旧版本仅保存 uploadFolderTemplate / uploadFileTemplate 的配置结构。
  const rawLegacyFolder = String(source.uploadFolderTemplate || '').trim()
  const rawLegacyFile = String(source.uploadFileTemplate || '').trim()
  const hasLegacyTemplates = Boolean(rawLegacyFolder || rawLegacyFile)
  const folderTemplate = rawLegacyFolder || DEFAULT_UPLOAD_FOLDER_TEMPLATE
  const fileTemplate = rawLegacyFile || DEFAULT_UPLOAD_FILE_TEMPLATE

  const hasTemplateProfiles =
    source.templateProfiles &&
    typeof source.templateProfiles === 'object' &&
    !Array.isArray(source.templateProfiles)
  let templateProfiles = normalizeTemplateProfiles(source.templateProfiles)
  if (!hasTemplateProfiles && hasLegacyTemplates) {
    templateProfiles = ensureTemplateProfile(templateProfiles, 'legacy_current', folderTemplate, fileTemplate)
  }

  const activeProfile = templateProfiles.profiles.find(item => item.id === templateProfiles.activeProfileId) || null
  const normalizedFolderTemplate = folderTemplate || activeProfile?.folderTemplate || DEFAULT_UPLOAD_FOLDER_TEMPLATE
  const normalizedFileTemplate = fileTemplate || activeProfile?.fileTemplate || DEFAULT_UPLOAD_FILE_TEMPLATE
  if (activeProfile && (
    activeProfile.folderTemplate !== normalizedFolderTemplate ||
    activeProfile.fileTemplate !== normalizedFileTemplate
  )) {
    templateProfiles = ensureTemplateProfile(
      templateProfiles,
      templateProfiles.activeProfileId,
      normalizedFolderTemplate,
      normalizedFileTemplate
    )
  }

  return {
    parsers: Array.isArray(source.parsers) ? source.parsers : [],
    webdavServers: Array.isArray(source.webdavServers) ? source.webdavServers : [],
    theme,
    uploadFolderTemplate: normalizedFolderTemplate,
    uploadFileTemplate: normalizedFileTemplate,
    retryPolicy: normalizeRetryPolicy(source.retryPolicy),
    notifications: normalizeNotificationSettings(source.notifications),
    templateProfiles,
  }
}

export function resolveStorageScope() {
  if (typeof window === 'undefined') {
    return GUEST_STORAGE_SCOPE
  }

  try {
    const activeUserId = window.localStorage.getItem(ACTIVE_USER_STORAGE_KEY)
    if (isUuid(activeUserId)) {
      return `user:${activeUserId}`
    }
  } catch {
  }

  return GUEST_STORAGE_SCOPE
}

export function getScopedStorageKey(baseKey: string, scope = resolveStorageScope()) {
  return `${baseKey}::${scope}`
}

export function getScopedStorageItem(baseKey: string): string | null {
  if (typeof window === 'undefined') {
    return null
  }

  const scope = resolveStorageScope()
  const scopedKey = getScopedStorageKey(baseKey, scope)

  const scopedValue = window.localStorage.getItem(scopedKey)
  if (scopedValue !== null) {
    return scopedValue
  }

  // 兼容旧版本未分桶数据，仅在游客桶下读取一次。
  if (scope === GUEST_STORAGE_SCOPE) {
    return window.localStorage.getItem(baseKey)
  }

  return null
}

export function setScopedStorageItem(baseKey: string, value: string) {
  if (typeof window === 'undefined') {
    return
  }

  const scope = resolveStorageScope()
  const scopedKey = getScopedStorageKey(baseKey, scope)
  window.localStorage.setItem(scopedKey, value)
}

export function removeScopedStorageItem(baseKey: string) {
  if (typeof window === 'undefined') {
    return
  }

  const scope = resolveStorageScope()
  const scopedKey = getScopedStorageKey(baseKey, scope)
  window.localStorage.removeItem(scopedKey)

  if (scope === GUEST_STORAGE_SCOPE) {
    window.localStorage.removeItem(baseKey)
  }
}
