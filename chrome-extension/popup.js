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
    syncStatus: document.getElementById('sync-status'),
    openOptions: document.getElementById('open-options'),
    homeView: document.getElementById('home-view'),
    previewView: document.getElementById('preview-view'),
    pageKind: document.getElementById('page-kind'),
    btnSmartUpload: document.getElementById('btn-smart-upload'),
    btnGetShare: document.getElementById('btn-get-share'),
    btnFillActive: document.getElementById('btn-fill-active'),
    btnPasteClipboard: document.getElementById('btn-paste-clipboard'),
    btnCheckSession: document.getElementById('btn-check-session'),
    btnOpenPreview: document.getElementById('btn-open-preview'),
    btnPreviewBack: document.getElementById('btn-preview-back'),
    btnQueueAdd: document.getElementById('btn-queue-add'),
    btnQueueRefresh: document.getElementById('btn-queue-refresh'),
    videoUrl: document.getElementById('video-url'),
    shareMeta: document.getElementById('share-meta'),
    metaShort: document.getElementById('meta-short'),
    metaLong: document.getElementById('meta-long'),
    metaAweme: document.getElementById('meta-aweme'),
    metaSource: document.getElementById('meta-source'),
    btnCopyShort: document.getElementById('btn-copy-short'),
    btnUseShort: document.getElementById('btn-use-short'),
    btnCopyLong: document.getElementById('btn-copy-long'),
    btnUseLong: document.getElementById('btn-use-long'),
    parserSelect: document.getElementById('parser-select'),
    webdavSelect: document.getElementById('webdav-select'),
    btnParse: document.getElementById('btn-parse'),
    btnUpload: document.getElementById('btn-upload'),
    resultBoxHome: document.getElementById('result-box-home'),
    resultBox: document.getElementById('result-box'),
    previewEmpty: document.getElementById('preview-empty'),
    previewPanel: document.getElementById('preview-panel'),
    previewVideo: document.getElementById('preview-video'),
    previewImage: document.getElementById('preview-image'),
    previewAlbumGrid: document.getElementById('preview-album-grid'),
    previewInfo: document.getElementById('preview-info'),
    previewOpenLink: document.getElementById('preview-open-link'),
    queueSummary: document.getElementById('queue-summary'),
    queueList: document.getElementById('queue-list')
  };

  let pageState = {
    parsers: [],
    webdavServers: [],
    defaults: { parserId: '', webdavId: '' },
    auth: { loggedIn: false, user: null }
  };

  let lastShareMeta = null;
  let queuePollTimer = null;

  function switchToView(view) {
    const showPreview = view === 'preview';
    if (el.homeView) {
      el.homeView.classList.toggle('hidden', showPreview);
    }
    if (el.previewView) {
      el.previewView.classList.toggle('hidden', !showPreview);
    }
  }

  function renderShareMeta() {
    if (!el.shareMeta) return;

    if (!lastShareMeta || typeof lastShareMeta !== 'object') {
      el.shareMeta.classList.add('hidden');
      if (el.metaShort) el.metaShort.textContent = '';
      if (el.metaLong) el.metaLong.textContent = '';
      if (el.metaAweme) el.metaAweme.textContent = '';
      if (el.metaSource) el.metaSource.textContent = '';
      return;
    }

    const shortLink = lastShareMeta.shortLink ? extractFirstUrl(lastShareMeta.shortLink) : '';
    const longLink = lastShareMeta.longLink ? extractFirstUrl(lastShareMeta.longLink) : '';
    const awemeId = lastShareMeta.awemeId ? String(lastShareMeta.awemeId || '').trim() : '';
    const source = lastShareMeta.source ? String(lastShareMeta.source || '').trim() : '';

    el.shareMeta.classList.remove('hidden');
    if (el.metaShort) el.metaShort.textContent = shortLink || '-';
    if (el.metaLong) el.metaLong.textContent = longLink || '-';
    if (el.metaAweme) el.metaAweme.textContent = awemeId || '-';
    if (el.metaSource) el.metaSource.textContent = source || '-';
  }

  function setResult(message, type) {
    [el.resultBox, el.resultBoxHome].forEach((box) => {
      if (!box) return;
      box.className = 'notice';
      if (type === 'error') {
        box.classList.add('error');
      } else if (type === 'success') {
        box.classList.add('success');
      }
      box.textContent = message;
    });
  }

  function resetPreviewMedia() {
    if (el.previewVideo) {
      try {
        el.previewVideo.pause();
      } catch (error) {
      }
      el.previewVideo.removeAttribute('src');
      el.previewVideo.classList.add('hidden');
    }

    if (el.previewImage) {
      el.previewImage.removeAttribute('src');
      el.previewImage.classList.add('hidden');
    }
  }

  function clearPreview(message) {
    resetPreviewMedia();

    if (el.previewInfo) {
      el.previewInfo.textContent = '';
    }

    if (el.previewOpenLink) {
      el.previewOpenLink.removeAttribute('href');
      el.previewOpenLink.classList.add('hidden');
    }

    if (el.previewPanel) {
      el.previewPanel.classList.add('hidden');
    }

    if (el.previewAlbumGrid) {
      el.previewAlbumGrid.innerHTML = '';
      el.previewAlbumGrid.classList.add('hidden');
    }

    if (el.previewEmpty) {
      el.previewEmpty.textContent = message || '点击“解析并进入结果页”后，会在当前插件页面展示完整预览。';
      el.previewEmpty.classList.remove('hidden');
    }
  }

  function renderParsedPreview(parsed, parserName) {
    if (!parsed || typeof parsed !== 'object') {
      clearPreview('暂无可展示的预览数据。');
      return;
    }

    const isAlbum = parsed.mediaType === 'image_album';
    const mediaType = isAlbum ? '图集' : '视频';
    const title = parsed.title ? String(parsed.title) : '未命名';
    const author = parsed.author ? String(parsed.author) : '未知';
    const lines = [
      `类型：${mediaType}`,
      `标题：${title}`,
      `作者：${author}`
    ];
    if (parserName) {
      lines.push(`解析器：${parserName}`);
    }

    const videoUrl = extractFirstUrl(parsed.url || '');
    const allImages = Array.isArray(parsed.images)
      ? parsed.images
          .map((item) => extractFirstUrl(item && item.url ? item.url : ''))
          .filter(Boolean)
      : [];
    const firstImage = Array.isArray(parsed.images) && parsed.images[0]
      ? extractFirstUrl(parsed.images[0].url || '')
      : '';
    const thumbnail = extractFirstUrl(parsed.thumbnail || '');
    const openLink = videoUrl || firstImage || thumbnail;

    if (el.previewInfo) {
      el.previewInfo.textContent = lines.join('\n');
    }

    if (el.previewOpenLink && openLink) {
      el.previewOpenLink.href = openLink;
      el.previewOpenLink.classList.remove('hidden');
    } else if (el.previewOpenLink) {
      el.previewOpenLink.classList.add('hidden');
    }

    resetPreviewMedia();

    if (isAlbum) {
      const imageSrc = firstImage || thumbnail;
      if (imageSrc && el.previewImage) {
        el.previewImage.src = imageSrc;
        el.previewImage.classList.remove('hidden');
      }
      if (el.previewAlbumGrid && allImages.length > 0) {
        el.previewAlbumGrid.innerHTML = '';
        allImages.forEach((src, index) => {
          const item = document.createElement('a');
          item.className = 'preview-album-item';
          item.href = src;
          item.target = '_blank';
          item.rel = 'noreferrer';

          const img = document.createElement('img');
          img.src = src;
          img.alt = `图集图片 ${index + 1}`;
          img.loading = 'lazy';
          item.appendChild(img);

          el.previewAlbumGrid.appendChild(item);
        });
        el.previewAlbumGrid.classList.remove('hidden');
      }
    } else {
      if (videoUrl && el.previewVideo) {
        el.previewVideo.src = videoUrl;
        if (thumbnail) {
          el.previewVideo.poster = thumbnail;
        } else {
          el.previewVideo.removeAttribute('poster');
        }
        el.previewVideo.classList.remove('hidden');
      } else if (thumbnail && el.previewImage) {
        el.previewImage.src = thumbnail;
        el.previewImage.classList.remove('hidden');
      } else if (firstImage && el.previewImage) {
        el.previewImage.src = firstImage;
        el.previewImage.classList.remove('hidden');
      }
    }

    if (el.previewPanel) {
      el.previewPanel.classList.remove('hidden');
    }
    if (el.previewEmpty) {
      el.previewEmpty.classList.add('hidden');
    }
  }

  function setLoading(loading) {
    [el.btnSmartUpload, el.btnGetShare, el.btnFillActive, el.btnPasteClipboard, el.btnParse, el.btnUpload, el.btnQueueAdd, el.btnCheckSession, el.btnOpenPreview, el.btnPreviewBack].forEach((button) => {
      if (!button) return;
      button.disabled = loading;
    });
  }

  function pickMatchedMeta(videoUrl) {
    const current = extractFirstUrl(videoUrl || '');
    if (!current) return null;
    if (!lastShareMeta || typeof lastShareMeta !== 'object') return null;
    const values = [lastShareMeta.link, lastShareMeta.shortLink, lastShareMeta.longLink]
      .map((item) => extractFirstUrl(item || ''))
      .filter(Boolean);
    return values.includes(current) ? lastShareMeta : null;
  }

  function queueStatusLabel(status) {
    const map = {
      queued: '排队中',
      pending: '等待中',
      resuming: '恢复中',
      running: '处理中',
      completed: '已完成',
      failed: '失败'
    };
    const key = String(status || '');
    return map[key] || key || '未知';
  }

  function queueStatusClass(status) {
    const key = String(status || '');
    if (key === 'completed') return 'badge success';
    if (key === 'failed') return 'badge fail';
    return 'badge warn';
  }

  function queueSortWeight(status) {
    const key = String(status || '');
    if (key === 'running' || key === 'resuming') return 0;
    if (key === 'queued' || key === 'pending') return 1;
    if (key === 'failed') return 2;
    if (key === 'completed') return 3;
    return 4;
  }

  function formatQueueTime(task) {
    const raw = task && (task.updatedAt || task.createdAt) ? String(task.updatedAt || task.createdAt) : '';
    if (!raw) return '-';
    const time = Date.parse(raw);
    return Number.isFinite(time) ? new Date(time).toLocaleString() : raw;
  }

  function renderQueueTasks(tasks) {
    const list = Array.isArray(tasks) ? tasks : [];
    if (el.queueSummary) {
      const running = list.filter((item) => ['running', 'resuming'].includes(String(item.status || ''))).length;
      const waiting = list.filter((item) => ['queued', 'pending'].includes(String(item.status || ''))).length;
      el.queueSummary.textContent = `队列任务：${list.length}（运行 ${running} / 等待 ${waiting}）`;
    }

    if (!el.queueList) return;
    if (list.length === 0) {
      el.queueList.innerHTML = '<div class="muted">暂无队列任务</div>';
      return;
    }

    el.queueList.innerHTML = '';
    list.forEach((task) => {
      const item = document.createElement('div');
      item.className = 'queue-item';

      const title = document.createElement('div');
      title.className = 'queue-item-title';
      title.textContent = String(task.title || '未命名任务');

      const meta = document.createElement('div');
      meta.className = 'queue-item-meta';
      const progress = Math.max(0, Math.min(100, Number(task.progress || 0)));
      meta.textContent = `${queueStatusLabel(task.status)} | 进度 ${progress}% | ${formatQueueTime(task)}`;

      const statusBadge = document.createElement('span');
      statusBadge.className = queueStatusClass(task.status);
      statusBadge.textContent = queueStatusLabel(task.status);

      const head = document.createElement('div');
      head.className = 'queue-item-head';
      head.appendChild(title);
      head.appendChild(statusBadge);

      const bar = document.createElement('div');
      bar.className = 'progress';
      const fill = document.createElement('span');
      fill.style.width = `${progress}%`;
      bar.appendChild(fill);

      const tail = document.createElement('div');
      tail.className = 'queue-item-tail';
      if (task.filePath) {
        const path = document.createElement('div');
        path.className = 'list-item-meta';
        path.textContent = String(task.filePath || '');
        tail.appendChild(path);
      } else if (task.error) {
        const err = document.createElement('div');
        err.className = 'list-item-meta';
        err.textContent = `失败原因：${String(task.error || '')}`;
        tail.appendChild(err);
      }

      const canDelete = ['completed', 'failed'].includes(String(task.status || ''));
      if (canDelete) {
        const actions = document.createElement('div');
        actions.className = 'row wrap';
        const btnDelete = document.createElement('button');
        btnDelete.className = 'ghost small-btn';
        btnDelete.textContent = '移除';
        btnDelete.addEventListener('click', async () => {
          try {
            await send('TASK_DELETE', { id: task.id });
            await refreshQueueTasks(false);
          } catch (error) {
            setResult(error.message, 'error');
          }
        });
        actions.appendChild(btnDelete);
        tail.appendChild(actions);
      }

      item.appendChild(head);
      item.appendChild(meta);
      item.appendChild(bar);
      item.appendChild(tail);
      el.queueList.appendChild(item);
    });
  }

  async function refreshQueueTasks(withNotice) {
    const allTasks = await send('TASKS_LIST');
    const queueTasks = (Array.isArray(allTasks) ? allTasks : [])
      .filter((task) => String(task && task.type ? task.type : '') === 'single_queue_upload')
      .sort((a, b) => {
        const weight = queueSortWeight(a.status) - queueSortWeight(b.status);
        if (weight !== 0) return weight;
        const aTime = Date.parse(String(a && (a.updatedAt || a.createdAt) ? (a.updatedAt || a.createdAt) : '')) || 0;
        const bTime = Date.parse(String(b && (b.updatedAt || b.createdAt) ? (b.updatedAt || b.createdAt) : '')) || 0;
        return bTime - aTime;
      });

    renderQueueTasks(queueTasks);
    if (withNotice) {
      setResult(`任务队列已刷新，共 ${queueTasks.length} 条。`, 'success');
    }
  }

  async function writeClipboardText(text) {
    const value = String(text || '');
    if (!value) {
      throw new Error('复制内容为空');
    }

    // Primary: async clipboard API (requires user gesture, which we have on button click).
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(value);
        return;
      }
    } catch (error) {
    }

    // Fallback: execCommand copy.
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand && document.execCommand('copy');
    textarea.remove();
    if (!ok) {
      throw new Error('自动复制失败，请手动复制');
    }
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
      lastShareMeta = null;
      renderShareMeta();
      clearPreview('链接已更新，请重新点击“解析并进入结果页”。');
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

  function renderSyncStatus() {
    if (!el.syncStatus) return;
    const autoHistory = pageState && pageState.settings && pageState.settings.autoSyncHistory !== false ? '开' : '关';
    const cloudConfig = pageState && pageState.auth && pageState.auth.loggedIn ? '已开启（登录后自动）' : '未登录';
    el.syncStatus.textContent = `历史自动同步：${autoHistory}｜配置云同步：${cloudConfig}`;
  }

  function renderPageKind(ctx) {
    if (!el.pageKind) return;
    const kind = ctx && ctx.pageKind ? String(ctx.pageKind) : 'unknown';
    const labelMap = {
      user: '用户主页',
      feed: '推荐页',
      video: '视频详情页',
      unknown: '未知'
    };
    const label = labelMap[kind] || kind;
    el.pageKind.textContent = `页面：${label}`;
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
    renderSyncStatus();
    renderSelects();
  }

  async function loadActiveContext() {
    try {
      const ctx = await send('VIDEO_EXTRACT_ACTIVE');
      renderPageKind(ctx);
      return ctx;
    } catch (error) {
      renderPageKind(null);
      return null;
    }
  }

  async function fillFromActiveTab() {
    setLoading(true);
    try {
      const ctx = await send('VIDEO_EXTRACT_ACTIVE');
      const url = extractFirstUrl(ctx.videoUrl || '');
      if (!url) {
        throw new Error('当前页面未识别到可用视频链接（推荐页请用“获取链接并复制”或“智能上传当前页”）');
      }
      el.videoUrl.value = url;
      lastShareMeta = {
        pageUrl: ctx.pageUrl || '',
        link: url,
        shortLink: '',
        longLink: /\/video\//i.test(url) ? url : '',
        awemeId: '',
        source: 'active_context'
      };
      renderShareMeta();
      clearPreview('链接已更新，请重新点击“解析并进入结果页”。');
      setResult('已读取地址栏链接。', 'success');
    } catch (error) {
      setResult(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function getShareLink() {
    setLoading(true);
    setResult('正在获取分享链接...', '');

    try {
      const result = await send('VIDEO_COPY_SHARE_LINK');
      const direct = result && result.link ? extractFirstUrl(result.link) : '';
      const shortLink = result && result.shortLink ? extractFirstUrl(result.shortLink) : '';
      const longLink = result && result.longLink ? extractFirstUrl(result.longLink) : '';
      const awemeId = result && result.awemeId ? String(result.awemeId || '').trim() : '';

      lastShareMeta = {
        pageUrl: result && result.pageUrl ? String(result.pageUrl || '') : '',
        link: direct,
        shortLink,
        longLink,
        awemeId,
        source: result && result.source ? String(result.source || '') : ''
      };
      renderShareMeta();
      clearPreview('链接元信息已更新，请重新点击“解析并进入结果页”。');

      const finalLink = shortLink || direct || longLink;
      if (finalLink) {
        el.videoUrl.value = finalLink;
        try {
          await writeClipboardText(finalLink);
          setResult('已获取链接并复制到剪贴板。', 'success');
        } catch (error) {
          setResult(`已获取链接，但自动复制失败：${error.message}`, 'success');
        }
        return;
      }

      // Fallback: read clipboard after triggering copy action.
      const deadline = Date.now() + 3000;
      let lastError = null;
      while (Date.now() < deadline) {
        try {
          const url = await readClipboardUrl();
          el.videoUrl.value = url;
          lastShareMeta = null;
          clearPreview('链接已更新，请重新点击“解析并进入结果页”。');
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

  async function smartUploadActive() {
    if (!el.webdavSelect.value) {
      setResult('请先在设置页添加并选择 WebDAV。', 'error');
      return;
    }

    setLoading(true);
    setResult('正在智能上传当前页...', '');
    try {
      const result = await send('SMART_UPLOAD_ACTIVE', {
        parserId: el.parserSelect.value,
        webdavId: el.webdavSelect.value
      });

      if (result && result.mode === 'batch') {
        const taskId = result.taskId || '';
        setResult(`已启动用户主页批量上传任务：${taskId}。请在设置页查看进度。`, 'success');
        return;
      }

      if (result && result.parsed) {
        renderParsedPreview(result.parsed, '');
        switchToView('preview');
      }
      const title = result && result.parsed && result.parsed.title ? String(result.parsed.title) : '未命名';
      const path = result && result.filePath ? String(result.filePath) : '';
      setResult(path ? `上传成功\n标题：${title}\n路径：${path}` : `上传成功\n标题：${title}`, 'success');
    } catch (error) {
      setResult(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function copyMetaLink(kind) {
    if (!lastShareMeta || typeof lastShareMeta !== 'object') {
      setResult('尚未获取到链接元信息。', 'error');
      return;
    }
    const value = kind === 'short'
      ? extractFirstUrl(lastShareMeta.shortLink || '')
      : extractFirstUrl(lastShareMeta.longLink || '');
    if (!value) {
      setResult(kind === 'short' ? '当前未获取到短链。' : '当前未获取到长链。', 'error');
      return;
    }
    try {
      await writeClipboardText(value);
      setResult('已复制到剪贴板。', 'success');
    } catch (error) {
      setResult(`复制失败：${error.message}`, 'error');
    }
  }

  function useMetaLink(kind) {
    if (!lastShareMeta || typeof lastShareMeta !== 'object') {
      setResult('尚未获取到链接元信息。', 'error');
      return;
    }
    const value = kind === 'short'
      ? extractFirstUrl(lastShareMeta.shortLink || '')
      : extractFirstUrl(lastShareMeta.longLink || '');
    if (!value) {
      setResult(kind === 'short' ? '当前未获取到短链。' : '当前未获取到长链。', 'error');
      return;
    }
    el.videoUrl.value = value;
    setResult('已填入链接输入框。', 'success');
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
      renderSyncStatus();
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
      const meta = pickMatchedMeta(videoUrl);

      const result = await send('VIDEO_PARSE', {
        videoUrl,
        parserId: el.parserSelect.value,
        meta
      });

      const parsed = result.parsed || {};
      renderParsedPreview(parsed, result.parserName || '');
      switchToView('preview');
      setResult('解析成功，结果已在插件内展示。', 'success');
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
      const meta = pickMatchedMeta(videoUrl);

      const result = await send('VIDEO_DIRECT_UPLOAD', {
        videoUrl,
        parserId: el.parserSelect.value,
        webdavId: el.webdavSelect.value,
        meta
      });

      const title = result.parsed && result.parsed.title ? result.parsed.title : '未命名';
      if (result && result.parsed) {
        renderParsedPreview(result.parsed, '');
        switchToView('preview');
      }
      setResult(`上传成功\n标题：${title}\n路径：${result.filePath}`, 'success');
    } catch (error) {
      setResult(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function enqueueUploadTask() {
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
    setResult('正在解析并加入后台任务队列...', '');

    try {
      const meta = pickMatchedMeta(videoUrl);
      const parsedResult = await send('VIDEO_PARSE', {
        videoUrl,
        parserId: el.parserSelect.value,
        meta
      });
      const parsed = parsedResult && parsedResult.parsed ? parsedResult.parsed : null;
      if (!parsed) {
        throw new Error('解析失败，未返回有效结果');
      }

      const queueResult = await send('QUEUE_ADD_UPLOAD', {
        videoUrl,
        parserId: el.parserSelect.value,
        webdavId: el.webdavSelect.value,
        meta,
        parsed,
        parserName: parsedResult.parserName || ''
      });

      renderParsedPreview(parsed, parsedResult.parserName || '');
      switchToView('preview');
      await refreshQueueTasks(false);

      const position = Number(queueResult && queueResult.position ? queueResult.position : 0);
      const title = queueResult && queueResult.title ? String(queueResult.title) : '未命名任务';
      const posSuffix = position > 0 ? `（队列第 ${position} 位）` : '';
      setResult(`已加入任务队列${posSuffix}\n标题：${title}`, 'success');
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

    if (el.btnSmartUpload) el.btnSmartUpload.addEventListener('click', smartUploadActive);
    el.btnGetShare.addEventListener('click', getShareLink);
    el.btnFillActive.addEventListener('click', fillFromActiveTab);
    el.btnPasteClipboard.addEventListener('click', pasteFromClipboard);
    el.btnCheckSession.addEventListener('click', refreshSession);
    el.btnParse.addEventListener('click', parsePreview);
    el.btnUpload.addEventListener('click', directUpload);
    if (el.btnQueueAdd) el.btnQueueAdd.addEventListener('click', enqueueUploadTask);
    if (el.btnQueueRefresh) {
      el.btnQueueRefresh.addEventListener('click', () => {
        refreshQueueTasks(true).catch((error) => setResult(error.message, 'error'));
      });
    }
    if (el.btnOpenPreview) el.btnOpenPreview.addEventListener('click', () => switchToView('preview'));
    if (el.btnPreviewBack) el.btnPreviewBack.addEventListener('click', () => switchToView('home'));

    if (el.btnCopyShort) el.btnCopyShort.addEventListener('click', () => copyMetaLink('short'));
    if (el.btnCopyLong) el.btnCopyLong.addEventListener('click', () => copyMetaLink('long'));
    if (el.btnUseShort) el.btnUseShort.addEventListener('click', () => useMetaLink('short'));
    if (el.btnUseLong) el.btnUseLong.addEventListener('click', () => useMetaLink('long'));

    if (el.videoUrl) {
      el.videoUrl.addEventListener('input', () => {
        // If the user manually edits the field, the stored meta may no longer match.
        // Keep meta visible (for quick switching) but avoid using stale meta elsewhere.
        clearPreview('链接已手动修改，请重新点击“解析并进入结果页”。');
      });
    }

    chrome.runtime.onMessage.addListener((message) => {
      if (!message || message.type !== 'TASK_UPDATED') return;
      refreshQueueTasks(false).catch(() => {});
    });

    if (queuePollTimer) {
      clearInterval(queuePollTimer);
    }
    queuePollTimer = setInterval(() => {
      refreshQueueTasks(false).catch(() => {});
    }, 3000);
  }

  async function bootstrap() {
    bindEvents();
    await loadState();
    await loadActiveContext();
    await refreshQueueTasks(false);
    renderShareMeta();
    clearPreview();
    switchToView('home');
  }

  bootstrap().catch((error) => {
    setResult(error.message, 'error');
  });
})();
