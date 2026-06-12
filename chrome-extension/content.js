(function () {
  if (globalThis.__videojxContentLoaded) {
    return;
  }
  globalThis.__videojxContentLoaded = true;

  const PAGE_BRIDGE_SCRIPT_ID = 'videojx-page-bridge-script';
  const PAGE_BRIDGE_READY_TIMEOUT_MS = 3000;
  const PAGE_BRIDGE_REQUEST_TYPE = 'VIDEOJX_PAGE_BRIDGE_REQUEST';
  const PAGE_BRIDGE_RESPONSE_TYPE = 'VIDEOJX_PAGE_BRIDGE_RESPONSE';
  const PAGE_BRIDGE_READY_TYPE = 'VIDEOJX_PAGE_BRIDGE_READY';
  const PAGE_BRIDGE_PING_TYPE = 'VIDEOJX_PAGE_BRIDGE_PING';

  let pageBridgeReadyPromise = null;

  function isDouyinHost(hostname) {
    const host = String(hostname || '').toLowerCase();
    return (
      host === 'douyin.com' ||
      host === 'www.douyin.com' ||
      host.endsWith('.douyin.com') ||
      host === 'iesdouyin.com' ||
      host === 'www.iesdouyin.com' ||
      host.endsWith('.iesdouyin.com')
    );
  }

  function ensureMainWorldBridgeReady() {
    if (pageBridgeReadyPromise) {
      return pageBridgeReadyPromise;
    }

    pageBridgeReadyPromise = new Promise((resolve, reject) => {
      try {
        const host = String(window.location && window.location.hostname ? window.location.hostname : '').toLowerCase();
        if (!isDouyinHost(host)) {
          reject(new Error('当前页面不是抖音域名'));
          return;
        }

        let settled = false;
        const timeoutId = setTimeout(() => {
          finish(false, new Error('页面桥接脚本加载超时'));
        }, PAGE_BRIDGE_READY_TIMEOUT_MS);

        function cleanup() {
          clearTimeout(timeoutId);
          window.removeEventListener('message', onMessage);
        }

        function finish(ok, value) {
          if (settled) {
            return;
          }
          settled = true;
          cleanup();
          if (ok) {
            resolve(value);
          } else {
            reject(value);
          }
        }

        function onMessage(event) {
          if (event.source !== window) return;
          const data = event.data;
          if (!data || data.type !== PAGE_BRIDGE_READY_TYPE) {
            return;
          }
          finish(true);
        }

        window.addEventListener('message', onMessage);

        let script = document.getElementById(PAGE_BRIDGE_SCRIPT_ID);
        if (!script) {
          script = document.createElement('script');
          script.id = PAGE_BRIDGE_SCRIPT_ID;
          script.src = chrome.runtime.getURL('page-bridge.js');
          script.async = false;
          script.onerror = () => {
            finish(false, new Error('页面桥接脚本加载失败'));
          };
          script.onload = () => {
            try {
              window.postMessage({ type: PAGE_BRIDGE_PING_TYPE }, '*');
            } catch (error) {}
          };
          (document.documentElement || document.head || document.body).appendChild(script);
        } else {
          try {
            window.postMessage({ type: PAGE_BRIDGE_PING_TYPE }, '*');
          } catch (error) {}
        }
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    }).catch((error) => {
      pageBridgeReadyPromise = null;
      throw error;
    });

    return pageBridgeReadyPromise;
  }

  function requestMainWorldBridge(action, payload, timeoutMs, timeoutMessage) {
    return new Promise((resolve, reject) => {
      ensureMainWorldBridgeReady()
        .then(() => {
          const requestId = `videojx_bridge_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
          const waitMs = Math.max(500, Number(timeoutMs || 5000));
          const timeoutId = setTimeout(() => {
            cleanup();
            reject(new Error(timeoutMessage || '主页面脚本响应超时'));
          }, waitMs);

          function cleanup() {
            clearTimeout(timeoutId);
            window.removeEventListener('message', onMessage);
          }

          function onMessage(event) {
            if (event.source !== window) return;
            const data = event.data;
            if (!data || data.type !== PAGE_BRIDGE_RESPONSE_TYPE || data.requestId !== requestId) {
              return;
            }
            cleanup();
            if (data.ok === false) {
              reject(new Error(data.error || '主页面脚本执行失败'));
              return;
            }
            resolve(data.payload);
          }

          window.addEventListener('message', onMessage);

          try {
            window.postMessage(
              {
                type: PAGE_BRIDGE_REQUEST_TYPE,
                requestId,
                action,
                payload: payload && typeof payload === 'object' ? payload : {}
              },
              '*'
            );
          } catch (error) {
            cleanup();
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        })
        .catch((error) => {
          reject(error);
        });
    });
  }

  // Best effort: load the in-page bridge early to avoid request-time races.
  ensureMainWorldBridgeReady().catch(() => {});

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function isVisible(el) {
    if (!el || typeof el.getBoundingClientRect !== 'function') {
      return false;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1) {
      return false;
    }
    const style = window.getComputedStyle(el);
    if (!style) {
      return true;
    }
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }
    return true;
  }

  function textOf(el) {
    return String(el && el.textContent ? el.textContent : '').replace(/\s+/g, ' ').trim();
  }

  function extractFirstUrl(text) {
    const matched = String(text || '').match(/https?:\/\/[^\s]+/i);
    return matched ? matched[0].trim().replace(/\/$/, '') : '';
  }

  function extractDouyinShortLinkFromText(text) {
    if (!text) return '';
    const matched = String(text).match(/https?:\/\/v\.douyin\.com\/[0-9A-Za-z]+\/?/);
    return matched ? matched[0].trim().replace(/\/$/, '') : '';
  }

  function extractDouyinShortLinkFromDom() {
    // The recommendation feed sometimes embeds the share shortlink inside hidden alt/aria text.
    try {
      const candidates = [];

      const imgs = Array.from(document.querySelectorAll('img[alt*="v.douyin.com"],img[alt*="https://v.douyin.com"]')).slice(0, 50);
      for (const img of imgs) {
        const alt = img.getAttribute('alt') || '';
        const short = extractDouyinShortLinkFromText(alt);
        if (short) return short;
        candidates.push(alt);
      }

      // Fallback: scan a small set of attributes on visible-ish nodes near the player.
      const attrs = ['data-clipboard-text', 'data-copy', 'aria-label', 'title'];
      const nodes = Array.from(document.querySelectorAll('[data-e2e],[role="button"],button,a,div,span')).slice(0, 500);
      for (const node of nodes) {
        for (const key of attrs) {
          const value = node.getAttribute ? (node.getAttribute(key) || '') : '';
          const short = extractDouyinShortLinkFromText(value);
          if (short) return short;
        }
      }

      // Last resort: scan HTML. This can be large, so do it only when explicitly requested.
      const html = document.documentElement && document.documentElement.outerHTML ? document.documentElement.outerHTML : '';
      return extractDouyinShortLinkFromText(html);
    } catch (error) {
      return '';
    }
  }

  function extractAwemeIdFromText(text) {
    if (!text) return '';
    const matched = String(text).match(/\/video\/([0-9]{10,25})/);
    return matched && matched[1] ? matched[1] : '';
  }

  function extractAwemeIdFromDom() {
    try {
      const active = document.querySelector('[data-e2e="feed-active-video"][data-e2e-vid]');
      if (active) {
        const vid = active.getAttribute('data-e2e-vid') || '';
        if (/^[0-9]{10,25}$/.test(vid)) return vid;
      }
      const any = document.querySelector('[data-e2e-vid]');
      if (any) {
        const vid = any.getAttribute('data-e2e-vid') || '';
        if (/^[0-9]{10,25}$/.test(vid)) return vid;
      }
    } catch (error) {
    }
    return '';
  }

  function buildDouyinLongUrl(awemeId) {
    if (!awemeId) return '';
    return `https://www.douyin.com/video/${awemeId}`;
  }

  function pickFirstUrl(list) {
    if (!Array.isArray(list)) return '';
    for (const item of list) {
      if (typeof item === 'string' && /^https?:\/\//i.test(item)) {
        return item.trim();
      }
    }
    return '';
  }

  function parseAwemeDetailToParsedInfo(awemeDetail) {
    if (!awemeDetail || typeof awemeDetail !== 'object') {
      throw new Error('aweme_detail 为空');
    }

    const title = String(awemeDetail.desc || awemeDetail.preview_title || awemeDetail.title || '').trim() || '未命名';
    const author = awemeDetail.author && typeof awemeDetail.author === 'object'
      ? String(awemeDetail.author.nickname || awemeDetail.author.unique_id || awemeDetail.author.short_id || '').trim()
      : '';
    const createTimeSec = Number(awemeDetail.create_time || awemeDetail.createTime || 0);
    const uploadDate = Number.isFinite(createTimeSec) && createTimeSec > 0
      ? new Date(createTimeSec * 1000).toISOString()
      : '';
    const isPinned = Boolean(
      awemeDetail.is_top ||
      awemeDetail.isTop ||
      awemeDetail.item_is_top ||
      awemeDetail.itemIsTop ||
      awemeDetail.top
    );

    // Images
    const images = Array.isArray(awemeDetail.images) ? awemeDetail.images : [];
    if (images.length > 0) {
      const normalized = images.map((img, index) => {
        const url = pickFirstUrl(img && img.url_list ? img.url_list : (img && img.urlList ? img.urlList : []));
        if (!url) return null;
        return { url, filename: `image_${String(index + 1).padStart(3, '0')}.jpg` };
      }).filter(Boolean);

      if (normalized.length > 0) {
        return {
          title,
          author,
          description: title,
          mediaType: 'image_album',
          images: normalized,
          imageCount: normalized.length,
          thumbnail: normalized[0].url,
          uploadDate,
          isPinned
        };
      }
    }

    const video = awemeDetail.video && typeof awemeDetail.video === 'object' ? awemeDetail.video : null;
    if (!video) {
      throw new Error('未检测到 video 字段');
    }

    const playAddr = video.play_addr || video.playAddr || null;
    const downloadAddr = video.download_addr || video.downloadAddr || null;
    const playUrl = pickFirstUrl(playAddr && playAddr.url_list ? playAddr.url_list : []);
    const downloadUrl = pickFirstUrl(downloadAddr && downloadAddr.url_list ? downloadAddr.url_list : []);

    const finalUrl = playUrl || downloadUrl;
    if (!finalUrl) {
      throw new Error('未检测到可播放/可下载的视频地址');
    }

    const durationMs = Number(awemeDetail.duration || 0);
    const durationSec = Number.isFinite(durationMs) && durationMs > 0 ? Math.round(durationMs / 1000) : undefined;

    return {
      title,
      author,
      description: title,
      mediaType: 'video',
      url: finalUrl,
      duration: durationSec,
      uploadDate,
      isPinned,
      thumbnail: pickFirstUrl(video.cover && video.cover.url_list ? video.cover.url_list : [])
        || pickFirstUrl(video.origin_cover && video.origin_cover.url_list ? video.origin_cover.url_list : '')
    };
  }

  function extractShareUrlFromAwemeDetail(awemeDetail) {
    if (!awemeDetail || typeof awemeDetail !== 'object') {
      return '';
    }
    const direct = typeof awemeDetail.share_url === 'string' ? awemeDetail.share_url : '';
    if (direct) return direct.trim();
    const shareInfo = awemeDetail.share_info || awemeDetail.shareInfo;
    if (shareInfo && typeof shareInfo === 'object') {
      const nested = shareInfo.share_url || shareInfo.shareUrl || shareInfo.url;
      if (typeof nested === 'string' && nested.trim()) return nested.trim();
    }
    return '';
  }

  function readCachedAwemeDetailInMainWorld(awemeId) {
    const id = String(awemeId || '').trim();
    if (!/^[0-9]{10,25}$/.test(id)) {
      return Promise.resolve(null);
    }

    return requestMainWorldBridge('READ_AWEME_CACHE', { awemeId: id }, 1200, '读取页面缓存超时')
      .then((payload) => (payload && typeof payload === 'object' ? payload : null))
      .catch(() => null);
  }

  function fetchAwemeDetailInMainWorld(awemeId) {
    const id = String(awemeId || '').trim();
    if (!/^[0-9]{10,25}$/.test(id)) {
      return Promise.reject(new Error('aweme_id 无效'));
    }
    return requestMainWorldBridge(
      'FETCH_AWEME_DETAIL',
      { awemeId: id },
      12000,
      '请求抖音 aweme detail 超时'
    );
  }

  async function parseAwemeViaWebApi(awemeId) {
    const cached = await readCachedAwemeDetailInMainWorld(awemeId);
    if (cached) {
      return parseAwemeDetailToParsedInfo(cached);
    }

    const json = await fetchAwemeDetailInMainWorld(awemeId);
    const detail = json && (json.aweme_detail || json.awemeDetail) ? (json.aweme_detail || json.awemeDetail) : null;
    if (!detail) {
      const code = json && (json.status_code ?? json.statusCode);
      throw new Error(`抖音接口未返回 aweme_detail (status_code=${code})`);
    }
    return parseAwemeDetailToParsedInfo(detail);
  }

  async function getShareUrlViaWebApi(awemeId) {
    const cached = await readCachedAwemeDetailInMainWorld(awemeId);
    if (cached) {
      return extractShareUrlFromAwemeDetail(cached) || '';
    }

    const json = await fetchAwemeDetailInMainWorld(awemeId);
    const detail = json && (json.aweme_detail || json.awemeDetail) ? (json.aweme_detail || json.awemeDetail) : null;
    if (!detail) {
      const code = json && (json.status_code ?? json.statusCode);
      throw new Error(`抖音接口未返回 aweme_detail (status_code=${code})`);
    }
    const url = extractShareUrlFromAwemeDetail(detail);
    return url || '';
  }

  function extractVideoUrlFromMeta() {
    const candidates = [];
    const og = document.querySelector('meta[property="og:url"]');
    if (og && og.getAttribute) {
      candidates.push(og.getAttribute('content') || '');
    }
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical && canonical.getAttribute) {
      candidates.push(canonical.getAttribute('href') || '');
    }
    for (const value of candidates) {
      const url = extractFirstUrl(value);
      if (url && (/\/video\//i.test(url) || /v\.douyin\.com/i.test(url) || /iesdouyin\.com/i.test(url))) {
        return url;
      }
    }
    return '';
  }

  function detectDouyinPageKind(urlLike) {
    try {
      const url = new URL(urlLike || window.location.href);
      const host = (url.hostname || '').toLowerCase();
      const path = url.pathname || '';

      // Shortlink / share domains are not feed pages.
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

  function extractSecUidFromPathname(pathname) {
    const matched = String(pathname || '').match(/^\/user\/([^/?#]+)/i);
    return matched && matched[1] ? matched[1] : '';
  }

  function extractCurrentContext() {
    const pageUrl = window.location.href;
    const title = document.title || '';

    const pageKind = detectDouyinPageKind(pageUrl);

    let videoUrl = '';
    let userUrl = '';

    if (pageKind === 'video' && (/\/video\//i.test(pageUrl) || /v\.douyin\.com/i.test(pageUrl) || /iesdouyin\.com/i.test(pageUrl))) {
      videoUrl = pageUrl;
    }

    if (pageKind === 'user') {
      userUrl = pageUrl;
    }

    if (!videoUrl && pageKind === 'video') {
      videoUrl = extractVideoUrlFromMeta();
    }

    return {
      pageUrl,
      pageKind,
      videoUrl,
      userUrl,
      title
    };
  }

  function readUserAwemeIdsInMainWorld(secUid) {
    const normalizedSecUid = String(secUid || '');
    return requestMainWorldBridge(
      'READ_USER_AWEME_IDS',
      { secUid: normalizedSecUid },
      1200,
      '读取用户视频缓存超时'
    )
      .then((payload) => {
        const ids = payload && Array.isArray(payload.awemeIds) ? payload.awemeIds : [];
        return ids.filter((id) => typeof id === 'string' && /^[0-9]{10,25}$/.test(id));
      })
      .catch(() => []);
  }

  function createCollectorOverlay() {
    const existing = document.getElementById('videojx-collector-overlay');
    if (existing) {
      existing.remove();
    }

    const root = document.createElement('div');
    root.id = 'videojx-collector-overlay';
    root.style.cssText =
      'position:fixed;right:16px;bottom:16px;z-index:2147483647;' +
      'font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto;' +
      'background:rgba(15,23,42,0.88);color:#fff;border:1px solid rgba(148,163,184,0.35);' +
      'border-radius:12px;padding:10px 12px;min-width:220px;box-shadow:0 10px 28px rgba(0,0,0,0.35);';

    root.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
        <div style="font-weight:700;letter-spacing:0.2px;">VideoJX 采集中</div>
        <button id="videojx-collector-cancel" style="all:unset;cursor:pointer;padding:6px 10px;border-radius:10px;background:rgba(248,113,113,0.22);border:1px solid rgba(248,113,113,0.35);font-weight:700;">取消</button>
      </div>
      <div id="videojx-collector-sub" style="margin-top:8px;font-size:12px;opacity:0.9;">已发现 0 条视频</div>
      <div style="margin-top:6px;font-size:11px;opacity:0.75;">提示：页面将自动滚动以加载更多内容</div>
    `;

    (document.body || document.documentElement).appendChild(root);

    const sub = root.querySelector('#videojx-collector-sub');
    const cancelBtn = root.querySelector('#videojx-collector-cancel');

    let canceled = false;
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        canceled = true;
        if (sub) sub.textContent = '已取消，正在结束...';
      });
    }

    return {
      get canceled() {
        return canceled;
      },
      updateCount(count, extra) {
        if (!sub) return;
        const suffix = extra ? `（${extra}）` : '';
        sub.textContent = `已发现 ${count} 条视频${suffix}`;
      },
      remove() {
        try {
          root.remove();
        } catch (error) {}
      }
    };
  }

  function removePreviewOverlay() {
    try {
      const existing = document.getElementById('videojx-preview-overlay');
      const previousOverflow = existing && existing.dataset
        ? String(existing.dataset.prevBodyOverflow || '')
        : '';
      if (existing) {
        existing.remove();
      }
      if (document.body && document.body.style) {
        document.body.style.overflow = previousOverflow;
      }
    } catch (error) {}
  }

  function normalizePreviewImageUrls(parsed) {
    const list = [];
    if (parsed && Array.isArray(parsed.images)) {
      for (const item of parsed.images) {
        const url = extractFirstUrl(item && item.url ? item.url : '');
        if (url) list.push(url);
      }
    }
    const thumbnail = extractFirstUrl(parsed && parsed.thumbnail ? parsed.thumbnail : '');
    if (list.length === 0 && thumbnail) {
      list.push(thumbnail);
    }
    return list;
  }

  function showParsedPreviewOverlay(parsed, options) {
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('预览数据为空');
    }

    removePreviewOverlay();

    const mediaType = parsed.mediaType === 'image_album' ? 'image_album' : 'video';
    const title = String(parsed.title || '未命名').trim() || '未命名';
    const author = String(parsed.author || '').trim();
    const sourceUrl = extractFirstUrl(
      (options && options.sourceUrl) || parsed.sourceUrl || parsed.share_url || parsed.url || ''
    );
    const videoUrl = extractFirstUrl(parsed.url || '');
    const imageUrls = normalizePreviewImageUrls(parsed);

    if (mediaType === 'video' && !videoUrl && imageUrls.length === 0) {
      throw new Error('视频预览地址为空');
    }
    if (mediaType === 'image_album' && imageUrls.length === 0) {
      throw new Error('图集预览地址为空');
    }

    const root = document.createElement('div');
    root.id = 'videojx-preview-overlay';
    root.style.cssText =
      'position:fixed;inset:0;z-index:2147483647;background:rgba(2,6,23,0.88);' +
      'backdrop-filter:blur(2px);display:flex;flex-direction:column;color:#fff;';

    const panel = document.createElement('div');
    panel.style.cssText =
      'display:flex;align-items:center;justify-content:space-between;gap:12px;' +
      'padding:14px 18px;border-bottom:1px solid rgba(148,163,184,0.35);' +
      'background:rgba(15,23,42,0.88);';

    const info = document.createElement('div');
    info.style.cssText = 'display:flex;flex-direction:column;gap:4px;min-width:0;';
    const titleEl = document.createElement('div');
    titleEl.textContent = title;
    titleEl.style.cssText = 'font-size:16px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    const subEl = document.createElement('div');
    subEl.textContent = `${mediaType === 'image_album' ? '图集' : '视频'}${author ? ` · ${author}` : ''}`;
    subEl.style.cssText = 'font-size:12px;opacity:0.85;';
    info.appendChild(titleEl);
    info.appendChild(subEl);

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;align-items:center;gap:8px;flex-shrink:0;';

    const openBtn = document.createElement('a');
    const openHref = mediaType === 'video' ? (videoUrl || sourceUrl) : (imageUrls[0] || sourceUrl);
    openBtn.textContent = '新窗口打开';
    openBtn.href = openHref || 'javascript:void(0)';
    openBtn.target = '_blank';
    openBtn.rel = 'noreferrer';
    openBtn.style.cssText =
      'text-decoration:none;color:#fff;padding:7px 10px;border-radius:8px;' +
      'border:1px solid rgba(148,163,184,0.55);background:rgba(30,41,59,0.65);font-size:12px;';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = '关闭预览';
    closeBtn.style.cssText =
      'all:unset;cursor:pointer;padding:7px 10px;border-radius:8px;font-size:12px;font-weight:700;' +
      'background:rgba(248,113,113,0.2);border:1px solid rgba(248,113,113,0.45);';

    actions.appendChild(openBtn);
    actions.appendChild(closeBtn);
    panel.appendChild(info);
    panel.appendChild(actions);

    const body = document.createElement('div');
    body.style.cssText = 'flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:14px;';

    let imageAlbumNav = null;
    if (mediaType === 'image_album') {
      const shell = document.createElement('div');
      shell.style.cssText = 'width:100%;height:100%;display:flex;flex-direction:column;gap:10px;';

      const mainWrap = document.createElement('div');
      mainWrap.style.cssText =
        'flex:1;min-height:0;display:flex;align-items:center;justify-content:center;' +
        'border:1px solid rgba(148,163,184,0.3);border-radius:12px;background:rgba(15,23,42,0.75);' +
        'position:relative;overflow:hidden;';

      const mainImg = document.createElement('img');
      mainImg.src = imageUrls[0];
      mainImg.alt = title;
      mainImg.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;';
      mainWrap.appendChild(mainImg);

      const loadingTag = document.createElement('div');
      loadingTag.textContent = '加载中...';
      loadingTag.style.cssText =
        'position:absolute;left:12px;bottom:12px;padding:4px 8px;border-radius:8px;font-size:12px;' +
        'background:rgba(15,23,42,0.68);border:1px solid rgba(148,163,184,0.45);display:none;';
      mainWrap.appendChild(loadingTag);

      const failWrap = document.createElement('div');
      failWrap.style.cssText =
        'position:absolute;inset:0;display:none;align-items:center;justify-content:center;' +
        'background:rgba(15,23,42,0.7);';
      const failCard = document.createElement('div');
      failCard.style.cssText =
        'display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:10px;' +
        'background:rgba(2,6,23,0.88);border:1px solid rgba(248,113,113,0.55);';
      const failText = document.createElement('div');
      failText.textContent = '图片加载失败';
      failText.style.cssText = 'font-size:12px;';
      const retryBtn = document.createElement('button');
      retryBtn.type = 'button';
      retryBtn.textContent = '重试';
      retryBtn.style.cssText =
        'all:unset;cursor:pointer;padding:6px 10px;border-radius:8px;font-size:12px;font-weight:700;' +
        'background:rgba(248,113,113,0.2);border:1px solid rgba(248,113,113,0.55);';
      failCard.appendChild(failText);
      failCard.appendChild(retryBtn);
      failWrap.appendChild(failCard);
      mainWrap.appendChild(failWrap);

      const controls = document.createElement('div');
      controls.style.cssText = 'display:flex;align-items:center;gap:10px;';

      const pager = document.createElement('div');
      pager.style.cssText = 'font-size:12px;opacity:0.85;flex-shrink:0;min-width:68px;';
      pager.textContent = `1 / ${imageUrls.length}`;

      const navWrap = document.createElement('div');
      navWrap.style.cssText = 'display:flex;align-items:center;gap:6px;flex-shrink:0;';

      const prevBtn = document.createElement('button');
      prevBtn.type = 'button';
      prevBtn.textContent = '上一张';
      prevBtn.style.cssText =
        'all:unset;cursor:pointer;padding:6px 10px;border-radius:8px;font-size:12px;font-weight:700;' +
        'border:1px solid rgba(148,163,184,0.55);background:rgba(30,41,59,0.65);';

      const nextBtn = document.createElement('button');
      nextBtn.type = 'button';
      nextBtn.textContent = '下一张';
      nextBtn.style.cssText =
        'all:unset;cursor:pointer;padding:6px 10px;border-radius:8px;font-size:12px;font-weight:700;' +
        'border:1px solid rgba(148,163,184,0.55);background:rgba(30,41,59,0.65);';

      const thumbWrap = document.createElement('div');
      thumbWrap.style.cssText = 'display:flex;gap:8px;overflow-x:auto;padding-bottom:2px;flex:1;min-width:0;';

      let currentIndex = 0;
      const preloadCache = new Set();
      let activeLoadToken = '';

      const preloadImage = (url) => {
        const imageUrl = extractFirstUrl(url || '');
        if (!imageUrl || preloadCache.has(imageUrl)) return;
        preloadCache.add(imageUrl);
        try {
          const img = new Image();
          img.decoding = 'async';
          img.src = imageUrl;
        } catch (error) {}
      };

      const preloadNearbyImages = (index) => {
        if (imageUrls.length <= 1) {
          preloadImage(imageUrls[index]);
          return;
        }
        const len = imageUrls.length;
        preloadImage(imageUrls[index]);
        preloadImage(imageUrls[(index + 1) % len]);
        preloadImage(imageUrls[(index - 1 + len) % len]);
      };

      const setLoading = (visible) => {
        loadingTag.style.display = visible ? 'block' : 'none';
      };

      const setLoadFailed = (failed) => {
        failWrap.style.display = failed ? 'flex' : 'none';
      };

      const withCacheBust = (url) => {
        if (!url) return '';
        const marker = `_videojx_retry=${Date.now()}`;
        return url.includes('?') ? `${url}&${marker}` : `${url}?${marker}`;
      };

      const updateImage = (nextIndex, forceRetry) => {
        currentIndex = nextIndex;
        const currentUrl = extractFirstUrl(imageUrls[currentIndex] || '');
        pager.textContent = `${currentIndex + 1} / ${imageUrls.length}`;
        Array.from(thumbWrap.children).forEach((child, index) => {
          child.style.outline = index === currentIndex ? '2px solid rgba(45,212,191,0.95)' : 'none';
        });

        const openUrl = currentUrl || sourceUrl;
        openBtn.href = openUrl || 'javascript:void(0)';
        setLoadFailed(false);
        setLoading(true);

        const token = `${currentIndex}_${Date.now()}`;
        activeLoadToken = token;

        mainImg.onload = () => {
          if (activeLoadToken !== token) return;
          setLoading(false);
          setLoadFailed(false);
        };

        mainImg.onerror = () => {
          if (activeLoadToken !== token) return;
          setLoading(false);
          setLoadFailed(true);
        };

        const renderUrl = forceRetry ? withCacheBust(currentUrl) : currentUrl;
        mainImg.src = renderUrl;
        preloadNearbyImages(currentIndex);
      };

      const moveImage = (step) => {
        if (imageUrls.length <= 1) return;
        const nextIndex = (currentIndex + step + imageUrls.length) % imageUrls.length;
        updateImage(nextIndex, false);
      };

      prevBtn.addEventListener('click', () => moveImage(-1));
      nextBtn.addEventListener('click', () => moveImage(1));
      retryBtn.addEventListener('click', () => updateImage(currentIndex, true));

      if (imageUrls.length <= 1) {
        prevBtn.style.opacity = '0.45';
        nextBtn.style.opacity = '0.45';
        prevBtn.style.cursor = 'not-allowed';
        nextBtn.style.cursor = 'not-allowed';
      }

      imageUrls.forEach((url, index) => {
        const thumb = document.createElement('img');
        thumb.src = url;
        thumb.alt = `图 ${index + 1}`;
        thumb.style.cssText =
          'width:72px;height:48px;object-fit:cover;border-radius:8px;cursor:pointer;' +
          'border:1px solid rgba(148,163,184,0.45);flex-shrink:0;background:#0f172a;';
        thumb.addEventListener('click', () => updateImage(index, false));
        thumbWrap.appendChild(thumb);
      });
      updateImage(0, false);

      navWrap.appendChild(prevBtn);
      navWrap.appendChild(nextBtn);
      controls.appendChild(pager);
      controls.appendChild(navWrap);
      controls.appendChild(thumbWrap);
      shell.appendChild(mainWrap);
      shell.appendChild(controls);
      body.appendChild(shell);

      imageAlbumNav = {
        prev() {
          moveImage(-1);
        },
        next() {
          moveImage(1);
        }
      };
    } else {
      const video = document.createElement('video');
      video.controls = true;
      video.playsInline = true;
      video.muted = true;
      video.preload = 'metadata';
      video.src = videoUrl || imageUrls[0] || '';
      if (parsed.thumbnail) {
        video.poster = extractFirstUrl(parsed.thumbnail || '');
      }
      video.style.cssText =
        'width:100%;height:100%;max-width:100%;max-height:100%;object-fit:contain;' +
        'border:1px solid rgba(148,163,184,0.3);border-radius:12px;background:#000;';
      body.appendChild(video);
    }

    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      removePreviewOverlay();
      window.removeEventListener('keydown', onKeydown, true);
      window.removeEventListener('hashchange', onNavigateAway, true);
      window.removeEventListener('popstate', onNavigateAway, true);
      window.removeEventListener('pagehide', onNavigateAway, true);
      document.removeEventListener('visibilitychange', onVisibilityChange, true);
    };

    const isTypingTarget = (target) => {
      if (!target || !(target instanceof Element)) return false;
      const tag = String(target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
      if (target.isContentEditable) return true;
      const editableParent = target.closest('[contenteditable=""],[contenteditable="true"]');
      return Boolean(editableParent);
    };

    const onNavigateAway = () => {
      close();
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        close();
      }
    };

    const onKeydown = (event) => {
      if (event && event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (imageAlbumNav && event && event.key === 'ArrowLeft') {
        if (isTypingTarget(event.target)) return;
        event.preventDefault();
        imageAlbumNav.prev();
        return;
      }
      if (imageAlbumNav && event && event.key === 'ArrowRight') {
        if (isTypingTarget(event.target)) return;
        event.preventDefault();
        imageAlbumNav.next();
      }
    };

    closeBtn.addEventListener('click', close);
    root.addEventListener('click', (event) => {
      if (event.target === root) {
        close();
      }
    });

    root.appendChild(panel);
    root.appendChild(body);
    (document.body || document.documentElement).appendChild(root);
    window.addEventListener('keydown', onKeydown, true);
    window.addEventListener('hashchange', onNavigateAway, true);
    window.addEventListener('popstate', onNavigateAway, true);
    window.addEventListener('pagehide', onNavigateAway, true);
    document.addEventListener('visibilitychange', onVisibilityChange, true);

    try {
      if (document.body) {
        root.dataset.prevBodyOverflow = String(document.body.style.overflow || '');
        document.body.style.overflow = 'hidden';
      }
    } catch (error) {}
  }

  function detectScrollContainer() {
    const root = document.scrollingElement || document.documentElement || document.body;
    if (root && root.scrollHeight > root.clientHeight + 200) {
      return root;
    }

    // Best-effort: some pages use an inner scroll container.
    let best = null;
    let bestScore = 0;
    const nodes = Array.from(document.querySelectorAll('div')).slice(0, 800);
    for (const el of nodes) {
      if (!isVisible(el)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.height < window.innerHeight * 0.55) continue;
      const style = window.getComputedStyle(el);
      const overflowY = style ? style.overflowY : '';
      if (overflowY !== 'auto' && overflowY !== 'scroll') continue;
      if (el.scrollHeight <= el.clientHeight + 200) continue;

      const score = el.scrollHeight;
      if (score > bestScore) {
        best = el;
        bestScore = score;
      }
    }

    return best || root;
  }

  async function collectUserAwemeIds(options) {
    const context = extractCurrentContext();
    if (context.pageKind !== 'user') {
      return { ok: false, error: 'NOT_USER_PAGE' };
    }

    const secUid = extractSecUidFromPathname(window.location.pathname || '');
    if (!secUid) {
      return { ok: false, error: '无法从当前 URL 提取 secUid' };
    }

    const opts = options && typeof options === 'object' ? options : {};
    const maxItems = Math.max(0, Number(opts.maxItems || 0));
    const maxScrollMs = Math.max(3000, Number(opts.maxScrollMs || 120000));
    const stableRounds = Math.max(1, Math.min(20, Number(opts.stableRounds || 3)));
    const restoreScroll = opts.restoreScroll !== false;

    const overlay = createCollectorOverlay();
    const scrollContainer = detectScrollContainer();
    const originalScrollTop = scrollContainer ? scrollContainer.scrollTop : 0;

    const seen = new Set();
    let stable = 0;
    let iterations = 0;
    const startedAt = Date.now();
    let timedOut = false;

    try {
      while (true) {
        if (overlay.canceled) {
          return {
            ok: true,
            pageKind: 'user',
            userUrl: window.location.href,
            secUid,
            awemeIds: Array.from(seen),
            canceled: true
          };
        }

        const ids = await readUserAwemeIdsInMainWorld(secUid);
        const before = seen.size;
        ids.forEach((id) => seen.add(id));

        const after = seen.size;
        const gained = after - before;

        overlay.updateCount(after, timedOut ? '已超时' : (gained > 0 ? `+${gained}` : '无新增'));

        iterations += 1;

        if (maxItems > 0 && after >= maxItems) {
          break;
        }

        if (gained === 0) {
          stable += 1;
        } else {
          stable = 0;
        }

        // Avoid exiting too early when the first few reads are empty.
        if (iterations >= 2 && after > 0 && stable >= stableRounds) {
          break;
        }

        if (Date.now() - startedAt > maxScrollMs) {
          timedOut = true;
          break;
        }

        // Scroll to bottom to trigger lazy loading.
        try {
          if (scrollContainer === document.scrollingElement || scrollContainer === document.documentElement || scrollContainer === document.body) {
            window.scrollTo(0, document.documentElement.scrollHeight);
          } else if (scrollContainer) {
            scrollContainer.scrollTop = scrollContainer.scrollHeight;
          } else {
            window.scrollTo(0, document.documentElement.scrollHeight);
          }
        } catch (error) {}

        await sleep(950);
      }
    } finally {
      overlay.remove();
      if (restoreScroll) {
        try {
          if (scrollContainer === document.scrollingElement || scrollContainer === document.documentElement || scrollContainer === document.body) {
            window.scrollTo(0, originalScrollTop);
          } else if (scrollContainer) {
            scrollContainer.scrollTop = originalScrollTop;
          } else {
            window.scrollTo(0, originalScrollTop);
          }
        } catch (error) {}
      }
    }

    return {
      ok: true,
      pageKind: 'user',
      userUrl: window.location.href,
      secUid,
      awemeIds: Array.from(seen),
      timedOut: Boolean(timedOut)
    };
  }

  function scoreShareCandidate(el) {
    const label = (el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('title'))) || '';
    const cls = (el.className && typeof el.className === 'string') ? el.className : '';
    const dataE2e = (el.getAttribute && el.getAttribute('data-e2e')) || '';
    const t = textOf(el);

    let score = 0;
    if (/分享/.test(label)) score += 6;
    if (/share/i.test(label)) score += 4;
    if (/share/i.test(dataE2e)) score += 6;
    if (/share/i.test(cls)) score += 3;
    if (t === '分享') score += 4;
    if (/分享/.test(t)) score += 2;

    const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    if (rect && rect.right > window.innerWidth * 0.7) {
      score += 1;
    }
    return score;
  }

  function findShareButton() {
    const selectors = [
      '[data-e2e="video-player-share"]',
      'button[aria-label*="分享"]',
      '[role="button"][aria-label*="分享"]',
      'button[title*="分享"]',
      '[role="button"][title*="分享"]',
      '[data-e2e*="share"]',
      '[class*="share"][role="button"]',
      'button[class*="share"]'
    ];

    const candidates = [];
    for (const selector of selectors) {
      document.querySelectorAll(selector).forEach((node) => candidates.push(node));
    }

    // Fallback: scan clickable nodes by text.
    if (candidates.length === 0) {
      document.querySelectorAll('button,[role="button"]').forEach((node) => {
        const t = textOf(node);
        if (t === '分享' || t.includes('分享')) {
          candidates.push(node);
        }
      });
    }

    const visible = candidates.filter(isVisible);
    visible.sort((a, b) => scoreShareCandidate(b) - scoreShareCandidate(a));
    return visible[0] || null;
  }

  function findCopyLinkButton() {
    const candidates = Array.from(document.querySelectorAll('button,[role="button"]'));
    const visible = candidates.filter(isVisible);

    const scored = visible
      .map((node) => {
        const t = textOf(node);
        let score = 0;
        if (t === '复制链接') score += 10;
        if (t.includes('复制链接')) score += 8;
        if (t === '复制') score += 3;
        if (t.includes('复制')) score += 2;
        return { node, t, score };
      })
      .filter((item) => item.score > 0);

    scored.sort((a, b) => b.score - a.score);
    return scored[0] ? scored[0].node : null;
  }

  function findShareLinkInDom() {
    const selectors = [
      'a[href*="v.douyin.com"]',
      'a[href*="iesdouyin.com"]',
      'a[href*="/video/"]',
      'input[value*="http"]',
      'textarea'
    ];

    for (const selector of selectors) {
      const nodes = Array.from(document.querySelectorAll(selector));
      for (const node of nodes) {
        if (!isVisible(node)) continue;
        const value = node.href || node.value || textOf(node);
        const url = extractFirstUrl(value);
        if (!url) continue;
        if (/v\.douyin\.com/i.test(url) || /iesdouyin\.com/i.test(url) || /\/video\//i.test(url)) {
          return url;
        }
      }
    }

    return '';
  }

  function absolutizeUrl(url) {
    if (!url) return '';
    try {
      return new URL(url, window.location.href).href;
    } catch (error) {
      return String(url || '');
    }
  }

  function extractVideoUrlNearViewportCenter() {
    const pageUrl = window.location.href;
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;

    const anchors = Array.from(document.querySelectorAll('a[href]'));
    const candidates = [];

    for (const a of anchors) {
      if (!isVisible(a)) continue;
      const href = a.getAttribute('href') || '';
      if (!href) continue;

      if (!(/\/video\//i.test(href) || /v\.douyin\.com/i.test(href) || /iesdouyin\.com/i.test(href))) {
        continue;
      }

      const rect = a.getBoundingClientRect();
      // Prefer links that are within the main viewport area.
      if (rect.bottom < window.innerHeight * 0.15 || rect.top > window.innerHeight * 0.95) {
        continue;
      }

      const dx = Math.abs((rect.left + rect.width / 2) - centerX);
      const dy = Math.abs((rect.top + rect.height / 2) - centerY);
      const distance = Math.sqrt(dx * dx + dy * dy);

      candidates.push({ href, distance });
    }

    candidates.sort((a, b) => a.distance - b.distance);
    const best = candidates[0] ? absolutizeUrl(candidates[0].href) : '';
    if (best && /\/video\//i.test(best)) {
      return best;
    }

    if (best && (/v\.douyin\.com/i.test(best) || /iesdouyin\.com/i.test(best))) {
      return best;
    }

    // Some anchors are relative without schema; fallback to the current host.
    if (best && best.startsWith('/video/')) {
      return absolutizeUrl(best);
    }

    // As a last resort, try to find any /video/ link in the page.
    for (const item of candidates.slice(0, 10)) {
      const url = absolutizeUrl(item.href);
      if (/\/video\//i.test(url)) {
        return url;
      }
    }

    return '';
  }

  function extractVideoOrShareUrlFromScripts() {
    const scripts = Array.from(document.querySelectorAll('script'));

    const urlPatterns = [
      /https?:\/\/v\.douyin\.com\/[0-9a-zA-Z]+\/?/g,
      /https?:\/\/(?:www\.)?iesdouyin\.com\/share\/video\/[0-9]+\/?/g,
      /https?:\/\/(?:www\.)?douyin\.com\/video\/[0-9]+/g
    ];

    for (const script of scripts) {
      const text = script.textContent || '';
      if (!text || text.length < 200) continue;
      // Avoid scanning extremely large blobs.
      if (text.length > 250000) continue;

      for (const pattern of urlPatterns) {
        const matched = text.match(pattern);
        if (matched && matched[0]) {
          return matched[0].trim().replace(/\/$/, '');
        }
      }

      // Fallback: find an aweme_id-like /video/<id> and construct a URL.
      const idMatch = text.match(/\/video\/([0-9]{10,})/);
      if (idMatch && idMatch[1]) {
        return `https://www.douyin.com/video/${idMatch[1]}`;
      }
    }

    return '';
  }

  function findShareButtonFromRightToolbar() {
    const nodes = Array.from(document.querySelectorAll('button,[role=\"button\"],a'));
    const candidates = nodes
      .filter((node) => isVisible(node))
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return { node, rect };
      })
      .filter(({ rect }) => {
        if (rect.width < 20 || rect.width > 120) return false;
        if (rect.height < 20 || rect.height > 120) return false;
        if (rect.right < window.innerWidth * 0.82) return false; // right toolbar area
        if (rect.top < window.innerHeight * 0.15 || rect.bottom > window.innerHeight * 0.98) return false;
        return true;
      })
      .filter(({ node }) => {
        // Toolbar buttons usually contain svg icons; this reduces the chance of clicking random text buttons.
        return Boolean(node.querySelector && node.querySelector('svg'));
      });

    // Group by parent element, choose a vertical stack with 4-8 items.
    const byParent = new Map();
    for (const item of candidates) {
      const parent = item.node.parentElement;
      if (!parent) continue;
      if (!byParent.has(parent)) byParent.set(parent, []);
      byParent.get(parent).push(item);
    }

    const groups = Array.from(byParent.values())
      .filter((group) => group.length >= 4 && group.length <= 10)
      .map((group) => {
        const sorted = group.slice().sort((a, b) => a.rect.top - b.rect.top);
        const spread = sorted[sorted.length - 1].rect.top - sorted[0].rect.top;
        return { group: sorted, spread };
      })
      .filter((g) => g.spread > 80);

    groups.sort((a, b) => a.group.length - b.group.length);

    // share is typically the last action in the right toolbar stack
    const bestGroup = groups[0] ? groups[0].group : null;
    if (!bestGroup) return null;
    return bestGroup[bestGroup.length - 1].node;
  }

  async function openSharePanelAndTryExtractShortLink() {
    // Opening the share panel usually renders a QR image whose alt text includes the
    // v.douyin.com short link, without needing to click "复制链接" (which may prompt).
    try {
      const active = document.querySelector('[data-e2e="feed-active-video"]');
      const btn = (active && active.querySelector)
        ? (active.querySelector('[data-e2e="video-player-share"]') || active.querySelector('[data-e2e="video-share-icon-container"]'))
        : null;

      const fallback = document.querySelector('[data-e2e="video-player-share"]')
        || document.querySelector('[data-e2e="video-share-icon-container"]')
        || findShareButtonFromRightToolbar();

      const target = btn || fallback;
      if (!target) return '';

      target.click();
      await sleep(350);

      let short = extractDouyinShortLinkFromDom();
      if (short) return short;

      // Some panels lazy-load the QR image and its alt text.
      await sleep(850);
      short = extractDouyinShortLinkFromDom();
      return short || '';
    } catch (error) {
      return '';
    }
  }

  async function copyShareLink() {
    // Prefer a share link without clicking UI. Clicking Douyin's share/copy buttons
    // often triggers a blocking prompt that asks users to manually press Cmd/Ctrl+C.
    const context = extractCurrentContext();
    let shortFromDom = extractDouyinShortLinkFromDom();
    const awemeFromContext = extractAwemeIdFromText(context.videoUrl || context.pageUrl || window.location.href);
    const awemeFromDom = extractAwemeIdFromDom();
    const awemeId = awemeFromContext || awemeFromDom;
    const longLink = awemeId ? buildDouyinLongUrl(awemeId) : '';

    if (shortFromDom) {
      return {
        ok: true,
        copied: false,
        link: shortFromDom,
        shortLink: shortFromDom,
        longLink: longLink || context.videoUrl || '',
        awemeId,
        source: 'dom_shortlink'
      };
    }

    // Best effort: open the share panel (no blocking clipboard prompt) and re-scan for shortlink.
    shortFromDom = await openSharePanelAndTryExtractShortLink();
    if (shortFromDom) {
      return {
        ok: true,
        copied: false,
        link: shortFromDom,
        shortLink: shortFromDom,
        longLink: longLink || context.videoUrl || '',
        awemeId,
        source: 'share_panel_dom_shortlink'
      };
    }

    if (awemeId) {
      try {
        const shareUrl = await getShareUrlViaWebApi(awemeId);
        if (shareUrl) {
          return {
            ok: true,
            copied: false,
            link: shareUrl,
            shortLink: '',
            longLink: longLink || context.videoUrl || '',
            awemeId,
            source: 'aweme_share_url'
          };
        }
      } catch (error) {
      }
    }

    const fromCenter = extractVideoUrlNearViewportCenter();
    if (fromCenter) {
      return {
        ok: true,
        copied: false,
        link: fromCenter,
        shortLink: '',
        longLink: longLink || fromCenter,
        awemeId: awemeId || extractAwemeIdFromText(fromCenter),
        source: 'center_anchor'
      };
    }

    const fromScripts = extractVideoOrShareUrlFromScripts();
    if (fromScripts) {
      const short = /v\.douyin\.com/i.test(fromScripts) ? fromScripts : '';
      const inferredId = extractAwemeIdFromText(fromScripts);
      return {
        ok: true,
        copied: false,
        link: fromScripts,
        shortLink: short,
        longLink: /\/video\//i.test(fromScripts) ? fromScripts : (longLink || ''),
        awemeId: awemeId || inferredId,
        source: 'script'
      };
    }

    if (awemeId || longLink) {
      return {
        ok: true,
        copied: false,
        link: longLink || context.videoUrl || window.location.href,
        shortLink: '',
        longLink: longLink || context.videoUrl || '',
        awemeId,
        source: 'fallback_long'
      };
    }

    return { ok: false, error: '未获取到可用链接，请刷新页面后重试。' };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message) {
      return false;
    }

    if (message.type === 'EXT_EXTRACT_CONTEXT') {
      sendResponse(extractCurrentContext());
      return false;
    }

    if (message.type === 'EXT_COPY_SHARE_LINK') {
      (async () => {
        const result = await copyShareLink();
        sendResponse(result);
      })();
      return true;
    }

    if (message.type === 'EXT_PARSE_AWEME') {
      (async () => {
        try {
          const awemeId = String(message.awemeId || extractAwemeIdFromDom() || '').trim();
          const parsed = await parseAwemeViaWebApi(awemeId);
          sendResponse({ ok: true, parsed, awemeId });
        } catch (error) {
          sendResponse({ ok: false, error: error instanceof Error ? error.message : '抖音页面解析失败' });
        }
      })();
      return true;
    }

    if (message.type === 'EXT_COLLECT_USER_AWEME_IDS') {
      (async () => {
        try {
          const result = await collectUserAwemeIds(message.options || {});
          sendResponse(result);
        } catch (error) {
          sendResponse({ ok: false, error: error instanceof Error ? error.message : '用户主页采集失败' });
        }
      })();
      return true;
    }

    if (message.type === 'EXT_SHOW_PARSED_PREVIEW') {
      (async () => {
        try {
          showParsedPreviewOverlay(message.parsed, message.options || {});
          sendResponse({ ok: true });
        } catch (error) {
          sendResponse({ ok: false, error: error instanceof Error ? error.message : '页面预览展示失败' });
        }
      })();
      return true;
    }

    if (message.type === 'EXT_HIDE_PARSED_PREVIEW') {
      removePreviewOverlay();
      sendResponse({ ok: true });
      return false;
    }

    return false;
  });
})();
