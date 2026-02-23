(function () {
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

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.type !== 'EXT_EXTRACT_CONTEXT') {
      return false;
    }

    sendResponse(extractCurrentContext());
    return false;
  });
})();
