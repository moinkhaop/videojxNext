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

  async function copyShareLink() {
    const shareButton = findShareButton();
    if (!shareButton) {
      return { ok: false, error: '未找到分享按钮，请先确保当前页面有视频播放区' };
    }

    shareButton.click();

    // Wait for share menu to appear.
    const timeoutAt = Date.now() + 2500;
    while (Date.now() < timeoutAt) {
      const copyBtn = findCopyLinkButton();
      if (copyBtn) {
        // Prefer reading link from DOM if present.
        const link = findShareLinkInDom();
        copyBtn.click();
        return { ok: true, copied: true, link };
      }
      await sleep(120);
    }

    return { ok: false, error: '未找到“复制链接”按钮，请手动点分享面板后再试' };
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
