import type {
  ParserAttemptResult,
  ParserErrorClass,
  ParserHealthSnapshot,
} from '@/types'

const STORE_KEY = 'dyjx_parser_health_v1'
const RETENTION_MS = 24 * 60 * 60 * 1000
const MAX_ATTEMPTS_PER_PARSER = 240
const DEFAULT_COOLDOWN_MS = 10 * 60 * 1000
const DEFAULT_FAILURE_THRESHOLD = 3

type ParserHealthStore = {
  attemptsByParser: Record<string, ParserAttemptResult[]>
  snapshotsByParser: Record<string, ParserHealthSnapshot>
}

const emptyStore = (): ParserHealthStore => ({
  attemptsByParser: {},
  snapshotsByParser: {},
})

export function classifyParserFailure(input: {
  status?: number
  error?: unknown
  message?: string
}): ParserErrorClass {
  const status = Number(input.status)
  if (Number.isFinite(status) && status >= 400 && status < 500) {
    return 'http4xx'
  }
  if (Number.isFinite(status) && status >= 500) {
    return 'http5xx'
  }

  const raw = [
    typeof input.message === 'string' ? input.message : '',
    input.error instanceof Error ? input.error.message : '',
    typeof input.error === 'string' ? input.error : '',
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  if (!raw) return 'unknown'

  const hintedStatusMatch = raw.match(
    /\bhttp[\s:/-]*([45]\d{2})\b|\bstatus[\s:=]*([45]\d{2})\b|[\(（]([45]\d{2})[\)）]/
  )
  const hintedStatus = Number(
    hintedStatusMatch?.[1]
      ?? hintedStatusMatch?.[2]
      ?? hintedStatusMatch?.[3]
      ?? NaN
  )
  if (Number.isFinite(hintedStatus) && hintedStatus >= 400 && hintedStatus < 500) {
    return 'http4xx'
  }
  if (Number.isFinite(hintedStatus) && hintedStatus >= 500) {
    return 'http5xx'
  }

  if (/(abort|aborted|timeout|timed out|超时|中止)/i.test(raw)) {
    return 'timeout'
  }
  if (/(network|fetch failed|failed to fetch|econn|enotfound|dns|socket|连接失败|不可达)/i.test(raw)) {
    return 'network'
  }
  if (/(non-json|json|空响应|empty response|无法解析|invalid|payload|格式)/i.test(raw)) {
    return 'invalid_payload'
  }
  return 'unknown'
}

export function getParserHealthConfig() {
  return {
    cooldownMs: getEnvNumber('NEXT_PUBLIC_PARSER_HEALTH_COOLDOWN_MS', DEFAULT_COOLDOWN_MS, 5_000, 24 * 60 * 60 * 1000),
    failureThreshold: getEnvNumber('NEXT_PUBLIC_PARSER_FAILURE_THRESHOLD', DEFAULT_FAILURE_THRESHOLD, 1, 20),
  }
}

export function recordParserAttempt(attempt: ParserAttemptResult) {
  if (!attempt?.parserId) return

  const store = readStore()
  const parserId = attempt.parserId
  const attempts = Array.isArray(store.attemptsByParser[parserId]) ? [...store.attemptsByParser[parserId]] : []
  attempts.push(normalizeAttempt(attempt))

  const now = Date.now()
  const freshAttempts = attempts
    .filter(item => {
      const ts = Date.parse(item.checkedAt)
      return Number.isFinite(ts) && now - ts <= RETENTION_MS
    })
    .slice(-MAX_ATTEMPTS_PER_PARSER)

  store.attemptsByParser[parserId] = freshAttempts
  store.snapshotsByParser[parserId] = buildSnapshot(parserId, freshAttempts, store.snapshotsByParser[parserId])
  writeStore(store)
}

export function getParserHealthSnapshot(parserId: string): ParserHealthSnapshot | null {
  if (!parserId) return null
  const store = readStore()
  const snapshot = store.snapshotsByParser[parserId]
  if (!snapshot) return null
  return { ...snapshot }
}

export function getAllParserHealthSnapshots(): Record<string, ParserHealthSnapshot> {
  const store = readStore()
  return { ...store.snapshotsByParser }
}

export function isParserCoolingDown(parserId: string, now = Date.now()): boolean {
  const snapshot = getParserHealthSnapshot(parserId)
  if (!snapshot?.cooldownUntil) return false
  const until = Date.parse(snapshot.cooldownUntil)
  return Number.isFinite(until) && until > now
}

export function scoreParserHealth(snapshot: ParserHealthSnapshot | null | undefined): number {
  if (!snapshot) return 0

  const now = Date.now()
  if (snapshot.cooldownUntil) {
    const until = Date.parse(snapshot.cooldownUntil)
    if (Number.isFinite(until) && until > now) {
      return -10_000
    }
  }

  const successScore = snapshot.successRate24h * 100
  const reliabilityPenalty = snapshot.consecutiveFailures * 18
  const latencyPenalty = snapshot.lastLatencyMs ? Math.min(40, snapshot.lastLatencyMs / 200) : 0
  const sampleBonus = Math.min(20, snapshot.recentAttempts)

  return successScore + sampleBonus - reliabilityPenalty - latencyPenalty
}

function normalizeAttempt(attempt: ParserAttemptResult): ParserAttemptResult {
  return {
    ...attempt,
    checkedAt: attempt.checkedAt || new Date().toISOString(),
    latencyMs: Number.isFinite(attempt.latencyMs) ? Math.max(0, Math.trunc(attempt.latencyMs)) : 0,
  }
}

function buildSnapshot(
  parserId: string,
  attempts: ParserAttemptResult[],
  prev?: ParserHealthSnapshot
): ParserHealthSnapshot {
  const now = Date.now()
  const { cooldownMs, failureThreshold } = getParserHealthConfig()
  const sorted = [...attempts].sort((a, b) => Date.parse(a.checkedAt) - Date.parse(b.checkedAt))
  const recentCount = sorted.length
  const successCount = sorted.reduce((acc, item) => acc + (item.success ? 1 : 0), 0)
  const successRate24h = recentCount > 0 ? successCount / recentCount : 0

  let consecutiveFailures = 0
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].success) break
    consecutiveFailures++
  }

  const lastAttempt = sorted[sorted.length - 1]
  const previousCooldown = prev?.cooldownUntil ? Date.parse(prev.cooldownUntil) : NaN
  let cooldownUntil = ''

  if (consecutiveFailures >= failureThreshold && lastAttempt && !lastAttempt.success) {
    const latest = Date.parse(lastAttempt.checkedAt)
    const startAt = Number.isFinite(latest) ? latest : now
    cooldownUntil = new Date(startAt + cooldownMs).toISOString()
  } else if (Number.isFinite(previousCooldown) && previousCooldown > now) {
    cooldownUntil = new Date(previousCooldown).toISOString()
  }

  return {
    parserId,
    parserName: lastAttempt?.parserName || prev?.parserName,
    parserUrl: lastAttempt?.parserUrl || prev?.parserUrl,
    successRate24h,
    recentAttempts: recentCount,
    consecutiveFailures,
    cooldownUntil: cooldownUntil || undefined,
    lastLatencyMs: lastAttempt?.latencyMs ?? prev?.lastLatencyMs,
    lastError: lastAttempt?.success ? undefined : (lastAttempt?.errorMessage || prev?.lastError),
    updatedAt: new Date().toISOString(),
  }
}

function readStore(): ParserHealthStore {
  if (typeof window === 'undefined') return emptyStore()

  try {
    const raw = window.localStorage.getItem(STORE_KEY)
    if (!raw) return emptyStore()

    const parsed = JSON.parse(raw) as ParserHealthStore
    if (!parsed || typeof parsed !== 'object') return emptyStore()

    return {
      attemptsByParser: parsed.attemptsByParser ?? {},
      snapshotsByParser: parsed.snapshotsByParser ?? {},
    }
  } catch {
    return emptyStore()
  }
}

function writeStore(store: ParserHealthStore) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(store))
  } catch {
    // ignore write failures
  }
}

function getEnvNumber(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name])
  if (!Number.isFinite(raw)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(raw)))
}
