(function () {
  const { createId, normalizeBaseUrl, formatDate, sanitizeName } = globalThis.ExtShared;

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
    notice: document.getElementById('global-notice'),

    tabButtons: Array.from(document.querySelectorAll('.tab-btn')),
    tabPanels: Array.from(document.querySelectorAll('.tab-panel')),

    accountStatus: document.getElementById('account-status'),
    authEmail: document.getElementById('auth-email'),
    authPassword: document.getElementById('auth-password'),
    btnRefreshSession: document.getElementById('btn-refresh-session'),
    btnConfigSync: document.getElementById('btn-config-sync'),
    btnLogin: document.getElementById('btn-login'),
    btnRegister: document.getElementById('btn-register'),
    btnLogout: document.getElementById('btn-logout'),
    accountConfigSyncMeta: document.getElementById('account-config-sync-meta'),
    accountHistorySyncMeta: document.getElementById('account-history-sync-meta'),

    settingApiBaseUrl: document.getElementById('setting-api-base-url'),
    settingBatchConcurrency: document.getElementById('setting-batch-concurrency'),
    settingBatchRetryCount: document.getElementById('setting-batch-retry-count'),
    settingHistoryLimit: document.getElementById('setting-history-limit'),
    settingUploadFolderTemplate: document.getElementById('setting-upload-folder-template'),
    settingUploadFileTemplate: document.getElementById('setting-upload-file-template'),
    settingNotifyEnabled: document.getElementById('setting-notify-enabled'),
    settingNotifySuccess: document.getElementById('setting-notify-success'),
    settingNotifyFailure: document.getElementById('setting-notify-failure'),
    settingNotifyBatchDone: document.getElementById('setting-notify-batch-done'),
    settingNotifyQuietStart: document.getElementById('setting-notify-quiet-start'),
    settingNotifyQuietEnd: document.getElementById('setting-notify-quiet-end'),
    settingRetryBaseDelayMs: document.getElementById('setting-retry-base-delay-ms'),
    settingRetryMaxDelayMs: document.getElementById('setting-retry-max-delay-ms'),
    settingRetryClassTimeout: document.getElementById('setting-retry-class-timeout'),
    settingRetryClassNetwork: document.getElementById('setting-retry-class-network'),
    settingRetryClassHttp5xx: document.getElementById('setting-retry-class-http5xx'),
    settingRetryClassHttp4xx: document.getElementById('setting-retry-class-http4xx'),
    settingRetryClassInvalid: document.getElementById('setting-retry-class-invalid'),
    settingAdaptiveConcurrency: document.getElementById('setting-adaptive-concurrency'),
    settingAutoResumeTasks: document.getElementById('setting-auto-resume-tasks'),
    settingDedupeCloud: document.getElementById('setting-dedupe-cloud'),
    settingAutoSyncHistory: document.getElementById('setting-auto-sync-history'),
    btnSaveSettings: document.getElementById('btn-save-settings'),

    parserName: document.getElementById('parser-name'),
    parserApiUrl: document.getElementById('parser-api-url'),
    parserMethod: document.getElementById('parser-method'),
    parserParam: document.getElementById('parser-param'),
    btnParserSave: document.getElementById('btn-parser-save'),
    btnParserReset: document.getElementById('btn-parser-reset'),
    parserList: document.getElementById('parser-list'),

    webdavName: document.getElementById('webdav-name'),
    webdavUrl: document.getElementById('webdav-url'),
    webdavUsername: document.getElementById('webdav-username'),
    webdavPassword: document.getElementById('webdav-password'),
    webdavBasePath: document.getElementById('webdav-base-path'),
    btnWebdavSave: document.getElementById('btn-webdav-save'),
    btnWebdavTest: document.getElementById('btn-webdav-test'),
    btnWebdavReset: document.getElementById('btn-webdav-reset'),
    webdavList: document.getElementById('webdav-list'),

    batchUserUrl: document.getElementById('batch-user-url'),
    batchLimit: document.getElementById('batch-limit'),
    batchParser: document.getElementById('batch-parser'),
    batchWebdav: document.getElementById('batch-webdav'),
    batchFilterMediaType: document.getElementById('batch-filter-media-type'),
    batchFilterMinDuration: document.getElementById('batch-filter-min-duration'),
    batchFilterStartDate: document.getElementById('batch-filter-start-date'),
    batchFilterEndDate: document.getElementById('batch-filter-end-date'),
    batchFilterExcludePinned: document.getElementById('batch-filter-exclude-pinned'),
    btnBatchStart: document.getElementById('btn-batch-start'),
    btnBatchResume: document.getElementById('btn-batch-resume'),
    btnBatchRefresh: document.getElementById('btn-batch-refresh'),
    batchTaskList: document.getElementById('batch-task-list'),

    btnHistoryRefresh: document.getElementById('btn-history-refresh'),
    btnHistorySync: document.getElementById('btn-history-sync'),
    btnHistoryExportJson: document.getElementById('btn-history-export-json'),
    btnHistoryExportCsv: document.getElementById('btn-history-export-csv'),
    btnHistoryClear: document.getElementById('btn-history-clear'),
    historyMetrics: document.getElementById('history-metrics'),
    historyList: document.getElementById('history-list')
  };

  const pageState = {
    settings: {
      apiBaseUrl: 'https://dyjx.ehhx.qzz.io',
      autoSyncHistory: true,
      batchConcurrency: 2,
      adaptiveConcurrency: true,
      autoResumeTasks: true,
      dedupeWithCloud: true,
      batchRetryCount: 2,
      retryPolicy: {
        retryableClasses: ['timeout', 'network', 'http5xx'],
        maxRetries: 2,
        baseDelayMs: 600,
        maxDelayMs: 12000
      },
      notifications: {
        enabled: true,
        success: false,
        failure: true,
        batchDone: true,
        quietHoursStart: '23:00',
        quietHoursEnd: '08:00'
      },
      historyLimit: 500,
      uploadFolderTemplate: '{author}',
      uploadFileTemplate: '{awemeId}_{title}',
      batchFilters: {
        mediaType: 'all',
        minDurationSec: 0,
        startDate: '',
        endDate: '',
        excludePinned: false
      }
    },
    parsers: [],
    webdavServers: [],
    defaults: {
      parserId: '',
      webdavId: ''
    },
    auth: {
      loggedIn: false,
      user: null,
      expiresAt: 0
    }
  };

  let editingParserId = '';
  let editingWebdavId = '';
  let taskPollTimer = null;

  function setNotice(message, type) {
    if (!message) {
      el.notice.classList.add('hidden');
      return;
    }

    el.notice.classList.remove('hidden');
    el.notice.className = 'notice';
    if (type === 'error') {
      el.notice.classList.add('error');
    } else if (type === 'success') {
      el.notice.classList.add('success');
    }
    el.notice.textContent = message;
  }

  function getEnabledParsers() {
    return (pageState.parsers || []).filter((item) => !item.disabled);
  }

  function getEnabledWebdav() {
    return (pageState.webdavServers || []).filter((item) => !item.disabled);
  }

  function findParser(id) {
    return (pageState.parsers || []).find((item) => item.id === id);
  }

  function findWebdav(id) {
    return (pageState.webdavServers || []).find((item) => item.id === id);
  }

  function normalizeBatchFilters(input) {
    const source = input && typeof input === 'object' ? input : {};
    const mediaType = String(source.mediaType || 'all');
    return {
      mediaType: mediaType === 'video' || mediaType === 'image_album' ? mediaType : 'all',
      minDurationSec: Math.max(0, Math.trunc(Number(source.minDurationSec || 0))),
      startDate: /^\d{4}-\d{2}-\d{2}$/.test(String(source.startDate || '')) ? String(source.startDate) : '',
      endDate: /^\d{4}-\d{2}-\d{2}$/.test(String(source.endDate || '')) ? String(source.endDate) : '',
      excludePinned: Boolean(source.excludePinned)
    };
  }

  function normalizeNotificationSettings(input) {
    const source = input && typeof input === 'object' ? input : {};
    const quietHoursStart = /^\d{2}:\d{2}$/.test(String(source.quietHoursStart || ''))
      ? String(source.quietHoursStart)
      : '23:00';
    const quietHoursEnd = /^\d{2}:\d{2}$/.test(String(source.quietHoursEnd || ''))
      ? String(source.quietHoursEnd)
      : '08:00';
    return {
      enabled: source.enabled !== false,
      success: source.success === true,
      failure: source.failure !== false,
      batchDone: source.batchDone !== false,
      quietHoursStart,
      quietHoursEnd
    };
  }

  function normalizeRetryPolicy(input, fallbackRetries) {
    const source = input && typeof input === 'object' ? input : {};
    const classes = Array.isArray(source.retryableClasses) ? source.retryableClasses : ['timeout', 'network', 'http5xx'];
    const normalizedClasses = [];
    const seen = new Set();
    const allowed = ['timeout', 'network', 'http4xx', 'http5xx', 'invalid_payload', 'unknown'];
    classes.forEach((item) => {
      const value = String(item || '').trim();
      if (!allowed.includes(value)) return;
      if (seen.has(value)) return;
      seen.add(value);
      normalizedClasses.push(value);
    });
    return {
      retryableClasses: normalizedClasses.length > 0 ? normalizedClasses : ['timeout', 'network', 'http5xx'],
      maxRetries: Math.max(0, Math.min(5, Number(source.maxRetries != null ? source.maxRetries : fallbackRetries))),
      baseDelayMs: Math.max(150, Math.min(60000, Number(source.baseDelayMs || 600))),
      maxDelayMs: Math.max(300, Math.min(120000, Number(source.maxDelayMs || 12000)))
    };
  }

  function switchTab(tab) {
    el.tabButtons.forEach((button) => {
      if (button.dataset.tab === tab) {
        button.classList.add('active');
      } else {
        button.classList.remove('active');
      }
    });

    el.tabPanels.forEach((panel) => {
      if (panel.id === `tab-${tab}`) {
        panel.classList.remove('hidden');
      } else {
        panel.classList.add('hidden');
      }
    });
  }

  function renderAccount() {
    const configTs = pageState && pageState.settings ? Number(pageState.settings.lastConfigSyncAt || 0) : 0;
    if (el.accountConfigSyncMeta) {
      el.accountConfigSyncMeta.textContent = `配置同步：${configTs ? formatDate(configTs) : '从未'}`;
    }

    const historyTs = pageState && pageState.settings ? Number(pageState.settings.lastHistorySyncAt || 0) : 0;
    const historyOk = pageState && pageState.settings ? Number(pageState.settings.lastHistorySyncSuccess || 0) : 0;
    const historyFail = pageState && pageState.settings ? Number(pageState.settings.lastHistorySyncFailed || 0) : 0;
    if (el.accountHistorySyncMeta) {
      const suffix = historyTs ? `（成功 ${historyOk} / 失败 ${historyFail}）` : '';
      el.accountHistorySyncMeta.textContent = `历史同步：${historyTs ? formatDate(historyTs) : '从未'}${suffix}`;
    }

    if (!pageState.auth.loggedIn) {
      el.accountStatus.className = 'notice';
      el.accountStatus.textContent = '未登录。登录后可同步历史记录到云端。';
      return;
    }

    const user = pageState.auth.user || {};
    el.accountStatus.className = 'notice success';
    el.accountStatus.textContent = `已登录：${user.email || user.id || '-'}，会话过期时间：${pageState.auth.expiresAt ? formatDate(pageState.auth.expiresAt * 1000) : '未知'}`;
  }

  function renderSettings() {
    el.settingApiBaseUrl.value = pageState.settings.apiBaseUrl || '';
    el.settingBatchConcurrency.value = String(pageState.settings.batchConcurrency || 2);
    if (el.settingBatchRetryCount) {
      el.settingBatchRetryCount.value = String(pageState.settings.batchRetryCount || 2);
    }
    el.settingHistoryLimit.value = String(pageState.settings.historyLimit || 500);
    if (el.settingUploadFolderTemplate) {
      el.settingUploadFolderTemplate.value = String(pageState.settings.uploadFolderTemplate || '{author}');
    }
    if (el.settingUploadFileTemplate) {
      el.settingUploadFileTemplate.value = String(pageState.settings.uploadFileTemplate || '{awemeId}_{title}');
    }
    const notifications = normalizeNotificationSettings(pageState.settings.notifications || {});
    if (el.settingNotifyEnabled) el.settingNotifyEnabled.checked = notifications.enabled !== false;
    if (el.settingNotifySuccess) el.settingNotifySuccess.checked = notifications.success === true;
    if (el.settingNotifyFailure) el.settingNotifyFailure.checked = notifications.failure !== false;
    if (el.settingNotifyBatchDone) el.settingNotifyBatchDone.checked = notifications.batchDone !== false;
    if (el.settingNotifyQuietStart) el.settingNotifyQuietStart.value = notifications.quietHoursStart;
    if (el.settingNotifyQuietEnd) el.settingNotifyQuietEnd.value = notifications.quietHoursEnd;

    const retryPolicy = normalizeRetryPolicy(pageState.settings.retryPolicy || {}, pageState.settings.batchRetryCount || 2);
    if (el.settingRetryBaseDelayMs) el.settingRetryBaseDelayMs.value = String(retryPolicy.baseDelayMs);
    if (el.settingRetryMaxDelayMs) el.settingRetryMaxDelayMs.value = String(retryPolicy.maxDelayMs);
    if (el.settingRetryClassTimeout) el.settingRetryClassTimeout.checked = retryPolicy.retryableClasses.includes('timeout');
    if (el.settingRetryClassNetwork) el.settingRetryClassNetwork.checked = retryPolicy.retryableClasses.includes('network');
    if (el.settingRetryClassHttp5xx) el.settingRetryClassHttp5xx.checked = retryPolicy.retryableClasses.includes('http5xx');
    if (el.settingRetryClassHttp4xx) el.settingRetryClassHttp4xx.checked = retryPolicy.retryableClasses.includes('http4xx');
    if (el.settingRetryClassInvalid) el.settingRetryClassInvalid.checked = retryPolicy.retryableClasses.includes('invalid_payload');
    if (el.settingAdaptiveConcurrency) {
      el.settingAdaptiveConcurrency.checked = pageState.settings.adaptiveConcurrency !== false;
    }
    if (el.settingAutoResumeTasks) {
      el.settingAutoResumeTasks.checked = pageState.settings.autoResumeTasks !== false;
    }
    if (el.settingDedupeCloud) {
      el.settingDedupeCloud.checked = pageState.settings.dedupeWithCloud !== false;
    }
    el.settingAutoSyncHistory.checked = pageState.settings.autoSyncHistory !== false;
  }

  function renderParserList() {
    const list = getEnabledParsers();

    if (list.length === 0) {
      el.parserList.innerHTML = '<div class="muted">暂无解析器配置</div>';
      return;
    }

    el.parserList.innerHTML = '';

    list.forEach((parser) => {
      const item = document.createElement('div');
      item.className = 'list-item';
      item.innerHTML = `
        <div class="list-item-title">${parser.name}</div>
        <div class="list-item-meta">${parser.apiUrl}</div>
        <div class="list-item-meta">${parser.requestMethod || 'POST'} | 参数：${parser.urlParamName || 'url'}</div>
      `;

      const actions = document.createElement('div');
      actions.className = 'row wrap';
      actions.style.marginTop = '8px';

      const defaultBadge = document.createElement('span');
      defaultBadge.className = `badge ${pageState.defaults.parserId === parser.id ? 'success' : 'warn'}`;
      defaultBadge.textContent = pageState.defaults.parserId === parser.id ? '默认' : '可选';
      actions.appendChild(defaultBadge);

      const btnEdit = document.createElement('button');
      btnEdit.className = 'ghost';
      btnEdit.textContent = '编辑';
      btnEdit.addEventListener('click', () => {
        editingParserId = parser.id;
        el.parserName.value = parser.name || '';
        el.parserApiUrl.value = parser.apiUrl || '';
        el.parserMethod.value = parser.requestMethod || 'GET';
        el.parserParam.value = parser.urlParamName || 'url';
      });
      actions.appendChild(btnEdit);

      const btnDefault = document.createElement('button');
      btnDefault.className = 'secondary';
      btnDefault.textContent = '设为默认';
      btnDefault.disabled = pageState.defaults.parserId === parser.id;
      btnDefault.addEventListener('click', async () => {
        pageState.defaults.parserId = parser.id;
        await persistConfig('默认解析器已更新');
      });
      actions.appendChild(btnDefault);

      const btnDelete = document.createElement('button');
      btnDelete.className = 'danger';
      btnDelete.textContent = '删除';
      btnDelete.disabled = Boolean(parser.isBuiltin);
      btnDelete.addEventListener('click', async () => {
        pageState.parsers = (pageState.parsers || []).filter((item) => item.id !== parser.id);
        if (pageState.defaults.parserId === parser.id) {
          const next = getEnabledParsers()[0];
          pageState.defaults.parserId = next ? next.id : '';
        }
        await persistConfig('解析器已删除');
      });
      actions.appendChild(btnDelete);

      item.appendChild(actions);
      el.parserList.appendChild(item);
    });
  }

  function renderWebdavList() {
    const list = getEnabledWebdav();

    if (list.length === 0) {
      el.webdavList.innerHTML = '<div class="muted">暂无 WebDAV 配置</div>';
      return;
    }

    el.webdavList.innerHTML = '';

    list.forEach((server) => {
      const item = document.createElement('div');
      item.className = 'list-item';
      item.innerHTML = `
        <div class="list-item-title">${server.name}</div>
        <div class="list-item-meta">${server.url}</div>
        <div class="list-item-meta">用户：${server.username || '-'} | 基础路径：${server.basePath || '/'}</div>
      `;

      const actions = document.createElement('div');
      actions.className = 'row wrap';
      actions.style.marginTop = '8px';

      const defaultBadge = document.createElement('span');
      defaultBadge.className = `badge ${pageState.defaults.webdavId === server.id ? 'success' : 'warn'}`;
      defaultBadge.textContent = pageState.defaults.webdavId === server.id ? '默认' : '可选';
      actions.appendChild(defaultBadge);

      const btnEdit = document.createElement('button');
      btnEdit.className = 'ghost';
      btnEdit.textContent = '编辑';
      btnEdit.addEventListener('click', () => {
        editingWebdavId = server.id;
        el.webdavName.value = server.name || '';
        el.webdavUrl.value = server.url || '';
        el.webdavUsername.value = server.username || '';
        el.webdavPassword.value = server.password || '';
        el.webdavBasePath.value = server.basePath || '';
      });
      actions.appendChild(btnEdit);

      const btnDefault = document.createElement('button');
      btnDefault.className = 'secondary';
      btnDefault.textContent = '设为默认';
      btnDefault.disabled = pageState.defaults.webdavId === server.id;
      btnDefault.addEventListener('click', async () => {
        pageState.defaults.webdavId = server.id;
        await persistConfig('默认 WebDAV 已更新');
      });
      actions.appendChild(btnDefault);

      const btnDelete = document.createElement('button');
      btnDelete.className = 'danger';
      btnDelete.textContent = '删除';
      btnDelete.addEventListener('click', async () => {
        pageState.webdavServers = (pageState.webdavServers || []).filter((item) => item.id !== server.id);
        if (pageState.defaults.webdavId === server.id) {
          const next = getEnabledWebdav()[0];
          pageState.defaults.webdavId = next ? next.id : '';
        }
        await persistConfig('WebDAV 已删除');
      });
      actions.appendChild(btnDelete);

      item.appendChild(actions);
      el.webdavList.appendChild(item);
    });
  }

  function renderBatchSelectors() {
    const parsers = getEnabledParsers();
    const webdav = getEnabledWebdav();

    el.batchParser.innerHTML = '';
    parsers.forEach((parser) => {
      const option = document.createElement('option');
      option.value = parser.id;
      option.textContent = parser.name;
      if (pageState.defaults.parserId === parser.id) {
        option.selected = true;
      }
      el.batchParser.appendChild(option);
    });

    el.batchWebdav.innerHTML = '';
    webdav.forEach((server) => {
      const option = document.createElement('option');
      option.value = server.id;
      option.textContent = server.name;
      if (pageState.defaults.webdavId === server.id) {
        option.selected = true;
      }
      el.batchWebdav.appendChild(option);
    });

    const filters = normalizeBatchFilters(pageState.settings.batchFilters || {});
    if (el.batchFilterMediaType) {
      el.batchFilterMediaType.value = filters.mediaType;
    }
    if (el.batchFilterMinDuration) {
      el.batchFilterMinDuration.value = String(filters.minDurationSec || 0);
    }
    if (el.batchFilterStartDate) {
      el.batchFilterStartDate.value = filters.startDate || '';
    }
    if (el.batchFilterEndDate) {
      el.batchFilterEndDate.value = filters.endDate || '';
    }
    if (el.batchFilterExcludePinned) {
      el.batchFilterExcludePinned.checked = filters.excludePinned === true;
    }
  }

  async function renderTasks() {
    const tasks = await send('TASKS_LIST');

    if (!tasks || tasks.length === 0) {
      el.batchTaskList.innerHTML = '<div class="muted">暂无任务</div>';
      return;
    }

    el.batchTaskList.innerHTML = '';

    tasks.forEach((task) => {
      const item = document.createElement('div');
      item.className = 'list-item';

      const title = document.createElement('div');
      title.className = 'list-item-title';
      title.textContent = `${task.type || 'task'} | ${task.status || '-'}`;

      const meta = document.createElement('div');
      meta.className = 'list-item-meta';
      const skipped = Number(task.skipped || 0);
      const skippedLabel = skipped > 0 ? ` / 跳过 ${skipped}` : '';
      meta.textContent = `进度 ${task.progress || 0}% | 成功 ${task.success || 0} / 失败 ${task.failed || 0}${skippedLabel} / 总数 ${task.total || 0}`;

      const progress = document.createElement('div');
      progress.className = 'progress';
      const bar = document.createElement('span');
      bar.style.width = `${Math.max(0, Math.min(100, Number(task.progress || 0)))}%`;
      progress.appendChild(bar);

      const detail = document.createElement('div');
      detail.className = 'list-item-meta';
      detail.style.marginTop = '6px';
      if (task.error) {
        detail.textContent = `错误：${task.error}`;
      } else {
        const firstLog = Array.isArray(task.logs) && task.logs.length > 0 ? task.logs[0] : '';
        detail.textContent = firstLog || '执行中';
      }

      const actions = document.createElement('div');
      actions.className = 'row wrap';
      actions.style.marginTop = '8px';

      const btnDelete = document.createElement('button');
      btnDelete.className = 'ghost';
      btnDelete.textContent = '移除任务';
      btnDelete.disabled = task.status !== 'completed' && task.status !== 'failed' && task.status !== 'canceled';
      btnDelete.addEventListener('click', async () => {
        await send('TASK_DELETE', { id: task.id });
        await renderTasks();
      });
      actions.appendChild(btnDelete);

      item.appendChild(title);
      item.appendChild(meta);
      item.appendChild(progress);
      item.appendChild(detail);
      item.appendChild(actions);

      el.batchTaskList.appendChild(item);
    });
  }

  function parseFailureReason(record) {
    const detail = record && record.detail && typeof record.detail === 'object' ? record.detail : {};
    const fields = [detail.error, detail.reason, detail.message, detail.detail];
    for (const item of fields) {
      const text = String(item || '').trim();
      if (text) return text;
    }
    return '';
  }

  function renderHistoryMetrics(history) {
    if (!el.historyMetrics) return;
    const list = Array.isArray(history) ? history : [];
    const total = list.length;
    let success = 0;
    let failed = 0;
    let partial = 0;
    const parserStats = new Map();
    const reasonStats = new Map();

    for (const record of list) {
      const status = String(record && record.status ? record.status : '');
      if (status === 'success') success += 1;
      if (status === 'failed') failed += 1;
      if (status === 'partial') partial += 1;

      const detail = record && record.detail && typeof record.detail === 'object' ? record.detail : {};
      const parser = String(detail.parserName || '-');
      if (!parserStats.has(parser)) {
        parserStats.set(parser, { total: 0, success: 0, failed: 0 });
      }
      const parserItem = parserStats.get(parser);
      parserItem.total += 1;
      if (status === 'success') parserItem.success += 1;
      if (status === 'failed') parserItem.failed += 1;

      if (status === 'failed') {
        const reason = parseFailureReason(record);
        const key = reason || '未知失败原因';
        reasonStats.set(key, (reasonStats.get(key) || 0) + 1);
      }
    }

    const parserLines = Array.from(parserStats.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 3)
      .map(([name, data]) => {
        const rate = data.total > 0 ? Math.round((data.success / data.total) * 100) : 0;
        return `${name}: ${rate}% (${data.success}/${data.total})`;
      });

    const reasonLines = Array.from(reasonStats.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, count]) => `${name} (${count})`);

    const parserText = parserLines.length > 0 ? parserLines.join(' ｜ ') : '暂无';
    const reasonText = reasonLines.length > 0 ? reasonLines.join(' ｜ ') : '暂无';
    el.historyMetrics.textContent = `总记录 ${total}｜成功 ${success}｜失败 ${failed}｜部分成功 ${partial}｜解析器成功率Top: ${parserText}｜失败原因Top: ${reasonText}`;
  }

  function toCsvValue(value) {
    const text = String(value == null ? '' : value);
    const escaped = text.replace(/"/g, '""');
    return `"${escaped}"`;
  }

  function historyToCsv(history) {
    const list = Array.isArray(history) ? history : [];
    const header = ['id', 'type', 'title', 'status', 'createdAt', 'updatedAt', 'parserName', 'awemeId', 'sourceUrl', 'filePath', 'error'];
    const rows = [header.join(',')];
    for (const record of list) {
      const detail = record && record.detail && typeof record.detail === 'object' ? record.detail : {};
      rows.push([
        toCsvValue(record.id || ''),
        toCsvValue(record.type || ''),
        toCsvValue(record.title || ''),
        toCsvValue(record.status || ''),
        toCsvValue(record.createdAt || ''),
        toCsvValue(record.updatedAt || ''),
        toCsvValue(detail.parserName || ''),
        toCsvValue(detail.awemeId || ''),
        toCsvValue(detail.sourceUrl || ''),
        toCsvValue(detail.filePath || ''),
        toCsvValue(detail.error || '')
      ].join(','));
    }
    return rows.join('\n');
  }

  function downloadTextFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function renderHistory() {
    const history = await send('HISTORY_LIST');
    renderHistoryMetrics(history);

    if (!history || history.length === 0) {
      el.historyList.innerHTML = '<div class="muted">暂无历史记录</div>';
      return;
    }

    el.historyList.innerHTML = '';

    history.forEach((record) => {
      const item = document.createElement('div');
      item.className = 'list-item';

      const title = document.createElement('div');
      title.className = 'list-item-title';
      title.textContent = `${record.title || '-'} (${record.type || '-'})`;

      const meta = document.createElement('div');
      meta.className = 'list-item-meta';
      const syncLabel = record.cloudSynced ? '已同步' : (record.cloudError ? `未同步: ${record.cloudError}` : '本地');
      meta.textContent = `${record.status || '-'} | ${formatDate(record.createdAt)} | ${syncLabel}`;

      const detail = document.createElement('div');
      detail.className = 'list-item-meta';
      detail.style.marginTop = '4px';
      const detailData = record && record.detail && typeof record.detail === 'object' ? record.detail : {};
      const path = detailData.filePath ? String(detailData.filePath || '') : '';
      const sourceUrl = detailData.sourceUrl ? String(detailData.sourceUrl || '') : '';
      detail.textContent = path || sourceUrl || '-';

      const failureInfo = document.createElement('div');
      failureInfo.className = 'list-item-meta';
      failureInfo.style.marginTop = '4px';
      const failureClass = detailData.failureClass ? String(detailData.failureClass || '') : '';
      const retryCount = Number(detailData.retryCount || (Array.isArray(detailData.retryTrace) ? detailData.retryTrace.length : 0));
      if (failureClass || retryCount > 0) {
        failureInfo.textContent = `失败分类：${failureClass || '-'} | 重试次数：${Math.max(0, retryCount)}`;
      } else {
        failureInfo.textContent = '失败分类：- | 重试次数：0';
      }

      const traceInfo = document.createElement('div');
      traceInfo.className = 'list-item-meta';
      traceInfo.style.marginTop = '4px';
      const trace = Array.isArray(detailData.retryTrace) ? detailData.retryTrace : [];
      if (trace.length > 0) {
        const latest = trace[trace.length - 1];
        const latestClass = latest && latest.class ? String(latest.class || '') : '-';
        const latestMsg = latest && latest.message ? String(latest.message || '') : '';
        traceInfo.textContent = `最近重试：${latestClass}${latestMsg ? ` | ${latestMsg}` : ''}`;
      } else {
        traceInfo.textContent = '最近重试：无';
      }

      const actions = document.createElement('div');
      actions.className = 'row wrap';
      actions.style.marginTop = '8px';

      const btnDelete = document.createElement('button');
      btnDelete.className = 'danger';
      btnDelete.textContent = '删除';
      btnDelete.addEventListener('click', async () => {
        await send('HISTORY_DELETE', { id: record.id });
        await renderHistory();
      });
      actions.appendChild(btnDelete);

      item.appendChild(title);
      item.appendChild(meta);
      item.appendChild(detail);
      item.appendChild(failureInfo);
      item.appendChild(traceInfo);
      item.appendChild(actions);

      el.historyList.appendChild(item);
    });
  }

  async function loadState() {
    const state = await send('STATE_GET');

    pageState.settings = state.settings || pageState.settings;
    pageState.parsers = state.parsers || [];
    pageState.webdavServers = state.webdavServers || [];
    pageState.defaults = state.defaults || pageState.defaults;
    pageState.auth = state.auth || pageState.auth;

    renderAccount();
    renderSettings();
    renderParserList();
    renderWebdavList();
    renderBatchSelectors();
  }

  async function persistConfig(successMessage) {
    await send('CONFIG_SAVE', {
      settings: pageState.settings,
      parsers: pageState.parsers,
      webdavServers: pageState.webdavServers,
      defaults: pageState.defaults
    });

    await loadState();
    if (successMessage) {
      setNotice(successMessage, 'success');
    }
  }

  function resetParserForm() {
    editingParserId = '';
    el.parserName.value = '';
    el.parserApiUrl.value = '';
    el.parserMethod.value = 'GET';
    el.parserParam.value = 'url';
  }

  function resetWebdavForm() {
    editingWebdavId = '';
    el.webdavName.value = '';
    el.webdavUrl.value = '';
    el.webdavUsername.value = '';
    el.webdavPassword.value = '';
    el.webdavBasePath.value = '';
  }

  function bindTabs() {
    el.tabButtons.forEach((button) => {
      button.addEventListener('click', () => {
        switchTab(button.dataset.tab || 'account');
      });
    });
  }

  function bindAccountActions() {
    el.btnRefreshSession.addEventListener('click', async () => {
      try {
        const data = await send('AUTH_SESSION');
        pageState.auth = {
          loggedIn: data.loggedIn,
          user: data.user,
          expiresAt: 0
        };
        renderAccount();

        // After session refresh, best-effort pull cloud config so WebDAV/parsers stay in sync.
        if (data.loggedIn) {
          try {
            const result = await send('CONFIG_SYNC_AUTO');
            let pulled = null;
            try {
              const historySync = await send('HISTORY_PULL_REMOTE');
              pulled = Math.max(0, Number(historySync && historySync.pulled ? historySync.pulled : 0));
            } catch (error) {
            }
            await loadState();
            await renderHistory();
            const configMessage = result && result.message ? result.message : '已同步云端配置';
            const historyMessage = pulled == null ? '' : `；历史已从云端刷新 ${pulled} 条`;
            setNotice(`${configMessage}${historyMessage}`, 'success');
            return;
          } catch (error) {
            // If cloud sync fails, still keep session status.
          }
        }

        setNotice(data.loggedIn ? '登录状态有效' : '当前未登录', data.loggedIn ? 'success' : '');
      } catch (error) {
        setNotice(error.message, 'error');
      }
    });

    if (el.btnConfigSync) {
      el.btnConfigSync.addEventListener('click', async () => {
        try {
          const result = await send('CONFIG_SYNC_AUTO');
          await loadState();
          setNotice(result && result.message ? result.message : '配置同步完成', 'success');
        } catch (error) {
          setNotice(error.message, 'error');
        }
      });
    }

    el.btnLogin.addEventListener('click', async () => {
      try {
        const email = el.authEmail.value.trim();
        const password = el.authPassword.value;
        const result = await send('AUTH_LOGIN', { email, password });

        // Best-effort auto sync config right after login so WebDAV/parsers appear immediately.
        let syncMessage = '';
        let historyMessage = '';
        try {
          const syncResult = await send('CONFIG_SYNC_AUTO');
          syncMessage = syncResult && syncResult.message ? `（${syncResult.message}）` : '';
        } catch (error) {
          syncMessage = '';
        }

        try {
          const historySync = await send('HISTORY_PULL_REMOTE');
          const pulled = Math.max(0, Number(historySync && historySync.pulled ? historySync.pulled : 0));
          historyMessage = `，历史已刷新 ${pulled} 条`;
        } catch (error) {
          historyMessage = '';
        }

        await loadState();
        await renderHistory();
        setNotice(`登录成功：${result.user && result.user.email ? result.user.email : '用户'}${syncMessage}${historyMessage}`, 'success');
      } catch (error) {
        setNotice(error.message, 'error');
      }
    });

    el.btnRegister.addEventListener('click', async () => {
      try {
        const email = el.authEmail.value.trim();
        const password = el.authPassword.value;
        const result = await send('AUTH_REGISTER', { email, password });
        setNotice(result.message || '注册成功', 'success');
      } catch (error) {
        setNotice(error.message, 'error');
      }
    });

    el.btnLogout.addEventListener('click', async () => {
      try {
        await send('AUTH_LOGOUT');
        await loadState();
        setNotice('已退出登录', 'success');
      } catch (error) {
        setNotice(error.message, 'error');
      }
    });
  }

  function bindSettingsActions() {
    el.btnSaveSettings.addEventListener('click', async () => {
      try {
        pageState.settings.apiBaseUrl = normalizeBaseUrl(el.settingApiBaseUrl.value);
        pageState.settings.batchConcurrency = Math.max(1, Math.min(5, Number(el.settingBatchConcurrency.value || 2)));
        pageState.settings.batchRetryCount = Math.max(0, Math.min(5, Number(el.settingBatchRetryCount ? el.settingBatchRetryCount.value : 2)));
        const retryableClasses = [
          el.settingRetryClassTimeout && el.settingRetryClassTimeout.checked ? 'timeout' : '',
          el.settingRetryClassNetwork && el.settingRetryClassNetwork.checked ? 'network' : '',
          el.settingRetryClassHttp5xx && el.settingRetryClassHttp5xx.checked ? 'http5xx' : '',
          el.settingRetryClassHttp4xx && el.settingRetryClassHttp4xx.checked ? 'http4xx' : '',
          el.settingRetryClassInvalid && el.settingRetryClassInvalid.checked ? 'invalid_payload' : '',
        ].filter(Boolean);
        pageState.settings.retryPolicy = normalizeRetryPolicy({
          retryableClasses,
          maxRetries: pageState.settings.batchRetryCount,
          baseDelayMs: Number(el.settingRetryBaseDelayMs ? el.settingRetryBaseDelayMs.value : 600),
          maxDelayMs: Number(el.settingRetryMaxDelayMs ? el.settingRetryMaxDelayMs.value : 12000)
        }, pageState.settings.batchRetryCount);
        pageState.settings.batchRetryCount = pageState.settings.retryPolicy.maxRetries;
        pageState.settings.historyLimit = Math.max(100, Math.min(1000, Number(el.settingHistoryLimit.value || 500)));
        pageState.settings.uploadFolderTemplate = el.settingUploadFolderTemplate
          ? String(el.settingUploadFolderTemplate.value || '').trim() || '{author}'
          : '{author}';
        pageState.settings.uploadFileTemplate = el.settingUploadFileTemplate
          ? String(el.settingUploadFileTemplate.value || '').trim() || '{awemeId}_{title}'
          : '{awemeId}_{title}';
        pageState.settings.notifications = normalizeNotificationSettings({
          enabled: Boolean(el.settingNotifyEnabled && el.settingNotifyEnabled.checked),
          success: Boolean(el.settingNotifySuccess && el.settingNotifySuccess.checked),
          failure: Boolean(el.settingNotifyFailure && el.settingNotifyFailure.checked),
          batchDone: Boolean(el.settingNotifyBatchDone && el.settingNotifyBatchDone.checked),
          quietHoursStart: el.settingNotifyQuietStart ? el.settingNotifyQuietStart.value : '23:00',
          quietHoursEnd: el.settingNotifyQuietEnd ? el.settingNotifyQuietEnd.value : '08:00'
        });
        pageState.settings.adaptiveConcurrency = Boolean(el.settingAdaptiveConcurrency && el.settingAdaptiveConcurrency.checked);
        pageState.settings.autoResumeTasks = Boolean(el.settingAutoResumeTasks && el.settingAutoResumeTasks.checked);
        pageState.settings.dedupeWithCloud = Boolean(el.settingDedupeCloud && el.settingDedupeCloud.checked);
        pageState.settings.autoSyncHistory = Boolean(el.settingAutoSyncHistory.checked);
        pageState.settings.batchFilters = normalizeBatchFilters(pageState.settings.batchFilters || {});

        await send('SETTINGS_NOTIFY_SAVE', { notifications: pageState.settings.notifications });
        await send('SETTINGS_RETRY_POLICY_SAVE', { retryPolicy: pageState.settings.retryPolicy });
        await persistConfig('设置已保存');
      } catch (error) {
        setNotice(error.message, 'error');
      }
    });
  }

  function bindParserActions() {
    el.btnParserSave.addEventListener('click', async () => {
      try {
        const name = sanitizeName(el.parserName.value, 50);
        const apiUrl = el.parserApiUrl.value.trim();
        const requestMethod = el.parserMethod.value;
        const urlParamName = (el.parserParam.value || 'url').trim();

        if (!name || !apiUrl) {
          throw new Error('请填写解析器名称和 API URL');
        }

        if (editingParserId) {
          pageState.parsers = (pageState.parsers || []).map((item) => {
            if (item.id !== editingParserId) {
              return item;
            }
            return {
              ...item,
              name,
              apiUrl,
              requestMethod,
              urlParamName
            };
          });
        } else {
          pageState.parsers = (pageState.parsers || []).concat({
            id: createId('parser'),
            name,
            apiUrl,
            requestMethod,
            urlParamName,
            isBuiltin: false,
            disabled: false
          });
        }

        if (!pageState.defaults.parserId) {
          pageState.defaults.parserId = pageState.parsers[0].id;
        }

        resetParserForm();
        await persistConfig('解析器已保存');
      } catch (error) {
        setNotice(error.message, 'error');
      }
    });

    el.btnParserReset.addEventListener('click', resetParserForm);
  }

  function bindWebdavActions() {
    const readWebdavForm = () => {
      const name = sanitizeName(el.webdavName.value, 50);
      let url = el.webdavUrl.value.trim();
      const username = el.webdavUsername.value.trim();
      const password = el.webdavPassword.value;
      const basePath = el.webdavBasePath.value.trim();

      if (url && !/^https?:\/\//i.test(url)) {
        url = `https://${url}`;
      }
      url = url.replace(/\/$/, '');

      return { name, url, username, password, basePath };
    };

    el.btnWebdavSave.addEventListener('click', async () => {
      try {
        const { name, url, username, password, basePath } = readWebdavForm();

        if (!name || !url) {
          throw new Error('请填写 WebDAV 名称和地址');
        }

        const record = {
          id: editingWebdavId || createId('webdav'),
          name,
          url,
          username,
          password,
          basePath,
          disabled: false
        };

        if (editingWebdavId) {
          pageState.webdavServers = (pageState.webdavServers || []).map((item) => {
            if (item.id !== editingWebdavId) {
              return item;
            }
            return {
              ...item,
              ...record
            };
          });
        } else {
          pageState.webdavServers = (pageState.webdavServers || []).concat(record);
        }

        if (!pageState.defaults.webdavId) {
          pageState.defaults.webdavId = record.id;
        }

        resetWebdavForm();
        await persistConfig('WebDAV 已保存');
      } catch (error) {
        setNotice(error.message, 'error');
      }
    });

    if (el.btnWebdavTest) {
      el.btnWebdavTest.addEventListener('click', async () => {
        try {
          const { url, username, password, basePath } = readWebdavForm();
          if (!url || !username || !password) {
            throw new Error('请先填写地址、用户名、密码再测试');
          }

          setNotice('正在测试 WebDAV 连接...', '');
          await send('WEBDAV_TEST', {
            webdavConfig: {
              url,
              username,
              password,
              basePath
            }
          });
          setNotice('WebDAV 连接测试成功', 'success');
        } catch (error) {
          setNotice(error.message, 'error');
        }
      });
    }

    el.btnWebdavReset.addEventListener('click', resetWebdavForm);
  }

  function bindBatchActions() {
      el.btnBatchStart.addEventListener('click', async () => {
      try {
        const userUrl = el.batchUserUrl.value.trim();
        const limit = Math.max(0, Math.min(5000, Number(el.batchLimit.value || 20)));
        const parserId = el.batchParser.value;
        const webdavId = el.batchWebdav.value;
        const filters = normalizeBatchFilters({
          mediaType: el.batchFilterMediaType ? el.batchFilterMediaType.value : 'all',
          minDurationSec: el.batchFilterMinDuration ? Number(el.batchFilterMinDuration.value || 0) : 0,
          startDate: el.batchFilterStartDate ? el.batchFilterStartDate.value : '',
          endDate: el.batchFilterEndDate ? el.batchFilterEndDate.value : '',
          excludePinned: Boolean(el.batchFilterExcludePinned && el.batchFilterExcludePinned.checked)
        });

        if (!userUrl) {
          throw new Error('请输入用户主页链接');
        }

        if (!parserId || !webdavId) {
          throw new Error('请选择解析器和 WebDAV');
        }

        const result = await send('BATCH_START', {
          userUrl,
          limit,
          parserId,
          webdavId,
          filters
        });

        pageState.settings.batchFilters = filters;
        await send('CONFIG_SAVE', {
          settings: {
            batchFilters: filters
          }
        });

        setNotice(`批量任务已启动：${result.taskId}`, 'success');
        await renderTasks();
      } catch (error) {
        setNotice(error.message, 'error');
      }
    });

    el.btnBatchRefresh.addEventListener('click', async () => {
      try {
        await renderTasks();
      } catch (error) {
        setNotice(error.message, 'error');
      }
    });

    if (el.btnBatchResume) {
      el.btnBatchResume.addEventListener('click', async () => {
        try {
          const result = await send('TASKS_RESUME');
          await renderTasks();
          setNotice(`已触发恢复，恢复任务数：${result.resumed || 0}`, 'success');
        } catch (error) {
          setNotice(error.message, 'error');
        }
      });
    }
  }

  function bindHistoryActions() {
    el.btnHistoryRefresh.addEventListener('click', async () => {
      try {
        if (pageState.auth && pageState.auth.loggedIn) {
          const result = await send('HISTORY_PULL_REMOTE');
          const pulled = Math.max(0, Number(result && result.pulled ? result.pulled : 0));
          await loadState();
          await renderHistory();
          setNotice(`已从云端刷新历史：${pulled} 条`, 'success');
          return;
        }

        await renderHistory();
        setNotice('未登录，仅刷新本地历史', '');
      } catch (error) {
        setNotice(error.message, 'error');
      }
    });

    el.btnHistorySync.addEventListener('click', async () => {
      try {
        const result = await send('HISTORY_SYNC_ALL');
        await loadState();
        await renderHistory();
        setNotice(`云端历史同步完成：成功 ${result.success} 条，失败 ${result.failed} 条`, 'success');
      } catch (error) {
        setNotice(error.message, 'error');
      }
    });

    if (el.btnHistoryExportJson) {
      el.btnHistoryExportJson.addEventListener('click', async () => {
        try {
          const history = await send('HISTORY_LIST');
          const now = new Date();
          const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
          downloadTextFile(`videojx_history_${ts}.json`, JSON.stringify(history || [], null, 2), 'application/json');
          setNotice('历史记录 JSON 导出成功', 'success');
        } catch (error) {
          setNotice(error.message, 'error');
        }
      });
    }

    if (el.btnHistoryExportCsv) {
      el.btnHistoryExportCsv.addEventListener('click', async () => {
        try {
          const history = await send('HISTORY_LIST');
          const csv = historyToCsv(history || []);
          const now = new Date();
          const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
          downloadTextFile(`videojx_history_${ts}.csv`, csv, 'text/csv;charset=utf-8');
          setNotice('历史记录 CSV 导出成功', 'success');
        } catch (error) {
          setNotice(error.message, 'error');
        }
      });
    }

    el.btnHistoryClear.addEventListener('click', async () => {
      try {
        await send('HISTORY_CLEAR');
        await renderHistory();
        setNotice('本地历史已清空', 'success');
      } catch (error) {
        setNotice(error.message, 'error');
      }
    });
  }

  function bindTaskEvents() {
    chrome.runtime.onMessage.addListener((message) => {
      if (!message || message.type !== 'TASK_UPDATED') {
        return;
      }

      renderTasks().catch(() => {});
    });

    if (taskPollTimer) {
      clearInterval(taskPollTimer);
    }

    taskPollTimer = setInterval(() => {
      renderTasks().catch(() => {});
    }, 3000);
  }

  async function bootstrap() {
    bindTabs();
    bindAccountActions();
    bindSettingsActions();
    bindParserActions();
    bindWebdavActions();
    bindBatchActions();
    bindHistoryActions();
    bindTaskEvents();

    await loadState();
    if (pageState.auth && pageState.auth.loggedIn) {
      try {
        await send('CONFIG_SYNC_AUTO');
      } catch (error) {
      }

      try {
        await send('HISTORY_PULL_REMOTE');
      } catch (error) {
      }

      await loadState();
    }
    await renderTasks();
    await renderHistory();
  }

  bootstrap().catch((error) => {
    setNotice(error.message, 'error');
  });
})();
