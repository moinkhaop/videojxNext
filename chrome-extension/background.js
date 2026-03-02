importScripts('shared.js');

const {
  STORAGE_KEY,
  DEFAULT_STATE,
  clone,
  createId,
  normalizeBaseUrl,
  extractFirstUrl,
  inferFileName,
  sanitizeName,
  patchDeep
} = globalThis.ExtShared;

const GUEST_STORAGE_SCOPE = 'guest';
const ACTIVE_SCOPE_STORAGE_KEY = `${STORAGE_KEY}__active_scope`;

function normalizeStorageScope(value) {
  const scope = String(value || '').trim();
  if (!scope || scope === GUEST_STORAGE_SCOPE) {
    return GUEST_STORAGE_SCOPE;
  }
  if (!scope.startsWith('user:')) {
    return GUEST_STORAGE_SCOPE;
  }
  const userId = scope.slice(5).trim();
  return userId ? `user:${userId}` : GUEST_STORAGE_SCOPE;
}

function scopeFromUserId(userId) {
  const id = String(userId || '').trim();
  return id ? `user:${id}` : GUEST_STORAGE_SCOPE;
}

function scopedStateStorageKey(scope) {
  return `${STORAGE_KEY}::${normalizeStorageScope(scope)}`;
}

function toErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error || '未知错误');
}

function isLikelyUpstreamParserUrl(value) {
  if (!value) return false;
  try {
    const u = new URL(String(value));
    const host = (u.hostname || '').toLowerCase();
    if (host.endsWith('jxcxin.cn')) return true;
    if (host === 'api.oick.cn' || host.endsWith('.oick.cn')) return true;
    if (host.endsWith('pearktrue.cn')) return true;
    if (host.endsWith('yujn.cn')) return true;
    if (host.endsWith('xzdx.top')) return true;
    if (host.endsWith('douyin.wtf')) return true;
    return false;
  } catch (error) {
    return false;
  }
}

function isLikelyDouyinUrl(value) {
  return /douyin\.com|iesdouyin\.com|v\.douyin\.com/i.test(String(value || ''));
}

function detectDouyinPageKindFromUrl(urlLike) {
  try {
    const url = new URL(String(urlLike || ''));
    const host = (url.hostname || '').toLowerCase();
    const path = url.pathname || '';

    if (host === 'v.douyin.com') {
      return 'video';
    }

    if (host === 'www.iesdouyin.com' || host === 'iesdouyin.com') {
      if (/^\/share\/user\//i.test(path)) return 'user';
      if (/^\/share\/video\//i.test(path)) return 'video';
      return 'unknown';
    }

    if (/^\/user\//i.test(path)) return 'user';
    if (/^\/video\//i.test(path) || /^\/note\//i.test(path) || /^\/share\/video\//i.test(path)) return 'video';

    if (host === 'www.douyin.com' || host === 'douyin.com' || host.endsWith('.douyin.com')) {
      return 'feed';
    }

    return 'unknown';
  } catch (error) {
    return 'unknown';
  }
}

function buildDouyinLongUrl(awemeId) {
  const id = String(awemeId || '').trim();
  if (!/^[0-9]{10,25}$/.test(id)) return '';
  return `https://www.douyin.com/video/${id}`;
}

function sleep(ms) {
  const timeout = Math.max(0, Number(ms || 0));
  return new Promise((resolve) => setTimeout(resolve, timeout));
}

function normalizeBatchFilters(input) {
  const source = input && typeof input === 'object' ? input : {};
  const mediaType = String(source.mediaType || 'all');
  const normalizedMediaType = mediaType === 'video' || mediaType === 'image_album' ? mediaType : 'all';
  const minDurationSec = Math.max(0, Math.trunc(Number(source.minDurationSec || 0)));
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(String(source.startDate || ''))
    ? String(source.startDate)
    : '';
  const endDate = /^\d{4}-\d{2}-\d{2}$/.test(String(source.endDate || ''))
    ? String(source.endDate)
    : '';
  return {
    mediaType: normalizedMediaType,
    minDurationSec,
    startDate,
    endDate,
    excludePinned: Boolean(source.excludePinned)
  };
}

const RETRY_CLASSES = ['timeout', 'network', 'http4xx', 'http5xx', 'invalid_payload', 'unknown'];
const DEFAULT_RETRYABLE_CLASSES = ['timeout', 'network', 'http5xx'];

const DEFAULT_TEMPLATE_PROFILES = [
  {
    id: 'safe',
    name: '保守模式',
    folderTemplate: '{author}',
    fileTemplate: '{title}'
  },
  {
    id: 'balanced',
    name: '信息丰富',
    folderTemplate: '{author}',
    fileTemplate: '{awemeId}_{title}'
  },
  {
    id: 'by_date',
    name: '按日期归档',
    folderTemplate: '{date}/{author}',
    fileTemplate: '{awemeId}_{title}'
  }
];

function normalizeRetryableClasses(input) {
  const raw = Array.isArray(input) ? input : [];
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const key = String(item || '').trim();
    if (!RETRY_CLASSES.includes(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out.length > 0 ? out : [...DEFAULT_RETRYABLE_CLASSES];
}

function normalizeRetryPolicy(input, fallbackMaxRetries) {
  const source = input && typeof input === 'object' ? input : {};
  const maxRetriesFallback = Number.isFinite(Number(fallbackMaxRetries)) ? Number(fallbackMaxRetries) : 2;
  return {
    retryableClasses: normalizeRetryableClasses(source.retryableClasses),
    maxRetries: Math.max(0, Math.min(5, Math.trunc(Number(source.maxRetries ?? maxRetriesFallback)))),
    baseDelayMs: Math.max(150, Math.min(60000, Math.trunc(Number(source.baseDelayMs ?? 600)))),
    maxDelayMs: Math.max(300, Math.min(120000, Math.trunc(Number(source.maxDelayMs ?? 12000))))
  };
}

function normalizeClockText(value, fallback) {
  const text = String(value || '').trim();
  return /^\d{2}:\d{2}$/.test(text) ? text : fallback;
}

function normalizeNotificationSettings(input) {
  const source = input && typeof input === 'object' ? input : {};
  return {
    enabled: source.enabled !== false,
    success: source.success === true,
    failure: source.failure !== false,
    batchDone: source.batchDone !== false,
    quietHoursStart: normalizeClockText(source.quietHoursStart, '23:00'),
    quietHoursEnd: normalizeClockText(source.quietHoursEnd, '08:00')
  };
}

function normalizeTemplateProfiles(input) {
  const source = input && typeof input === 'object' ? input : {};
  const profiles = Array.isArray(source.profiles) ? source.profiles : DEFAULT_TEMPLATE_PROFILES;
  const normalized = [];
  const seen = new Set();
  for (const profile of profiles) {
    const id = String(profile && profile.id ? profile.id : '').trim() || createId('profile');
    if (seen.has(id)) continue;
    seen.add(id);
    normalized.push({
      id,
      name: String(profile && profile.name ? profile.name : '未命名模板').trim() || '未命名模板',
      folderTemplate: String(profile && profile.folderTemplate ? profile.folderTemplate : '{author}').trim() || '{author}',
      fileTemplate: String(profile && profile.fileTemplate ? profile.fileTemplate : '{awemeId}_{title}').trim() || '{awemeId}_{title}'
    });
  }
  const safeProfiles = normalized.length > 0 ? normalized : clone(DEFAULT_TEMPLATE_PROFILES);
  const activeProfileId = String(source.activeProfileId || '').trim();
  const hasActive = safeProfiles.some((item) => item.id === activeProfileId);
  return {
    activeProfileId: hasActive ? activeProfileId : safeProfiles[0].id,
    profiles: safeProfiles
  };
}

function normalizeTaskSettings(settings) {
  const source = settings && typeof settings === 'object' ? settings : {};
  const legacyMaxRetries = Math.max(0, Math.min(5, Math.trunc(Number(source.batchRetryCount || 2))));
  const retryPolicy = normalizeRetryPolicy(source.retryPolicy, legacyMaxRetries);
  return {
    batchConcurrency: Math.max(1, Math.min(5, Number(source.batchConcurrency || 2))),
    adaptiveConcurrency: source.adaptiveConcurrency !== false,
    autoResumeTasks: source.autoResumeTasks !== false,
    dedupeWithCloud: source.dedupeWithCloud !== false,
    batchRetryCount: retryPolicy.maxRetries,
    retryPolicy,
    notifications: normalizeNotificationSettings(source.notifications),
    templateProfiles: normalizeTemplateProfiles(source.templateProfiles),
    uploadFolderTemplate: String(source.uploadFolderTemplate || '{author}').trim() || '{author}',
    uploadFileTemplate: String(source.uploadFileTemplate || '{awemeId}_{title}').trim() || '{awemeId}_{title}',
    batchFilters: normalizeBatchFilters(source.batchFilters)
  };
}

function parseUnknownDateToMs(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    // Some fields use epoch seconds.
    return value < 1e12 ? value * 1000 : value;
  }
  const text = String(value || '').trim();
  if (!text) return null;
  const asNum = Number(text);
  if (Number.isFinite(asNum) && asNum > 0) {
    return asNum < 1e12 ? asNum * 1000 : asNum;
  }
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function dateStartMs(dateText) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateText || ''))) return null;
  const parsed = Date.parse(`${dateText}T00:00:00`);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateEndMs(dateText) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateText || ''))) return null;
  const parsed = Date.parse(`${dateText}T23:59:59.999`);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseAwemeIdFromRecord(record) {
  const detail = record && record.detail && typeof record.detail === 'object' ? record.detail : null;
  const directId = detail && detail.awemeId ? String(detail.awemeId || '').trim() : '';
  if (/^[0-9]{10,25}$/.test(directId)) {
    return directId;
  }
  const fromSource = detail && detail.sourceUrl ? extractAwemeIdFromUrl(detail.sourceUrl) : '';
  if (fromSource) return fromSource;
  const fromTitle = record && record.title ? extractAwemeIdFromUrl(record.title) : '';
  return fromTitle || '';
}

function collectLocalUploadedAwemeIds(history) {
  const set = new Set();
  const list = Array.isArray(history) ? history : [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const status = String(item.status || '');
    if (status !== 'success' && status !== 'partial') continue;
    const awemeId = parseAwemeIdFromRecord(item);
    if (awemeId) set.add(awemeId);
  }
  return set;
}

function resolveTemplateString(template, variables, fallback) {
  const text = String(template || '').trim() || String(fallback || '').trim();
  if (!text) return '';
  return text.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => {
    const value = variables && Object.prototype.hasOwnProperty.call(variables, key)
      ? variables[key]
      : '';
    return String(value == null ? '' : value);
  });
}

function normalizeFolderPath(pathLike) {
  const raw = String(pathLike || '');
  const parts = raw
    .split(/[\\/]+/)
    .map((item) => sanitizeName(item, 50))
    .filter(Boolean);
  return parts.join('/');
}

function formatDateToken(value) {
  const ms = parseUnknownDateToMs(value) || Date.now();
  const d = new Date(ms);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildUploadNaming(settings, parsedInfo, context) {
  const parsed = parsedInfo && typeof parsedInfo === 'object' ? parsedInfo : {};
  const sourceUrl = extractFirstUrl((context && context.sourceUrl) || parsed.sourceUrl || parsed.share_url || '');
  const awemeId = String((context && context.awemeId) || extractAwemeIdFromUrl(sourceUrl) || '').trim();
  const title = sanitizeName(parsed.title || 'untitled', 80);
  const author = sanitizeName(parsed.author || 'unknown', 60);
  const mediaType = parsed.mediaType === 'image_album' ? 'image_album' : 'video';
  const date = formatDateToken((context && context.uploadDate) || parsed.uploadDate || parsed.time || Date.now());
  const index = Number.isFinite(Number(context && context.index)) ? String(Number(context.index)) : '';
  const vars = {
    title,
    author,
    awemeId: awemeId || 'unknown',
    date,
    mediaType,
    index
  };

  const folderTemplate = settings && settings.uploadFolderTemplate
    ? settings.uploadFolderTemplate
    : '{author}';
  const fileTemplate = settings && settings.uploadFileTemplate
    ? settings.uploadFileTemplate
    : '{awemeId}_{title}';

  const rawFolder = resolveTemplateString(folderTemplate, vars, '{author}');
  const folderPath = normalizeFolderPath(rawFolder);
  const fileBase = sanitizeName(resolveTemplateString(fileTemplate, vars, title), 100) || title;

  if (mediaType === 'image_album') {
    return {
      folderPath,
      fileName: fileBase
    };
  }

  const rawFormat = String(parsed.format || 'mp4').toLowerCase();
  const format = /^[a-z0-9]{2,8}$/.test(rawFormat) ? rawFormat : 'mp4';
  return {
    folderPath,
    fileName: `${fileBase}.${format}`
  };
}

function evaluateBatchFilter(parsedInfo, filters, source) {
  const activeFilters = normalizeBatchFilters(filters);
  const parsed = parsedInfo && typeof parsedInfo === 'object' ? parsedInfo : {};
  const mediaType = parsed.mediaType === 'image_album' ? 'image_album' : 'video';
  const reasonPrefix = source === 'cloud' ? '云端去重/过滤' : '过滤';

  if (activeFilters.mediaType !== 'all' && mediaType !== activeFilters.mediaType) {
    return { matched: false, reason: `${reasonPrefix}：媒体类型不匹配` };
  }

  if (activeFilters.minDurationSec > 0) {
    const duration = Number(parsed.duration || 0);
    if (Number.isFinite(duration) && duration > 0 && duration < activeFilters.minDurationSec) {
      return { matched: false, reason: `${reasonPrefix}：时长低于 ${activeFilters.minDurationSec}s` };
    }
  }

  if (activeFilters.excludePinned && Boolean(parsed.isPinned)) {
    return { matched: false, reason: `${reasonPrefix}：已排除置顶` };
  }

  const sourceMs = parseUnknownDateToMs(parsed.uploadDate || parsed.time || parsed.createTime);
  const startMs = dateStartMs(activeFilters.startDate);
  const endMs = dateEndMs(activeFilters.endDate);
  if (sourceMs && startMs && sourceMs < startMs) {
    return { matched: false, reason: `${reasonPrefix}：发布时间早于开始日期` };
  }
  if (sourceMs && endMs && sourceMs > endMs) {
    return { matched: false, reason: `${reasonPrefix}：发布时间晚于结束日期` };
  }

  return { matched: true, reason: '' };
}

function classifyFailure(input) {
  const status = Number(input && input.status);
  if (Number.isFinite(status) && status >= 400 && status < 500) {
    return 'http4xx';
  }
  if (Number.isFinite(status) && status >= 500) {
    return 'http5xx';
  }

  const raw = [
    input && typeof input.message === 'string' ? input.message : '',
    input && input.error instanceof Error ? input.error.message : '',
    input && typeof input.error === 'string' ? input.error : ''
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (!raw) return 'unknown';
  if (/(abort|aborted|timeout|timed out|超时|中止)/i.test(raw)) return 'timeout';
  if (/(network|fetch failed|failed to fetch|econn|enotfound|dns|socket|连接失败|不可达)/i.test(raw)) return 'network';
  if (/(payload|non-json|json|empty response|无法解析|invalid|格式)/i.test(raw)) return 'invalid_payload';
  if (/\bhttp[\s:/-]*([45]\d{2})\b|\bstatus[\s:=]*([45]\d{2})\b|[\(（]([45]\d{2})[\)）]/i.test(raw)) {
    const matched = raw.match(/\bhttp[\s:/-]*([45]\d{2})\b|\bstatus[\s:=]*([45]\d{2})\b|[\(（]([45]\d{2})[\)）]/i);
    const code = Number(matched && (matched[1] || matched[2] || matched[3]));
    if (Number.isFinite(code) && code >= 400 && code < 500) return 'http4xx';
    if (Number.isFinite(code) && code >= 500) return 'http5xx';
  }
  return 'unknown';
}

function isRetryableClass(errorClass, retryPolicy) {
  const policy = normalizeRetryPolicy(retryPolicy, 2);
  return policy.retryableClasses.includes(String(errorClass || 'unknown'));
}

function clockTextToMinutes(value) {
  const text = String(value || '').trim();
  if (!/^\d{2}:\d{2}$/.test(text)) return null;
  const [hh, mm] = text.split(':').map((item) => Number(item));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function isInQuietHours(notificationSettings, nowDate) {
  const settings = normalizeNotificationSettings(notificationSettings);
  const start = clockTextToMinutes(settings.quietHoursStart);
  const end = clockTextToMinutes(settings.quietHoursEnd);
  if (start == null || end == null || start === end) return false;
  const now = nowDate instanceof Date ? nowDate : new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (start < end) {
    return minutes >= start && minutes < end;
  }
  return minutes >= start || minutes < end;
}

function isRetryableError(error, retryPolicy) {
  const message = toErrorMessage(error).toLowerCase();
  if (!message) return false;
  if (/请选择|缺少|无效|未找到|不能为空|参数/.test(message)) {
    return false;
  }
  const errorClass = classifyFailure({ error, message });
  return isRetryableClass(errorClass, retryPolicy);
}

async function withRetry(task, options) {
  const policy = normalizeRetryPolicy(options && options.retryPolicy, options && options.maxRetries);
  const maxRetries = Math.max(0, Math.min(5, Number(options && options.maxRetries != null ? options.maxRetries : policy.maxRetries)));
  const baseDelayMs = Math.max(150, Number(options && options.baseDelayMs ? options.baseDelayMs : policy.baseDelayMs));
  const maxDelayMs = Math.max(baseDelayMs, Number(options && options.maxDelayMs ? options.maxDelayMs : policy.maxDelayMs));
  let attempt = 0;
  let lastError = null;
  while (attempt <= maxRetries) {
    try {
      return await task(attempt);
    } catch (error) {
      lastError = error;
      const errorClass = classifyFailure({ error, message: toErrorMessage(error) });
      const canRetry = isRetryableError(error, policy);
      if (attempt >= maxRetries || !canRetry) {
        if (options && typeof options.onFailure === 'function') {
          try {
            options.onFailure({
              attempt: attempt + 1,
              error,
              errorClass,
              message: toErrorMessage(error)
            });
          } catch (callbackError) {}
        }
        break;
      }
      const delay = Math.min(maxDelayMs, Math.round(baseDelayMs * Math.pow(2, attempt)));
      if (options && typeof options.onRetry === 'function') {
        try {
          options.onRetry({
            attempt: attempt + 1,
            delay,
            error,
            errorClass,
            message: toErrorMessage(error)
          });
        } catch (callbackError) {}
      }
      await sleep(delay);
      attempt += 1;
      continue;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(toErrorMessage(lastError));
}

async function fetchCloudUploadedAwemeIds(maxScan) {
  const cap = Math.max(500, Math.min(10000, Number(maxScan || 3000)));
  const set = new Set();
  let offset = 0;
  const limit = 500;
  while (offset < cap) {
    const response = await apiRequest(`/api/extension/history?limit=${limit}&offset=${offset}`, {
      method: 'GET',
      useAuth: true
    });
    const rows = response && Array.isArray(response.data) ? response.data : [];
    for (const row of rows) {
      const awemeId = parseAwemeIdFromRecord(row);
      if (awemeId) set.add(awemeId);
    }
    if (rows.length < limit) break;
    offset += rows.length;
  }
  return set;
}

async function runAdaptivePool(total, options) {
  const totalCount = Math.max(0, Number(total || 0));
  if (totalCount === 0) return;
  const minConcurrency = 1;
  const maxConcurrency = 5;
  let currentConcurrency = Math.max(minConcurrency, Math.min(maxConcurrency, Number(options.initialConcurrency || 2)));
  const adaptive = options && options.adaptive !== false;
  const recent = [];
  let nextIndex = 0;
  let running = 0;
  let finished = 0;
  let adjustCounter = 0;

  await new Promise((resolve) => {
    const tryAdjust = () => {
      if (!adaptive) return;
      adjustCounter += 1;
      if (adjustCounter < 6 || recent.length < 6) return;
      adjustCounter = 0;
      const window = recent.slice(-8);
      const failed = window.filter((item) => item.ok === false).length;
      const failRate = failed / window.length;
      const avgDuration = window.reduce((sum, item) => sum + item.durationMs, 0) / window.length;
      let next = currentConcurrency;
      if (failRate >= 0.4 && currentConcurrency > minConcurrency) {
        next -= 1;
      } else if (failRate <= 0.1 && avgDuration < 9000 && currentConcurrency < maxConcurrency) {
        next += 1;
      }
      if (next !== currentConcurrency) {
        const prev = currentConcurrency;
        currentConcurrency = next;
        if (options && typeof options.onConcurrencyChange === 'function') {
          try {
            options.onConcurrencyChange({ previous: prev, current: currentConcurrency, failRate, avgDuration });
          } catch (error) {}
        }
      }
    };

    const schedule = () => {
      while (running < currentConcurrency && nextIndex < totalCount) {
        const index = nextIndex;
        nextIndex += 1;
        running += 1;
        const startAt = Date.now();
        Promise.resolve()
          .then(() => options.worker(index))
          .then((okValue) => {
            recent.push({ ok: okValue !== false, durationMs: Date.now() - startAt });
          })
          .catch(() => {
            recent.push({ ok: false, durationMs: Date.now() - startAt });
          })
          .finally(() => {
            running -= 1;
            finished += 1;
            tryAdjust();
            if (finished >= totalCount && running === 0) {
              resolve();
              return;
            }
            schedule();
          });
      }
    };

    schedule();
  });
}

async function refreshDouyinDirectVideoUrl(sourceUrl) {
  const input = extractFirstUrl(sourceUrl || '');
  if (!input) {
    throw new Error('缺少抖音链接，无法刷新直链');
  }

  const response = await apiRequest('/api/douyin/parse', {
    method: 'POST',
    body: {
      url: input,
      videoUrl: input,
      text: input
    }
  });

  const parsed = response && response.data ? response.data : null;
  const url = parsed && parsed.mediaType === 'video' ? String(parsed.url || '') : '';
  if (!url) {
    throw new Error('刷新直链失败：未返回有效视频地址');
  }
  return { parsed, url };
}

function storageGet(key) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([key], (result) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      resolve(result[key]);
    });
  });
}

function storageSet(payload) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(payload, () => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      resolve();
    });
  });
}

async function getActiveStorageScope() {
  const stored = await storageGet(ACTIVE_SCOPE_STORAGE_KEY);
  return normalizeStorageScope(stored);
}

async function setActiveStorageScope(scope) {
  const normalized = normalizeStorageScope(scope);
  await storageSet({ [ACTIVE_SCOPE_STORAGE_KEY]: normalized });
  return normalized;
}

function tabsQuery(query) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query(query, (tabs) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      resolve(tabs || []);
    });
  });
}

function tabsSendMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      resolve(response || null);
    });
  });
}

function isNoReceivingEndError(error) {
  const msg = error instanceof Error ? error.message : String(error || '');
  return /Receiving end does not exist|Could not establish connection/i.test(msg);
}

function scriptingExecuteFiles(tabId, files) {
  return new Promise((resolve, reject) => {
    if (!chrome.scripting || typeof chrome.scripting.executeScript !== 'function') {
      reject(new Error('当前浏览器不支持脚本注入'));
      return;
    }

    chrome.scripting.executeScript(
      {
        target: { tabId },
        files
      },
      () => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message));
          return;
        }
        resolve();
      }
    );
  });
}

async function ensureContentScript(tabId) {
  // content.js is registered as a content_script, but in practice MV3 can miss it
  // on SPA navigations or right after install. Inject and dedupe in content.js.
  await scriptingExecuteFiles(tabId, ['content.js']);
}

async function sendToContent(tabId, message) {
  try {
    return await tabsSendMessage(tabId, message);
  } catch (error) {
    if (!isNoReceivingEndError(error)) {
      throw error;
    }
    await ensureContentScript(tabId);
    return await tabsSendMessage(tabId, message);
  }
}

async function readState() {
  const scope = await getActiveStorageScope();
  const scopedKey = scopedStateStorageKey(scope);
  let stored = await storageGet(scopedKey);

  // Migration: move legacy unscoped storage to guest scope once.
  if (!stored && scope === GUEST_STORAGE_SCOPE) {
    const legacy = await storageGet(STORAGE_KEY);
    if (legacy && typeof legacy === 'object') {
      stored = legacy;
      await storageSet({ [scopedKey]: legacy });
    }
  }

  const merged = patchDeep(DEFAULT_STATE, stored || {});
  return merged;
}

async function writeState(state) {
  const scope = await getActiveStorageScope();
  const scopedKey = scopedStateStorageKey(scope);
  await storageSet({ [scopedKey]: state });
}

async function mutateState(mutator) {
  const current = await readState();
  const working = clone(current);
  const result = await mutator(working);
  const nextState = result || working;
  await writeState(nextState);
  return nextState;
}

async function ensureInitialized() {
  await mutateState((state) => {
    if (!Array.isArray(state.parsers) || state.parsers.length === 0) {
      state.parsers = clone(DEFAULT_STATE.parsers);
    }

    // Keep builtin parsers across upgrades even if the stored array overwrote DEFAULT_STATE.parsers.
    const requiredBuiltins = (DEFAULT_STATE.parsers || []).filter((p) => p && p.isBuiltin);
    for (const builtin of requiredBuiltins) {
      if (!builtin || !builtin.id) continue;
      const index = (state.parsers || []).findIndex((item) => item && item.id === builtin.id);
      if (index === -1) {
        state.parsers.unshift(clone(builtin));
        continue;
      }

      // Patch builtin definitions on upgrade (apiUrl/isDefault/name can change). Keep user toggles like disabled.
      const existing = state.parsers[index] || {};
      const disabled = Boolean(existing.disabled);
      state.parsers[index] = {
        ...clone(builtin),
        disabled
      };
    }

    if (!state.defaults.parserId || !state.parsers.some((item) => item.id === state.defaults.parserId && !item.disabled)) {
      const defaultParser = state.parsers.find((item) => item.isDefault && !item.disabled) || state.parsers[0];
      state.defaults.parserId = defaultParser ? defaultParser.id : '';
    }

    // Migration: prefer stable builtin parser over third-party defaults.
    if (
      state.defaults.parserId === 'builtin_parser_jxcxin' &&
      state.parsers.some((item) => item && item.id === 'builtin_parser_next_douyin' && !item.disabled)
    ) {
      state.defaults.parserId = 'builtin_parser_next_douyin';
    }

    if (!Array.isArray(state.webdavServers)) {
      state.webdavServers = [];
    }

    if (!state.defaults.webdavId || !state.webdavServers.some((item) => item.id === state.defaults.webdavId && !item.disabled)) {
      const defaultWebdav = state.webdavServers.find((item) => item.isDefault && !item.disabled) || state.webdavServers[0];
      state.defaults.webdavId = defaultWebdav ? defaultWebdav.id : '';
    }

    if (!Array.isArray(state.history)) {
      state.history = [];
    }

    if (!state.tasks || typeof state.tasks !== 'object') {
      state.tasks = {};
    }

    if (!Array.isArray(state.inbox)) {
      state.inbox = [];
    }
    if (state.inbox.length > 200) {
      state.inbox = state.inbox.slice(0, 200);
    }

    if (!state.auth || typeof state.auth !== 'object') {
      state.auth = clone(DEFAULT_STATE.auth);
    }

    if (!state.settings || typeof state.settings !== 'object') {
      state.settings = clone(DEFAULT_STATE.settings);
    }

    const normalizedTaskSettings = normalizeTaskSettings(state.settings);
    state.settings = {
      ...state.settings,
      ...normalizedTaskSettings,
      apiBaseUrl: normalizeBaseUrl(state.settings.apiBaseUrl || DEFAULT_STATE.settings.apiBaseUrl)
    };

    state.settings.batchFilters = normalizeBatchFilters(state.settings.batchFilters);
    state.settings.batchConcurrency = normalizedTaskSettings.batchConcurrency;
    state.settings.adaptiveConcurrency = normalizedTaskSettings.adaptiveConcurrency;
    state.settings.autoResumeTasks = normalizedTaskSettings.autoResumeTasks;
    state.settings.dedupeWithCloud = normalizedTaskSettings.dedupeWithCloud;
    state.settings.batchRetryCount = normalizedTaskSettings.batchRetryCount;
    state.settings.retryPolicy = normalizeRetryPolicy(normalizedTaskSettings.retryPolicy, normalizedTaskSettings.batchRetryCount);
    state.settings.notifications = normalizeNotificationSettings(normalizedTaskSettings.notifications);
    state.settings.templateProfiles = normalizeTemplateProfiles(normalizedTaskSettings.templateProfiles);
    state.settings.uploadFolderTemplate = normalizedTaskSettings.uploadFolderTemplate;
    state.settings.uploadFileTemplate = normalizedTaskSettings.uploadFileTemplate;
    state.settings.historyLimit = Math.max(100, Math.min(1000, Number(state.settings.historyLimit || 500)));
    state.settings.configUpdatedAt = Math.max(0, Number(state.settings.configUpdatedAt || 0));
    state.settings.lastConfigSyncAt = Math.max(0, Number(state.settings.lastConfigSyncAt || 0));
    state.settings.lastHistorySyncAt = Math.max(0, Number(state.settings.lastHistorySyncAt || 0));
    state.settings.lastHistorySyncSuccess = Math.max(0, Number(state.settings.lastHistorySyncSuccess || 0));
    state.settings.lastHistorySyncFailed = Math.max(0, Number(state.settings.lastHistorySyncFailed || 0));
  });
}

function getApiBaseUrl(state) {
  const url = normalizeBaseUrl(state.settings.apiBaseUrl);
  if (!url) {
    throw new Error('请先在扩展设置中配置后端地址');
  }
  return url;
}

async function apiRequest(path, options) {
  const state = await readState();
  const method = (options && options.method) || 'GET';
  const body = options ? options.body : undefined;
  const useAuth = Boolean(options && options.useAuth);
  const retry = Boolean(options && options.retry);

  const headers = {
    'Content-Type': 'application/json'
  };

  if (useAuth && state.auth && state.auth.accessToken) {
    headers.Authorization = `Bearer ${state.auth.accessToken}`;
  }

  const response = await fetch(`${getApiBaseUrl(state)}${path}`, {
    method,
    headers,
    body: method === 'GET' || body == null ? undefined : JSON.stringify(body)
  });

  const text = await response.text();
  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch (error) {
      data = { success: false, error: text.slice(0, 300) };
    }
  }

  if (response.status === 401 && useAuth && !retry && state.auth && state.auth.refreshToken) {
    const refreshed = await refreshSessionInternal(state.auth.refreshToken);
    if (refreshed) {
      return apiRequest(path, {
        method,
        body,
        useAuth,
        retry: true
      });
    }
  }

  if (!response.ok || (data && data.success === false)) {
    const message = data && data.error ? data.error : `请求失败 (HTTP ${response.status})`;
    throw new Error(message);
  }

  return data;
}

function normalizeSessionPayload(payload) {
  if (!payload || !payload.session) {
    throw new Error('会话数据无效');
  }

  return {
    accessToken: payload.session.accessToken,
    refreshToken: payload.session.refreshToken,
    expiresAt: Number(payload.session.expiresAt || 0),
    user: payload.user || null,
    loggedInAt: Date.now()
  };
}

async function refreshSessionInternal(refreshToken) {
  if (!refreshToken) {
    return false;
  }

  try {
    const state = await readState();
    const response = await fetch(`${getApiBaseUrl(state)}/api/extension/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ refreshToken })
    });

    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;

    if (!response.ok || !payload || payload.success === false) {
      return false;
    }

    const session = normalizeSessionPayload(payload);
    await mutateState((next) => {
      next.auth = session;
    });

    return true;
  } catch (error) {
    return false;
  }
}

async function persistAuth(payload) {
  const session = normalizeSessionPayload(payload);
  const previousState = await readState();
  const previousApiBaseUrl = previousState && previousState.settings
    ? normalizeBaseUrl(previousState.settings.apiBaseUrl || '')
    : '';
  const nextScope = scopeFromUserId(session && session.user ? session.user.id : '');
  await setActiveStorageScope(nextScope);

  await mutateState((state) => {
    state.auth = session;
    if (previousApiBaseUrl) {
      state.settings.apiBaseUrl = previousApiBaseUrl;
    }
  });
  return session;
}

async function clearAuth(options) {
  const switchToGuest = Boolean(options && options.switchToGuest);

  await mutateState((state) => {
    state.auth = clone(DEFAULT_STATE.auth);
  });

  if (!switchToGuest) {
    return;
  }

  await setActiveStorageScope(GUEST_STORAGE_SCOPE);
  await mutateState((state) => {
    state.auth = clone(DEFAULT_STATE.auth);
  });
}

async function checkSession() {
  const state = await readState();
  const token = state.auth && state.auth.accessToken;

  if (!token) {
    return { loggedIn: false, user: null };
  }

  try {
    const data = await apiRequest('/api/extension/auth/session', {
      method: 'GET',
      useAuth: true
    });

    await mutateState((next) => {
      next.auth.user = data.user || null;
    });

    return {
      loggedIn: true,
      user: data.user || null
    };
  } catch (error) {
    await clearAuth({ switchToGuest: true });
    return {
      loggedIn: false,
      user: null
    };
  }
}

async function login(payload) {
  const email = String(payload.email || '').trim();
  const password = String(payload.password || '');

  if (!email || !password) {
    throw new Error('邮箱和密码不能为空');
  }

  const response = await apiRequest('/api/extension/auth/login', {
    method: 'POST',
    body: { email, password }
  });

  const session = await persistAuth(response);
  try {
    await syncConfigAuto();
  } catch (error) {
  }
  return {
    user: session.user,
    expiresAt: session.expiresAt
  };
}

async function register(payload) {
  const email = String(payload.email || '').trim();
  const password = String(payload.password || '');

  if (!email || !password) {
    throw new Error('邮箱和密码不能为空');
  }

  return apiRequest('/api/extension/auth/register', {
    method: 'POST',
    body: { email, password }
  });
}

async function logout() {
  const state = await readState();

  if (state.auth && state.auth.accessToken) {
    try {
      await apiRequest('/api/extension/auth/logout', {
        method: 'POST',
        useAuth: true
      });
    } catch (error) {
    }
  }

  await clearAuth({ switchToGuest: true });
}

function pickExtensionConfigSnapshot(state) {
  const normalizedTaskSettings = normalizeTaskSettings(state?.settings || {});
  return {
    settings: {
      apiBaseUrl: normalizeBaseUrl(state?.settings?.apiBaseUrl || DEFAULT_STATE.settings.apiBaseUrl),
      autoSyncHistory: state?.settings?.autoSyncHistory !== false,
      batchConcurrency: normalizedTaskSettings.batchConcurrency,
      adaptiveConcurrency: normalizedTaskSettings.adaptiveConcurrency,
      autoResumeTasks: normalizedTaskSettings.autoResumeTasks,
      dedupeWithCloud: normalizedTaskSettings.dedupeWithCloud,
      batchRetryCount: normalizedTaskSettings.batchRetryCount,
      retryPolicy: normalizeRetryPolicy(normalizedTaskSettings.retryPolicy, normalizedTaskSettings.batchRetryCount),
      notifications: normalizeNotificationSettings(normalizedTaskSettings.notifications),
      templateProfiles: normalizeTemplateProfiles(normalizedTaskSettings.templateProfiles),
      historyLimit: Math.max(100, Math.min(1000, Number(state?.settings?.historyLimit || 500))),
      uploadFolderTemplate: normalizedTaskSettings.uploadFolderTemplate,
      uploadFileTemplate: normalizedTaskSettings.uploadFileTemplate,
      batchFilters: normalizeBatchFilters(normalizedTaskSettings.batchFilters)
    },
    parsers: Array.isArray(state?.parsers) ? state.parsers : [],
    webdavServers: Array.isArray(state?.webdavServers) ? state.webdavServers : [],
    defaults: state?.defaults && typeof state.defaults === 'object'
      ? state.defaults
      : { parserId: '', webdavId: '' }
  };
}

function hasConfigSnapshotContent(snapshot) {
  const safe = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const settings = safe.settings && typeof safe.settings === 'object' ? safe.settings : {};
  const parsers = Array.isArray(safe.parsers) ? safe.parsers : [];
  const webdavServers = Array.isArray(safe.webdavServers) ? safe.webdavServers : [];
  const defaults = safe.defaults && typeof safe.defaults === 'object' ? safe.defaults : {};

  if (parsers.length > 0) return true;
  if (webdavServers.length > 0) return true;
  if (Object.keys(settings).length > 0) return true;
  if (Object.keys(defaults).length > 0) return true;
  return false;
}

async function applyCloudConfig(config, updatedAt) {
  const payload = config && typeof config === 'object' ? config : {};
  await mutateState((state) => {
    if (payload.settings && typeof payload.settings === 'object') {
      state.settings = {
        ...state.settings,
        ...payload.settings,
        apiBaseUrl: normalizeBaseUrl(payload.settings.apiBaseUrl || state.settings.apiBaseUrl)
      };

      const normalizedTaskSettings = normalizeTaskSettings(state.settings);
      state.settings.batchConcurrency = normalizedTaskSettings.batchConcurrency;
      state.settings.adaptiveConcurrency = normalizedTaskSettings.adaptiveConcurrency;
      state.settings.autoResumeTasks = normalizedTaskSettings.autoResumeTasks;
      state.settings.dedupeWithCloud = normalizedTaskSettings.dedupeWithCloud;
      state.settings.batchRetryCount = normalizedTaskSettings.batchRetryCount;
      state.settings.retryPolicy = normalizeRetryPolicy(normalizedTaskSettings.retryPolicy, normalizedTaskSettings.batchRetryCount);
      state.settings.notifications = normalizeNotificationSettings(normalizedTaskSettings.notifications);
      state.settings.templateProfiles = normalizeTemplateProfiles(normalizedTaskSettings.templateProfiles);
      state.settings.uploadFolderTemplate = normalizedTaskSettings.uploadFolderTemplate;
      state.settings.uploadFileTemplate = normalizedTaskSettings.uploadFileTemplate;
      state.settings.batchFilters = normalizeBatchFilters(normalizedTaskSettings.batchFilters);
      state.settings.historyLimit = Math.max(100, Math.min(1000, Number(state.settings.historyLimit || 500)));
    }

    if (Array.isArray(payload.parsers)) {
      state.parsers = payload.parsers;
    }

    if (Array.isArray(payload.webdavServers)) {
      state.webdavServers = payload.webdavServers;
    }

    if (payload.defaults && typeof payload.defaults === 'object') {
      state.defaults = {
        ...state.defaults,
        ...payload.defaults
      };
    }

    state.settings.configUpdatedAt = Math.max(0, Number(updatedAt || 0));
    state.settings.lastConfigSyncAt = Date.now();
    state.settings.configUserId = state.auth && state.auth.user && state.auth.user.id
      ? String(state.auth.user.id)
      : '';
  });

  // Ensure builtin parsers exist even if cloud config overwrote them.
  await ensureInitialized();
}

async function syncConfigAuto() {
  const state = await readState();
  if (!state.auth || !state.auth.accessToken) {
    throw new Error('请先登录再同步配置');
  }

  const currentUserId = state.auth && state.auth.user && state.auth.user.id
    ? String(state.auth.user.id)
    : '';
  const previousConfigUserId = state.settings && state.settings.configUserId
    ? String(state.settings.configUserId)
    : '';
  const switchedUser = Boolean(currentUserId && previousConfigUserId && currentUserId !== previousConfigUserId);

  const localUpdatedAt = Math.max(0, Number(state.settings && state.settings.configUpdatedAt ? state.settings.configUpdatedAt : 0));
  const effectiveLocalUpdatedAt = switchedUser ? 0 : localUpdatedAt;
  const localSnapshot = pickExtensionConfigSnapshot(state);

  const remote = await apiRequest('/api/extension/config', {
    method: 'GET',
    useAuth: true
  });

  const remoteUpdatedAt = Math.max(0, Number(remote && remote.data && remote.data.updatedAt ? remote.data.updatedAt : 0));
  const remoteConfig = remote && remote.data ? remote.data.config : null;

  if (!remoteUpdatedAt) {
    const localHasConfig = hasConfigSnapshotContent(localSnapshot);
    if (localHasConfig && effectiveLocalUpdatedAt > 0) {
      await apiRequest('/api/extension/config', {
        method: 'POST',
        useAuth: true,
        body: { config: localSnapshot, updatedAt: effectiveLocalUpdatedAt }
      });

      await mutateState((next) => {
        next.settings.lastConfigSyncAt = Date.now();
        next.settings.configUserId = currentUserId;
      });

      return { mode: 'push', updatedAt: effectiveLocalUpdatedAt, remoteUpdatedAt, message: '云端暂无配置，已上传本机配置。' };
    }

    await mutateState((next) => {
      next.settings.lastConfigSyncAt = Date.now();
      next.settings.configUserId = currentUserId;
    });

    return { mode: 'noop', updatedAt: effectiveLocalUpdatedAt, remoteUpdatedAt, message: '云端暂无配置，已跳过自动上传。' };
  }

  // Heuristic: if remote has WebDAV configs but local is empty, prefer pulling remote even when
  // localUpdatedAt looks newer (e.g. user changed any local setting before login, which bumps
  // configUpdatedAt and would otherwise overwrite remote WebDAV list).
  const localWebdavCount = Array.isArray(localSnapshot.webdavServers) ? localSnapshot.webdavServers.length : 0;
  const remoteWebdavCount = remoteConfig && typeof remoteConfig === 'object' && Array.isArray(remoteConfig.webdavServers)
    ? remoteConfig.webdavServers.length
    : 0;
  const remoteDefaultWebdavId = remoteConfig && typeof remoteConfig === 'object' && remoteConfig.defaults && typeof remoteConfig.defaults === 'object'
    ? String(remoteConfig.defaults.webdavId || '')
    : '';
  const localDefaultWebdavId = localSnapshot.defaults && typeof localSnapshot.defaults === 'object'
    ? String(localSnapshot.defaults.webdavId || '')
    : '';

  if (remoteWebdavCount > 0 && localWebdavCount === 0) {
    await applyCloudConfig(remoteConfig, remoteUpdatedAt);
    return { mode: 'pull', updatedAt: remoteUpdatedAt, remoteUpdatedAt, message: '已拉取云端 WebDAV 配置并覆盖本机配置。' };
  }

  if (remoteDefaultWebdavId && !localDefaultWebdavId) {
    await applyCloudConfig(remoteConfig, remoteUpdatedAt);
    return { mode: 'pull', updatedAt: remoteUpdatedAt, remoteUpdatedAt, message: '已拉取云端默认 WebDAV 配置并覆盖本机配置。' };
  }

  if (remoteUpdatedAt > effectiveLocalUpdatedAt) {
    await applyCloudConfig(remoteConfig, remoteUpdatedAt);
    return { mode: 'pull', updatedAt: remoteUpdatedAt, remoteUpdatedAt, message: '已拉取云端配置并覆盖本机配置。' };
  }

  if (effectiveLocalUpdatedAt > remoteUpdatedAt) {
    const snapshot = localSnapshot;
    await apiRequest('/api/extension/config', {
      method: 'POST',
      useAuth: true,
      body: { config: snapshot, updatedAt: effectiveLocalUpdatedAt }
    });

    await mutateState((next) => {
      next.settings.lastConfigSyncAt = Date.now();
      next.settings.configUserId = currentUserId;
    });

    return { mode: 'push', updatedAt: effectiveLocalUpdatedAt, remoteUpdatedAt, message: '本机配置较新，已上传到云端。' };
  }

  await mutateState((next) => {
    next.settings.lastConfigSyncAt = Date.now();
    next.settings.configUserId = currentUserId;
  });

  return { mode: 'noop', updatedAt: effectiveLocalUpdatedAt, remoteUpdatedAt, message: '配置已是最新，无需同步。' };
}

async function createHistoryRecord(input) {
  const now = new Date().toISOString();
  const detail = input && input.detail && typeof input.detail === 'object'
    ? clone(input.detail)
    : {};
  const status = String(input && input.status ? input.status : 'success');
  if (!Array.isArray(detail.retryTrace)) {
    detail.retryTrace = [];
  }
  if (status === 'failed' && !detail.failureClass) {
    detail.failureClass = classifyFailure({
      message: detail.error || (input && input.error) || '',
      status: detail.status
    });
  }
  detail.notified = Boolean(detail.notified);

  const record = {
    id: input.id || createId('history'),
    type: input.type || 'single',
    createdAt: input.createdAt || now,
    updatedAt: now,
    title: input.title || '未命名任务',
    status,
    source: input.source || 'extension',
    detail,
    cloudSynced: false,
    cloudError: ''
  };

  return record;
}

async function saveHistoryRecord(record, options) {
  const settings = options || {};
  let resultRecord = clone(record);
  const localRecordId = resultRecord.id;

  await mutateState((state) => {
    const nextHistory = [resultRecord].concat(
      (state.history || []).filter((item) => item.id !== resultRecord.id)
    );

    const limit = Number(state.settings.historyLimit || 500);
    state.history = nextHistory.slice(0, limit);
  });

  const latest = await readState();
  const shouldSync = latest.settings.autoSyncHistory !== false;
  const loggedIn = Boolean(latest.auth && latest.auth.accessToken);

  if (settings.syncRemote !== false && shouldSync && loggedIn) {
    try {
      const response = await apiRequest('/api/extension/history', {
        method: 'POST',
        useAuth: true,
        body: {
          record: resultRecord
        }
      });

      const synced = {
        ...(response.data || resultRecord),
        cloudSynced: true,
        cloudError: ''
      };

      resultRecord = synced;
      await mutateState((state) => {
        state.history = (state.history || []).map((item) => {
          if (item.id !== localRecordId && item.id !== synced.id) {
            return item;
          }
          return synced;
        });
      });
    } catch (error) {
      const message = toErrorMessage(error);
      resultRecord = {
        ...resultRecord,
        cloudSynced: false,
        cloudError: message
      };

      await mutateState((state) => {
        state.history = (state.history || []).map((item) => {
          if (item.id !== localRecordId && item.id !== resultRecord.id) {
            return item;
          }
          return resultRecord;
        });
      });
    }
  }

  try {
    await dispatchHistoryInboxEvent(resultRecord);
  } catch (error) {
  }

  return resultRecord;
}

const CLOUD_HISTORY_PAGE_SIZE = 500;
const CLOUD_HISTORY_MAX_PAGES = 40;

async function fetchCloudHistoryAll() {
  const all = [];

  for (let page = 0; page < CLOUD_HISTORY_MAX_PAGES; page += 1) {
    const offset = page * CLOUD_HISTORY_PAGE_SIZE;
    const response = await apiRequest(
      `/api/extension/history?limit=${CLOUD_HISTORY_PAGE_SIZE}&offset=${offset}`,
      {
        method: 'GET',
        useAuth: true
      }
    );

    const rows = Array.isArray(response && response.data) ? response.data : [];
    all.push(...rows);

    if (rows.length < CLOUD_HISTORY_PAGE_SIZE) {
      break;
    }
  }

  return all;
}

async function syncAllHistoryToCloud() {
  const state = await readState();

  if (!state.auth || !state.auth.accessToken) {
    throw new Error('请先登录再同步历史记录');
  }

  let success = 0;
  let failed = 0;

  for (const item of state.history || []) {
    try {
      await apiRequest('/api/extension/history', {
        method: 'POST',
        useAuth: true,
        body: {
          record: item
        }
      });
      success += 1;
    } catch (error) {
      failed += 1;
    }
  }

  const cloudHistory = await fetchCloudHistoryAll();

  await mutateState((next) => {
    next.history = cloudHistory;
    if (!next.settings || typeof next.settings !== 'object') {
      next.settings = {};
    }
    next.settings.lastHistorySyncAt = Date.now();
    next.settings.lastHistorySyncSuccess = success;
    next.settings.lastHistorySyncFailed = failed;
  });

  return { success, failed };
}

async function pullHistoryFromCloud() {
  const state = await readState();

  if (!state.auth || !state.auth.accessToken) {
    throw new Error('请先登录再刷新云端历史记录');
  }

  const cloudHistory = await fetchCloudHistoryAll();

  await mutateState((next) => {
    next.history = cloudHistory;
    if (!next.settings || typeof next.settings !== 'object') {
      next.settings = {};
    }
    next.settings.lastHistorySyncAt = Date.now();
    next.settings.lastHistorySyncSuccess = cloudHistory.length;
    next.settings.lastHistorySyncFailed = 0;
  });

  return { pulled: cloudHistory.length };
}

async function parseVideo(videoUrl, parserConfig) {
  if (!videoUrl) {
    throw new Error('缺少视频链接');
  }

  if (!parserConfig) {
    throw new Error('缺少解析器配置');
  }

  const apiUrl = String(parserConfig.apiUrl || '').trim();
  const urlParamName = String(parserConfig.urlParamName || 'url').trim() || 'url';

  // If parser points to a local API route, call it directly to avoid the extra proxy hop
  // (which is more likely to trigger EdgeOne 500/545 in practice).
  if (/^\/api\//.test(apiUrl)) {
    const configuredMethod = String(parserConfig.requestMethod || '').toUpperCase();
    const method = configuredMethod === 'GET' ? 'GET' : 'POST';

    if (method === 'GET') {
      const query = new URLSearchParams();
      const customQueryParams = parserConfig.customQueryParams && typeof parserConfig.customQueryParams === 'object'
        ? parserConfig.customQueryParams
        : null;

      if (customQueryParams) {
        Object.entries(customQueryParams).forEach(([key, value]) => {
          if (!key) return;
          if (value === undefined || value === null) return;
          query.set(String(key), String(value));
        });
      }

      query.set(urlParamName, videoUrl);
      const joiner = apiUrl.includes('?') ? '&' : '?';
      const response = await apiRequest(`${apiUrl}${joiner}${query.toString()}`, {
        method: 'GET',
        useAuth: true
      });

      if (!response || !response.data) {
        throw new Error('解析结果为空');
      }
      return response.data;
    }

    const body = {
      ...(parserConfig.customBodyParams && typeof parserConfig.customBodyParams === 'object' ? parserConfig.customBodyParams : {}),
      [urlParamName]: videoUrl
    };

    const response = await apiRequest(apiUrl, {
      method: 'POST',
      body,
      useAuth: true
    });

    if (!response || !response.data) {
      throw new Error('解析结果为空');
    }

    return response.data;
  }

  const response = await apiRequest('/api/extension/parse', {
    method: 'POST',
    useAuth: true,
    body: {
      videoUrl,
      parserConfig
    }
  });

  if (!response || !response.data) {
    throw new Error('解析结果为空');
  }

  return response.data;
}

function extractAwemeIdFromUrl(url) {
  const text = String(url || '');
  const matched = text.match(/\/video\/([0-9]{10,25})/);
  if (matched && matched[1]) return matched[1];
  const iesMatched = text.match(/iesdouyin\.com\/share\/video\/([0-9]{10,25})/i);
  if (iesMatched && iesMatched[1]) return iesMatched[1];
  if (/^[0-9]{10,25}$/.test(text.trim())) return text.trim();
  return '';
}

async function tryParseViaActiveDouyinWebApi(awemeId) {
  const id = String(awemeId || '').trim();
  if (!/^[0-9]{10,25}$/.test(id)) return null;

  // Prefer active tab, but allow any Douyin tab in current window to satisfy parsing.
  const tabs = await tabsQuery({ currentWindow: true });
  const active = (tabs || []).find((t) => t && t.active);
  const candidates = [active].concat(tabs || []).filter(Boolean);
  const tab = candidates.find((t) => t && t.id && /douyin\.com/i.test(t.url || '')) || null;
  if (!tab || !tab.id) return null;

  const response = await sendToContent(tab.id, {
    type: 'EXT_PARSE_AWEME',
    awemeId: id
  });

  if (!response || response.ok === false) {
    const message = response && response.error ? response.error : '抖音页面解析失败';
    throw new Error(message);
  }

  if (!response.parsed) {
    throw new Error('抖音页面解析结果为空');
  }

  return response.parsed;
}

async function uploadParsedMedia(parsedInfo, webdavConfig, folderPath, sourceUrl, options) {
  if (!parsedInfo || typeof parsedInfo !== 'object') {
    throw new Error('缺少解析数据');
  }

  if (!webdavConfig) {
    throw new Error('缺少 WebDAV 配置');
  }

  const resolvedSourceUrl = extractFirstUrl(sourceUrl || parsedInfo.sourceUrl || parsedInfo.share_url || '');

  // If upstream parser returns its own API endpoint as "url", try to refresh via builtin parser to get a direct CDN link.
  let effectiveParsedInfo = parsedInfo;
  if (
    effectiveParsedInfo.mediaType === 'video' &&
    typeof effectiveParsedInfo.url === 'string' &&
    isLikelyUpstreamParserUrl(effectiveParsedInfo.url) &&
    resolvedSourceUrl &&
    isLikelyDouyinUrl(resolvedSourceUrl)
  ) {
    try {
      const refreshed = await refreshDouyinDirectVideoUrl(resolvedSourceUrl);
      if (refreshed && refreshed.parsed) {
        effectiveParsedInfo = {
          ...effectiveParsedInfo,
          url: refreshed.url,
          // prefer refreshed format if any
          format: refreshed.parsed.format || effectiveParsedInfo.format
        };
      }
    } catch (error) {
      // Best effort: still continue with original parsed url (server may handle it with sourceUrl fallback).
    }
  }

  const body = {
    videoUrl: effectiveParsedInfo.mediaType === 'video' ? effectiveParsedInfo.url : undefined,
    sourceUrl: resolvedSourceUrl || undefined,
    images: effectiveParsedInfo.mediaType === 'image_album' ? effectiveParsedInfo.images : undefined,
    webdavConfig,
    fileName: options && options.fileName ? String(options.fileName) : inferFileName(effectiveParsedInfo),
    folderPath: folderPath || ''
  };

  let response = null;
  let lastError = null;

  // Prefer direct call to the same endpoint the web app uses (fewer hops, fewer platform-specific failure points).
  try {
    response = await apiRequest('/api/proxy/webdav', {
      method: 'POST',
      useAuth: true,
      body
    });
  } catch (error) {
    lastError = error;
    response = null;
  }

  // Fallback to the extension wrapper (adds CORS + can keep working even if the edge-function
  // doesn't include CORS headers or has route mapping issues).
  if (!response) {
    response = await apiRequest('/api/extension/upload', {
      method: 'POST',
      useAuth: true,
      body
    }).catch((error) => {
      // Prefer the more actionable error message if the direct call failed with something descriptive.
      throw lastError instanceof Error ? lastError : error;
    });
  }

  if (!response || !response.success || !response.filePath) {
    throw new Error(response && response.error ? response.error : '上传失败');
  }

  return response.filePath;
}

function pickParserAndWebdav(payload, state) {
  const parserId = payload.parserId || state.defaults.parserId;
  const webdavId = payload.webdavId || state.defaults.webdavId;

  const parser = (state.parsers || []).find((item) => item.id === parserId && !item.disabled);
  const webdav = (state.webdavServers || []).find((item) => item.id === webdavId && !item.disabled);

  if (!parser) {
    throw new Error('请选择可用的解析器');
  }

  if (!webdav) {
    throw new Error('请选择可用的 WebDAV 服务器');
  }

  return { parser, webdav };
}

function pickFallbackParser(state, excludedParserId) {
  const excluded = String(excludedParserId || '').trim();
  const candidates = (state.parsers || [])
    .filter((item) => item && !item.disabled)
    .filter((item) => item.id !== excluded)
    .filter((item) => item.builtinType !== 'douyin_page_api' && item.apiUrl !== 'builtin:douyin_page_api');

  if (candidates.length === 0) return null;

  const preferredId = state && state.defaults && state.defaults.parserId ? String(state.defaults.parserId) : '';
  const preferred = preferredId ? candidates.find((p) => p.id === preferredId) : null;
  return preferred || candidates.find((p) => p.isDefault) || candidates[0] || null;
}

async function directUpload(payload) {
  const state = await readState();
  const normalizedTaskSettings = normalizeTaskSettings(state.settings);
  const inputUrl = extractFirstUrl(payload.videoUrl || '');

  if (!inputUrl) {
    throw new Error('请输入有效的视频链接');
  }

  const meta = payload && payload.meta && typeof payload.meta === 'object' ? payload.meta : null;
  const metaShort = meta && meta.shortLink ? extractFirstUrl(meta.shortLink) : '';
  const metaLong = meta && meta.longLink ? extractFirstUrl(meta.longLink) : '';
  const metaAwemeId = meta && meta.awemeId ? String(meta.awemeId || '').trim() : '';
  const metaPageUrl = meta && meta.pageUrl ? String(meta.pageUrl || '') : '';
  const metaSource = meta && meta.source ? String(meta.source || '') : '';

  const selected = pickParserAndWebdav(payload, state);

  const awemeId = metaAwemeId || extractAwemeIdFromUrl(inputUrl) || extractAwemeIdFromUrl(metaLong) || extractAwemeIdFromUrl(metaShort);
  let parsed = null;
  let parsedByPage = false;
  let pageApiError = '';
  let fallbackUsed = false;
  let finalParserName = selected.parser.name;
  try {
    if (awemeId) {
      parsed = await tryParseViaActiveDouyinWebApi(awemeId);
      parsedByPage = Boolean(parsed);
    }
  } catch (error) {
    // Fallback to upstream parser when page API fails (e.g. not on Douyin tab / login restrictions).
    pageApiError = toErrorMessage(error);
    parsed = null;
  }

  const requiresPageApi = Boolean(selected.parser && selected.parser.builtinType === 'douyin_page_api');
  if (requiresPageApi && !parsed) {
    // Page API parser is best when a Douyin tab is available, but users may want to paste
    // short links elsewhere. Degrade to an upstream parser if configured.
    const fallbackParser = pickFallbackParser(state, selected.parser.id);
    const fallbackUrl = metaShort || inputUrl || metaLong;

    if (fallbackParser && fallbackUrl) {
      parsed = await parseVideo(fallbackUrl, fallbackParser);
      parsedByPage = false;
      fallbackUsed = true;
      finalParserName = `${fallbackParser.name} (自动降级)`;
    } else {
      const hint = pageApiError ? `抖音页面解析失败：${pageApiError}` : '未找到可用的抖音网页标签页';
      throw new Error(`${hint}。请在抖音网页（推荐页/详情页）打开视频后重试，或切换到网络解析器。`);
    }
  }

  if (!parsed) {
    const parseUrl = metaShort || inputUrl || metaLong;
    parsed = await parseVideo(parseUrl, selected.parser);
  }

  const uploadSourceUrl = metaLong || metaShort || inputUrl || '';
  const retryTrace = [];
  try {
    const naming = buildUploadNaming(normalizedTaskSettings, parsed, {
      sourceUrl: uploadSourceUrl,
      awemeId: metaAwemeId || awemeId
    });
    const filePath = await withRetry(
      async () => uploadParsedMedia(parsed, selected.webdav, naming.folderPath, uploadSourceUrl, {
        fileName: naming.fileName
      }),
      {
        retryPolicy: normalizedTaskSettings.retryPolicy,
        onRetry(info) {
          retryTrace.push({
            at: new Date().toISOString(),
            class: info.errorClass || 'unknown',
            message: info.message || toErrorMessage(info.error),
            attempt: info.attempt
          });
        }
      }
    );

    const history = await createHistoryRecord({
      type: 'single',
      title: parsed.title || '单视频上传',
      status: 'success',
      detail: {
        inputUrl,
        shareShortUrl: metaShort || (/v\.douyin\.com/i.test(inputUrl) ? inputUrl : ''),
        videoLongUrl: metaLong || (/\/video\//i.test(inputUrl) ? inputUrl : ''),
        awemeId: metaAwemeId || awemeId,
        pageUrl: metaPageUrl,
        linkSource: metaSource,
        mediaType: parsed.mediaType,
        parserName: parsedByPage ? '抖音页面API' : finalParserName,
        pageApiError: parsedByPage ? '' : (fallbackUsed ? pageApiError : ''),
        webdavName: selected.webdav.name,
        filePath,
        author: parsed.author || '',
        retryCount: retryTrace.length,
        retryTrace
      }
    });

    await saveHistoryRecord(history);

    return {
      parsed,
      filePath,
      history
    };
  } catch (error) {
    const errorMessage = toErrorMessage(error);
    const failureClass = classifyFailure({ error, message: errorMessage });
    const failedHistory = await createHistoryRecord({
      type: 'single',
      title: parsed && parsed.title ? parsed.title : '单视频上传',
      status: 'failed',
      detail: {
        inputUrl,
        shareShortUrl: metaShort || (/v\.douyin\.com/i.test(inputUrl) ? inputUrl : ''),
        videoLongUrl: metaLong || (/\/video\//i.test(inputUrl) ? inputUrl : ''),
        awemeId: metaAwemeId || awemeId,
        pageUrl: metaPageUrl,
        linkSource: metaSource,
        mediaType: parsed && parsed.mediaType ? parsed.mediaType : 'video',
        parserName: parsedByPage ? '抖音页面API' : finalParserName,
        pageApiError: parsedByPage ? '' : (fallbackUsed ? pageApiError : ''),
        webdavName: selected.webdav.name,
        author: parsed && parsed.author ? parsed.author : '',
        error: errorMessage,
        failureClass,
        retryCount: retryTrace.length,
        retryTrace
      }
    });
    await saveHistoryRecord(failedHistory);
    throw error;
  }
}

async function parseActiveTabContext() {
  const tabs = await tabsQuery({ active: true, currentWindow: true });
  const tab = tabs && tabs[0] ? tabs[0] : null;

  if (!tab) {
    throw new Error('未找到当前标签页');
  }

  const fallbackKind = detectDouyinPageKindFromUrl(tab.url || '');
  const fallback = {
    pageUrl: tab.url || '',
    pageKind: fallbackKind,
    videoUrl: fallbackKind === 'video' ? (tab.url || '') : '',
    userUrl: fallbackKind === 'user' ? (tab.url || '') : '',
    title: tab.title || ''
  };

  if (!tab.id) {
    return fallback;
  }

  try {
    const response = await sendToContent(tab.id, {
      type: 'EXT_EXTRACT_CONTEXT'
    });

    if (!response) {
      return fallback;
    }

    return {
      pageUrl: response.pageUrl || fallback.pageUrl,
      pageKind: response.pageKind || fallback.pageKind,
      videoUrl: response.videoUrl || fallback.videoUrl,
      userUrl: response.userUrl || fallback.userUrl,
      title: response.title || fallback.title
    };
  } catch (error) {
    return fallback;
  }
}

async function showParsedPreviewOnActiveTab(payload) {
  const parsed = payload && payload.parsed && typeof payload.parsed === 'object' ? payload.parsed : null;
  if (!parsed) {
    throw new Error('缺少预览数据');
  }

  const tabs = await tabsQuery({ active: true, currentWindow: true });
  const tab = tabs && tabs[0] ? tabs[0] : null;
  if (!tab || !tab.id) {
    throw new Error('未找到当前标签页');
  }

  const sourceUrl = extractFirstUrl(
    (payload && payload.sourceUrl) ||
    parsed.sourceUrl ||
    parsed.share_url ||
    parsed.url ||
    ''
  );

  const response = await sendToContent(tab.id, {
    type: 'EXT_SHOW_PARSED_PREVIEW',
    parsed,
    options: {
      sourceUrl
    }
  });

  if (!response || response.ok === false) {
    throw new Error((response && response.error) || '页面预览展示失败');
  }

  return {
    shown: true,
    tabId: tab.id
  };
}

async function triggerCopyShareLinkOnActiveTab() {
  const tabs = await tabsQuery({ active: true, currentWindow: true });
  const tab = tabs && tabs[0] ? tabs[0] : null;

  if (!tab || !tab.id) {
    throw new Error('未找到当前抖音标签页');
  }

  function extractAwemeIdFromUrl(url) {
    const text = String(url || '');
    const matched = text.match(/\/video\/([0-9]{10,25})/);
    return matched && matched[1] ? matched[1] : '';
  }

  function extractShortLinkFromText(text) {
    const matched = String(text || '').match(/https?:\/\/v\.douyin\.com\/[0-9A-Za-z]+\/?/);
    return matched ? matched[0].trim().replace(/\/$/, '') : '';
  }

  function buildIesShareUrl(awemeId) {
    return `https://www.iesdouyin.com/share/video/${awemeId}`;
  }

  async function fetchShortLinkByAwemeId(awemeId) {
    if (!awemeId) return '';
    const url = buildIesShareUrl(awemeId);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,*/*'
        },
        signal: controller.signal
      });

      const text = await response.text();
      return extractShortLinkFromText(text);
    } catch (error) {
      return '';
    } finally {
      clearTimeout(timeoutId);
    }
  }

  const response = await sendToContent(tab.id, {
    type: 'EXT_COPY_SHARE_LINK'
  });

  if (!response || response.ok === false) {
    const message = response && response.error ? response.error : '无法触发复制链接动作';
    throw new Error(message);
  }

  const direct = extractFirstUrl(response.link || '');
  let shortLink = extractFirstUrl(response.shortLink || '');
  if (!shortLink && /v\.douyin\.com/i.test(direct)) {
    shortLink = direct;
  }

  let longLink = extractFirstUrl(response.longLink || '');
  if (!longLink && /\/video\//i.test(direct)) {
    longLink = direct;
  }
  if (!longLink && /\/video\//i.test(tab.url || '')) {
    longLink = extractFirstUrl(tab.url || '');
  }

  const awemeId = String(response.awemeId || '').trim()
    || extractAwemeIdFromUrl(longLink)
    || extractAwemeIdFromUrl(direct)
    || extractAwemeIdFromUrl(tab.url || '');

  // Best effort: derive a v.douyin.com short url by fetching the share page HTML.
  // This is optional, and may fail depending on Douyin's page structure / login state.
  if (!shortLink && awemeId) {
    shortLink = await fetchShortLinkByAwemeId(awemeId);
  }

  const finalLink = shortLink || direct || longLink;
  if (!finalLink) {
    throw new Error('未获取到可用的视频链接');
  }

  return {
    ...response,
    ok: true,
    link: finalLink,
    shortLink: shortLink || '',
    longLink: longLink || '',
    awemeId: awemeId || '',
    pageUrl: response.pageUrl || tab.url || '',
  };
}

async function updateTask(taskId, patch) {
  let previousTask = null;
  const nextState = await mutateState((state) => {
    previousTask = state.tasks[taskId] ? clone(state.tasks[taskId]) : null;
    if (!state.tasks[taskId]) {
      state.tasks[taskId] = {
        id: taskId,
        createdAt: new Date().toISOString()
      };
    }

    const nextTask = {
      ...state.tasks[taskId],
      ...patch,
      updatedAt: new Date().toISOString()
    };
    if (String(nextTask.status || '') === 'failed' && !nextTask.failureClass) {
      nextTask.failureClass = classifyFailure({ message: nextTask.error || '' });
    }
    state.tasks[taskId] = nextTask;
  });

  const task = nextState.tasks[taskId];
  try {
    chrome.runtime.sendMessage({
      type: 'TASK_UPDATED',
      payload: task
    });
  } catch (error) {
  }

  void dispatchTaskInboxEvent(task, previousTask);

  return task;
}

async function removeTask(taskId) {
  await mutateState((state) => {
    delete state.tasks[taskId];
  });
}

const runningTaskIds = new Set();
let singleQueuePumpRunning = false;

function appendTaskLog(logs, message) {
  if (!Array.isArray(logs)) return;
  const text = String(message || '').trim();
  if (!text) return;
  logs.unshift(text);
  if (logs.length > 40) {
    logs.length = 40;
  }
}

function pickNotificationSwitch(settings, kind) {
  const normalized = normalizeNotificationSettings(settings);
  if (!normalized.enabled) return false;
  if (kind === 'success') return normalized.success === true;
  if (kind === 'failure') return normalized.failure !== false;
  if (kind === 'batch_done') return normalized.batchDone !== false;
  return false;
}

function formatInboxMessage(record, kind) {
  const detail = record && record.detail && typeof record.detail === 'object' ? record.detail : {};
  if (kind === 'failure') {
    return String(detail.error || record.error || '任务执行失败');
  }
  if (kind === 'batch_done') {
    const success = Number(detail.success || 0);
    const failed = Number(detail.failed || 0);
    const skipped = Number(detail.skipped || 0);
    const total = Number(detail.total || 0);
    return `批量任务完成：成功 ${success} / 失败 ${failed} / 跳过 ${skipped} / 总计 ${total}`;
  }
  return String(detail.filePath || detail.sourceUrl || '任务执行成功');
}

function buildInboxItemFromHistory(record, kind) {
  const detail = record && record.detail && typeof record.detail === 'object' ? record.detail : {};
  const createdAt = String(record && record.createdAt ? record.createdAt : new Date().toISOString());
  return {
    id: createId('inbox'),
    key: `history:${record.id}:${record.status}`,
    kind,
    title: String(record && record.title ? record.title : '未命名任务'),
    message: formatInboxMessage(record, kind),
    status: String(record && record.status ? record.status : ''),
    historyId: String(record && record.id ? record.id : ''),
    taskId: String(detail.taskId || detail.batchTaskId || detail.queueTaskId || ''),
    createdAt
  };
}

function buildInboxItemFromTask(task, kind) {
  const createdAt = String(task && (task.updatedAt || task.finishedAt || task.createdAt) ? (task.updatedAt || task.finishedAt || task.createdAt) : new Date().toISOString());
  return {
    id: createId('inbox'),
    key: `task:${task.id}:${task.status}`,
    kind,
    title: String(task && task.title ? task.title : '任务通知'),
    message: kind === 'failure'
      ? String(task && task.error ? task.error : '任务失败')
      : `任务状态更新：${String(task && task.status ? task.status : '')}`,
    status: String(task && task.status ? task.status : ''),
    historyId: '',
    taskId: String(task && task.id ? task.id : ''),
    createdAt
  };
}

async function listInboxItems() {
  const state = await readState();
  const list = Array.isArray(state.inbox) ? state.inbox : [];
  return list
    .slice()
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, 20);
}

async function pushInboxItem(item) {
  if (!item || typeof item !== 'object') {
    return null;
  }

  let created = null;
  await mutateState((state) => {
    if (!Array.isArray(state.inbox)) {
      state.inbox = [];
    }
    const key = String(item.key || '');
    if (key && state.inbox.some((entry) => String(entry && entry.key ? entry.key : '') === key)) {
      return;
    }
    const normalized = {
      ...item,
      id: String(item.id || createId('inbox')),
      createdAt: String(item.createdAt || new Date().toISOString())
    };
    state.inbox.unshift(normalized);
    state.inbox = state.inbox.slice(0, 200);
    created = normalized;
  });

  if (created) {
    try {
      chrome.runtime.sendMessage({
        type: 'INBOX_UPDATED',
        payload: created
      });
    } catch (error) {}
  }

  return created;
}

async function showSystemNotification(item, settings) {
  const kind = String(item && item.kind ? item.kind : '');
  if (!pickNotificationSwitch(settings, kind)) {
    return false;
  }
  if (isInQuietHours(settings, new Date())) {
    return false;
  }
  if (!chrome.notifications || typeof chrome.notifications.create !== 'function') {
    return false;
  }

  const iconUrl = 'icons/icon128.png';
  const titlePrefix = kind === 'failure'
    ? '任务失败'
    : (kind === 'batch_done' ? '批量完成' : '任务成功');
  const title = `${titlePrefix} · VideoJX`;
  const message = String(item && item.message ? item.message : '').slice(0, 300) || '任务状态已更新';
  const notificationId = `videojx_${String(item && item.id ? item.id : createId('notice')).replace(/[^a-zA-Z0-9_-]/g, '')}`;

  return new Promise((resolve) => {
    try {
      chrome.notifications.create(notificationId, {
        type: 'basic',
        iconUrl,
        title,
        message
      }, () => {
        const err = chrome.runtime.lastError;
        resolve(!err);
      });
    } catch (error) {
      resolve(false);
    }
  });
}

async function dispatchHistoryInboxEvent(record) {
  const status = String(record && record.status ? record.status : '');
  let kind = '';
  if (status === 'failed') {
    kind = 'failure';
  } else if (status === 'partial' || (status === 'success' && String(record && record.type ? record.type : '') === 'batch')) {
    kind = 'batch_done';
  } else if (status === 'success') {
    kind = 'success';
  }
  if (!kind) return false;

  const item = buildInboxItemFromHistory(record, kind);
  const created = await pushInboxItem(item);
  if (!created) {
    return false;
  }

  const state = await readState();
  const taskSettings = normalizeTaskSettings(state.settings);
  const notified = await showSystemNotification(created, taskSettings.notifications);

  await mutateState((next) => {
    next.history = (next.history || []).map((entry) => {
      if (!entry || entry.id !== record.id) return entry;
      const detail = entry.detail && typeof entry.detail === 'object' ? entry.detail : {};
      return {
        ...entry,
        detail: {
          ...detail,
          notified
        }
      };
    });
  });

  return notified;
}

async function dispatchTaskInboxEvent(task, previousTask) {
  const prevStatus = String(previousTask && previousTask.status ? previousTask.status : '');
  const nextStatus = String(task && task.status ? task.status : '');
  if (!nextStatus || nextStatus === prevStatus) {
    return;
  }

  let kind = '';
  if (nextStatus === 'failed') {
    kind = 'failure';
  }
  if (!kind) {
    return;
  }

  const item = buildInboxItemFromTask(task, kind);
  const created = await pushInboxItem(item);
  if (!created) return;

  const state = await readState();
  const taskSettings = normalizeTaskSettings(state.settings);
  await showSystemNotification(created, taskSettings.notifications);
}

function normalizeBatchLimit(value, fallback) {
  const requestedLimit = Number(value ?? fallback);
  const maxLimit = 5000;
  let limit = Number.isFinite(requestedLimit) ? Math.trunc(requestedLimit) : fallback;
  if (limit < 0) {
    limit = fallback;
  }
  limit = Math.max(0, Math.min(maxLimit, limit));
  return limit;
}

function buildBatchItemKey(input) {
  const awemeId = String(input && input.awemeId ? input.awemeId : '').trim();
  if (/^[0-9]{10,25}$/.test(awemeId)) {
    return `aweme:${awemeId}`;
  }
  const sourceUrl = extractFirstUrl(input && input.sourceUrl ? input.sourceUrl : '');
  if (sourceUrl) {
    return `src:${sourceUrl}`;
  }
  const index = Number.isFinite(Number(input && input.index)) ? Number(input.index) : -1;
  return `idx:${index}`;
}

async function saveSingleHistoryRecord(input) {
  const record = await createHistoryRecord(input);
  return saveHistoryRecord(record);
}

async function loadUploadedAwemeIds(state, taskSettings, logs) {
  const uploadedAwemeIds = collectLocalUploadedAwemeIds(state.history || []);
  appendTaskLog(logs, `本地去重基线：${uploadedAwemeIds.size} 条`);

  if (taskSettings.dedupeWithCloud && state.auth && state.auth.accessToken) {
    try {
      const cloudIds = await fetchCloudUploadedAwemeIds(3000);
      for (const id of cloudIds) {
        uploadedAwemeIds.add(id);
      }
      appendTaskLog(logs, `云端去重基线：${cloudIds.size} 条`);
    } catch (error) {
      appendTaskLog(logs, `云端去重读取失败：${toErrorMessage(error)}`);
    }
  }

  return uploadedAwemeIds;
}

async function processParsedVideosForTask(params) {
  const {
    taskId,
    videos,
    userUrl,
    selected,
    parserName,
    taskSettings,
    filters,
    uploadedAwemeIds,
    baseFolder,
    logs
  } = params;

  const total = Array.isArray(videos) ? videos.length : 0;
  const counters = {
    processed: 0,
    success: 0,
    failed: 0,
    skipped: 0
  };

  const seenKeys = new Set();
  const adaptive = taskSettings.adaptiveConcurrency !== false;
  const initialConcurrency = Math.max(1, Math.min(5, Number(taskSettings.batchConcurrency || 2)));

  await runAdaptivePool(total, {
    initialConcurrency,
    adaptive,
    onConcurrencyChange(change) {
      appendTaskLog(
        logs,
        `并发自适应：${change.previous} -> ${change.current}（失败率 ${(change.failRate * 100).toFixed(0)}%）`
      );
    },
    worker: async (index) => {
      const video = videos[index];
      const title = video && video.title ? String(video.title) : `视频_${index + 1}`;
      const sourceUrl = extractFirstUrl((video && (video.share_url || video.url)) || userUrl || '');
      const awemeId = String(
        (video && (video.awemeId || video.aweme_id)) || extractAwemeIdFromUrl(sourceUrl) || ''
      ).trim();
      const itemKey = buildBatchItemKey({ awemeId, sourceUrl, index });

      if (seenKeys.has(itemKey)) {
        counters.skipped += 1;
        counters.processed += 1;
        appendTaskLog(logs, `⏭️ ${title} - 跳过（任务内重复）`);
      } else {
        seenKeys.add(itemKey);
        if (awemeId && uploadedAwemeIds.has(awemeId)) {
          counters.skipped += 1;
          counters.processed += 1;
          appendTaskLog(logs, `⏭️ ${title} - 跳过（已上传 awemeId=${awemeId}）`);
        } else {
          const parsedLike = {
            ...video,
            uploadDate: video && (video.uploadDate || video.time),
            isPinned: Boolean(video && (video.isPinned || video.is_top || video.top === 1))
          };
          const filterCheck = evaluateBatchFilter(parsedLike, filters, 'local');
          if (!filterCheck.matched) {
            counters.skipped += 1;
            counters.processed += 1;
            appendTaskLog(logs, `⏭️ ${title} - ${filterCheck.reason}`);
          } else {
            let retryCount = 0;
            const retryTrace = [];
            try {
              const naming = buildUploadNaming(taskSettings, parsedLike, {
                sourceUrl,
                awemeId,
                index: index + 1,
                uploadDate: parsedLike.uploadDate
              });
              const folderPath = naming.folderPath || baseFolder || '';

              const filePath = await withRetry(
                async () => uploadParsedMedia(parsedLike, selected.webdav, folderPath, sourceUrl, {
                  fileName: naming.fileName
                }),
                {
                  retryPolicy: taskSettings.retryPolicy,
                  onRetry(info) {
                    retryCount = info.attempt;
                    retryTrace.push({
                      at: new Date().toISOString(),
                      class: info.errorClass || 'unknown',
                      message: info.message || toErrorMessage(info.error),
                      attempt: info.attempt
                    });
                    appendTaskLog(logs, `🔁 ${title} - 第 ${info.attempt} 次重试（${Math.round(info.delay / 1000)}s 后）`);
                  }
                }
              );

              await saveSingleHistoryRecord({
                type: 'single',
                title,
                status: 'success',
                detail: {
                  mediaType: parsedLike.mediaType || 'video',
                  parserName,
                  webdavName: selected.webdav.name,
                  filePath,
                  sourceUrl: sourceUrl || userUrl,
                  awemeId,
                  retryCount,
                  retryTrace,
                  batchTaskId: taskId
                }
              });

              if (awemeId) {
                uploadedAwemeIds.add(awemeId);
              }

              counters.success += 1;
              counters.processed += 1;
              appendTaskLog(logs, `✅ ${title}${retryCount > 0 ? `（重试 ${retryCount} 次）` : ''}`);
            } catch (error) {
              const errorMessage = toErrorMessage(error);
              const failureClass = classifyFailure({ error, message: errorMessage });
              counters.failed += 1;
              counters.processed += 1;
              appendTaskLog(logs, `❌ ${title} - ${errorMessage}`);

              await saveSingleHistoryRecord({
                type: 'single',
                title,
                status: 'failed',
                detail: {
                  mediaType: parsedLike.mediaType || 'video',
                  parserName,
                  webdavName: selected.webdav.name,
                  sourceUrl: sourceUrl || userUrl,
                  awemeId,
                  retryCount,
                  retryTrace,
                  error: errorMessage,
                  failureClass,
                  batchTaskId: taskId
                }
              });
            }
          }
        }
      }

      const progress = total > 0 ? (10 + Math.round((counters.processed / total) * 85)) : 95;
      await updateTask(taskId, {
        processed: counters.processed,
        success: counters.success,
        failed: counters.failed,
        skipped: counters.skipped,
        progress,
        logs: logs.slice(0, 20)
      });
      return true;
    }
  });

  return counters;
}

async function processAwemeIdsForTask(params) {
  const {
    taskId,
    awemeIds,
    userUrl,
    secUid,
    selected,
    taskSettings,
    filters,
    uploadedAwemeIds,
    logs
  } = params;

  const total = Array.isArray(awemeIds) ? awemeIds.length : 0;
  const counters = {
    processed: 0,
    success: 0,
    failed: 0,
    skipped: 0
  };

  const seenKeys = new Set();
  let fallbackFolder = sanitizeName(secUid || 'douyin_user', 60);
  const adaptive = taskSettings.adaptiveConcurrency !== false;
  const initialConcurrency = Math.max(1, Math.min(5, Number(taskSettings.batchConcurrency || 2)));

  await runAdaptivePool(total, {
    initialConcurrency,
    adaptive,
    onConcurrencyChange(change) {
      appendTaskLog(
        logs,
        `并发自适应：${change.previous} -> ${change.current}（失败率 ${(change.failRate * 100).toFixed(0)}%）`
      );
    },
    worker: async (index) => {
      const awemeId = String(awemeIds[index] || '').trim();
      const sourceUrl = buildDouyinLongUrl(awemeId) || userUrl || '';
      const titleFallback = `aweme_${awemeId}`;
      const itemKey = buildBatchItemKey({ awemeId, sourceUrl, index });

      if (seenKeys.has(itemKey)) {
        counters.skipped += 1;
        counters.processed += 1;
        appendTaskLog(logs, `⏭️ ${titleFallback} - 跳过（任务内重复）`);
      } else {
        seenKeys.add(itemKey);
        if (awemeId && uploadedAwemeIds.has(awemeId)) {
          counters.skipped += 1;
          counters.processed += 1;
          appendTaskLog(logs, `⏭️ ${titleFallback} - 跳过（已上传 awemeId=${awemeId}）`);
        } else {
          let retryCount = 0;
          const retryTrace = [];
          try {
            const parsed = await withRetry(
              async () => {
                const result = await tryParseViaActiveDouyinWebApi(awemeId);
                if (!result) {
                  throw new Error('抖音页面解析结果为空');
                }
                return result;
              },
              {
                retryPolicy: taskSettings.retryPolicy,
                onRetry(info) {
                  retryCount = info.attempt;
                  retryTrace.push({
                    at: new Date().toISOString(),
                    class: info.errorClass || 'unknown',
                    message: info.message || toErrorMessage(info.error),
                    attempt: info.attempt
                  });
                  appendTaskLog(logs, `🔁 ${titleFallback} - 页面解析重试 ${info.attempt} 次`);
                }
              }
            );

            const filterCheck = evaluateBatchFilter(parsed, filters, 'local');
            if (!filterCheck.matched) {
              counters.skipped += 1;
              counters.processed += 1;
              appendTaskLog(logs, `⏭️ ${parsed.title || titleFallback} - ${filterCheck.reason}`);
            } else {
              const nickname = parsed && parsed.author ? String(parsed.author || '').trim() : '';
              if (nickname) {
                fallbackFolder = sanitizeName(nickname, 60);
              }

              const naming = buildUploadNaming(taskSettings, parsed, {
                sourceUrl,
                awemeId,
                index: index + 1,
                uploadDate: parsed.uploadDate || parsed.time
              });
              const folderPath = naming.folderPath || fallbackFolder || '';

              const filePath = await withRetry(
                async () => uploadParsedMedia(parsed, selected.webdav, folderPath, sourceUrl, {
                  fileName: naming.fileName
                }),
                {
                  retryPolicy: taskSettings.retryPolicy,
                  onRetry(info) {
                    retryCount = Math.max(retryCount, info.attempt);
                    retryTrace.push({
                      at: new Date().toISOString(),
                      class: info.errorClass || 'unknown',
                      message: info.message || toErrorMessage(info.error),
                      attempt: info.attempt
                    });
                    appendTaskLog(logs, `🔁 ${parsed.title || titleFallback} - 上传重试 ${info.attempt} 次`);
                  }
                }
              );

              await saveSingleHistoryRecord({
                type: 'single',
                title: parsed.title || titleFallback,
                status: 'success',
                detail: {
                  mediaType: parsed.mediaType || 'video',
                  parserName: '抖音页面API',
                  webdavName: selected.webdav.name,
                  filePath,
                  sourceUrl,
                  awemeId,
                  retryCount,
                  retryTrace,
                  batchTaskId: taskId
                }
              });

              if (awemeId) {
                uploadedAwemeIds.add(awemeId);
              }

              counters.success += 1;
              counters.processed += 1;
              appendTaskLog(logs, `✅ ${parsed.title || titleFallback}${retryCount > 0 ? `（重试 ${retryCount} 次）` : ''}`);
            }
          } catch (error) {
            const errorMessage = toErrorMessage(error);
            const failureClass = classifyFailure({ error, message: errorMessage });
            counters.failed += 1;
            counters.processed += 1;
            appendTaskLog(logs, `❌ ${titleFallback} - ${errorMessage}`);

            await saveSingleHistoryRecord({
              type: 'single',
              title: titleFallback,
              status: 'failed',
              detail: {
                mediaType: 'video',
                parserName: '抖音页面API',
                webdavName: selected.webdav.name,
                sourceUrl,
                awemeId,
                retryCount,
                retryTrace,
                error: errorMessage,
                failureClass,
                batchTaskId: taskId
              }
            });
          }
        }
      }

      const progress = total > 0 ? (10 + Math.round((counters.processed / total) * 85)) : 95;
      await updateTask(taskId, {
        processed: counters.processed,
        success: counters.success,
        failed: counters.failed,
        skipped: counters.skipped,
        progress,
        logs: logs.slice(0, 20)
      });
      return true;
    }
  });

  return counters;
}

function launchTaskRunner(taskId, runner) {
  if (!taskId || runningTaskIds.has(taskId)) {
    return;
  }
  runningTaskIds.add(taskId);
  Promise.resolve()
    .then(() => runner())
    .catch(() => {})
    .finally(() => {
      runningTaskIds.delete(taskId);
    });
}

function isSingleQueueTask(task) {
  if (!task || typeof task !== 'object') return false;
  return String(task.type || '') === 'single_queue_upload';
}

function isSingleQueuePendingStatus(status) {
  return status === 'queued' || status === 'pending' || status === 'resuming' || status === 'running';
}

function taskTimeMs(task, field) {
  const raw = task && task[field] ? Date.parse(String(task[field])) : NaN;
  return Number.isFinite(raw) ? raw : 0;
}

async function pickNextSingleQueueTask() {
  const state = await readState();
  const list = Object.values(state.tasks || {})
    .filter((task) => isSingleQueueTask(task))
    .filter((task) => isSingleQueuePendingStatus(String(task.status || '')))
    .sort((a, b) => {
      const aCreated = taskTimeMs(a, 'createdAt');
      const bCreated = taskTimeMs(b, 'createdAt');
      if (aCreated !== bCreated) return aCreated - bCreated;
      return String(a.id || '').localeCompare(String(b.id || ''));
    });
  return list[0] || null;
}

async function runQueuedSingleUpload(taskId, payload) {
  const data = payload && typeof payload === 'object' ? payload : {};
  const state = await readState();
  const selected = pickParserAndWebdav(data, state);
  const taskSettings = normalizeTaskSettings(state.settings);
  const inputUrl = extractFirstUrl(data.videoUrl || '');
  if (!inputUrl) {
    throw new Error('任务链接无效');
  }

  const preparedParsed = data.parsed && typeof data.parsed === 'object' ? data.parsed : null;
  if (!preparedParsed) {
    // Fallback to direct flow when parsed data is missing.
    return directUpload(data);
  }

  const meta = data.meta && typeof data.meta === 'object' ? data.meta : null;
  const metaShort = meta && meta.shortLink ? extractFirstUrl(meta.shortLink) : '';
  const metaLong = meta && meta.longLink ? extractFirstUrl(meta.longLink) : '';
  const metaAwemeId = meta && meta.awemeId ? String(meta.awemeId || '').trim() : '';
  const awemeId = metaAwemeId || extractAwemeIdFromUrl(inputUrl) || extractAwemeIdFromUrl(metaLong) || extractAwemeIdFromUrl(metaShort);
  const uploadSourceUrl = metaLong || metaShort || inputUrl || '';
  const retryTrace = [];

  const naming = buildUploadNaming(taskSettings, preparedParsed, {
    sourceUrl: uploadSourceUrl,
    awemeId
  });
  let filePath = '';
  try {
    filePath = await withRetry(
      async () => uploadParsedMedia(preparedParsed, selected.webdav, naming.folderPath, uploadSourceUrl, {
        fileName: naming.fileName
      }),
      {
        retryPolicy: taskSettings.retryPolicy,
        onRetry(info) {
          retryTrace.push({
            at: new Date().toISOString(),
            class: info.errorClass || 'unknown',
            message: info.message || toErrorMessage(info.error),
            attempt: info.attempt
          });
        }
      }
    );
  } catch (error) {
    try {
      error.retryTrace = retryTrace.slice();
    } catch (attachError) {}
    throw error;
  }

  const history = await createHistoryRecord({
    type: 'single',
    title: preparedParsed.title || '队列上传',
    status: 'success',
    detail: {
      inputUrl,
      shareShortUrl: metaShort || (/v\.douyin\.com/i.test(inputUrl) ? inputUrl : ''),
      videoLongUrl: metaLong || (/\/video\//i.test(inputUrl) ? inputUrl : ''),
      awemeId,
      parserName: String(data.parserName || selected.parser.name || '未知解析器'),
      webdavName: selected.webdav.name,
      filePath,
      sourceUrl: uploadSourceUrl,
      queueTaskId: taskId,
      mediaType: preparedParsed.mediaType || 'video',
      author: preparedParsed.author || '',
      retryCount: retryTrace.length,
      retryTrace
    }
  });

  await saveHistoryRecord(history);

  return {
    parsed: preparedParsed,
    filePath,
    history
  };
}

async function appendFailedQueueHistory(taskId, payload, errorMessage, retryTrace) {
  const data = payload && typeof payload === 'object' ? payload : {};
  const parsed = data.parsed && typeof data.parsed === 'object' ? data.parsed : null;
  const title = parsed && parsed.title ? String(parsed.title) : '队列上传';
  const sourceUrl = extractFirstUrl(data.videoUrl || '');
  const traces = Array.isArray(retryTrace) ? retryTrace : [];
  const failureClass = classifyFailure({ message: errorMessage });

  const failRecord = await createHistoryRecord({
    type: 'single',
    title,
    status: 'failed',
    detail: {
      inputUrl: sourceUrl,
      sourceUrl,
      parserName: String(data.parserName || ''),
      awemeId: String(data && data.meta && data.meta.awemeId ? data.meta.awemeId : ''),
      error: errorMessage,
      failureClass,
      retryCount: traces.length,
      retryTrace: traces,
      queueTaskId: taskId
    }
  });
  await saveHistoryRecord(failRecord);
}

async function pumpSingleUploadQueue() {
  if (singleQueuePumpRunning) {
    return;
  }
  singleQueuePumpRunning = true;
  try {
    while (true) {
      const nextTask = await pickNextSingleQueueTask();
      if (!nextTask || !nextTask.id) {
        break;
      }

      const taskId = String(nextTask.id);
      if (runningTaskIds.has(taskId)) {
        await sleep(150);
        continue;
      }

      runningTaskIds.add(taskId);
      try {
        await updateTask(taskId, {
          status: 'running',
          progress: 15,
          logs: ['后台任务执行中，请勿重复添加相同链接']
        });

        const result = await runQueuedSingleUpload(taskId, nextTask.payload || {});
        await updateTask(taskId, {
          status: 'completed',
          progress: 100,
          filePath: result && result.filePath ? String(result.filePath) : '',
          title: result && result.parsed && result.parsed.title ? String(result.parsed.title) : String(nextTask.title || ''),
          finishedAt: new Date().toISOString(),
          logs: ['任务完成，已写入历史记录']
        });
      } catch (error) {
        const message = toErrorMessage(error);
        const failureClass = classifyFailure({ error, message });
        await appendFailedQueueHistory(taskId, nextTask.payload || {}, message, error && Array.isArray(error.retryTrace) ? error.retryTrace : []).catch(() => {});
        await updateTask(taskId, {
          status: 'failed',
          progress: 100,
          error: message,
          failureClass,
          finishedAt: new Date().toISOString(),
          logs: [`任务失败：${message}`]
        });
      } finally {
        runningTaskIds.delete(taskId);
      }
    }
  } finally {
    singleQueuePumpRunning = false;
  }
}

async function enqueueSingleUploadTask(payload) {
  const data = payload && typeof payload === 'object' ? payload : {};
  const inputUrl = extractFirstUrl(data.videoUrl || '');
  if (!inputUrl) {
    throw new Error('请输入有效的视频链接');
  }

  const state = await readState();
  const selected = pickParserAndWebdav(data, state);
  const parsed = data.parsed && typeof data.parsed === 'object' ? data.parsed : null;
  if (!parsed) {
    throw new Error('请先解析成功后再加入队列');
  }

  const title = String(parsed.title || '未命名任务');
  const taskId = createId('queue');
  const now = new Date().toISOString();

  const pendingCount = Object.values(state.tasks || {}).filter((task) => {
    if (!isSingleQueueTask(task)) return false;
    return isSingleQueuePendingStatus(String(task.status || ''));
  }).length;

  await updateTask(taskId, {
    id: taskId,
    type: 'single_queue_upload',
    status: 'queued',
    progress: 0,
    title,
    parserName: String(data.parserName || selected.parser.name || ''),
    webdavName: String(selected.webdav.name || ''),
    sourceUrl: inputUrl,
    payload: {
      videoUrl: inputUrl,
      parserId: data.parserId || selected.parser.id,
      webdavId: data.webdavId || selected.webdav.id,
      meta: data.meta && typeof data.meta === 'object' ? data.meta : null,
      parsed,
      parserName: String(data.parserName || selected.parser.name || '')
    },
    createdAt: now,
    logs: ['已加入队列，等待后台处理']
  });

  void pumpSingleUploadQueue();

  return {
    taskId,
    title,
    position: pendingCount + 1
  };
}

async function runUserBatchUpload(taskId, payload) {
  try {
    const state = await readState();
    const selected = pickParserAndWebdav(payload, state);
    const taskSettings = normalizeTaskSettings(state.settings);
    const filters = normalizeBatchFilters((payload && payload.filters) || taskSettings.batchFilters);
    const userUrl = extractFirstUrl(payload.userUrl || payload.sourceUrl || '');
    const limit = normalizeBatchLimit(payload && payload.limit, 20);

    if (!userUrl) {
      throw new Error('请输入有效的用户主页链接');
    }

    const logs = [];
    appendTaskLog(logs, limit === 0 ? '开始解析用户主页（全量）' : `开始解析用户主页（最多 ${limit} 条）`);
    await updateTask(taskId, {
      status: 'parsing_user',
      sourceUrl: userUrl,
      parserName: selected.parser.name,
      webdavName: selected.webdav.name,
      filters,
      payload,
      progress: 5,
      processed: 0,
      success: 0,
      failed: 0,
      skipped: 0,
      total: 0,
      logs: logs.slice(0, 20)
    });

    const parsedUser = await apiRequest('/api/extension/douyin-user', {
      method: 'POST',
      useAuth: true,
      body: {
        url: userUrl,
        limit
      }
    });

    const videos = parsedUser && parsedUser.data && Array.isArray(parsedUser.data.videos)
      ? parsedUser.data.videos
      : [];

    if (videos.length === 0) {
      throw new Error('用户主页下没有可上传的视频');
    }

    const uploadedAwemeIds = await loadUploadedAwemeIds(state, taskSettings, logs);
    const parseHint = limit === 0 && videos.length >= 1000
      ? `解析成功，共 ${videos.length} 条（数量较大，预计耗时较长），开始上传`
      : `解析成功，共 ${videos.length} 条，开始上传`;
    appendTaskLog(logs, parseHint);

    await updateTask(taskId, {
      status: 'uploading',
      total: videos.length,
      progress: 10,
      logs: logs.slice(0, 20)
    });

    const counters = await processParsedVideosForTask({
      taskId,
      videos,
      userUrl,
      selected,
      parserName: selected.parser.name,
      taskSettings,
      filters,
      uploadedAwemeIds,
      baseFolder: sanitizeName(parsedUser?.data?.userInfo?.nickname || '', 60),
      logs
    });

    const summaryRecord = await createHistoryRecord({
      type: 'batch',
      title: `用户主页批量上传 (${counters.success}/${videos.length})`,
      status: counters.failed > 0 ? 'partial' : 'success',
      detail: {
        sourceUrl: userUrl,
        parserName: selected.parser.name,
        webdavName: selected.webdav.name,
        total: videos.length,
        success: counters.success,
        failed: counters.failed,
        skipped: counters.skipped,
        filters,
        taskId
      }
    });

    await saveHistoryRecord(summaryRecord);

    await updateTask(taskId, {
      status: 'completed',
      progress: 100,
      summaryRecordId: summaryRecord.id,
      finishedAt: new Date().toISOString()
    });
  } catch (error) {
    const message = toErrorMessage(error);
    await updateTask(taskId, {
      status: 'failed',
      progress: 100,
      error: message,
      failureClass: classifyFailure({ error, message }),
      finishedAt: new Date().toISOString()
    });
  }
}

async function startUserBatchUpload(payload) {
  const taskId = createId('batch');
  const normalizedPayload = {
    ...(payload || {}),
    limit: normalizeBatchLimit(payload && payload.limit, 20),
    filters: normalizeBatchFilters(payload && payload.filters)
  };

  await updateTask(taskId, {
    id: taskId,
    type: 'user_batch_upload',
    status: 'pending',
    progress: 0,
    createdAt: new Date().toISOString(),
    sourceUrl: normalizedPayload.userUrl || '',
    payload: normalizedPayload
  });

  launchTaskRunner(taskId, async () => {
    await runUserBatchUpload(taskId, normalizedPayload);
  });

  return { taskId };
}

async function runUserPageBatchUpload(taskId, payload) {
  try {
    const state = await readState();
    const selected = pickParserAndWebdav(payload, state);
    const taskSettings = normalizeTaskSettings(state.settings);
    const filters = normalizeBatchFilters((payload && payload.filters) || taskSettings.batchFilters);

    const activeTabs = await tabsQuery({ active: true, currentWindow: true });
    const activeTab = activeTabs && activeTabs[0] ? activeTabs[0] : null;

    const tabUrl = (activeTab && activeTab.url) ? String(activeTab.url) : '';
    const pageKind = detectDouyinPageKindFromUrl(tabUrl);
    const userUrl = extractFirstUrl(payload.userUrl || payload.sourceUrl || tabUrl || '');

    await updateTask(taskId, {
      status: 'collecting',
      sourceUrl: userUrl,
      pageKind,
      parserName: '抖音页面API',
      webdavName: selected.webdav.name,
      filters,
      payload,
      progress: 5,
      processed: 0,
      success: 0,
      failed: 0,
      skipped: 0,
      total: 0,
      logs: ['开始采集用户主页视频列表']
    });

    let collectResult = null;
    if (activeTab && activeTab.id && pageKind === 'user') {
      try {
        collectResult = await sendToContent(activeTab.id, {
          type: 'EXT_COLLECT_USER_AWEME_IDS',
          options: {
            maxItems: 0,
            maxScrollMs: 120000,
            stableRounds: 3,
            restoreScroll: true
          }
        });
      } catch (error) {
        collectResult = { ok: false, error: toErrorMessage(error) };
      }
    } else {
      collectResult = { ok: false, error: '未在抖音用户主页标签页内，无法进行页面采集' };
    }

    if (collectResult && collectResult.ok && collectResult.canceled) {
      await updateTask(taskId, {
        status: 'canceled',
        progress: 100,
        logs: ['已取消采集'],
        finishedAt: new Date().toISOString()
      });
      return;
    }

    const collectedIds = collectResult && collectResult.ok && Array.isArray(collectResult.awemeIds)
      ? collectResult.awemeIds
      : [];
    const timedOut = Boolean(collectResult && collectResult.ok && collectResult.timedOut);

    const shouldFallback =
      !collectResult ||
      collectResult.ok === false ||
      !Array.isArray(collectedIds) ||
      collectedIds.length === 0 ||
      (timedOut && collectedIds.length < 3);

    if (shouldFallback) {
      if (!userUrl) {
        throw new Error(collectResult && collectResult.error ? collectResult.error : '采集失败且缺少用户主页链接');
      }

      await updateTask(taskId, {
        logs: [
          `页面采集失败：${collectResult && collectResult.error ? collectResult.error : '未知原因'}`,
          '改用后端接口解析（limit=0）...'
        ]
      });

      const parsedUser = await apiRequest('/api/extension/douyin-user', {
        method: 'POST',
        useAuth: true,
        body: {
          url: userUrl,
          limit: 0
        }
      });

      const videos = parsedUser && parsedUser.data && Array.isArray(parsedUser.data.videos)
        ? parsedUser.data.videos
        : [];

      if (videos.length === 0) {
        throw new Error('后端解析未返回可上传的视频');
      }

      const logs = [];
      appendTaskLog(logs, `后端解析成功，共 ${videos.length} 条，开始上传`);
      const uploadedAwemeIds = await loadUploadedAwemeIds(state, taskSettings, logs);
      await updateTask(taskId, {
        status: 'uploading',
        total: videos.length,
        progress: 10,
        logs: logs.slice(0, 20)
      });

      const counters = await processParsedVideosForTask({
        taskId,
        videos,
        userUrl,
        selected,
        parserName: '后端用户解析',
        taskSettings,
        filters,
        uploadedAwemeIds,
        baseFolder: sanitizeName(parsedUser?.data?.userInfo?.nickname || '', 60),
        logs
      });

      const summaryRecord = await createHistoryRecord({
        type: 'batch',
        title: `用户主页批量上传 (${counters.success}/${videos.length})`,
        status: counters.failed > 0 ? 'partial' : 'success',
        detail: {
          sourceUrl: userUrl,
          parserName: '后端用户解析',
          webdavName: selected.webdav.name,
          total: videos.length,
          success: counters.success,
          failed: counters.failed,
          skipped: counters.skipped,
          filters,
          taskId
        }
      });

      await saveHistoryRecord(summaryRecord);

      await updateTask(taskId, {
        status: 'completed',
        progress: 100,
        summaryRecordId: summaryRecord.id,
        finishedAt: new Date().toISOString()
      });

      return;
    }

    const secUid = String(collectResult.secUid || '').trim();
    const uniqueIds = [];
    const dedupe = new Set();
    for (const item of collectedIds) {
      const id = String(item || '').trim();
      if (!/^[0-9]{10,25}$/.test(id)) continue;
      if (dedupe.has(id)) continue;
      dedupe.add(id);
      uniqueIds.push(id);
    }

    if (uniqueIds.length === 0) {
      throw new Error('采集结果为空，无法开始上传');
    }

    const collectHint = timedOut ? `采集成功，共 ${uniqueIds.length} 条（采集超时，使用已采集部分），开始上传` : `采集成功，共 ${uniqueIds.length} 条，开始上传`;
    const logs = [];
    appendTaskLog(logs, collectHint);
    const uploadedAwemeIds = await loadUploadedAwemeIds(state, taskSettings, logs);

    await updateTask(taskId, {
      status: 'uploading',
      total: uniqueIds.length,
      progress: 10,
      logs: logs.slice(0, 20)
    });

    const counters = await processAwemeIdsForTask({
      taskId,
      awemeIds: uniqueIds,
      userUrl,
      secUid,
      selected,
      taskSettings,
      filters,
      uploadedAwemeIds,
      logs
    });

    const summaryRecord = await createHistoryRecord({
      type: 'batch',
      title: `用户主页批量上传 (${counters.success}/${uniqueIds.length})`,
      status: counters.failed > 0 ? 'partial' : 'success',
      detail: {
        sourceUrl: userUrl,
        parserName: '抖音页面API',
        webdavName: selected.webdav.name,
        total: uniqueIds.length,
        success: counters.success,
        failed: counters.failed,
        skipped: counters.skipped,
        filters,
        taskId
      }
    });

    await saveHistoryRecord(summaryRecord);

    await updateTask(taskId, {
      status: 'completed',
      progress: 100,
      summaryRecordId: summaryRecord.id,
      finishedAt: new Date().toISOString()
    });
  } catch (error) {
    const message = toErrorMessage(error);
    await updateTask(taskId, {
      status: 'failed',
      progress: 100,
      error: message,
      failureClass: classifyFailure({ error, message }),
      finishedAt: new Date().toISOString()
    });
  }
}

async function startUserPageBatchUpload(payload) {
  const taskId = createId('batch');
  const normalizedPayload = {
    ...(payload || {}),
    filters: normalizeBatchFilters(payload && payload.filters)
  };

  await updateTask(taskId, {
    id: taskId,
    type: 'user_page_batch_upload',
    status: 'collecting',
    progress: 0,
    createdAt: new Date().toISOString(),
    sourceUrl: normalizedPayload.userUrl || normalizedPayload.sourceUrl || '',
    payload: normalizedPayload
  });

  launchTaskRunner(taskId, async () => {
    await runUserPageBatchUpload(taskId, normalizedPayload);
  });

  return { taskId };
}

async function resumePendingTasks() {
  const state = await readState();
  const taskSettings = normalizeTaskSettings(state.settings);
  if (taskSettings.autoResumeTasks === false) {
    return { resumed: 0 };
  }

  const tasks = Object.values(state.tasks || {});
  const resumable = tasks.filter((task) => {
    if (!task || typeof task !== 'object') return false;
    const status = String(task.status || '');
    const type = String(task.type || '');
    const payload = task.payload && typeof task.payload === 'object' ? task.payload : null;
    if (!payload) return false;
    if (runningTaskIds.has(task.id)) return false;
    if (type !== 'user_batch_upload' && type !== 'user_page_batch_upload' && type !== 'single_queue_upload') return false;
    return status === 'queued' || status === 'pending' || status === 'collecting' || status === 'parsing_user' || status === 'uploading' || status === 'resuming' || status === 'running';
  });

  let resumed = 0;
  for (const task of resumable) {
    resumed += 1;
    const taskId = String(task.id || '');
    await updateTask(taskId, {
      status: 'resuming',
      logs: [`检测到未完成任务，自动恢复（${task.type}）`]
    });

    if (task.type === 'single_queue_upload') {
      await updateTask(taskId, {
        status: 'queued',
        logs: ['检测到未完成任务，已恢复到队列']
      });
      void pumpSingleUploadQueue();
    } else if (task.type === 'user_page_batch_upload') {
      launchTaskRunner(taskId, async () => {
        await runUserPageBatchUpload(taskId, task.payload || {});
      });
    } else {
      launchTaskRunner(taskId, async () => {
        await runUserBatchUpload(taskId, task.payload || {});
      });
    }
  }

  return { resumed };
}

async function getPublicState() {
  const state = await readState();
  return {
    settings: state.settings,
    parsers: state.parsers,
    webdavServers: state.webdavServers,
    defaults: state.defaults,
    auth: {
      loggedIn: Boolean(state.auth && state.auth.accessToken),
      user: state.auth ? state.auth.user : null,
      expiresAt: state.auth ? state.auth.expiresAt : 0
    },
    historyCount: (state.history || []).length,
    taskCount: Object.keys(state.tasks || {}).length,
    inboxCount: Array.isArray(state.inbox) ? state.inbox.length : 0
  };
}

async function saveConfiguration(payload) {
  await mutateState((state) => {
    let touched = false;

    if (payload.settings && typeof payload.settings === 'object') {
      state.settings = {
        ...state.settings,
        ...payload.settings,
        apiBaseUrl: normalizeBaseUrl(payload.settings.apiBaseUrl || state.settings.apiBaseUrl)
      };

      const normalizedTaskSettings = normalizeTaskSettings(state.settings);
      state.settings.batchConcurrency = normalizedTaskSettings.batchConcurrency;
      state.settings.adaptiveConcurrency = normalizedTaskSettings.adaptiveConcurrency;
      state.settings.autoResumeTasks = normalizedTaskSettings.autoResumeTasks;
      state.settings.dedupeWithCloud = normalizedTaskSettings.dedupeWithCloud;
      state.settings.batchRetryCount = normalizedTaskSettings.batchRetryCount;
      state.settings.retryPolicy = normalizeRetryPolicy(normalizedTaskSettings.retryPolicy, normalizedTaskSettings.batchRetryCount);
      state.settings.notifications = normalizeNotificationSettings(normalizedTaskSettings.notifications);
      state.settings.templateProfiles = normalizeTemplateProfiles(normalizedTaskSettings.templateProfiles);
      state.settings.uploadFolderTemplate = normalizedTaskSettings.uploadFolderTemplate;
      state.settings.uploadFileTemplate = normalizedTaskSettings.uploadFileTemplate;
      state.settings.batchFilters = normalizeBatchFilters(normalizedTaskSettings.batchFilters);
      state.settings.historyLimit = Math.max(100, Math.min(1000, Number(state.settings.historyLimit || 500)));
      touched = true;
    }

    if (Array.isArray(payload.parsers)) {
      state.parsers = payload.parsers;
      touched = true;
    }

    if (Array.isArray(payload.webdavServers)) {
      state.webdavServers = payload.webdavServers;
      touched = true;
    }

    if (payload.defaults && typeof payload.defaults === 'object') {
      state.defaults = {
        ...state.defaults,
        ...payload.defaults
      };
      touched = true;
    }

    const parserExists = (state.parsers || []).some((item) => item.id === state.defaults.parserId && !item.disabled);
    if (!parserExists) {
      const fallbackParser = (state.parsers || []).find((item) => !item.disabled);
      state.defaults.parserId = fallbackParser ? fallbackParser.id : '';
    }

    const webdavExists = (state.webdavServers || []).some((item) => item.id === state.defaults.webdavId && !item.disabled);
    if (!webdavExists) {
      const fallbackWebdav = (state.webdavServers || []).find((item) => !item.disabled);
      state.defaults.webdavId = fallbackWebdav ? fallbackWebdav.id : '';
    }

    if (touched) {
      state.settings.configUpdatedAt = Date.now();
      state.settings.configUserId = state.auth && state.auth.user && state.auth.user.id
        ? String(state.auth.user.id)
        : '';
    }
  });

  return getPublicState();
}

async function listHistory() {
  const state = await readState();
  return state.history || [];
}

async function deleteHistoryRecord(payload) {
  const id = String(payload.id || '').trim();
  if (!id) {
    throw new Error('缺少历史记录 ID');
  }

  const state = await readState();
  const target = (state.history || []).find((item) => item.id === id);

  await mutateState((next) => {
    next.history = (next.history || []).filter((item) => item.id !== id);
  });

  if (target && state.auth && state.auth.accessToken) {
    try {
      await apiRequest(`/api/extension/history/${id}`, {
        method: 'DELETE',
        useAuth: true
      });
    } catch (error) {
    }
  }

  return { success: true };
}

async function clearHistory() {
  await mutateState((state) => {
    state.history = [];
  });

  return { success: true };
}

async function listTasks() {
  const state = await readState();
  const tasks = Object.values(state.tasks || {}).sort((a, b) => {
    return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
  });
  return tasks;
}

function isRecoverableTaskFailure(task, retryPolicy) {
  if (!task || typeof task !== 'object') return false;
  if (String(task.status || '') !== 'failed') return false;
  const failureClass = String(task.failureClass || classifyFailure({ message: task.error || '' }));
  return isRetryableClass(failureClass, retryPolicy);
}

async function retryRecoverableTasks() {
  const state = await readState();
  const taskSettings = normalizeTaskSettings(state.settings);
  const retryPolicy = taskSettings.retryPolicy;
  const tasks = Object.values(state.tasks || {});
  const recoverable = tasks.filter((task) => isRecoverableTaskFailure(task, retryPolicy));

  let queued = 0;
  let relaunched = 0;

  for (const task of recoverable) {
    const taskId = String(task.id || '');
    const payload = task && task.payload && typeof task.payload === 'object' ? task.payload : null;
    if (!taskId || !payload) continue;
    const type = String(task.type || '');

    if (type === 'single_queue_upload') {
      queued += 1;
      await updateTask(taskId, {
        status: 'queued',
        progress: 0,
        error: '',
        failureClass: '',
        logs: ['可恢复失败任务已重新入队，等待后台执行']
      });
      continue;
    }

    if (type === 'user_batch_upload') {
      relaunched += 1;
      await updateTask(taskId, {
        status: 'pending',
        progress: 0,
        error: '',
        failureClass: '',
        logs: ['可恢复失败任务已重新启动']
      });
      launchTaskRunner(taskId, async () => {
        await runUserBatchUpload(taskId, payload || {});
      });
      continue;
    }

    if (type === 'user_page_batch_upload') {
      relaunched += 1;
      await updateTask(taskId, {
        status: 'collecting',
        progress: 0,
        error: '',
        failureClass: '',
        logs: ['可恢复失败任务已重新启动']
      });
      launchTaskRunner(taskId, async () => {
        await runUserPageBatchUpload(taskId, payload || {});
      });
    }
  }

  if (queued > 0) {
    void pumpSingleUploadQueue();
  }

  return {
    matched: recoverable.length,
    queued,
    relaunched
  };
}

async function saveNotificationSettings(payload) {
  const input = payload && payload.notifications && typeof payload.notifications === 'object'
    ? payload.notifications
    : payload || {};
  const notifications = normalizeNotificationSettings(input);

  await mutateState((state) => {
    const normalizedTaskSettings = normalizeTaskSettings(state.settings);
    state.settings = {
      ...state.settings,
      ...normalizedTaskSettings,
      notifications
    };
    state.settings.configUpdatedAt = Date.now();
    state.settings.configUserId = state.auth && state.auth.user && state.auth.user.id
      ? String(state.auth.user.id)
      : '';
  });

  return getPublicState();
}

async function saveRetryPolicySettings(payload) {
  const input = payload && payload.retryPolicy && typeof payload.retryPolicy === 'object'
    ? payload.retryPolicy
    : payload || {};

  await mutateState((state) => {
    const normalizedTaskSettings = normalizeTaskSettings(state.settings);
    const retryPolicy = normalizeRetryPolicy(input, normalizedTaskSettings.batchRetryCount);
    state.settings = {
      ...state.settings,
      ...normalizedTaskSettings,
      retryPolicy,
      batchRetryCount: retryPolicy.maxRetries
    };
    state.settings.configUpdatedAt = Date.now();
    state.settings.configUserId = state.auth && state.auth.user && state.auth.user.id
      ? String(state.auth.user.id)
      : '';
  });

  return getPublicState();
}

const handlers = {
  async STATE_GET() {
    return getPublicState();
  },

  async CONFIG_SAVE(payload) {
    return saveConfiguration(payload || {});
  },

  async CONFIG_SYNC_AUTO() {
    const result = await syncConfigAuto();
    return {
      ...(result || {}),
      state: await getPublicState()
    };
  },

  async AUTH_LOGIN(payload) {
    return login(payload || {});
  },

  async AUTH_REGISTER(payload) {
    return register(payload || {});
  },

  async AUTH_LOGOUT() {
    return logout();
  },

  async AUTH_SESSION() {
    return checkSession();
  },

  async VIDEO_EXTRACT_ACTIVE() {
    return parseActiveTabContext();
  },

  async VIDEO_COPY_SHARE_LINK() {
    return triggerCopyShareLinkOnActiveTab();
  },

  async VIDEO_PARSE(payload) {
    const state = await readState();
    const parser = payload && payload.parserId
      ? (state.parsers || []).find((item) => item.id === payload.parserId)
      : (state.parsers || []).find((item) => item.id === state.defaults.parserId);

    if (!parser) {
      throw new Error('未找到可用解析器');
    }

    const url = extractFirstUrl(payload.videoUrl || '');
    if (!url) {
      throw new Error('请输入有效的视频链接');
    }

    const meta = payload && payload.meta && typeof payload.meta === 'object' ? payload.meta : null;
    const metaShort = meta && meta.shortLink ? extractFirstUrl(meta.shortLink) : '';
    const metaLong = meta && meta.longLink ? extractFirstUrl(meta.longLink) : '';
    const metaAwemeId = meta && meta.awemeId ? String(meta.awemeId || '').trim() : '';

    const awemeId = metaAwemeId || extractAwemeIdFromUrl(url) || extractAwemeIdFromUrl(metaLong) || extractAwemeIdFromUrl(metaShort);
    let parsed = null;
    let parsedByPage = false;
    let pageApiError = '';

    const requiresPageApi = Boolean(parser && parser.builtinType === 'douyin_page_api');
    if (awemeId) {
      try {
        parsed = await tryParseViaActiveDouyinWebApi(awemeId);
        parsedByPage = Boolean(parsed);
      } catch (error) {
        pageApiError = toErrorMessage(error);
        parsed = null;
      }
    }

    if (requiresPageApi && !parsed) {
      const fallbackParser = pickFallbackParser(state, parser.id);
      const fallbackUrl = metaShort || url || metaLong;
      if (fallbackParser && fallbackUrl) {
        parsed = await parseVideo(fallbackUrl, fallbackParser);
        parsedByPage = false;
        return {
          parsed,
          parserName: `${fallbackParser.name} (自动降级)`
        };
      }

      const hint = pageApiError ? `抖音页面解析失败：${pageApiError}` : '未找到可用的抖音网页标签页';
      throw new Error(`${hint}。请在抖音网页（推荐页/详情页）打开视频后重试，或切换到网络解析器。`);
    }

    if (!parsed) {
      // Upstream parsers often only support v.douyin.com short links.
      const parseUrl = (!requiresPageApi && metaShort && !/v\.douyin\.com/i.test(url)) ? metaShort : url;
      parsed = await parseVideo(parseUrl, parser);
    }

    return {
      parsed,
      parserName: parsedByPage ? '抖音页面API' : parser.name
    };
  },

  async PREVIEW_SHOW_ACTIVE(payload) {
    return showParsedPreviewOnActiveTab(payload || {});
  },

  async VIDEO_DIRECT_UPLOAD(payload) {
    return directUpload(payload || {});
  },

  async QUEUE_ADD_UPLOAD(payload) {
    return enqueueSingleUploadTask(payload || {});
  },

  async SMART_UPLOAD_ACTIVE(payload) {
    const state = await readState();
    const selected = pickParserAndWebdav(payload || {}, state);
    const ctx = await parseActiveTabContext();
    const pageKind = ctx && ctx.pageKind ? String(ctx.pageKind) : 'unknown';

    if (pageKind === 'user') {
      const userUrl = extractFirstUrl(ctx.userUrl || ctx.pageUrl || '');
      const result = await startUserPageBatchUpload({
        ...(payload || {}),
        userUrl,
        parserId: selected.parser.id,
        webdavId: selected.webdav.id
      });
      return {
        mode: 'batch',
        taskId: result.taskId,
        pageKind,
        userUrl
      };
    }

    const meta = await triggerCopyShareLinkOnActiveTab();
    const single = await directUpload({
      ...(payload || {}),
      videoUrl: meta.link,
      meta,
      parserId: selected.parser.id,
      webdavId: selected.webdav.id
    });

    return {
      mode: 'single',
      pageKind,
      meta,
      ...single
    };
  },

  async WEBDAV_TEST(payload) {
    const config = payload && payload.webdavConfig ? payload.webdavConfig : null;
    if (!config || !config.url || !config.username || !config.password) {
      throw new Error('缺少 WebDAV 配置（需要地址/用户名/密码）');
    }
    await apiRequest('/api/proxy/webdav/test', {
      method: 'POST',
      useAuth: true,
      body: {
        webdavConfig: {
          url: String(config.url || ''),
          username: String(config.username || ''),
          password: String(config.password || ''),
          basePath: String(config.basePath || '')
        }
      }
    });
    return { success: true };
  },

  async BATCH_START(payload) {
    return startUserBatchUpload(payload || {});
  },

  async TASKS_LIST() {
    return listTasks();
  },

  async TASKS_INBOX_LIST() {
    return listInboxItems();
  },

  async TASKS_RETRY_RECOVERABLE() {
    return retryRecoverableTasks();
  },

  async TASKS_RESUME() {
    return resumePendingTasks();
  },

  async TASK_DELETE(payload) {
    const id = String(payload.id || '').trim();
    if (!id) {
      throw new Error('缺少任务ID');
    }
    await removeTask(id);
    return { success: true };
  },

  async HISTORY_LIST() {
    return listHistory();
  },

  async HISTORY_DELETE(payload) {
    return deleteHistoryRecord(payload || {});
  },

  async HISTORY_CLEAR() {
    return clearHistory();
  },

  async HISTORY_SYNC_ALL() {
    return syncAllHistoryToCloud();
  },

  async HISTORY_PULL_REMOTE() {
    return pullHistoryFromCloud();
  },

  async SETTINGS_NOTIFY_SAVE(payload) {
    return saveNotificationSettings(payload || {});
  },

  async SETTINGS_RETRY_POLICY_SAVE(payload) {
    return saveRetryPolicySettings(payload || {});
  }
};

chrome.runtime.onInstalled.addListener(() => {
  ensureInitialized()
    .then(() => resumePendingTasks())
    .catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  ensureInitialized()
    .then(() => resumePendingTasks())
    .catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const type = message && message.type;
  const payload = message ? message.payload : undefined;
  const handler = handlers[type];

  if (!handler) {
    return false;
  }

  (async () => {
    try {
      await ensureInitialized();
      const data = await handler(payload, sender);
      sendResponse({ ok: true, data });
    } catch (error) {
      sendResponse({ ok: false, error: toErrorMessage(error) });
    }
  })();

  return true;
});
