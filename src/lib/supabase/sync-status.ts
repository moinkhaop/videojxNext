type SyncScope = 'config' | 'history' | 'tags' | 'cleanup' | 'hydrate'

type SyncScopeStatus = {
  okAt?: string
  errorAt?: string
  error?: string
}

type SyncStatus = Record<SyncScope, SyncScopeStatus>

const KEY = 'dyjx_supabase_sync_status'

const emptyStatus = (): SyncStatus => ({
  config: {},
  history: {},
  tags: {},
  cleanup: {},
  hydrate: {},
})

const formatError = (error: unknown) => {
  if (!error) return ''
  if (typeof error === 'string') return error
  const anyErr = error as any
  const message = anyErr?.message ?? String(error)
  const code = anyErr?.code ? `code=${anyErr.code}` : ''
  const hint = anyErr?.hint ? `hint=${anyErr.hint}` : ''
  const details = anyErr?.details ? `details=${anyErr.details}` : ''
  return [message, code, hint, details].filter(Boolean).join(' | ')
}

export function readSyncStatus(): SyncStatus {
  if (typeof window === 'undefined') return emptyStatus()
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return emptyStatus()
    return { ...emptyStatus(), ...(JSON.parse(raw) as any) }
  } catch {
    return emptyStatus()
  }
}

function writeSyncStatus(status: SyncStatus) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KEY, JSON.stringify(status))
  } catch {
    // ignore
  }
}

export function markSyncOk(scope: SyncScope) {
  const status = readSyncStatus()
  status[scope] = { okAt: new Date().toISOString() }
  writeSyncStatus(status)
}

export function markSyncError(scope: SyncScope, error: unknown) {
  const status = readSyncStatus()
  status[scope] = {
    errorAt: new Date().toISOString(),
    error: formatError(error),
  }
  writeSyncStatus(status)
}

