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
  const stored = await storageGet(STORAGE_KEY);
  const merged = patchDeep(DEFAULT_STATE, stored || {});
  return merged;
}

async function writeState(state) {
  await storageSet({ [STORAGE_KEY]: state });
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
      const exists = (state.parsers || []).some((item) => item && item.id === builtin.id);
      if (!exists) {
        state.parsers.unshift(clone(builtin));
      }
    }

    if (!state.defaults.parserId || !state.parsers.some((item) => item.id === state.defaults.parserId && !item.disabled)) {
      const defaultParser = state.parsers.find((item) => item.isDefault && !item.disabled) || state.parsers[0];
      state.defaults.parserId = defaultParser ? defaultParser.id : '';
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

    if (!state.auth || typeof state.auth !== 'object') {
      state.auth = clone(DEFAULT_STATE.auth);
    }

    if (!state.settings || typeof state.settings !== 'object') {
      state.settings = clone(DEFAULT_STATE.settings);
    }

    state.settings.apiBaseUrl = normalizeBaseUrl(state.settings.apiBaseUrl || DEFAULT_STATE.settings.apiBaseUrl);
    state.settings.batchConcurrency = Math.max(1, Math.min(5, Number(state.settings.batchConcurrency || 2)));
    state.settings.historyLimit = Math.max(100, Math.min(1000, Number(state.settings.historyLimit || 500)));
    state.settings.configUpdatedAt = Math.max(0, Number(state.settings.configUpdatedAt || 0));
    state.settings.lastConfigSyncAt = Math.max(0, Number(state.settings.lastConfigSyncAt || 0));
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
  await mutateState((state) => {
    state.auth = session;
  });
  return session;
}

async function clearAuth() {
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
    await clearAuth();
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

  await clearAuth();
}

function pickExtensionConfigSnapshot(state) {
  return {
    settings: {
      apiBaseUrl: normalizeBaseUrl(state?.settings?.apiBaseUrl || DEFAULT_STATE.settings.apiBaseUrl),
      autoSyncHistory: state?.settings?.autoSyncHistory !== false,
      batchConcurrency: Math.max(1, Math.min(5, Number(state?.settings?.batchConcurrency || 2))),
      historyLimit: Math.max(100, Math.min(1000, Number(state?.settings?.historyLimit || 500)))
    },
    parsers: Array.isArray(state?.parsers) ? state.parsers : [],
    webdavServers: Array.isArray(state?.webdavServers) ? state.webdavServers : [],
    defaults: state?.defaults && typeof state.defaults === 'object'
      ? state.defaults
      : { parserId: '', webdavId: '' }
  };
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

      state.settings.batchConcurrency = Math.max(1, Math.min(5, Number(state.settings.batchConcurrency || 2)));
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
  });

  // Ensure builtin parsers exist even if cloud config overwrote them.
  await ensureInitialized();
}

async function syncConfigAuto() {
  const state = await readState();
  if (!state.auth || !state.auth.accessToken) {
    throw new Error('请先登录再同步配置');
  }

  const localUpdatedAt = Math.max(0, Number(state.settings && state.settings.configUpdatedAt ? state.settings.configUpdatedAt : 0));

  const remote = await apiRequest('/api/extension/config', {
    method: 'GET',
    useAuth: true
  });

  const remoteUpdatedAt = Math.max(0, Number(remote && remote.data && remote.data.updatedAt ? remote.data.updatedAt : 0));
  const remoteConfig = remote && remote.data ? remote.data.config : null;

  if (!remoteUpdatedAt) {
    const nextUpdatedAt = localUpdatedAt || Date.now();
    const snapshot = pickExtensionConfigSnapshot(state);

    await apiRequest('/api/extension/config', {
      method: 'POST',
      useAuth: true,
      body: { config: snapshot, updatedAt: nextUpdatedAt }
    });

    await mutateState((next) => {
      next.settings.configUpdatedAt = nextUpdatedAt;
      next.settings.lastConfigSyncAt = Date.now();
    });

    return { mode: 'push', updatedAt: nextUpdatedAt, remoteUpdatedAt, message: '云端暂无配置，已上传本机配置。' };
  }

  if (remoteUpdatedAt > localUpdatedAt) {
    await applyCloudConfig(remoteConfig, remoteUpdatedAt);
    return { mode: 'pull', updatedAt: remoteUpdatedAt, remoteUpdatedAt, message: '已拉取云端配置并覆盖本机配置。' };
  }

  if (localUpdatedAt > remoteUpdatedAt) {
    const snapshot = pickExtensionConfigSnapshot(state);
    await apiRequest('/api/extension/config', {
      method: 'POST',
      useAuth: true,
      body: { config: snapshot, updatedAt: localUpdatedAt }
    });

    await mutateState((next) => {
      next.settings.lastConfigSyncAt = Date.now();
    });

    return { mode: 'push', updatedAt: localUpdatedAt, remoteUpdatedAt, message: '本机配置较新，已上传到云端。' };
  }

  await mutateState((next) => {
    next.settings.lastConfigSyncAt = Date.now();
  });

  return { mode: 'noop', updatedAt: localUpdatedAt, remoteUpdatedAt, message: '配置已是最新，无需同步。' };
}

async function createHistoryRecord(input) {
  const now = new Date().toISOString();
  const record = {
    id: input.id || createId('history'),
    type: input.type || 'single',
    createdAt: input.createdAt || now,
    updatedAt: now,
    title: input.title || '未命名任务',
    status: input.status || 'success',
    source: input.source || 'extension',
    detail: input.detail || {},
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

  return resultRecord;
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

  const cloudList = await apiRequest('/api/extension/history?limit=500&offset=0', {
    method: 'GET',
    useAuth: true
  });

  await mutateState((next) => {
    next.history = Array.isArray(cloudList.data) ? cloudList.data : next.history;
  });

  return { success, failed };
}

async function parseVideo(videoUrl, parserConfig) {
  if (!videoUrl) {
    throw new Error('缺少视频链接');
  }

  if (!parserConfig) {
    throw new Error('缺少解析器配置');
  }

  const response = await apiRequest('/api/extension/parse', {
    method: 'POST',
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

async function uploadParsedMedia(parsedInfo, webdavConfig, folderPath, sourceUrl) {
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
    fileName: inferFileName(effectiveParsedInfo),
    folderPath: folderPath || ''
  };

  const response = await apiRequest('/api/extension/upload', {
    method: 'POST',
    body
  });

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
  const filePath = await uploadParsedMedia(parsed, selected.webdav, '', uploadSourceUrl);

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
      author: parsed.author || ''
    }
  });

  await saveHistoryRecord(history);

  return {
    parsed,
    filePath,
    history
  };
}

async function parseActiveTabContext() {
  const tabs = await tabsQuery({ active: true, currentWindow: true });
  const tab = tabs && tabs[0] ? tabs[0] : null;

  if (!tab) {
    throw new Error('未找到当前标签页');
  }

  const fallback = {
    pageUrl: tab.url || '',
    videoUrl: tab.url || '',
    userUrl: /\/user\//i.test(tab.url || '') ? tab.url : '',
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
      videoUrl: response.videoUrl || fallback.videoUrl,
      userUrl: response.userUrl || fallback.userUrl,
      title: response.title || fallback.title
    };
  } catch (error) {
    return fallback;
  }
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
  const nextState = await mutateState((state) => {
    if (!state.tasks[taskId]) {
      state.tasks[taskId] = {
        id: taskId,
        createdAt: new Date().toISOString()
      };
    }

    state.tasks[taskId] = {
      ...state.tasks[taskId],
      ...patch,
      updatedAt: new Date().toISOString()
    };
  });

  const task = nextState.tasks[taskId];
  try {
    chrome.runtime.sendMessage({
      type: 'TASK_UPDATED',
      payload: task
    });
  } catch (error) {
  }

  return task;
}

async function removeTask(taskId) {
  await mutateState((state) => {
    delete state.tasks[taskId];
  });
}

async function runUserBatchUpload(taskId, payload) {
  try {
    const state = await readState();
    const selected = pickParserAndWebdav(payload, state);
    const userUrl = extractFirstUrl(payload.userUrl || payload.sourceUrl || '');
    const limit = Math.max(1, Math.min(200, Number(payload.limit || 20)));
    const concurrency = Math.max(1, Math.min(5, Number(state.settings.batchConcurrency || 2)));

    if (!userUrl) {
      throw new Error('请输入有效的用户主页链接');
    }

    await updateTask(taskId, {
      status: 'parsing_user',
      sourceUrl: userUrl,
      parserName: selected.parser.name,
      webdavName: selected.webdav.name,
      progress: 5,
      processed: 0,
      success: 0,
      failed: 0,
      total: 0,
      logs: ['开始解析用户主页']
    });

    const parsedUser = await apiRequest('/api/extension/douyin-user', {
      method: 'POST',
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

    await updateTask(taskId, {
      status: 'uploading',
      total: videos.length,
      progress: 10,
      logs: [`解析成功，共 ${videos.length} 条，开始上传`] 
    });

    const taskCounters = {
      processed: 0,
      success: 0,
      failed: 0
    };

    const logs = [];

    let cursor = 0;
    async function worker() {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= videos.length) {
          return;
        }

        const video = videos[index];
        const title = video && video.title ? video.title : `视频_${index + 1}`;

        try {
          const videoSourceUrl = extractFirstUrl(video.share_url || video.url || userUrl || '');
          const filePath = await uploadParsedMedia(
            video,
            selected.webdav,
            sanitizeName(parsedUser?.data?.userInfo?.nickname || '', 60),
            videoSourceUrl
          );

          const history = await createHistoryRecord({
            type: 'single',
            title,
            status: 'success',
            detail: {
              mediaType: video.mediaType || 'video',
              parserName: selected.parser.name,
              webdavName: selected.webdav.name,
              filePath,
              sourceUrl: video.share_url || userUrl,
              batchTaskId: taskId
            }
          });
          await saveHistoryRecord(history);

          taskCounters.success += 1;
          logs.unshift(`✅ ${title}`);
        } catch (error) {
          taskCounters.failed += 1;
          logs.unshift(`❌ ${title} - ${toErrorMessage(error)}`);
        }

        taskCounters.processed += 1;

        const progress = 10 + Math.round((taskCounters.processed / videos.length) * 85);
        await updateTask(taskId, {
          processed: taskCounters.processed,
          success: taskCounters.success,
          failed: taskCounters.failed,
          progress,
          logs: logs.slice(0, 20)
        });
      }
    }

    await Promise.all(Array.from({ length: concurrency }, () => worker()));

    const summaryRecord = await createHistoryRecord({
      type: 'batch',
      title: `用户主页批量上传 (${taskCounters.success}/${videos.length})`,
      status: taskCounters.failed > 0 ? 'partial' : 'success',
      detail: {
        sourceUrl: userUrl,
        parserName: selected.parser.name,
        webdavName: selected.webdav.name,
        total: videos.length,
        success: taskCounters.success,
        failed: taskCounters.failed,
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
    await updateTask(taskId, {
      status: 'failed',
      progress: 100,
      error: toErrorMessage(error),
      finishedAt: new Date().toISOString()
    });
  }
}

async function startUserBatchUpload(payload) {
  const taskId = createId('batch');

  await updateTask(taskId, {
    id: taskId,
    type: 'user_batch_upload',
    status: 'pending',
    progress: 0,
    createdAt: new Date().toISOString(),
    sourceUrl: payload.userUrl || ''
  });

  runUserBatchUpload(taskId, payload).catch(async (error) => {
    await updateTask(taskId, {
      status: 'failed',
      progress: 100,
      error: toErrorMessage(error)
    });
  });

  return { taskId };
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
    taskCount: Object.keys(state.tasks || {}).length
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

      state.settings.batchConcurrency = Math.max(1, Math.min(5, Number(state.settings.batchConcurrency || 2)));
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

  async VIDEO_DIRECT_UPLOAD(payload) {
    return directUpload(payload || {});
  },

  async WEBDAV_TEST(payload) {
    const config = payload && payload.webdavConfig ? payload.webdavConfig : null;
    if (!config || !config.url || !config.username || !config.password) {
      throw new Error('缺少 WebDAV 配置（需要地址/用户名/密码）');
    }
    await apiRequest('/api/proxy/webdav/test', {
      method: 'POST',
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
  }
};

chrome.runtime.onInstalled.addListener(() => {
  ensureInitialized().catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  ensureInitialized().catch(() => {});
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
