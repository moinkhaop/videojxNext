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
    btnLogin: document.getElementById('btn-login'),
    btnRegister: document.getElementById('btn-register'),
    btnLogout: document.getElementById('btn-logout'),

    settingApiBaseUrl: document.getElementById('setting-api-base-url'),
    settingBatchConcurrency: document.getElementById('setting-batch-concurrency'),
    settingHistoryLimit: document.getElementById('setting-history-limit'),
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
    btnWebdavReset: document.getElementById('btn-webdav-reset'),
    webdavList: document.getElementById('webdav-list'),

    batchUserUrl: document.getElementById('batch-user-url'),
    batchLimit: document.getElementById('batch-limit'),
    batchParser: document.getElementById('batch-parser'),
    batchWebdav: document.getElementById('batch-webdav'),
    btnBatchStart: document.getElementById('btn-batch-start'),
    btnBatchRefresh: document.getElementById('btn-batch-refresh'),
    batchTaskList: document.getElementById('batch-task-list'),

    btnHistoryRefresh: document.getElementById('btn-history-refresh'),
    btnHistorySync: document.getElementById('btn-history-sync'),
    btnHistoryClear: document.getElementById('btn-history-clear'),
    historyList: document.getElementById('history-list')
  };

  const pageState = {
    settings: {
      apiBaseUrl: 'https://dyjx.ehhx.qzz.io',
      autoSyncHistory: true,
      batchConcurrency: 2,
      historyLimit: 500
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
    el.settingHistoryLimit.value = String(pageState.settings.historyLimit || 500);
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
      meta.textContent = `进度 ${task.progress || 0}% | 成功 ${task.success || 0} / 失败 ${task.failed || 0} / 总数 ${task.total || 0}`;

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
      btnDelete.disabled = task.status !== 'completed' && task.status !== 'failed';
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

  async function renderHistory() {
    const history = await send('HISTORY_LIST');

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
      const path = record.detail && record.detail.filePath ? record.detail.filePath : '';
      detail.textContent = path || (record.detail && record.detail.sourceUrl ? record.detail.sourceUrl : '');

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
        setNotice(data.loggedIn ? '登录状态有效' : '当前未登录', data.loggedIn ? 'success' : '');
      } catch (error) {
        setNotice(error.message, 'error');
      }
    });

    el.btnLogin.addEventListener('click', async () => {
      try {
        const email = el.authEmail.value.trim();
        const password = el.authPassword.value;
        const result = await send('AUTH_LOGIN', { email, password });
        await loadState();
        setNotice(`登录成功：${result.user && result.user.email ? result.user.email : '用户'}`, 'success');
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
        pageState.settings.historyLimit = Math.max(100, Math.min(1000, Number(el.settingHistoryLimit.value || 500)));
        pageState.settings.autoSyncHistory = Boolean(el.settingAutoSyncHistory.checked);

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
    el.btnWebdavSave.addEventListener('click', async () => {
      try {
        const name = sanitizeName(el.webdavName.value, 50);
        const url = el.webdavUrl.value.trim();
        const username = el.webdavUsername.value.trim();
        const password = el.webdavPassword.value;
        const basePath = el.webdavBasePath.value.trim();

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

    el.btnWebdavReset.addEventListener('click', resetWebdavForm);
  }

  function bindBatchActions() {
    el.btnBatchStart.addEventListener('click', async () => {
      try {
        const userUrl = el.batchUserUrl.value.trim();
        const limit = Math.max(1, Math.min(200, Number(el.batchLimit.value || 20)));
        const parserId = el.batchParser.value;
        const webdavId = el.batchWebdav.value;

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
          webdavId
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
  }

  function bindHistoryActions() {
    el.btnHistoryRefresh.addEventListener('click', async () => {
      try {
        await renderHistory();
      } catch (error) {
        setNotice(error.message, 'error');
      }
    });

    el.btnHistorySync.addEventListener('click', async () => {
      try {
        const result = await send('HISTORY_SYNC_ALL');
        await renderHistory();
        setNotice(`同步完成：成功 ${result.success} 条，失败 ${result.failed} 条`, 'success');
      } catch (error) {
        setNotice(error.message, 'error');
      }
    });

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
    await renderTasks();
    await renderHistory();
  }

  bootstrap().catch((error) => {
    setNotice(error.message, 'error');
  });
})();
