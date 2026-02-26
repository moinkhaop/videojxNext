(function () {
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

  function extractCurrentContext() {
    const pageUrl = window.location.href;
    const title = document.title || '';

    let videoUrl = '';
    let userUrl = '';

    if (/\/video\//i.test(pageUrl) || /v\.douyin\.com/i.test(pageUrl)) {
      videoUrl = pageUrl;
    }

    if (/\/user\//i.test(pageUrl)) {
      userUrl = pageUrl;
    }

    if (!videoUrl) {
      videoUrl = extractVideoUrlFromMeta();
    }

    if (!videoUrl) {
      const candidateLinks = Array.from(document.querySelectorAll('a[href]'));
      for (const link of candidateLinks) {
        const href = link.getAttribute('href') || '';
        if (/\/video\//i.test(href) || /v\.douyin\.com/i.test(href)) {
          try {
            videoUrl = new URL(href, pageUrl).href;
          } catch (error) {
            videoUrl = href;
          }
          break;
        }
      }
    }

    if (!userUrl) {
      const candidateLinks = Array.from(document.querySelectorAll('a[href]'));
      for (const link of candidateLinks) {
        const href = link.getAttribute('href') || '';
        if (/\/user\//i.test(href)) {
          try {
            userUrl = new URL(href, pageUrl).href;
          } catch (error) {
            userUrl = href;
          }
          break;
        }
      }
    }

    return {
      pageUrl,
      videoUrl,
      userUrl,
      title
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

  async function copyShareLink() {
    // Prefer a real share shortlink (v.douyin.com) without clicking UI.
    const context = extractCurrentContext();
    const shortFromDom = extractDouyinShortLinkFromDom();
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

    // If share menu is already open, just click copy.
    const existingCopy = findCopyLinkButton();
    if (existingCopy) {
      const link = findShareLinkInDom();
      existingCopy.click();
      return {
        ok: true,
        copied: true,
        link,
        shortLink: /v\.douyin\.com/i.test(link) ? link : '',
        longLink: /\/video\//i.test(link) ? link : (longLink || ''),
        awemeId: awemeId || extractAwemeIdFromText(link),
        source: 'existing_menu'
      };
    }

    const shareButton = findShareButton();
    const toolbarShare = shareButton || findShareButtonFromRightToolbar();
    if (!toolbarShare) {
      return { ok: false, error: '未找到分享按钮。建议先单击视频区域让右侧工具栏显示，再点击“获取分享链接”。' };
    }

    toolbarShare.click();

    // Wait for share menu to appear.
    const timeoutAt = Date.now() + 2500;
    while (Date.now() < timeoutAt) {
      const copyBtn = findCopyLinkButton();
      if (copyBtn) {
        // Prefer reading link from DOM if present.
        const link = findShareLinkInDom();
        copyBtn.click();
        return {
          ok: true,
          copied: true,
          link,
          shortLink: /v\.douyin\.com/i.test(link) ? link : '',
          longLink: /\/video\//i.test(link) ? link : (longLink || ''),
          awemeId: awemeId || extractAwemeIdFromText(link),
          source: 'share_menu'
        };
      }
      await sleep(120);
    }

    // Login gating: share menu might show login prompt instead of copy button.
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

    return { ok: false, error: '未找到“复制链接”按钮（可能需要登录）。请手动打开分享面板后再试。' };
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

    return false;
  });
})();
