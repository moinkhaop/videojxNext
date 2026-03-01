(function () {
  const REQUEST_TYPE = 'VIDEOJX_PAGE_BRIDGE_REQUEST';
  const RESPONSE_TYPE = 'VIDEOJX_PAGE_BRIDGE_RESPONSE';
  const READY_TYPE = 'VIDEOJX_PAGE_BRIDGE_READY';
  const PING_TYPE = 'VIDEOJX_PAGE_BRIDGE_PING';

  function postReady() {
    try {
      window.postMessage({ type: READY_TYPE }, '*');
    } catch (error) {}
  }

  function postResponse(requestId, ok, payload, error) {
    try {
      window.postMessage(
        {
          type: RESPONSE_TYPE,
          requestId,
          ok: Boolean(ok),
          payload: payload === undefined ? null : payload,
          error: error ? String(error) : ''
        },
        '*'
      );
    } catch (err) {}
  }

  function normalizeAwemeId(value) {
    const id = String(value || '').trim();
    return /^[0-9]{10,25}$/.test(id) ? id : '';
  }

  function ensureFetchHook() {
    try {
      if (window.__VIDEOJX_FETCH_HOOK_INSTALLED) {
        return;
      }

      window.__VIDEOJX_FETCH_HOOK_INSTALLED = true;
      window.__VIDEOJX_AWEME_CACHE = window.__VIDEOJX_AWEME_CACHE || Object.create(null);

      const cache = window.__VIDEOJX_AWEME_CACHE;
      const originalFetch = window.fetch;
      if (typeof originalFetch !== 'function') {
        return;
      }

      window.fetch = async (...args) => {
        const response = await originalFetch(...args);
        try {
          const input = args && args[0] ? args[0] : '';
          const url =
            typeof input === 'string'
              ? input
              : input && input.url
                ? String(input.url)
                : '';

          if (!url || (!url.includes('/aweme/v1/web/') && !url.includes('aweme/v1/web/'))) {
            return response;
          }
          if (!response || !response.ok) {
            return response;
          }

          const data = await response.clone().json().catch(() => null);
          if (!data || typeof data !== 'object') {
            return response;
          }

          const detail = data.aweme_detail || data.awemeDetail;
          if (detail && typeof detail === 'object') {
            const detailId = normalizeAwemeId(detail.aweme_id || detail.awemeId);
            if (detailId) {
              cache[detailId] = detail;
            }
            return response;
          }

          const list = data.aweme_list || data.awemeList;
          if (Array.isArray(list)) {
            for (const item of list) {
              if (!item || typeof item !== 'object') {
                continue;
              }
              const itemId = normalizeAwemeId(item.aweme_id || item.awemeId);
              if (itemId) {
                cache[itemId] = item;
              }
            }
          }
        } catch (error) {}

        return response;
      };
    } catch (error) {}
  }

  async function fetchAwemeDetail(awemeId) {
    const id = normalizeAwemeId(awemeId);
    if (!id) {
      throw new Error('aweme_id 无效');
    }

    const response = await fetch(
      `/aweme/v1/web/aweme/detail/?aid=6383&aweme_id=${encodeURIComponent(id)}`,
      { credentials: 'include' }
    );
    return response.json();
  }

  function readCachedAwemeDetail(awemeId) {
    const id = normalizeAwemeId(awemeId);
    if (!id) {
      return null;
    }

    const cache = window.__VIDEOJX_AWEME_CACHE;
    if (!cache || typeof cache !== 'object') {
      return null;
    }
    return cache[id] || null;
  }

  function readUserAwemeIds(secUid) {
    const cache = window.__VIDEOJX_AWEME_CACHE || Object.create(null);
    const normalizedSecUid = String(secUid || '');
    const out = [];

    for (const key of Object.keys(cache)) {
      const item = cache[key];
      if (!item || typeof item !== 'object') {
        continue;
      }
      const author = item.author && typeof item.author === 'object' ? item.author : null;
      const itemSecUid = author ? author.sec_uid || author.secUid || '' : '';
      if (normalizedSecUid) {
        if (!itemSecUid) {
          continue;
        }
        if (String(itemSecUid) !== normalizedSecUid) {
          continue;
        }
      }
      out.push(String(key));
    }

    return out;
  }

  async function handleBridgeRequest(action, payload) {
    ensureFetchHook();

    switch (action) {
      case 'READ_AWEME_CACHE':
        return readCachedAwemeDetail(payload && payload.awemeId);
      case 'FETCH_AWEME_DETAIL':
        return fetchAwemeDetail(payload && payload.awemeId);
      case 'READ_USER_AWEME_IDS':
        return { awemeIds: readUserAwemeIds(payload && payload.secUid) };
      default:
        throw new Error(`未知 bridge action: ${String(action || '')}`);
    }
  }

  if (!window.__VIDEOJX_PAGE_BRIDGE_LISTENER__) {
    window.__VIDEOJX_PAGE_BRIDGE_LISTENER__ = true;

    window.addEventListener('message', (event) => {
      if (event.source !== window) {
        return;
      }
      const data = event.data;
      if (!data || typeof data !== 'object') {
        return;
      }

      if (data.type === PING_TYPE) {
        postReady();
        return;
      }
      if (data.type !== REQUEST_TYPE) {
        return;
      }

      const requestId = String(data.requestId || '');
      if (!requestId) {
        return;
      }

      Promise.resolve(handleBridgeRequest(data.action, data.payload))
        .then((payload) => {
          postResponse(requestId, true, payload, '');
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          postResponse(requestId, false, null, message);
        });
    });
  }

  ensureFetchHook();
  postReady();
})();
