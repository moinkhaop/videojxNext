// ==UserScript==
// @name         抖音上传助手
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  在抖音页面添加视频上传功能面板，支持WebDAV云存储
// @author       Your Name
// @match        https://www.douyin.com/*
// @match        https://douyin.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM_notification
// @connect      *
// @run-at       document-end
// @require      file://config-dialog.js
// ==/UserScript==

(function() {
    'use strict';
    
    // 存储键名常量
    const STORAGE_KEYS = {
        PARSERS: 'dy_upload_parsers',
        WEBDAV: 'dy_upload_webdav',
        SETTINGS: 'dy_upload_settings',
        HISTORY: 'dy_upload_history',
        CACHE: 'dy_upload_cache'
    };
    
    // 应用状态
    const AppState = {
        isPanelVisible: false,
        currentVideoInfo: null,
        isUploading: false,
        clipboardMonitor: null
    };
    
    // 配置管理类
    class ConfigManager {
        // 初始化默认配置
        static initDefaults() {
            const defaultParsers = [{
                id: 'builtin_parser_jxcxin',
                name: '默认抖音解析器',
                apiUrl: 'https://apis.jxcxin.cn/api/douyin',
                requestMethod: 'GET',
                urlParamName: 'url',
                isDefault: true,
                isBuiltin: true,
                disabled: false
            }];
            
            const defaultWebDAV = [{
                id: 'builtin_webdav_e3one',
                name: 'E3one',
                url: 'https://app.koofr.net/dav/E3one',
                username: 'tuguo@proton.me',
                password: this.encrypt('evg8drocizzqb681'),
                basePath: '/public/dy',
                isDefault: true,
                disabled: false
            }];
            
            const defaultSettings = {
                uiPosition: 'bottom-right',
                autoCollapse: true,
                clipboardMonitor: false,
                theme: 'light'
            };
            
            if (!this.getParsers().length) {
                this.saveParsers(defaultParsers);
            }
            
            if (!this.getWebDAVConfigs().length) {
                this.saveWebDAVConfigs(defaultWebDAV);
            }
            
            if (!this.getSettings()) {
                this.saveSettings(defaultSettings);
            }
        }
        
        // 加密密码
        static encrypt(text) {
            return btoa(text);
        }
        
        // 解密密码
        static decrypt(encrypted) {
            try {
                return atob(encrypted);
            } catch (error) {
                console.error('解密失败:', error);
                return '';
            }
        }
        
        // 获取解析器配置
        static getParsers() {
            try {
                const data = GM_getValue(STORAGE_KEYS.PARSERS, '[]');
                return JSON.parse(data);
            } catch (error) {
                console.error('获取解析器配置失败:', error);
                return [];
            }
        }
        
        // 保存解析器配置
        static saveParsers(parsers) {
            try {
                GM_setValue(STORAGE_KEYS.PARSERS, JSON.stringify(parsers));
                return true;
            } catch (error) {
                console.error('保存解析器配置失败:', error);
                return false;
            }
        }
        
        // 获取WebDAV配置
        static getWebDAVConfigs() {
            try {
                const data = GM_getValue(STORAGE_KEYS.WEBDAV, '[]');
                const configs = JSON.parse(data);
                // 解密密码
                return configs.map(c => ({
                    ...c,
                    password: this.decrypt(c.password)
                }));
            } catch (error) {
                console.error('获取WebDAV配置失败:', error);
                return [];
            }
        }
        
        // 保存WebDAV配置
        static saveWebDAVConfigs(configs) {
            try {
                // 加密密码
                const encrypted = configs.map(c => ({
                    ...c,
                    password: this.encrypt(c.password)
                }));
                GM_setValue(STORAGE_KEYS.WEBDAV, JSON.stringify(encrypted));
                return true;
            } catch (error) {
                console.error('保存WebDAV配置失败:', error);
                return false;
            }
        }
        
        // 获取应用设置
        static getSettings() {
            try {
                const data = GM_getValue(STORAGE_KEYS.SETTINGS, '{}');
                return JSON.parse(data);
            } catch (error) {
                console.error('获取应用设置失败:', error);
                return {};
            }
        }
        
        // 保存应用设置
        static saveSettings(settings) {
            try {
                GM_setValue(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
                return true;
            } catch (error) {
                console.error('保存应用设置失败:', error);
                return false;
            }
        }
        
        // 获取默认解析器
        static getDefaultParser() {
            const parsers = this.getParsers();
            return parsers.find(p => p.isDefault) || parsers[0] || null;
        }
        
        // 获取默认WebDAV服务器
        static getDefaultWebDAVServer() {
            const servers = this.getWebDAVConfigs();
            return servers.find(s => s.isDefault) || servers[0] || null;
        }
    }
    
    // 视频解析服务
    class ParseService {
        // 解析视频链接
        static async parseVideo(videoUrl, parserConfig) {
            try {
                console.log('[解析服务] 开始解析视频:', videoUrl);
                
                // 1. 清理URL
                const cleanUrl = this.extractRealUrl(videoUrl);
                console.log('[解析服务] 清理后的URL:', cleanUrl);
                
                // 2. 构建请求
                const requestUrl = this.buildRequestUrl(cleanUrl, parserConfig);
                console.log('[解析服务] 请求URL:', requestUrl);
                
                // 3. 发送请求
                const response = await this.sendRequest(requestUrl, parserConfig, cleanUrl);
                console.log('[解析服务] 响应状态:', response.status);
                
                // 4. 解析响应
                const data = JSON.parse(response.responseText);
                console.log('[解析服务] 解析数据:', data);
                
                // 5. 标准化数据
                const normalizedData = this.normalizeData(data);
                console.log('[解析服务] 标准化数据:', normalizedData);
                
                return normalizedData;
                
            } catch (error) {
                console.error('[解析服务] 解析失败:', error);
                throw new Error(`视频解析失败: ${error.message}`);
            }
        }
        
        // 提取真实URL
        static extractRealUrl(input) {
            // 从分享文本中提取URL
            const urlRegex = /(https?:\/\/[^\s]+)/g;
            const matches = input.match(urlRegex);
            
            if (matches && matches.length > 0) {
                return matches[0].replace(/\/$/, '');
            }
            
            return input.trim();
        }
        
        // 构建请求URL
        static buildRequestUrl(videoUrl, config) {
            if (config.requestMethod === 'GET') {
                const params = new URLSearchParams();
                params.append(config.urlParamName, videoUrl);
                return `${config.apiUrl}?${params.toString()}`;
            }
            return config.apiUrl;
        }
        
        // 发送请求
        static sendRequest(url, config, videoUrl) {
            return new Promise((resolve, reject) => {
                const requestConfig = {
                    method: config.requestMethod,
                    url: url,
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    onload: resolve,
                    onerror: (error) => {
                        console.error('[解析服务] 请求错误:', error);
                        reject(new Error('网络请求失败'));
                    },
                    ontimeout: () => {
                        reject(new Error('请求超时'));
                    },
                    timeout: 30000
                };
                
                if (config.requestMethod === 'POST') {
                    requestConfig.data = JSON.stringify({ url: videoUrl });
                }
                
                GM_xmlhttpRequest(requestConfig);
            });
        }
        
        // 标准化数据格式
        static normalizeData(data) {
            if (!data.success && !data.data) {
                throw new Error(data.error || '解析API返回错误');
            }
            
            const videoData = data.data || data;
            
            return {
                title: videoData.title || videoData.desc || '未知标题',
                author: videoData.author || videoData.nickname || '未知作者',
                url: videoData.url || videoData.video_url || videoData.play_addr,
                cover: videoData.cover || videoData.pic || videoData.thumbnail,
                duration: videoData.duration || 0,
                format: 'mp4',
                size: videoData.size || 0,
                mediaType: videoData.mediaType || 'video'
            };
        }
    }
    
    // 上传服务
    class UploadService {
        // 上传到WebDAV
        static async uploadToWebDAV(videoInfo, webdavConfig, onProgress) {
            try {
                console.log('[上传服务] 开始上传视频:', videoInfo.title);
                
                // 1. 生成文件名
                const fileName = this.generateFileName(videoInfo.title);
                console.log('[上传服务] 生成文件名:', fileName);
                
                // 2. 构建上传路径
                const uploadPath = this.buildUploadPath(webdavConfig, fileName);
                console.log('[上传服务] 上传路径:', uploadPath);
                
                // 3. 下载视频
                onProgress?.(10, '正在下载视频...');
                const videoBlob = await this.downloadVideo(
                    videoInfo.url,
                    (loaded, total) => {
                        const progress = Math.round((loaded / total) * 40);
                        onProgress?.(10 + progress, `下载中... ${progress}%`);
                    }
                );
                console.log('[上传服务] 视频下载完成，大小:', videoBlob.size);
                
                // 4. 上传到WebDAV
                onProgress?.(50, '正在上传到云存储...');
                await this.putToWebDAV(
                    uploadPath,
                    videoBlob,
                    webdavConfig,
                    (loaded, total) => {
                        const progress = Math.round((loaded / total) * 50);
                        onProgress?.(50 + progress, `上传中... ${progress}%`);
                    }
                );
                
                console.log('[上传服务] 上传成功:', uploadPath);
                return uploadPath;
                
            } catch (error) {
                console.error('[上传服务] 上传失败:', error);
                throw new Error(`上传失败: ${error.message}`);
            }
        }
        
        // 生成文件名
        static generateFileName(title) {
            // 清理文件名中的特殊字符
            const clean = title.replace(/[<>:"/\\|?*]/g, '_').substring(0, 50);
            const timestamp = new Date().getTime();
            return `${clean}_${timestamp}.mp4`;
        }
        
        // 构建上传路径
        static buildUploadPath(config, fileName) {
            const baseUrl = config.url.replace(/\/$/, '');
            const basePath = config.basePath.replace(/^\/+|\/+$/g, '');
            const encodedFileName = encodeURIComponent(fileName);
            
            if (basePath) {
                return `${baseUrl}/${basePath}/${encodedFileName}`;
            }
            return `${baseUrl}/${encodedFileName}`;
        }
        
        // 下载视频
        static downloadVideo(url, onProgress) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    responseType: 'blob',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Referer': 'https://www.douyin.com/'
                    },
                    onprogress: (e) => {
                        if (e.lengthComputable && onProgress) {
                            onProgress(e.loaded, e.total);
                        }
                    },
                    onload: (response) => {
                        if (response.status === 200) {
                            resolve(response.response);
                        } else {
                            reject(new Error(`下载失败: HTTP ${response.status}`));
                        }
                    },
                    onerror: (error) => {
                        reject(new Error('视频下载失败'));
                    },
                    ontimeout: () => {
                        reject(new Error('下载超时'));
                    },
                    timeout: 60000
                });
            });
        }
        
        // 上传到WebDAV
        static putToWebDAV(path, blob, config, onProgress) {
            return new Promise((resolve, reject) => {
                const auth = btoa(`${config.username}:${config.password}`);
                
                GM_xmlhttpRequest({
                    method: 'PUT',
                    url: path,
                    headers: {
                        'Authorization': `Basic ${auth}`,
                        'Content-Type': 'video/mp4',
                        'Content-Length': blob.size.toString()
                    },
                    data: blob,
                    binary: true,
                    onprogress: (e) => {
                        if (e.lengthComputable && onProgress) {
                            onProgress(e.loaded, e.total);
                        }
                    },
                    onload: (response) => {
                        if (response.status === 201 || response.status === 204) {
                            resolve(response);
                        } else {
                            console.error('[上传服务] WebDAV响应:', response);
                            reject(new Error(`上传失败: HTTP ${response.status} ${response.statusText}`));
                        }
                    },
                    onerror: (error) => {
                        reject(new Error('WebDAV上传失败'));
                    },
                    ontimeout: () => {
                        reject(new Error('上传超时'));
                    },
                    timeout: 120000
                });
            });
        }
    }
    
    // 剪贴板监控
    class ClipboardMonitor {
        constructor() {
            this.enabled = false;
            this.lastText = '';
            this.interval = null;
            this.callback = null;
        }
        
        // 启动监控
        start(callback, interval = 1000) {
            this.enabled = true;
            this.callback = callback;
            this.interval = setInterval(async () => {
                try {
                    const text = await navigator.clipboard.readText();
                    
                    if (text !== this.lastText && this.isDouyinLink(text)) {
                        this.lastText = text;
                        callback(text);
                    }
                } catch (error) {
                    // 忽略权限错误
                }
            }, interval);
        }
        
        // 停止监控
        stop() {
            this.enabled = false;
            if (this.interval) {
                clearInterval(this.interval);
                this.interval = null;
            }
        }
        
        // 检查是否是抖音链接
        isDouyinLink(text) {
            return /douyin\.com|iesdouyin\.com|v\.douyin\.com/i.test(text);
        }
    }
    
    // 工具函数
    const Utils = {
        // 显示Toast通知
        showToast(message, type = 'info', duration = 3000) {
            const toast = document.createElement('div');
            toast.className = `dy-toast dy-toast--${type}`;
            toast.textContent = message;
            
            // 添加样式
            Object.assign(toast.style, {
                position: 'fixed',
                top: '20px',
                right: '20px',
                padding: '12px 20px',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '500',
                zIndex: '999999',
                opacity: '0',
                transform: 'translateY(-20px)',
                transition: 'all 0.3s ease',
                maxWidth: '300px',
                wordBreak: 'break-word'
            });
            
            // 设置颜色
            switch (type) {
                case 'success':
                    toast.style.background = '#00D68F';
                    toast.style.color = 'white';
                    break;
                case 'error':
                    toast.style.background = '#FF3B5C';
                    toast.style.color = 'white';
                    break;
                case 'warning':
                    toast.style.background = '#FFB800';
                    toast.style.color = 'white';
                    break;
                default:
                    toast.style.background = '#FE2D52';
                    toast.style.color = 'white';
            }
            
            document.body.appendChild(toast);
            
            // 显示动画
            setTimeout(() => {
                toast.style.opacity = '1';
                toast.style.transform = 'translateY(0)';
            }, 10);
            
            // 自动隐藏
            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateY(-20px)';
                setTimeout(() => {
                    if (toast.parentNode) {
                        toast.parentNode.removeChild(toast);
                    }
                }, 300);
            }, duration);
        },
        
        // 格式化文件大小
        formatFileSize(bytes) {
            if (!bytes || bytes === 0) return '0 B';
            
            const units = ['B', 'KB', 'MB', 'GB', 'TB'];
            const k = 1024;
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            
            return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`;
        },
        
        // 格式化时长
        formatDuration(seconds) {
            if (!seconds || seconds < 0) return '00:00';
            
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const secs = Math.floor(seconds % 60);
            
            if (hours > 0) {
                return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            }
            return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
    };
    
    // 主应用类
    class DouyinUploadHelper {
        constructor() {
            this.uiManager = null;
            this.clipboardMonitor = new ClipboardMonitor();
            this.init();
        }
        
        // 初始化应用
        init() {
            console.log('[抖音上传助手] 开始初始化...');
            
            // 等待页面加载完成
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this.onPageReady());
            } else {
                this.onPageReady();
            }
        }
        
        // 页面准备就绪
        onPageReady() {
            console.log('[抖音上传助手] 页面加载完成');
            
            // 初始化配置
            ConfigManager.initDefaults();
            
            // 注入样式
            this.injectStyles();
            
            // 创建UI
            this.createUI();
            
            // 注册菜单
            this.registerMenu();
            
            // 启动剪贴板监控
            this.startClipboardMonitor();
            
            console.log('[抖音上传助手] 初始化完成');
        }
        
        // 注入样式
        injectStyles() {
            const style = document.createElement('style');
            style.textContent = `
                /* 抖音上传助手样式 */
                .dy-upload-trigger {
                    position: fixed;
                    right: 20px;
                    bottom: 80px;
                    width: 60px;
                    height: 60px;
                    background: linear-gradient(135deg, #FE2D52 0%, #FF6B9D 100%);
                    border-radius: 50%;
                    cursor: pointer;
                    box-shadow: 0 4px 20px rgba(254, 45, 82, 0.4);
                    transition: all 0.3s ease;
                    z-index: 999999;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-size: 24px;
                }
                
                .dy-upload-trigger:hover {
                    transform: scale(1.1) translateY(-2px);
                    box-shadow: 0 6px 30px rgba(254, 45, 82, 0.6);
                }
                
                .dy-upload-panel {
                    position: fixed;
                    right: 90px;
                    bottom: 80px;
                    width: 400px;
                    max-height: 600px;
                    background: rgba(255, 255, 255, 0.98);
                    border-radius: 16px;
                    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
                    z-index: 999999;
                    display: none;
                    overflow: hidden;
                    backdrop-filter: blur(10px);
                }
                
                .dy-upload-panel.show {
                    display: block;
                    animation: slideIn 0.3s ease;
                }
                
                @keyframes slideIn {
                    from {
                        opacity: 0;
                        transform: translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                
                .dy-panel-header {
                    padding: 16px 20px;
                    background: linear-gradient(135deg, #FE2D52 0%, #FF6B9D 100%);
                    color: white;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                
                .dy-panel-header h3 {
                    margin: 0;
                    font-size: 16px;
                    font-weight: 600;
                }
                
                .dy-panel-controls {
                    display: flex;
                    gap: 8px;
                }
                
                .dy-panel-controls button {
                    width: 24px;
                    height: 24px;
                    border: none;
                    background: rgba(255, 255, 255, 0.2);
                    color: white;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                    transition: background 0.2s;
                }
                
                .dy-panel-controls button:hover {
                    background: rgba(255, 255, 255, 0.3);
                }
                
                .dy-panel-body {
                    padding: 20px;
                    max-height: 500px;
                    overflow-y: auto;
                }
                
                .dy-form-group {
                    margin-bottom: 16px;
                }
                
                .dy-form-group label {
                    display: block;
                    margin-bottom: 6px;
                    font-size: 14px;
                    font-weight: 500;
                    color: #333;
                }
                
                .dy-form-input,
                .dy-form-textarea,
                .dy-form-select {
                    width: 100%;
                    padding: 10px 12px;
                    border: 1px solid #e4e5eb;
                    border-radius: 6px;
                    font-size: 14px;
                    transition: all 0.2s;
                    box-sizing: border-box;
                }
                
                .dy-form-textarea {
                    min-height: 80px;
                    resize: vertical;
                }
                
                .dy-form-input:focus,
                .dy-form-textarea:focus,
                .dy-form-select:focus {
                    outline: none;
                    border-color: #FE2D52;
                    box-shadow: 0 0 0 2px rgba(254, 45, 82, 0.1);
                }
                
                .dy-input-actions {
                    display: flex;
                    gap: 8px;
                    margin-top: 8px;
                }
                
                .dy-btn {
                    padding: 8px 16px;
                    border: none;
                    border-radius: 6px;
                    font-size: 14px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s;
                    text-align: center;
                }
                
                .dy-btn-small {
                    padding: 6px 12px;
                    font-size: 12px;
                }
                
                .dy-btn-primary {
                    background: #FE2D52;
                    color: white;
                }
                
                .dy-btn-primary:hover {
                    background: #E52746;
                    transform: translateY(-1px);
                }
                
                .dy-btn-success {
                    background: #00D68F;
                    color: white;
                }
                
                .dy-btn-success:hover {
                    background: #00B87A;
                    transform: translateY(-1px);
                }
                
                .dy-btn-secondary {
                    background: #f8f8f8;
                    color: #333;
                    border: 1px solid #e4e5eb;
                }
                
                .dy-btn-secondary:hover {
                    background: #f0f0f0;
                }
                
                .dy-action-buttons {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 12px;
                    margin-bottom: 16px;
                }
                
                .dy-bottom-menu {
                    display: flex;
                    gap: 12px;
                    padding-top: 16px;
                    border-top: 1px solid #e4e5eb;
                }
                
                .dy-bottom-menu .dy-btn {
                    flex: 1;
                }
                
                .dy-loading {
                    display: inline-block;
                    width: 16px;
                    height: 16px;
                    border: 2px solid #f3f3f3;
                    border-top: 2px solid #FE2D52;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }
                
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                
                .dy-progress-bar {
                    width: 100%;
                    height: 4px;
                    background: #f0f0f0;
                    border-radius: 2px;
                    overflow: hidden;
                    margin: 8px 0;
                }
                
                .dy-progress-fill {
                    height: 100%;
                    background: linear-gradient(90deg, #FE2D52, #FF6B9D);
                    transition: width 0.3s ease;
                }
                
                .dy-video-preview {
                    margin: 16px 0;
                    padding: 16px;
                    background: #f8f8f8;
                    border-radius: 8px;
                }
                
                .dy-video-info {
                    font-size: 14px;
                    line-height: 1.6;
                    color: #333;
                }
                
                .dy-video-info div {
                    margin-bottom: 4px;
                }
                
                .dy-video-info strong {
                    color: #666;
                    min-width: 60px;
                    display: inline-block;
                }
            `;
            document.head.appendChild(style);
        }
        
        // 创建UI
        createUI() {
            this.createTriggerButton();
            this.createMainPanel();
            this.bindEvents();
        }
        
        // 创建触发按钮
        createTriggerButton() {
            const trigger = document.createElement('div');
            trigger.className = 'dy-upload-trigger';
            trigger.innerHTML = '⬆️';
            trigger.title = '抖音上传助手';
            document.body.appendChild(trigger);
            
            this.triggerButton = trigger;
        }
        
        // 创建主面板
        createMainPanel() {
            const panel = document.createElement('div');
            panel.className = 'dy-upload-panel';
            panel.innerHTML = `
                <div class="dy-panel-header">
                    <h3>📺 抖音上传助手</h3>
                    <div class="dy-panel-controls">
                        <button class="btn-minimize">–</button>
                        <button class="btn-close">×</button>
                    </div>
                </div>
                <div class="dy-panel-body">
                    <div class="dy-form-group">
                        <label>🔗 视频链接</label>
                        <textarea id="dy-video-url" class="dy-form-textarea" 
                            placeholder="粘贴视频链接或分享文本..."
                            rows="3"></textarea>
                        <div class="dy-input-actions">
                            <button id="dy-btn-paste" class="dy-btn dy-btn-small dy-btn-secondary">📋 粘贴</button>
                            <button id="dy-btn-monitor" class="dy-btn dy-btn-small dy-btn-secondary">🔄 自动检测: OFF</button>
                        </div>
                    </div>
                    
                    <div class="dy-form-group">
                        <label>🔧 解析API</label>
                        <select id="dy-parser-select" class="dy-form-select">
                            <option value="">选择解析器...</option>
                        </select>
                    </div>
                    
                    <div class="dy-form-group">
                        <label>☁️ WebDAV服务器</label>
                        <select id="dy-webdav-select" class="dy-form-select">
                            <option value="">选择服务器...</option>
                        </select>
                    </div>
                    
                    <div class="dy-action-buttons">
                        <button id="dy-btn-parse" class="dy-btn dy-btn-primary">🔍 解析</button>
                        <button id="dy-btn-upload" class="dy-btn dy-btn-success">⬆️ 上传</button>
                    </div>
                    
                    <div class="dy-bottom-menu">
                        <button id="dy-btn-config" class="dy-btn dy-btn-secondary">⚙️ 配置</button>
                        <button id="dy-btn-history" class="dy-btn dy-btn-secondary">📜 历史</button>
                    </div>
                </div>
            `;
            document.body.appendChild(panel);
            
            this.mainPanel = panel;
            this.refreshSelects();
        }
        
        // 刷新下拉选择框
        refreshSelects() {
            // 刷新解析器选择框
            const parserSelect = document.getElementById('dy-parser-select');
            const parsers = ConfigManager.getParsers();
            parserSelect.innerHTML = '<option value="">选择解析器...</option>';
            parsers.forEach(parser => {
                const option = document.createElement('option');
                option.value = parser.id;
                option.textContent = parser.name + (parser.isDefault ? ' (默认)' : '');
                if (parser.isDefault) {
                    option.selected = true;
                }
                parserSelect.appendChild(option);
            });
            
            // 刷新WebDAV选择框
            const webdavSelect = document.getElementById('dy-webdav-select');
            const webdavConfigs = ConfigManager.getWebDAVConfigs();
            webdavSelect.innerHTML = '<option value="">选择服务器...</option>';
            webdavConfigs.forEach(config => {
                const option = document.createElement('option');
                option.value = config.id;
                option.textContent = config.name + (config.isDefault ? ' (默认)' : '');
                if (config.isDefault) {
                    option.selected = true;
                }
                webdavSelect.appendChild(option);
            });
        }
        
        // 绑定事件
        bindEvents() {
            // 触发按钮点击
            this.triggerButton.addEventListener('click', () => {
                this.togglePanel();
            });
            
            // 关闭按钮
            this.mainPanel.querySelector('.btn-close').addEventListener('click', () => {
                this.hidePanel();
            });
            
            // 最小化按钮
            this.mainPanel.querySelector('.btn-minimize').addEventListener('click', () => {
                this.hidePanel();
            });
            
            // 粘贴按钮
            document.getElementById('dy-btn-paste').addEventListener('click', () => {
                this.pasteFromClipboard();
            });
            
            // 自动检测按钮
            document.getElementById('dy-btn-monitor').addEventListener('click', () => {
                this.toggleClipboardMonitor();
            });
            
            // 解析按钮
            document.getElementById('dy-btn-parse').addEventListener('click', () => {
                this.parseVideo();
            });
            
            // 上传按钮
            document.getElementById('dy-btn-upload').addEventListener('click', () => {
                this.uploadVideo();
            });
            
            // 配置按钮
            document.getElementById('dy-btn-config').addEventListener('click', () => {
                this.showConfigDialog();
            });
            
            // 历史按钮
            document.getElementById('dy-btn-history').addEventListener('click', () => {
                Utils.showToast('历史记录功能开发中...', 'info');
            });
        }
        
        // 切换面板显示
        togglePanel() {
            if (AppState.isPanelVisible) {
                this.hidePanel();
            } else {
                this.showPanel();
            }
        }
        
        // 显示面板
        showPanel() {
            this.mainPanel.classList.add('show');
            AppState.isPanelVisible = true;
        }
        
        // 隐藏面板
        hidePanel() {
            this.mainPanel.classList.remove('show');
            AppState.isPanelVisible = false;
        }
        
        // 从剪贴板粘贴
        async pasteFromClipboard() {
            try {
                const text = await navigator.clipboard.readText();
                if (text) {
                    document.getElementById('dy-video-url').value = text;
                    Utils.showToast('已粘贴剪贴板内容', 'success');
                } else {
                    Utils.showToast('剪贴板为空', 'warning');
                }
            } catch (error) {
                Utils.showToast('无法读取剪贴板', 'error');
            }
        }
        
        // 切换剪贴板监控
        toggleClipboardMonitor() {
            const btn = document.getElementById('dy-btn-monitor');
            const settings = ConfigManager.getSettings();
            
            if (this.clipboardMonitor.enabled) {
                this.clipboardMonitor.stop();
                btn.textContent = '🔄 自动检测: OFF';
                settings.clipboardMonitor = false;
            } else {
                this.clipboardMonitor.start((text) => {
                    document.getElementById('dy-video-url').value = text;
                    Utils.showToast('检测到抖音链接', 'success');
                });
                btn.textContent = '🔄 自动检测: ON';
                settings.clipboardMonitor = true;
            }
            
            ConfigManager.saveSettings(settings);
        }
        
        // 解析视频
        async parseVideo() {
            const urlInput = document.getElementById('dy-video-url');
            const parserSelect = document.getElementById('dy-parser-select');
            const videoUrl = urlInput.value.trim();
            const parserId = parserSelect.value;
            
            if (!videoUrl) {
                Utils.showToast('请输入视频链接', 'warning');
                return;
            }
            
            if (!parserId) {
                Utils.showToast('请选择解析器', 'warning');
                return;
            }
            
            const parsers = ConfigManager.getParsers();
            const parser = parsers.find(p => p.id === parserId);
            
            if (!parser) {
                Utils.showToast('解析器配置错误', 'error');
                return;
            }
            
            try {
                Utils.showToast('正在解析视频...', 'info');
                
                const videoInfo = await ParseService.parseVideo(videoUrl, parser);
                AppState.currentVideoInfo = videoInfo;
                
                this.showVideoPreview(videoInfo);
                Utils.showToast('解析成功', 'success');
                
            } catch (error) {
                Utils.showToast(error.message, 'error');
            }
        }
        
        // 上传视频
        async uploadVideo() {
            if (!AppState.currentVideoInfo) {
                Utils.showToast('请先解析视频', 'warning');
                return;
            }
            
            const webdavSelect = document.getElementById('dy-webdav-select');
            const webdavId = webdavSelect.value;
            
            if (!webdavId) {
                Utils.showToast('请选择WebDAV服务器', 'warning');
                return;
            }
            
            const webdavConfigs = ConfigManager.getWebDAVConfigs();
            const webdavConfig = webdavConfigs.find(c => c.id === webdavId);
            
            if (!webdavConfig) {
                Utils.showToast('WebDAV配置错误', 'error');
                return;
            }
            
            if (AppState.isUploading) {
                Utils.showToast('正在上传中，请稍候', 'warning');
                return;
            }
            
            try {
                AppState.isUploading = true;
                
                const uploadPath = await UploadService.uploadToWebDAV(
                    AppState.currentVideoInfo,
                    webdavConfig,
                    (progress, message) => {
                        Utils.showToast(message || `上传进度: ${progress}%`, 'info', 1000);
                    }
                );
                
                Utils.showToast(`上传成功: ${uploadPath}`, 'success');
                
            } catch (error) {
                Utils.showToast(error.message, 'error');
            } finally {
                AppState.isUploading = false;
            }
        }
        
        // 显示视频预览
        showVideoPreview(videoInfo) {
            const previewHtml = `
                <div class="dy-video-preview">
                    <div class="dy-video-info">
                        <div><strong>标题:</strong> ${videoInfo.title}</div>
                        <div><strong>作者:</strong> ${videoInfo.author}</div>
                        <div><strong>时长:</strong> ${Utils.formatDuration(videoInfo.duration)}</div>
                        <div><strong>大小:</strong> ${Utils.formatFileSize(videoInfo.size)}</div>
                        <div><strong>格式:</strong> ${videoInfo.format}</div>
                    </div>
                </div>
            `;
            
            // 在面板底部插入预览
            const panelBody = this.mainPanel.querySelector('.dy-panel-body');
            const existingPreview = panelBody.querySelector('.dy-video-preview');
            if (existingPreview) {
                existingPreview.remove();
            }
            
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = previewHtml;
            panelBody.appendChild(tempDiv.firstElementChild);
        }
        
        // 显示配置对话框
        showConfigDialog() {
            if (!window.configDialog) {
                // 创建配置对话框实例
                window.configDialog = new ConfigDialog();
            }
            
            window.configDialog.show();
        }
        
        // 启动剪贴板监控
        startClipboardMonitor() {
            const settings = ConfigManager.getSettings();
            if (settings.clipboardMonitor) {
                this.clipboardMonitor.start((text) => {
                    document.getElementById('dy-video-url').value = text;
                    Utils.showToast('检测到抖音链接', 'success');
                });
                
                const btn = document.getElementById('dy-btn-monitor');
                btn.textContent = '🔄 自动检测: ON';
            }
        }
        
        // 注册菜单
        registerMenu() {
            GM_registerMenuCommand('📺 打开上传面板', () => {
                this.showPanel();
            });
            
            GM_registerMenuCommand('⚙️ 配置设置', () => {
                this.showConfigDialog();
            });
        }
    }
    
    // 启动应用
    new DouyinUploadHelper();
    
})();