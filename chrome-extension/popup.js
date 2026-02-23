(function () {
  const { extractFirstUrl } = globalThis.ExtShared;

  function send(type, payload) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type, payload }, (response) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message));
          return;
        }

        if (!response) {
          reject(new Error('后台无响应'));
          return;
        }

        if (!response.ok) {
          reject(new Error(response.error || '操作失败'));
          return;
        }

        resolve(response.data);
      });
    });
  }

  const el = {
    authStatus: document.getElementById('auth-status'),
    openOptions: document.getElementById('open-options'),
    btnGetShare: document.getElementById('btn-get-share'),
    btnFillActive: document.getElementById('btn-fill-active'),
    btnPasteClipboard: document.getElementById('btn-paste-clipboard'),
    btnCheckSession: document.getElementById('btn-check-session'),
    videoUrl: document.getElementById('video-url'),
    parserSelect: document.getElementById('parser-select'),
    webdavSelect: document.getElementById('webdav-select'),
    btnParse: document.getElementById('btn-parse'),
    btnUpload: document.getElementById('btn-upload'),
    resultBox: document.getElementById('result-box')
  };

  let pageState = {
    parsers: [],
    webdavServers: [],
    defaults: { parserId: '', webdavId: '' },
    auth: { loggedIn: false, user: null }
  };

  function setResult(message, type) {
    el.resultBox.className = 'notice';
    if (type === 'error') {
      el.resultBox.classList.add('error');
    } else if (type === 'success') {
      el.resultBox.classList.add('success');
    }
    el.resultBox.textContent = message;
  }

  function setLoading(loading) {
    [el.btnGetShare, el.btnFillActive, el.btnPasteClipboard, el.btnParse, el.btnUpload, el.btnCheckSession].forEach((button) => {
      button.disabled = loading;
    });
  }

  async function readClipboardUrl() {
    if (!navigator.clipboard || typeof navigator.clipboard.readText !== 'function') {
      throw new Error('当前环境不支持读取剪贴板，请手动粘贴链接');
    }

    const text = await navigator.clipboard.readText();
    const url = extractFirstUrl(text || '');
    if (!url) {
      throw new Error('剪贴板中未检测到链接');
    }
    return url;
  }

  async function pasteFromClipboard() {
    setLoading(true);
    try {
      const url = await readClipboardUrl();
      el.videoUrl.value = url;
      setResult('已从剪贴板粘贴链接。', 'success');
    } catch (error) {
      setResult(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  function renderAuthStatus() {
    if (!pageState.auth || !pageState.auth.loggedIn) {
      el.authStatus.textContent = '未登录。可在设置页登录后启用云端历史同步。';
      return;
    }

    const user = pageState.auth.user || {};
    el.authStatus.textContent = `已登录：${user.email || user.id || '未知用户'}`;
  }

  function renderSelects() {
    const parsers = (pageState.parsers || []).filter((item) => !item.disabled);
    const webdavServers = (pageState.webdavServers || []).filter((item) => !item.disabled);

    el.parserSelect.innerHTML = '';
    parsers.forEach((parser) => {
      const option = document.createElement('option');
      option.value = parser.id;
      option.textContent = parser.name + (parser.isDefault ? ' (默认)' : '');
      if (parser.id === pageState.defaults.parserId) {
        option.selected = true;
      }
      el.parserSelect.appendChild(option);
    });

    el.webdavSelect.innerHTML = '';
    if (webdavServers.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = '请先在设置页添加 WebDAV';
      el.webdavSelect.appendChild(option);
    } else {
      webdavServers.forEach((server) => {
        const option = document.createElement('option');
        option.value = server.id;
        option.textContent = server.name + (server.isDefault ? ' (默认)' : '');
        if (server.id === pageState.defaults.webdavId) {
          option.selected = true;
        }
        el.webdavSelect.appendChild(option);
      });
    }
  }

  async function loadState() {
    pageState = await send('STATE_GET');
    renderAuthStatus();
    renderSelects();
  }

  async function fillFromActiveTab() {
    setLoading(true);
    try {
      const ctx = await send('VIDEO_EXTRACT_ACTIVE');
      const url = extractFirstUrl(ctx.videoUrl || ctx.pageUrl || '');
      if (!url) {
        throw new Error('当前页面未识别到可用链接');
      }
      el.videoUrl.value = url;
      setResult('已读取地址栏链接。', 'success');
    } catch (error) {
      setResult(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function getShareLink() {
    setLoading(true);
    setResult('正在获取分享链接（自动点击 分享 -> 复制链接）...', '');

    try {
      const result = await send('VIDEO_COPY_SHARE_LINK');
      const direct = result && result.link ? extractFirstUrl(result.link) : '';

      if (direct) {
        el.videoUrl.value = direct;
        setResult('已从页面直接获取分享链接。', 'success');
        return;
      }

      // Fallback: read clipboard after triggering copy action.
      const deadline = Date.now() + 3000;
      let lastError = null;
      while (Date.now() < deadline) {
        try {
          const url = await readClipboardUrl();
          el.videoUrl.value = url;
          setResult('已获取分享链接并填入。', 'success');
          return;
        } catch (error) {
          lastError = error;
          await new Promise((r) => setTimeout(r, 200));
        }
      }

      throw lastError || new Error('获取分享链接失败，请手动点击分享并复制链接后再粘贴');
    } catch (error) {
      setResult(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function refreshSession() {
    setLoading(true);
    try {
      const session = await send('AUTH_SESSION');
      pageState.auth = {
        loggedIn: session.loggedIn,
        user: session.user
      };
      renderAuthStatus();
      setResult(session.loggedIn ? '登录状态有效。' : '当前未登录。', session.loggedIn ? 'success' : '');
    } catch (error) {
      setResult(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function parsePreview() {
    const videoUrl = extractFirstUrl(el.videoUrl.value);
    if (!videoUrl) {
      setResult('请输入有效的视频链接。', 'error');
      return;
    }

    setLoading(true);
    try {
      const result = await send('VIDEO_PARSE', {
        videoUrl,
        parserId: el.parserSelect.value
      });

      const parsed = result.parsed || {};
      const mediaType = parsed.mediaType === 'image_album' ? '图集' : '视频';
      const author = parsed.author ? `作者：${parsed.author}` : '作者：未知';
      const title = parsed.title || '未命名';
      setResult(`解析成功\n类型：${mediaType}\n标题：${title}\n${author}\n解析器：${result.parserName || '-'}`, 'success');
    } catch (error) {
      setResult(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function directUpload() {
    const videoUrl = extractFirstUrl(el.videoUrl.value);
    if (!videoUrl) {
      setResult('请输入有效的视频链接。', 'error');
      return;
    }

    if (!el.webdavSelect.value) {
      setResult('请先在设置页添加并选择 WebDAV。', 'error');
      return;
    }

    setLoading(true);
    setResult('处理中，请稍候...', '');

    try {
      const result = await send('VIDEO_DIRECT_UPLOAD', {
        videoUrl,
        parserId: el.parserSelect.value,
        webdavId: el.webdavSelect.value
      });

      const title = result.parsed && result.parsed.title ? result.parsed.title : '未命名';
      setResult(`上传成功\n标题：${title}\n路径：${result.filePath}`, 'success');
    } catch (error) {
      setResult(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  function bindEvents() {
    el.openOptions.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });

    el.btnGetShare.addEventListener('click', getShareLink);
    el.btnFillActive.addEventListener('click', fillFromActiveTab);
    el.btnPasteClipboard.addEventListener('click', pasteFromClipboard);
    el.btnCheckSession.addEventListener('click', refreshSession);
    el.btnParse.addEventListener('click', parsePreview);
    el.btnUpload.addEventListener('click', directUpload);
  }

  async function bootstrap() {
    bindEvents();
    await loadState();
  }

  bootstrap().catch((error) => {
    setResult(error.message, 'error');
  });
})();
