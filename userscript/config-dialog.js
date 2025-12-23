// 配置对话框模块
class ConfigDialog {
    constructor() {
        this.isVisible = false;
        this.currentTab = 'parsers';
        this.dialog = null;
    }
    
    // 显示配置对话框
    show() {
        if (this.isVisible) return;
        
        this.createDialog();
        this.bindEvents();
        this.loadConfigs();
        
        document.body.appendChild(this.dialog);
        this.isVisible = true;
        
        // 显示动画
        setTimeout(() => {
            this.dialog.classList.add('show');
        }, 10);
    }
    
    // 隐藏配置对话框
    hide() {
        if (!this.isVisible) return;
        
        this.dialog.classList.remove('show');
        setTimeout(() => {
            if (this.dialog && this.dialog.parentNode) {
                this.dialog.parentNode.removeChild(this.dialog);
            }
            this.isVisible = false;
        }, 300);
    }
    
    // 创建对话框
    createDialog() {
        this.dialog = document.createElement('div');
        this.dialog.className = 'dy-config-dialog';
        this.dialog.innerHTML = `
            <div class="dy-config-overlay"></div>
            <div class="dy-config-content">
                <div class="dy-config-header">
                    <h2>⚙️ 配置管理</h2>
                    <button class="dy-btn-close">×</button>
                </div>
                
                <div class="dy-config-tabs">
                    <button class="dy-tab-btn active" data-tab="parsers">🔧 解析器</button>
                    <button class="dy-tab-btn" data-tab="webdav">☁️ WebDAV</button>
                    <button class="dy-tab-btn" data-tab="settings">🎨 设置</button>
                </div>
                
                <div class="dy-config-body">
                    <!-- 解析器配置标签页 -->
                    <div class="dy-tab-content active" id="parsers-tab">
                        <div class="dy-tab-header">
                            <h3>解析API配置</h3>
                            <button class="dy-btn dy-btn-primary dy-btn-small" id="add-parser-btn">➕ 添加解析器</button>
                        </div>
                        <div class="dy-config-list" id="parsers-list">
                            <!-- 解析器列表将在这里动态生成 -->
                        </div>
                    </div>
                    
                    <!-- WebDAV配置标签页 -->
                    <div class="dy-tab-content" id="webdav-tab">
                        <div class="dy-tab-header">
                            <h3>WebDAV服务器配置</h3>
                            <button class="dy-btn dy-btn-primary dy-btn-small" id="add-webdav-btn">➕ 添加服务器</button>
                        </div>
                        <div class="dy-config-list" id="webdav-list">
                            <!-- WebDAV列表将在这里动态生成 -->
                        </div>
                    </div>
                    
                    <!-- 设置标签页 -->
                    <div class="dy-tab-content" id="settings-tab">
                        <div class="dy-settings-form">
                            <div class="dy-form-group">
                                <label>界面位置</label>
                                <select id="ui-position" class="dy-form-select">
                                    <option value="bottom-right">右下角</option>
                                    <option value="bottom-left">左下角</option>
                                </select>
                            </div>
                            
                            <div class="dy-form-group">
                                <label>主题</label>
                                <select id="theme" class="dy-form-select">
                                    <option value="light">浅色</option>
                                    <option value="dark">深色</option>
                                    <option value="auto">跟随系统</option>
                                </select>
                            </div>
                            
                            <div class="dy-form-group">
                                <label class="dy-checkbox-label">
                                    <input type="checkbox" id="auto-collapse">
                                    <span class="dy-checkbox"></span>
                                    自动收起面板
                                </label>
                            </div>
                            
                            <div class="dy-form-group">
                                <label class="dy-checkbox-label">
                                    <input type="checkbox" id="clipboard-monitor">
                                    <span class="dy-checkbox"></span>
                                    启用剪贴板监控
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="dy-config-footer">
                    <button class="dy-btn dy-btn-secondary" id="config-cancel-btn">取消</button>
                    <button class="dy-btn dy-btn-primary" id="config-save-btn">保存</button>
                </div>
            </div>
        `;
    }
    
    // 绑定事件
    bindEvents() {
        // 关闭按钮
        this.dialog.querySelector('.dy-btn-close').addEventListener('click', () => {
            this.hide();
        });
        
        // 点击遮罩关闭
        this.dialog.querySelector('.dy-config-overlay').addEventListener('click', () => {
            this.hide();
        });
        
        // 标签页切换
        this.dialog.querySelectorAll('.dy-tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });
        
        // 添加解析器按钮
        this.dialog.querySelector('#add-parser-btn').addEventListener('click', () => {
            this.showParserForm();
        });
        
        // 添加WebDAV按钮
        this.dialog.querySelector('#add-webdav-btn').addEventListener('click', () => {
            this.showWebDAVForm();
        });
        
        // 保存按钮
        this.dialog.querySelector('#config-save-btn').addEventListener('click', () => {
            this.saveSettings();
        });
        
        // 取消按钮
        this.dialog.querySelector('#config-cancel-btn').addEventListener('click', () => {
            this.hide();
        });
    }
    
    // 切换标签页
    switchTab(tabName) {
        // 更新按钮状态
        this.dialog.querySelectorAll('.dy-tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        this.dialog.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        
        // 更新内容显示
        this.dialog.querySelectorAll('.dy-tab-content').forEach(content => {
            content.classList.remove('active');
        });
        this.dialog.querySelector(`#${tabName}-tab`).classList.add('active');
        
        this.currentTab = tabName;
    }
    
    // 加载配置
    loadConfigs() {
        this.loadParsers();
        this.loadWebDAV();
        this.loadSettings();
    }
    
    // 加载解析器配置
    loadParsers() {
        const parsers = ConfigManager.getParsers();
        const listContainer = this.dialog.querySelector('#parsers-list');
        
        if (parsers.length === 0) {
            listContainer.innerHTML = '<div class="dy-empty-state">暂无解析器配置</div>';
            return;
        }
        
        listContainer.innerHTML = parsers.map(parser => `
            <div class="dy-config-item" data-id="${parser.id}">
                <div class="dy-config-info">
                    <div class="dy-config-title">
                        ${parser.name}
                        ${parser.isDefault ? '<span class="dy-badge dy-badge-primary">默认</span>' : ''}
                        ${parser.isBuiltin ? '<span class="dy-badge dy-badge-secondary">内置</span>' : ''}
                    </div>
                    <div class="dy-config-desc">${parser.apiUrl}</div>
                </div>
                <div class="dy-config-actions">
                    <button class="dy-btn dy-btn-small dy-btn-secondary" onclick="configDialog.testParser('${parser.id}')">测试</button>
                    <button class="dy-btn dy-btn-small dy-btn-secondary" onclick="configDialog.editParser('${parser.id}')">编辑</button>
                    ${!parser.isBuiltin ? `<button class="dy-btn dy-btn-small dy-btn-danger" onclick="configDialog.deleteParser('${parser.id}')">删除</button>` : ''}
                </div>
            </div>
        `).join('');
    }
    
    // 加载WebDAV配置
    loadWebDAV() {
        const webdavConfigs = ConfigManager.getWebDAVConfigs();
        const listContainer = this.dialog.querySelector('#webdav-list');
        
        if (webdavConfigs.length === 0) {
            listContainer.innerHTML = '<div class="dy-empty-state">暂无WebDAV配置</div>';
            return;
        }
        
        listContainer.innerHTML = webdavConfigs.map(config => `
            <div class="dy-config-item" data-id="${config.id}">
                <div class="dy-config-info">
                    <div class="dy-config-title">
                        ${config.name}
                        ${config.isDefault ? '<span class="dy-badge dy-badge-primary">默认</span>' : ''}
                    </div>
                    <div class="dy-config-desc">${config.url}</div>
                </div>
                <div class="dy-config-actions">
                    <button class="dy-btn dy-btn-small dy-btn-secondary" onclick="configDialog.testWebDAV('${config.id}')">测试</button>
                    <button class="dy-btn dy-btn-small dy-btn-secondary" onclick="configDialog.editWebDAV('${config.id}')">编辑</button>
                    <button class="dy-btn dy-btn-small dy-btn-danger" onclick="configDialog.deleteWebDAV('${config.id}')">删除</button>
                </div>
            </div>
        `).join('');
    }
    
    // 加载设置
    loadSettings() {
        const settings = ConfigManager.getSettings();
        
        // 设置界面位置
        const positionSelect = this.dialog.querySelector('#ui-position');
        positionSelect.value = settings.uiPosition || 'bottom-right';
        
        // 设置主题
        const themeSelect = this.dialog.querySelector('#theme');
        themeSelect.value = settings.theme || 'light';
        
        // 设置自动收起
        const autoCollapse = this.dialog.querySelector('#auto-collapse');
        autoCollapse.checked = settings.autoCollapse !== false;
        
        // 设置剪贴板监控
        const clipboardMonitor = this.dialog.querySelector('#clipboard-monitor');
        clipboardMonitor.checked = settings.clipboardMonitor === true;
    }
    
    // 显示解析器表单
    showParserForm(parserId = null) {
        const parsers = ConfigManager.getParsers();
        const parser = parserId ? parsers.find(p => p.id === parserId) : null;
        
        const formHtml = `
            <div class="dy-form-dialog">
                <div class="dy-form-header">
                    <h3>${parser ? '编辑解析器' : '添加解析器'}</h3>
                    <button class="dy-btn-close">×</button>
                </div>
                <div class="dy-form-body">
                    <div class="dy-form-group">
                        <label>配置名称 *</label>
                        <input type="text" id="parser-name" class="dy-form-input" value="${parser ? parser.name : ''}" placeholder="例如：我的解析器">
                    </div>
                    
                    <div class="dy-form-group">
                        <label>API地址 *</label>
                        <input type="text" id="parser-api-url" class="dy-form-input" value="${parser ? parser.apiUrl : ''}" placeholder="https://api.example.com">
                    </div>
                    
                    <div class="dy-form-group">
                        <label>请求方式</label>
                        <select id="parser-method" class="dy-form-select">
                            <option value="GET" ${parser && parser.requestMethod === 'GET' ? 'selected' : ''}>GET</option>
                            <option value="POST" ${parser && parser.requestMethod === 'POST' ? 'selected' : ''}>POST</option>
                        </select>
                    </div>
                    
                    <div class="dy-form-group">
                        <label>URL参数名</label>
                        <input type="text" id="parser-param" class="dy-form-input" value="${parser ? parser.urlParamName : 'url'}" placeholder="url">
                    </div>
                    
                    <div class="dy-form-group">
                        <label class="dy-checkbox-label">
                            <input type="checkbox" id="parser-default" ${parser && parser.isDefault ? 'checked' : ''}>
                            <span class="dy-checkbox"></span>
                            设为默认解析器
                        </label>
                    </div>
                </div>
                <div class="dy-form-footer">
                    <button class="dy-btn dy-btn-secondary" onclick="configDialog.closeForm()">取消</button>
                    <button class="dy-btn dy-btn-primary" onclick="configDialog.saveParser('${parserId || ''}')">保存</button>
                </div>
            </div>
        `;
        
        this.showForm(formHtml);
    }
    
    // 显示WebDAV表单
    showWebDAVForm(configId = null) {
        const webdavConfigs = ConfigManager.getWebDAVConfigs();
        const config = configId ? webdavConfigs.find(c => c.id === configId) : null;
        
        const formHtml = `
            <div class="dy-form-dialog">
                <div class="dy-form-header">
                    <h3>${config ? '编辑WebDAV服务器' : '添加WebDAV服务器'}</h3>
                    <button class="dy-btn-close">×</button>
                </div>
                <div class="dy-form-body">
                    <div class="dy-form-group">
                        <label>服务器名称 *</label>
                        <input type="text" id="webdav-name" class="dy-form-input" value="${config ? config.name : ''}" placeholder="例如：我的网盘">
                    </div>
                    
                    <div class="dy-form-group">
                        <label>WebDAV地址 *</label>
                        <input type="text" id="webdav-url" class="dy-form-input" value="${config ? config.url : ''}" placeholder="https://dav.example.com">
                    </div>
                    
                    <div class="dy-form-group">
                        <label>用户名</label>
                        <input type="text" id="webdav-username" class="dy-form-input" value="${config ? config.username : ''}" placeholder="用户名">
                    </div>
                    
                    <div class="dy-form-group">
                        <label>密码</label>
                        <input type="password" id="webdav-password" class="dy-form-input" value="${config ? config.password : ''}" placeholder="密码">
                    </div>
                    
                    <div class="dy-form-group">
                        <label>基础路径</label>
                        <input type="text" id="webdav-base-path" class="dy-form-input" value="${config ? config.basePath : ''}" placeholder="/videos 或留空使用根目录">
                    </div>
                    
                    <div class="dy-form-group">
                        <label class="dy-checkbox-label">
                            <input type="checkbox" id="webdav-default" ${config && config.isDefault ? 'checked' : ''}>
                            <span class="dy-checkbox"></span>
                            设为默认服务器
                        </label>
                    </div>
                </div>
                <div class="dy-form-footer">
                    <button class="dy-btn dy-btn-secondary" onclick="configDialog.closeForm()">取消</button>
                    <button class="dy-btn dy-btn-primary" onclick="configDialog.saveWebDAV('${configId || ''}')">保存</button>
                </div>
            </div>
        `;
        
        this.showForm(formHtml);
    }
    
    // 显示表单对话框
    showForm(html) {
        const formDialog = document.createElement('div');
        formDialog.className = 'dy-form-overlay';
        formDialog.innerHTML = html;
        
        document.body.appendChild(formDialog);
        
        // 绑定关闭事件
        formDialog.querySelector('.dy-btn-close').addEventListener('click', () => {
            this.closeForm();
        });
        
        formDialog.addEventListener('click', (e) => {
            if (e.target === formDialog) {
                this.closeForm();
            }
        });
        
        // 显示动画
        setTimeout(() => {
            formDialog.classList.add('show');
        }, 10);
    }
    
    // 关闭表单
    closeForm() {
        const formOverlay = document.querySelector('.dy-form-overlay');
        if (formOverlay) {
            formOverlay.classList.remove('show');
            setTimeout(() => {
                formOverlay.remove();
            }, 300);
        }
    }
    
    // 保存解析器
    saveParser(parserId) {
        const name = document.getElementById('parser-name').value.trim();
        const apiUrl = document.getElementById('parser-api-url').value.trim();
        const requestMethod = document.getElementById('parser-method').value;
        const urlParamName = document.getElementById('parser-param').value.trim();
        const isDefault = document.getElementById('parser-default').checked;
        
        if (!name || !apiUrl) {
            Utils.showToast('请填写必填字段', 'error');
            return;
        }
        
        const parsers = ConfigManager.getParsers();
        
        if (parserId) {
            // 编辑现有解析器
            const index = parsers.findIndex(p => p.id === parserId);
            if (index !== -1) {
                parsers[index] = {
                    ...parsers[index],
                    name,
                    apiUrl,
                    requestMethod,
                    urlParamName,
                    isDefault
                };
            }
        } else {
            // 添加新解析器
            const newParser = {
                id: 'parser_' + Date.now(),
                name,
                apiUrl,
                requestMethod,
                urlParamName,
                isDefault,
                isBuiltin: false,
                disabled: false
            };
            
            // 如果设为默认，清除其他默认设置
            if (isDefault) {
                parsers.forEach(p => p.isDefault = false);
            }
            
            parsers.push(newParser);
        }
        
        if (ConfigManager.saveParsers(parsers)) {
            Utils.showToast('解析器配置保存成功', 'success');
            this.closeForm();
            this.loadParsers();
        } else {
            Utils.showToast('保存失败', 'error');
        }
    }
    
    // 保存WebDAV
    saveWebDAV(configId) {
        const name = document.getElementById('webdav-name').value.trim();
        const url = document.getElementById('webdav-url').value.trim();
        const username = document.getElementById('webdav-username').value.trim();
        const password = document.getElementById('webdav-password').value;
        const basePath = document.getElementById('webdav-base-path').value.trim();
        const isDefault = document.getElementById('webdav-default').checked;
        
        if (!name || !url) {
            Utils.showToast('请填写必填字段', 'error');
            return;
        }
        
        const webdavConfigs = ConfigManager.getWebDAVConfigs();
        
        if (configId) {
            // 编辑现有配置
            const index = webdavConfigs.findIndex(c => c.id === configId);
            if (index !== -1) {
                webdavConfigs[index] = {
                    ...webdavConfigs[index],
                    name,
                    url,
                    username,
                    password,
                    basePath,
                    isDefault
                };
            }
        } else {
            // 添加新配置
            const newConfig = {
                id: 'webdav_' + Date.now(),
                name,
                url,
                username,
                password,
                basePath,
                isDefault,
                disabled: false
            };
            
            // 如果设为默认，清除其他默认设置
            if (isDefault) {
                webdavConfigs.forEach(c => c.isDefault = false);
            }
            
            webdavConfigs.push(newConfig);
        }
        
        if (ConfigManager.saveWebDAVConfigs(webdavConfigs)) {
            Utils.showToast('WebDAV配置保存成功', 'success');
            this.closeForm();
            this.loadWebDAV();
        } else {
            Utils.showToast('保存失败', 'error');
        }
    }
    
    // 删除解析器
    deleteParser(parserId) {
        if (!confirm('确定要删除这个解析器配置吗？')) {
            return;
        }
        
        const parsers = ConfigManager.getParsers();
        const filteredParsers = parsers.filter(p => p.id !== parserId);
        
        if (ConfigManager.saveParsers(filteredParsers)) {
            Utils.showToast('解析器已删除', 'success');
            this.loadParsers();
        } else {
            Utils.showToast('删除失败', 'error');
        }
    }
    
    // 删除WebDAV
    deleteWebDAV(configId) {
        if (!confirm('确定要删除这个WebDAV配置吗？')) {
            return;
        }
        
        const webdavConfigs = ConfigManager.getWebDAVConfigs();
        const filteredConfigs = webdavConfigs.filter(c => c.id !== configId);
        
        if (ConfigManager.saveWebDAVConfigs(filteredConfigs)) {
            Utils.showToast('WebDAV配置已删除', 'success');
            this.loadWebDAV();
        } else {
            Utils.showToast('删除失败', 'error');
        }
    }
    
    // 测试解析器
    async testParser(parserId) {
        const parsers = ConfigManager.getParsers();
        const parser = parsers.find(p => p.id === parserId);
        
        if (!parser) {
            Utils.showToast('解析器配置不存在', 'error');
            return;
        }
        
        // 使用一个测试URL
        const testUrl = 'https://v.douyin.com/test';
        
        try {
            Utils.showToast('正在测试解析器...', 'info');
            await ParseService.parseVideo(testUrl, parser);
            Utils.showToast('解析器测试成功', 'success');
        } catch (error) {
            Utils.showToast(`解析器测试失败: ${error.message}`, 'error');
        }
    }
    
    // 测试WebDAV
    async testWebDAV(configId) {
        const webdavConfigs = ConfigManager.getWebDAVConfigs();
        const config = webdavConfigs.find(c => c.id === configId);
        
        if (!config) {
            Utils.showToast('WebDAV配置不存在', 'error');
            return;
        }
        
        try {
            Utils.showToast('正在测试连接...', 'info');
            
            // 构建测试路径
            const baseUrl = config.url.replace(/\/$/, '');
            let testUrl = baseUrl;
            
            if (config.basePath) {
                const normalizedBasePath = config.basePath.replace(/^\/+|\/+$/g, '');
                if (normalizedBasePath) {
                    testUrl = `${baseUrl}/${normalizedBasePath}`;
                }
            }
            
            // 发送PROPFIND请求测试连接
            const auth = btoa(`${config.username}:${config.password}`);
            
            GM_xmlhttpRequest({
                method: 'PROPFIND',
                url: testUrl,
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Depth': '0'
                },
                onload: (response) => {
                    if (response.status === 207 || response.status === 200) {
                        Utils.showToast('WebDAV连接测试成功', 'success');
                    } else {
                        Utils.showToast(`连接失败: HTTP ${response.status}`, 'error');
                    }
                },
                onerror: () => {
                    Utils.showToast('连接测试失败', 'error');
                },
                ontimeout: () => {
                    Utils.showToast('连接测试超时', 'error');
                },
                timeout: 10000
            });
            
        } catch (error) {
            Utils.showToast(`连接测试失败: ${error.message}`, 'error');
        }
    }
    
    // 保存设置
    saveSettings() {
        const settings = {
            uiPosition: document.getElementById('ui-position').value,
            theme: document.getElementById('theme').value,
            autoCollapse: document.getElementById('auto-collapse').checked,
            clipboardMonitor: document.getElementById('clipboard-monitor').checked
        };
        
        if (ConfigManager.saveSettings(settings)) {
            Utils.showToast('设置保存成功', 'success');
            this.hide();
        } else {
            Utils.showToast('保存失败', 'error');
        }
    }
}

// 将配置对话框实例暴露到全局作用域
let configDialog;