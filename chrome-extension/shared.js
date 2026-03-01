(function () {
  const STORAGE_KEY = 'videojx_extension_state_v1';

  const DEFAULT_STATE = {
    settings: {
      apiBaseUrl: 'https://dyjx.ehhx.qzz.io',
      autoSyncHistory: true,
      batchConcurrency: 2,
      adaptiveConcurrency: true,
      autoResumeTasks: true,
      dedupeWithCloud: true,
      batchRetryCount: 2,
      historyLimit: 500,
      uploadFolderTemplate: '{author}',
      uploadFileTemplate: '{awemeId}_{title}',
      batchFilters: {
        mediaType: 'all',
        minDurationSec: 0,
        startDate: '',
        endDate: '',
        excludePinned: false
      },
      configUpdatedAt: 0,
      lastConfigSyncAt: 0,
      lastHistorySyncAt: 0,
      lastHistorySyncSuccess: 0,
      lastHistorySyncFailed: 0
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
        id: 'builtin_parser_next_douyin',
        name: '内置抖音解析器（多上游自动降级）',
        apiUrl: '/api/douyin/parse',
        requestMethod: 'POST',
        urlParamName: 'url',
        isDefault: true,
        isBuiltin: true,
        disabled: false
      },
      {
        id: 'builtin_parser_jxcxin',
        name: '默认抖音解析器',
        apiUrl: 'https://apis.jxcxin.cn/api/douyin',
        requestMethod: 'GET',
        urlParamName: 'url',
        isDefault: false,
        isBuiltin: true,
        disabled: false
      },
      {
        id: 'builtin_parser_douyin_wtf',
        name: 'douyin.wtf（抖音/多平台）',
        apiUrl: 'https://api.douyin.wtf/api/hybrid/video_data',
        requestMethod: 'GET',
        urlParamName: 'url',
        isDefault: false,
        isBuiltin: true,
        disabled: false
      },
      {
        id: 'builtin_parser_mmp_dyhome',
        name: 'MMP dyhome（抖音）',
        apiUrl: 'https://api.mmp.cc/api/dyhome',
        requestMethod: 'GET',
        urlParamName: 'url',
        isDefault: false,
        isBuiltin: true,
        disabled: false
      },
      {
        id: 'builtin_parser_yujn',
        name: '遇见API（抖音/多平台）',
        apiUrl: 'https://api.yujn.cn/api/dy_jx.php',
        requestMethod: 'GET',
        urlParamName: 'msg',
        isDefault: false,
        isBuiltin: true,
        disabled: false
      },
      {
        id: 'builtin_parser_xzdx',
        name: 'xzdx.top（多平台）',
        apiUrl: 'https://xzdx.top/api/duan',
        requestMethod: 'GET',
        urlParamName: 'url',
        isDefault: false,
        isBuiltin: true,
        disabled: false
      },
      {
        id: 'builtin_parser_oick_douyin',
        name: 'Oick（抖音）',
        apiUrl: 'https://api.oick.cn/douyin/',
        requestMethod: 'GET',
        urlParamName: 'url',
        isDefault: false,
        isBuiltin: true,
        disabled: false
      },
      {
        id: 'builtin_parser_pearktrue_douyin',
        name: 'Pearktrue（抖音/多平台）',
        apiUrl: 'https://api.pearktrue.cn/api/video/douyin/',
        requestMethod: 'GET',
        urlParamName: 'url',
        isDefault: false,
        isBuiltin: true,
        disabled: false
      },
      {
        id: 'builtin_parser_next_bilibili',
        name: '内置B站解析器（上游失败自动降级官方接口）',
        apiUrl: '/api/bilibili/parse',
        requestMethod: 'POST',
        urlParamName: 'url',
        isDefault: false,
        isBuiltin: true,
        disabled: false
      }
    ],
    webdavServers: [],
    defaults: {
      // Prefer stable builtin parser (server-side multi-upstream) over third-party nodes.
      parserId: 'builtin_parser_next_douyin',
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
    const normalized = String(text || '')
      .replace(/\u3000/g, ' ')
      .replace(/：/g, ':')
      .replace(/／/g, '/');

    const short = normalized.match(/(?:https?:\/\/)?v\.douyin\.com\/([A-Za-z0-9_-]{4,})(?:\/)?/i);
    if (short && short[1]) {
      return `https://v.douyin.com/${short[1]}/`;
    }

    const douyin = normalized.match(/(?:https?:\/\/)?(?:www\.)?(?:douyin\.com|iesdouyin\.com)\/[A-Za-z0-9\-._~%!$&'()*+,;=:@/?#[\]]+/i);
    if (douyin && douyin[0]) {
      const candidate = douyin[0].replace(/[),.;!?'"`，。！？；、）】》〉」』”’]+$/, '');
      return /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
    }

    const generic = normalized.match(/https?:\/\/[A-Za-z0-9\-._~%!$&'()*+,;=:@/?#[\]]+/i);
    if (generic && generic[0]) {
      return generic[0].replace(/[),.;!?'"`，。！？；、）】》〉」』”’]+$/, '');
    }

    return '';
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
