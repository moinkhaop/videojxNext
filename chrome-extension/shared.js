(function () {
  const STORAGE_KEY = 'videojx_extension_state_v1';

  const DEFAULT_STATE = {
    settings: {
      apiBaseUrl: 'https://dyjx.ehhx.qzz.io',
      autoSyncHistory: true,
      batchConcurrency: 2,
      historyLimit: 500,
      configUpdatedAt: 0,
      lastConfigSyncAt: 0
    },
    parsers: [
      {
        id: 'builtin_parser_douyin_page_api',
        name: '抖音页面解析器（内置，支持长链接）',
        apiUrl: 'builtin:douyin_page_api',
        requestMethod: 'GET',
        urlParamName: 'url',
        isDefault: false,
        isBuiltin: true,
        builtinType: 'douyin_page_api',
        disabled: false
      },
      {
        id: 'builtin_parser_jxcxin',
        name: '默认抖音解析器',
        apiUrl: 'https://apis.jxcxin.cn/api/douyin',
        requestMethod: 'GET',
        urlParamName: 'url',
        isDefault: true,
        isBuiltin: true,
        disabled: false
      }
    ],
    webdavServers: [],
    defaults: {
      parserId: 'builtin_parser_jxcxin',
      webdavId: ''
    },
    auth: {
      accessToken: '',
      refreshToken: '',
      expiresAt: 0,
      user: null,
      loggedInAt: 0
    },
    history: [],
    tasks: {}
  };

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function createId(prefix) {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
      return `${prefix}_${globalThis.crypto.randomUUID()}`;
    }

    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function sanitizeName(text, maxLength) {
    const source = String(text || '').trim();
    const fallback = 'untitled';
    const cleaned = (source || fallback)
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      .replace(/\s+/g, ' ')
      .trim();

    return cleaned.slice(0, maxLength || 80) || fallback;
  }

  function normalizeBaseUrl(url) {
    return String(url || '').trim().replace(/\/$/, '');
  }

  function isDouyinUrl(text) {
    return /douyin\.com|iesdouyin\.com|v\.douyin\.com/i.test(String(text || ''));
  }

  function extractFirstUrl(text) {
    const matched = String(text || '').match(/https?:\/\/[^\s]+/i);
    return matched ? matched[0].trim().replace(/\/$/, '') : '';
  }

  function inferFileName(parsedInfo) {
    if (!parsedInfo || typeof parsedInfo !== 'object') {
      return `video_${Date.now()}.mp4`;
    }

    const title = sanitizeName(parsedInfo.title || 'untitled', 80);

    if (parsedInfo.mediaType === 'image_album') {
      return title;
    }

    const rawFormat = String(parsedInfo.format || 'mp4').toLowerCase();
    const format = /^[a-z0-9]{2,8}$/.test(rawFormat) ? rawFormat : 'mp4';
    return `${title}.${format}`;
  }

  function formatDate(value) {
    try {
      return new Date(value).toLocaleString();
    } catch (error) {
      return String(value || '');
    }
  }

  function patchDeep(target, source) {
    const out = clone(target);
    Object.keys(source || {}).forEach((key) => {
      const nextValue = source[key];
      if (
        nextValue &&
        typeof nextValue === 'object' &&
        !Array.isArray(nextValue) &&
        out[key] &&
        typeof out[key] === 'object' &&
        !Array.isArray(out[key])
      ) {
        out[key] = patchDeep(out[key], nextValue);
        return;
      }
      out[key] = nextValue;
    });
    return out;
  }

  globalThis.ExtShared = {
    STORAGE_KEY,
    DEFAULT_STATE,
    clone,
    createId,
    sanitizeName,
    normalizeBaseUrl,
    isDouyinUrl,
    extractFirstUrl,
    inferFileName,
    formatDate,
    patchDeep
  };
})();
