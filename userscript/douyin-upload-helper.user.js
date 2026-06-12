// ==UserScript==
// @name         抖音上传助手
// @namespace    http://tampermonkey.net/
// @version      1.0.5
// @description  在抖音页面添加视频上传功能面板，支持WebDAV云存储 - 修复配置保存问题
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
                theme: 'light',
                customApiUrl: '' // 添加自定义API地址设置
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
            try {
                return btoa(text);
            } catch (error) {
                console.error('加密失败:', error);
                return text; // 如果加密失败，返回原始文本
            }
        }
        
        // 解密密码
        static decrypt(encrypted) {
            try {
                // 检查是否已经是明文（不是base64格式）
                if (!encrypted || typeof encrypted !== 'string') {
                    return encrypted || '';
                }
                
                // 尝试解密
                const decoded = atob(encrypted);
                
                // 检查解密结果是否合理
                if (decoded && decoded.length > 0) {
                    return decoded;
                } else {
                    // 如果解密结果不合理，可能是明文
                    return encrypted;
                }
            } catch (error) {
                console.error('解密失败:', error);
                // 如果解密失败，可能是明文，直接返回
                return encrypted;
            }
        }
        
        // 检查密码是否已加密
        static isPasswordEncrypted(password) {
            if (!password || typeof password !== 'string') {
                return false;
            }
            
            try {
                // 尝试解密，如果成功且结果合理，则认为是加密的
                const decoded = atob(password);
                return decoded && decoded.length > 0 && decoded !== password;
            } catch (error) {
                // 如果解密失败，可能是明文
                return false;
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
                console.log('[配置管理] 开始保存解析器配置:', parsers.length, '个');
                const jsonString = JSON.stringify(parsers);
                console.log('[配置管理] 配置JSON长度:', jsonString.length);
                GM_setValue(STORAGE_KEYS.PARSERS, jsonString);
                console.log('[配置管理] ✓ 解析器配置保存成功');
                return true;
            } catch (error) {
                console.error('[配置管理] ✗ 保存解析器配置失败:', error);
                console.error('[配置管理] 错误堆栈:', error.stack);
                return false;
            }
        }
        
        // 获取WebDAV配置
        static getWebDAVConfigs() {
            try {
                const data = GM_getValue(STORAGE_KEYS.WEBDAV, '[]');
                const configs = JSON.parse(data);
                // 解密密码
                return configs.map(c => {
                    try {
                        return {
                            ...c,
                            password: this.decrypt(c.password)
                        };
                    } catch (decryptError) {
                        console.error('[配置管理] 解密密码失败:', decryptError);
                        // 如果解密失败，尝试直接使用原始密码
                        return {
                            ...c,
                            password: c.password
                        };
                    }
                });
            } catch (error) {
                console.error('获取WebDAV配置失败:', error);
                return [];
            }
        }
        
        // 保存WebDAV配置
        static saveWebDAVConfigs(configs) {
            try {
                console.log('[配置管理] 开始保存WebDAV配置:', configs.length, '个');
                
                // 加密密码
                const encrypted = configs.map(c => {
                    try {
                        return {
                            ...c,
                            password: this.encrypt(c.password)
                        };
                    } catch (encryptError) {
                        console.error('[配置管理] 加密密码失败:', encryptError);
                        // 如果加密失败，尝试直接保存原始密码
                        return {
                            ...c,
                            password: c.password
                        };
                    }
                });
                
                const jsonString = JSON.stringify(encrypted);
                console.log('[配置管理] 配置JSON长度:', jsonString.length);
                
                GM_setValue(STORAGE_KEYS.WEBDAV, jsonString);
                console.log('[配置管理] ✓ WebDAV配置保存成功');
                return true;
            } catch (error) {
                console.error('[配置管理] ✗ 保存WebDAV配置失败:', error);
                console.error('[配置管理] 错误堆栈:', error.stack);
                return false;
            }
        }
        
        // 验证和修复WebDAV配置
        static validateAndFixWebDAVConfig(config) {
            try {
                console.log('[配置管理] 验证WebDAV配置:', config);
                
                // 检查必要字段
                if (!config.url || !config.username || !config.password) {
                    throw new Error('WebDAV配置不完整，缺少必要字段');
                }
                
                // 检查URL格式
                if (!config.url.startsWith('http://') && !config.url.startsWith('https://')) {
                    console.warn('[配置管理] URL格式不正确，自动添加https://');
                    config.url = 'https://' + config.url;
                }
                
                // 移除URL末尾的斜杠
                config.url = config.url.replace(/\/+$/, '');
                
                // 处理基础路径
                if (config.basePath) {
                    // 确保基础路径以/开头
                    if (!config.basePath.startsWith('/')) {
                        config.basePath = '/' + config.basePath;
                    }
                    // 移除基础路径末尾的斜杠
                    config.basePath = config.basePath.replace(/\/+$/, '');
                } else {
                    config.basePath = '';
                }
                
                // 检查密码是否需要重新加密
                if (config.password && typeof config.password === 'string') {
                    const isEncrypted = this.isPasswordEncrypted(config.password);
                    
                    if (isEncrypted) {
                        console.log('[配置管理] 密码已正确加密');
                        // 尝试解密验证
                        try {
                            const decrypted = this.decrypt(config.password);
                            if (!decrypted || decrypted.length === 0) {
                                console.warn('[配置管理] 密码加密但解密失败，可能需要重新输入');
                                throw new Error('密码加密格式不正确，请重新输入密码');
                            }
                        } catch (decryptError) {
                            console.error('[配置管理] 密码解密验证失败:', decryptError);
                            throw new Error('密码加密格式不正确，请重新输入密码');
                        }
                    } else {
                        console.log('[配置管理] 检测到未加密的密码，正在重新加密...');
                        try {
                            config.password = this.encrypt(config.password);
                            console.log('[配置管理] 密码重新加密成功');
                        } catch (encryptError) {
                            console.error('[配置管理] 密码重新加密失败:', encryptError);
                            // 保持原始密码
                        }
                    }
                }
                
                console.log('[配置管理] 修复后的WebDAV配置:', config);
                return config;
                
            } catch (error) {
                console.error('[配置管理] 验证WebDAV配置失败:', error);
                throw error;
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
            console.log('[解析服务] 原始响应数据:', JSON.stringify(data, null, 2));
            
            // 检查不同的响应格式
            if (data.code !== undefined && data.code !== 200 && data.code !== '200') {
                throw new Error(data.msg || data.message || '解析API返回错误');
            }
            
            if (!data.success && !data.data && data.code !== 200 && data.code !== '200') {
                throw new Error(data.error || data.msg || data.message || '解析API返回错误');
            }
            
            // 尝试从不同的数据结构中获取视频信息
            let videoData = data.data || data;
            
            // 如果data是数组，取第一个元素
            if (Array.isArray(videoData) && videoData.length > 0) {
                videoData = videoData[0];
            }
            
            // 尝试从嵌套结构中获取视频信息
            if (videoData.data && typeof videoData.data === 'object') {
                videoData = videoData.data;
            }
            
            console.log('[解析服务] 处理后的视频数据:', JSON.stringify(videoData, null, 2));
            
            // 尝试多种可能的字段名获取视频URL
            let videoUrl = null;
            const urlFields = [
                'url', 'video_url', 'play_addr', 'playUrl', 'videoUrl',
                'download_url', 'downloadUrl', 'src', 'source',
                'play_addr_lowbr', 'play_addr_h264', 'play_addr_720p'
            ];
            
            for (const field of urlFields) {
                if (videoData[field]) {
                    videoUrl = videoData[field];
                    // 如果是对象，尝试获取其中的URL
                    if (typeof videoUrl === 'object' && videoUrl.url_list && videoUrl.url_list.length > 0) {
                        videoUrl = videoUrl.url_list[0];
                    } else if (typeof videoUrl === 'object' && videoUrl.url) {
                        videoUrl = videoUrl.url;
                    } else if (Array.isArray(videoUrl) && videoUrl.length > 0) {
                        videoUrl = videoUrl[0];
                    }
                    break;
                }
            }
            
            if (!videoUrl) {
                throw new Error('无法从解析结果中获取视频URL');
            }
            
            // 获取标题
            let title = videoData.title || videoData.desc || videoData.description || videoData.content || videoData.aweme_info?.desc || '未知标题';
            
            // 获取作者
            let author = videoData.author || videoData.nickname || videoData.creator || videoData.uploader || videoData.aweme_info?.author?.nickname || '未知作者';
            
            // 获取封面
            let cover = videoData.cover || videoData.pic || videoData.thumbnail || videoData.poster || videoData.dynamic_cover || videoData.aweme_info?.video?.cover;
            
            // 获取时长 - 尝试更多字段
            let duration = videoData.duration || videoData.video_duration || videoData.aweme_info?.video?.duration || 0;
            if (typeof duration === 'string') {
                // 尝试解析时长字符串，如 "00:30" 或 "30s"
                const timeMatch = duration.match(/(\d+):(\d+)/);
                if (timeMatch) {
                    duration = parseInt(timeMatch[1]) * 60 + parseInt(timeMatch[2]);
                } else {
                    const secondsMatch = duration.match(/(\d+)/);
                    if (secondsMatch) {
                        duration = parseInt(secondsMatch[1]);
                    }
                }
            } else if (typeof duration === 'object' && duration.value) {
                // 如果是对象，尝试获取value属性
                duration = parseInt(duration.value);
            }
            
            // 获取大小 - 尝试更多字段
            let size = videoData.size || videoData.file_size || videoData.fileSize || videoData.aweme_info?.video?.size || 0;
            if (typeof size === 'string') {
                // 尝试解析大小字符串，如 "10MB" 或 "10240000"
                const sizeMatch = size.match(/(\d+(?:\.\d+)?)(\w*)/);
                if (sizeMatch) {
                    const value = parseFloat(sizeMatch[1]);
                    const unit = sizeMatch[2].toUpperCase();
                    switch (unit) {
                        case 'GB':
                        case 'G':
                            size = value * 1024 * 1024 * 1024;
                            break;
                        case 'MB':
                        case 'M':
                            size = value * 1024 * 1024;
                            break;
                        case 'KB':
                        case 'K':
                            size = value * 1024;
                            break;
                        default:
                            size = value;
                    }
                }
            } else if (typeof size === 'object' && size.value) {
                // 如果是对象，尝试获取value属性
                size = parseInt(size.value);
            }
            
            // 如果仍然没有获取到有效的时长和大小，尝试从视频URL获取
            if (duration === 0 || size === 0) {
                console.log('[解析服务] 尝试从视频URL获取时长和大小信息');
                // 这里可以添加HEAD请求来获取文件大小，但可能会被CORS阻止
                // 暂时使用默认值
                if (duration === 0) {
                    duration = 30; // 默认30秒
                }
                if (size === 0) {
                    size = 5 * 1024 * 1024; // 默认5MB
                }
            }
            
            const result = {
                title: title,
                author: author,
                url: videoUrl,
                cover: cover,
                duration: duration,
                format: 'mp4',
                size: size,
                mediaType: videoData.mediaType || 'video'
            };
            
            console.log('[解析服务] 标准化后的结果:', result);
            return result;
        }
    }
    
    // 上传服务
    class UploadService {
        // 上传到WebDAV
        static async uploadToWebDAV(videoInfo, webdavConfig, onProgress) {
            try {
                console.log('[上传服务] 开始上传视频:', videoInfo.title);
                console.log('[上传服务] WebDAV配置:', {
                    url: webdavConfig.url,
                    username: webdavConfig.username,
                    basePath: webdavConfig.basePath
                });
                
                // 1. 生成文件名
                const fileName = this.generateFileName(videoInfo.title);
                console.log('[上传服务] 生成文件名:', fileName);
                
                // 2. 验证和修复WebDAV配置
                try {
                    webdavConfig = ConfigManager.validateAndFixWebDAVConfig(webdavConfig);
                } catch (error) {
                    throw new Error(`WebDAV配置验证失败: ${error.message}`);
                }
                
                // 3. 使用原项目的上传接口
                onProgress?.(10, '正在准备上传...');
                
                // 构建上传请求数据
                const uploadData = {
                    videoUrl: videoInfo.url,
                    webdavConfig: {
                        url: webdavConfig.url,
                        username: webdavConfig.username,
                        password: webdavConfig.password,
                        basePath: webdavConfig.basePath || ''
                    },
                    fileName: fileName,
                    folderPath: '' // 可以根据需要添加子文件夹
                };
                
                console.log('[上传服务] 发送上传请求:', uploadData);
                
                // 4. 发送上传请求到原项目接口
                onProgress?.(30, '正在连接到服务器...');
                
                const response = await this.sendUploadRequest(uploadData, (progress, message) => {
                    // 将0-100的进度映射到30-90的范围
                    const mappedProgress = 30 + Math.round(progress * 0.6);
                    onProgress?.(mappedProgress, message);
                });
                
                console.log('[上传服务] 上传响应:', response);
                
                if (response.success === true || (response.data && response.data.success !== false)) {
                    onProgress?.(95, '正在保存文件信息...');
                    // 短暂延迟，让用户看到100%完成
                    await new Promise(resolve => setTimeout(resolve, 500));
                    onProgress?.(100, '上传完成');
                    
                    // 处理不同的响应格式
                    let filePath;
                    if (response.data && response.data.filePath) {
                        filePath = response.data.filePath;
                    } else if (response.data && response.data.url) {
                        filePath = response.data.url;
                    } else if (response.filePath) {
                        filePath = response.filePath;
                    } else {
                        filePath = '上传成功，但未获取到文件路径';
                    }
                    
                    console.log('[上传服务] 上传成功:', filePath);
                    return filePath;
                } else {
                    onProgress?.(0, '上传失败');
                    const errorMsg = response.error || response.message || '上传失败';
                    throw new Error(errorMsg);
                }
                
            } catch (error) {
                console.error('[上传服务] 上传失败:', error);
                
                // 提供更详细的错误信息
                let errorMessage = error.message;
                if (error.message.includes('401')) {
                    errorMessage = '身份验证失败：请检查WebDAV服务器配置中的用户名和密码是否正确';
                } else if (error.message.includes('403')) {
                    errorMessage = '权限不足：请检查WebDAV服务器权限设置，确保有写入权限';
                } else if (error.message.includes('404')) {
                    errorMessage = '服务器地址错误：请检查WebDAV服务器地址是否正确';
                } else if (error.message.includes('timeout') || error.message.includes('超时')) {
                    errorMessage = '网络超时：请检查网络连接或稍后重试';
                } else if (error.message.includes('network') || error.message.includes('网络')) {
                    errorMessage = '网络错误：请检查网络连接';
                }
                
                onProgress?.(0, '上传失败');
                throw new Error(errorMessage);
            }
        }
        
        // 发送上传请求到原项目接口
        static async sendUploadRequest(uploadData, onProgress) {
            return new Promise((resolve, reject) => {
                // 这里需要替换为实际的原项目接口地址
                // 从设置中获取自定义API地址，如果没有则使用默认地址
                const settings = ConfigManager.getSettings();
                const customApiUrl = settings.customApiUrl;
                const apiUrl = customApiUrl || 'http://localhost:3000/api/proxy/webdav';
                
                console.log('[上传服务] 使用API地址:', apiUrl);
                if (customApiUrl) {
                    console.log('[上传服务] 使用自定义API地址');
                } else {
                    console.log('[上传服务] 使用默认API地址');
                }
                
                console.log('[上传服务] 请求原项目接口:', apiUrl);
                console.log('[上传服务] 上传数据:', uploadData);
                
                // 模拟进度更新
                let progress = 0;
                const progressInterval = setInterval(() => {
                    progress += Math.random() * 15;
                    if (progress > 90) progress = 90;
                    onProgress?.(progress, `正在上传... ${Math.round(progress)}%`);
                }, 500);
                
                // 准备请求数据，确保与原项目格式一致
                const requestData = {
                    videoUrl: uploadData.videoUrl,
                    webdavConfig: {
                        url: uploadData.webdavConfig.url,
                        username: uploadData.webdavConfig.username,
                        password: uploadData.webdavConfig.password,
                        basePath: uploadData.webdavConfig.basePath || ''
                    },
                    fileName: uploadData.fileName,
                    folderPath: uploadData.folderPath || ''
                };
                
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: apiUrl,
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                        'Accept': 'application/json, text/plain, */*',
                        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                        'Cache-Control': 'no-cache',
                        'Pragma': 'no-cache'
                    },
                    data: JSON.stringify(requestData),
                    onload: (response) => {
                        clearInterval(progressInterval);
                        
                        console.log('[上传服务] 原项目接口响应:', {
                            status: response.status,
                            statusText: response.statusText,
                            responseHeaders: response.responseHeaders,
                            responseText: response.responseText
                        });
                        
                        // 处理不同的响应状态
                        if (response.status === 200) {
                            try {
                                const data = JSON.parse(response.responseText);
                                console.log('[上传服务] 解析响应数据:', data);
                                
                                // 检查响应中的success字段
                                if (data.success === false) {
                                    // 如果原项目返回success=false，使用原项目的错误信息
                                    const errorMsg = data.error || data.message || '上传失败';
                                    console.error('[上传服务] 原项目返回错误:', errorMsg);
                                    reject(new Error(errorMsg));
                                } else {
                                    resolve(data);
                                }
                            } catch (error) {
                                console.error('[上传服务] 解析响应失败:', error);
                                reject(new Error('解析上传响应失败'));
                            }
                        } else if (response.status === 401) {
                            // 401错误通常表示身份验证失败
                            console.error('[上传服务] 身份验证失败');
                            reject(new Error('身份验证失败，请检查WebDAV配置中的用户名和密码是否正确'));
                        } else if (response.status === 403) {
                            // 403错误表示权限不足
                            console.error('[上传服务] 权限不足');
                            reject(new Error('权限不足，请检查WebDAV服务器权限设置'));
                        } else if (response.status === 404) {
                            // 404错误表示资源不存在
                            console.error('[上传服务] 资源不存在');
                            reject(new Error('上传接口不存在，请检查API地址是否正确'));
                        } else if (response.status >= 500) {
                            // 5xx错误表示服务器错误
                            console.error('[上传服务] 服务器错误');
                            reject(new Error('服务器内部错误，请稍后重试'));
                        } else {
                            // 其他错误
                            console.error('[上传服务] 上传失败:', response.status, response.statusText);
                            reject(new Error(`上传请求失败: HTTP ${response.status} ${response.statusText}`));
                        }
                    },
                    onerror: (error) => {
                        clearInterval(progressInterval);
                        console.error('[上传服务] 上传请求错误:', error);
                        
                        // 尝试使用备用上传方法
                        console.log('[上传服务] 尝试使用备用上传方法');
                        this.fallbackUploadMethod(uploadData, onProgress)
                            .then(resolve)
                            .catch(reject);
                    },
                    ontimeout: () => {
                        clearInterval(progressInterval);
                        console.error('[上传服务] 上传请求超时');
                        reject(new Error('上传请求超时，请检查网络连接'));
                    },
                    timeout: 300000 // 5分钟超时
                });
            });
        }
        
        // 备用上传方法
        static async fallbackUploadMethod(uploadData, onProgress) {
            return new Promise((resolve, reject) => {
                console.log('[上传服务] 使用备用上传方法');
                
                // 尝试直接上传到WebDAV服务器
                this.directWebDAVUpload(uploadData, onProgress)
                    .then(resolve)
                    .catch(reject);
            });
        }
        
        // 直接上传到WebDAV服务器
        static async directWebDAVUpload(uploadData, onProgress) {
            try {
                console.log('[上传服务] 开始直接上传到WebDAV服务器');
                
                // 1. 下载视频
                onProgress?.(10, '正在下载视频...');
                const videoBlob = await this.downloadVideo(uploadData.videoUrl, (loaded, total) => {
                    const progress = 10 + (loaded / total) * 40;
                    onProgress?.(progress, `正在下载视频... ${Math.round(progress)}%`);
                });
                
                // 2. 上传到WebDAV
                onProgress?.(50, '正在上传到WebDAV服务器...');
                const uploadPath = this.buildUploadPath(uploadData.webdavConfig, uploadData.fileName);
                
                await this.putToWebDAV(uploadPath, videoBlob, uploadData.webdavConfig, (loaded, total) => {
                    const progress = 50 + (loaded / total) * 40;
                    onProgress?.(progress, `正在上传到WebDAV... ${Math.round(progress)}%`);
                });
                
                onProgress?.(90, '正在完成上传...');
                
                // 3. 返回结果，与原项目接口格式保持一致
                const result = {
                    success: true,
                    data: {
                        filePath: uploadPath,
                        fileName: uploadData.fileName,
                        fileSize: videoBlob.size,
                        url: uploadPath // 添加URL字段，与原项目保持一致
                    }
                };
                
                onProgress?.(100, '上传完成');
                return result;
                
            } catch (error) {
                console.error('[上传服务] 直接上传到WebDAV失败:', error);
                throw error;
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
            
            // 只对文件名中的特殊字符进行编码，保留中文字符
            // 使用更温和的编码方式，只编码必要的字符
            const safeFileName = fileName.replace(/[<>:"/\\|?*]/g, '_');
            
            // 更精确的编码逻辑，只编码真正需要编码的字符
            let encodedFileName = '';
            for (let i = 0; i < safeFileName.length; i++) {
                const char = safeFileName[i];
                const code = char.charCodeAt(0);
                
                // 保留ASCII字母数字、基本标点和中文字符
                if ((code >= 48 && code <= 57) || // 0-9
                    (code >= 65 && code <= 90) || // A-Z
                    (code >= 97 && code <= 122) || // a-z
                    code === 45 || code === 46 || code === 95 || // -._
                    (code >= 0x4e00 && code <= 0x9fa5)) { // 中文字符
                    encodedFileName += char;
                } else {
                    // 其他字符进行编码
                    try {
                        // 检查字符是否为有效的Unicode字符
                        if (code === 0xFFFD || // 替换字符
                            (code >= 0xD800 && code <= 0xDFFF) || // 代理区域
                            code < 0x20) { // 控制字符
                            // 对于无效字符，直接替换为下划线
                            encodedFileName += '_';
                            console.warn('[上传服务] 检测到无效字符，已替换: "' + char + '" (代码: ' + code + ')');
                        } else {
                            // 对于有效字符，尝试编码
                            encodedFileName += encodeURIComponent(char);
                        }
                    } catch (e) {
                        // 如果编码失败，替换为下划线
                        encodedFileName += '_';
                        console.warn('[上传服务] 字符编码失败，已替换: "' + char + '" (错误: ' + (e?.message || e) + ')');
                    }
                }
            }
            
            if (basePath) {
                return `${baseUrl}/${basePath}/${encodedFileName}`;
            }
            return `${baseUrl}/${encodedFileName}`;
        }
        
        // 下载视频
        static downloadVideo(url, onProgress) {
            return new Promise((resolve, reject) => {
                console.log('[上传服务] 开始下载视频:', url);
                
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    responseType: 'blob',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                        'Referer': 'https://www.douyin.com/',
                        'Accept': '*/*',
                        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                        'Accept-Encoding': 'gzip, deflate, br',
                        'Connection': 'keep-alive',
                        'Sec-Fetch-Dest': 'empty',
                        'Sec-Fetch-Mode': 'cors',
                        'Sec-Fetch-Site': 'cross-site'
                    },
                    onprogress: (e) => {
                        console.log('[上传服务] 下载进度:', e);
                        if (e.lengthComputable && onProgress) {
                            onProgress(e.loaded, e.total);
                        }
                    },
                    onload: (response) => {
                        console.log('[上传服务] 下载响应:', {
                            status: response.status,
                            statusText: response.statusText,
                            responseHeaders: response.responseHeaders,
                            responseSize: response.response ? response.response.size : 0
                        });
                        
                        if (response.status === 200) {
                            if (response.response && response.response.size > 0) {
                                console.log('[上传服务] 视频下载成功，大小:', response.response.size);
                                resolve(response.response);
                            } else {
                                reject(new Error('下载的视频文件为空'));
                            }
                        } else {
                            reject(new Error(`下载失败: HTTP ${response.status} ${response.statusText}`));
                        }
                    },
                    onerror: (error) => {
                        console.error('[上传服务] 下载错误:', error);
                        reject(new Error('视频下载失败'));
                    },
                    ontimeout: () => {
                        console.error('[上传服务] 下载超时');
                        reject(new Error('下载超时'));
                    },
                    timeout: 120000 // 增加超时时间到2分钟
                });
            });
        }
        
        // 上传到WebDAV
        static putToWebDAV(path, blob, config, onProgress) {
            return new Promise((resolve, reject) => {
                console.log('[上传服务] 开始上传到WebDAV:', {
                    path: path,
                    size: blob.size,
                    config: {
                        url: config.url,
                        username: config.username,
                        basePath: config.basePath
                    }
                });
                
                const auth = btoa(`${config.username}:${config.password}`);
                
                GM_xmlhttpRequest({
                    method: 'PUT',
                    url: path,
                    headers: {
                        'Authorization': `Basic ${auth}`,
                        'Content-Type': 'video/mp4',
                        'Content-Length': blob.size.toString(),
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Accept': '*/*'
                    },
                    data: blob,
                    binary: true,
                    onprogress: (e) => {
                        console.log('[上传服务] 上传进度:', e);
                        if (e.lengthComputable && onProgress) {
                            onProgress(e.loaded, e.total);
                        }
                    },
                    onload: (response) => {
                        console.log('[上传服务] WebDAV响应:', {
                            status: response.status,
                            statusText: response.statusText,
                            responseHeaders: response.responseHeaders
                        });
                        
                        if (response.status === 201 || response.status === 204 || response.status === 200) {
                            console.log('[上传服务] 上传成功');
                            resolve(response);
                        } else {
                            console.error('[上传服务] WebDAV上传失败:', response);
                            reject(new Error(`上传失败: HTTP ${response.status} ${response.statusText}`));
                        }
                    },
                    onerror: (error) => {
                        console.error('[上传服务] WebDAV上传错误:', error);
                        reject(new Error('WebDAV上传失败'));
                    },
                    ontimeout: () => {
                        console.error('[上传服务] WebDAV上传超时');
                        reject(new Error('上传超时'));
                    },
                    timeout: 300000 // 增加超时时间到5分钟
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
    
    // 配置对话框类
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
                                    <label>API地址</label>
                                    <div class="dy-input-group">
                                        <input type="text" id="custom-api-url" class="dy-form-input"
                                               placeholder="留空使用默认地址: http://localhost:3000/api/proxy/webdav">
                                        <button id="test-api-url" class="dy-btn dy-btn-small dy-btn-secondary">测试</button>
                                    </div>
                                    <div class="dy-input-hint">
                                        💡 提示：如果本地服务运行在不同端口或远程服务器，请输入完整的API地址
                                    </div>
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
            
            // API地址测试按钮
            this.dialog.querySelector('#test-api-url').addEventListener('click', () => {
                this.testApiUrl();
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
            
            // 设置自定义API地址
            const apiUrlInput = this.dialog.querySelector('#custom-api-url');
            apiUrlInput.value = settings.customApiUrl || '';
            
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
            
            // 如果设为默认，清除其他解析器的默认设置
            if (isDefault) {
                parsers.forEach(p => p.isDefault = false);
            }
            
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
            
            // 如果设为默认，清除其他配置的默认设置
            if (isDefault) {
                webdavConfigs.forEach(c => c.isDefault = false);
            }
            
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
        
        // 测试API地址
        async testApiUrl() {
            const apiUrlInput = document.getElementById('custom-api-url');
            const testButton = document.getElementById('test-api-url');
            const apiUrl = apiUrlInput.value.trim() || 'http://localhost:3000/api/proxy/webdav';
            
            // 禁用测试按钮，防止重复点击
            const originalText = testButton.textContent;
            testButton.disabled = true;
            testButton.textContent = '测试中...';
            
            try {
                Utils.showToast('正在测试API地址...', 'info');
                
                // 使用GM_xmlhttpRequest替代fetch，确保兼容性
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: apiUrl,
                    headers: {
                        'Accept': 'application/json'
                    },
                    onload: (response) => {
                        // 恢复测试按钮
                        testButton.disabled = false;
                        testButton.textContent = originalText;
                        
                        if (response.status === 200 || response.status === 405) {
                            // 200 OK 或 405 Method Not Allowed 都表示API存在
                            // 405是因为我们发送GET请求，但API只支持POST
                            Utils.showToast('API地址测试成功！', 'success');
                        } else {
                            Utils.showToast(`API地址测试失败: HTTP ${response.status}`, 'error');
                        }
                    },
                    onerror: (error) => {
                        // 恢复测试按钮
                        testButton.disabled = false;
                        testButton.textContent = originalText;
                        
                        console.error('[配置管理] API地址测试失败:', error);
                        Utils.showToast('API地址测试失败：无法连接到服务器', 'error');
                    },
                    ontimeout: () => {
                        // 恢复测试按钮
                        testButton.disabled = false;
                        testButton.textContent = originalText;
                        
                        Utils.showToast('API地址测试超时：请检查网络连接', 'error');
                    },
                    timeout: 10000
                });
                
            } catch (error) {
                // 恢复测试按钮
                testButton.disabled = false;
                testButton.textContent = originalText;
                
                console.error('[配置管理] API地址测试失败:', error);
                Utils.showToast('API地址测试失败：无法连接到服务器', 'error');
            }
        }
        
        // 保存设置
        saveSettings() {
            const settings = {
                uiPosition: document.getElementById('ui-position').value,
                theme: document.getElementById('theme').value,
                customApiUrl: document.getElementById('custom-api-url').value.trim(),
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
            this.configDialog = new ConfigDialog();
            this.currentVideoUrl = null; // 存储当前检测到的视频URL
            this.lastVideoCheck = 0; // 上次检查视频的时间
            this.lastInteractedVideo = null; // 用户最后交互的视频元素
            this.videoIntersectionObserver = null; // IntersectionObserver 实例
            this.currentVisibleVideo = null; // 当前最可见的视频元素
            this.lastInteractionTime = 0; // 最后交互时间
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
            
            // 启动视频链接监控
            this.startVideoLinkMonitor();

            // 启动交互追踪
            this.startInteractionTracking();

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
                
                .dy-input-hint {
                    margin-top: 8px;
                    padding: 8px 12px;
                    background: rgba(254, 45, 82, 0.1);
                    border-radius: 6px;
                    font-size: 12px;
                    color: #FE2D52;
                    line-height: 1.4;
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
                
                .dy-upload-progress {
                    margin-top: 12px;
                    padding: 12px;
                    background: #f8f9fa;
                    border-radius: 8px;
                    border: 1px solid #e9ecef;
                }
                
                .dy-progress-text {
                    font-size: 12px;
                    color: #666;
                    margin-top: 6px;
                    text-align: center;
                }
                
                /* 密码修复对话框样式 */
                .dy-password-dialog {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    z-index: 1000002;
                    display: none;
                }
                
                .dy-password-dialog.show {
                    display: block;
                }
                
                .dy-password-overlay {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.5);
                    backdrop-filter: blur(4px);
                }
                
                .dy-password-content {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    width: 90%;
                    max-width: 500px;
                    background: white;
                    border-radius: 12px;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                    overflow: hidden;
                }
                
                .dy-password-header {
                    padding: 20px 24px;
                    background: linear-gradient(135deg, #FE2D52 0%, #FF6B9D 100%);
                    color: white;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                
                .dy-password-header h3 {
                    margin: 0;
                    font-size: 16px;
                    font-weight: 600;
                }
                
                .dy-password-body {
                    padding: 24px;
                }
                
                .dy-password-footer {
                    padding: 20px 24px;
                    border-top: 1px solid #e4e5eb;
                    display: flex;
                    justify-content: flex-end;
                    gap: 12px;
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
                
                /* 配置对话框样式 */
                .dy-config-dialog {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    z-index: 1000000;
                    display: none;
                }
                
                .dy-config-dialog.show {
                    display: block;
                }
                
                .dy-config-overlay {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.5);
                    backdrop-filter: blur(4px);
                }
                
                .dy-config-content {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    width: 90%;
                    max-width: 800px;
                    max-height: 80vh;
                    background: white;
                    border-radius: 16px;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                }
                
                .dy-config-header {
                    padding: 20px 24px;
                    background: linear-gradient(135deg, #FE2D52 0%, #FF6B9D 100%);
                    color: white;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                
                .dy-config-header h2 {
                    margin: 0;
                    font-size: 18px;
                    font-weight: 600;
                }
                
                .dy-config-tabs {
                    display: flex;
                    background: #f8f8f8;
                    border-bottom: 1px solid #e4e5eb;
                }
                
                .dy-tab-btn {
                    flex: 1;
                    padding: 16px;
                    border: none;
                    background: transparent;
                    font-size: 14px;
                    font-weight: 500;
                    color: #666;
                    cursor: pointer;
                    transition: all 0.2s;
                    border-bottom: 3px solid transparent;
                }
                
                .dy-tab-btn:hover {
                    background: rgba(254, 45, 82, 0.1);
                    color: #FE2D52;
                }
                
                .dy-tab-btn.active {
                    color: #FE2D52;
                    border-bottom-color: #FE2D52;
                    background: white;
                }
                
                .dy-config-body {
                    flex: 1;
                    overflow-y: auto;
                    padding: 0;
                }
                
                .dy-tab-content {
                    display: none;
                    padding: 24px;
                }
                
                .dy-tab-content.active {
                    display: block;
                }
                
                .dy-tab-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                }
                
                .dy-tab-header h3 {
                    margin: 0;
                    font-size: 16px;
                    font-weight: 600;
                    color: #333;
                }
                
                .dy-config-list {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }
                
                .dy-config-item {
                    padding: 16px;
                    border: 1px solid #e4e5eb;
                    border-radius: 8px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    transition: all 0.2s;
                }
                
                .dy-config-item:hover {
                    border-color: #FE2D52;
                    box-shadow: 0 2px 8px rgba(254, 45, 82, 0.1);
                }
                
                .dy-config-info {
                    flex: 1;
                    min-width: 0;
                }
                
                .dy-config-title {
                    font-size: 14px;
                    font-weight: 600;
                    color: #333;
                    margin-bottom: 4px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                
                .dy-config-desc {
                    font-size: 12px;
                    color: #666;
                    word-break: break-all;
                }
                
                .dy-config-actions {
                    display: flex;
                    gap: 8px;
                    flex-shrink: 0;
                }
                
                .dy-badge {
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-size: 10px;
                    font-weight: 500;
                }
                
                .dy-badge-primary {
                    background: #FE2D52;
                    color: white;
                }
                
                .dy-badge-secondary {
                    background: #f0f0f0;
                    color: #666;
                }
                
                .dy-empty-state {
                    text-align: center;
                    padding: 40px 20px;
                    color: #999;
                    font-size: 14px;
                }
                
                .dy-settings-form {
                    display: flex;
                    flex-direction: column;
                    gap: 20px;
                }
                
                .dy-checkbox-label {
                    display: flex;
                    align-items: center;
                    cursor: pointer;
                    font-size: 14px;
                    color: #333;
                }
                
                .dy-checkbox-label input[type="checkbox"] {
                    display: none;
                }
                
                .dy-checkbox {
                    width: 16px;
                    height: 16px;
                    border: 2px solid #e4e5eb;
                    border-radius: 3px;
                    margin-right: 8px;
                    position: relative;
                    transition: all 0.2s;
                }
                
                .dy-checkbox-label input[type="checkbox"]:checked + .dy-checkbox {
                    background: #FE2D52;
                    border-color: #FE2D52;
                }
                
                .dy-checkbox-label input[type="checkbox"]:checked + .dy-checkbox::after {
                    content: '✓';
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    color: white;
                    font-size: 10px;
                    font-weight: bold;
                }
                
                .dy-config-footer {
                    padding: 20px 24px;
                    border-top: 1px solid #e4e5eb;
                    display: flex;
                    justify-content: flex-end;
                    gap: 12px;
                }
                
                .dy-btn-danger {
                    background: #FF3B5C;
                    color: white;
                }
                
                .dy-btn-danger:hover {
                    background: #E52746;
                    transform: translateY(-1px);
                }
                
                /* 表单对话框样式 */
                .dy-form-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.5);
                    z-index: 1000001;
                    display: none;
                }
                
                .dy-form-overlay.show {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                
                .dy-form-dialog {
                    background: white;
                    border-radius: 12px;
                    width: 90%;
                    max-width: 500px;
                    max-height: 80vh;
                    overflow-y: auto;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                }
                
                .dy-form-header {
                    padding: 20px 24px;
                    background: linear-gradient(135deg, #FE2D52 0%, #FF6B9D 100%);
                    color: white;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                
                .dy-form-header h3 {
                    margin: 0;
                    font-size: 16px;
                    font-weight: 600;
                }
                
                .dy-form-body {
                    padding: 24px;
                }
                
                .dy-form-footer {
                    padding: 20px 24px;
                    border-top: 1px solid #e4e5eb;
                    display: flex;
                    justify-content: flex-end;
                    gap: 12px;
                }
                
                .dy-input-group {
                    display: flex;
                    gap: 8px;
                    align-items: center;
                }
                
                .dy-input-group .dy-form-input {
                    flex: 1;
                }

                /* 调试信息显示 */
                .dy-debug-info {
                    margin-top: 16px;
                    padding: 12px;
                    background: #f8f9fa;
                    border-radius: 8px;
                    border-left: 3px solid #FE2D52;
                    font-size: 12px;
                    line-height: 1.6;
                }

                .dy-debug-info.collapsed {
                    display: none;
                }

                .dy-debug-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 8px;
                    font-weight: 600;
                    color: #333;
                    cursor: pointer;
                    user-select: none;
                }

                .dy-debug-header:hover {
                    color: #FE2D52;
                }

                .dy-debug-body {
                    color: #666;
                }

                .dy-debug-row {
                    margin: 4px 0;
                    display: flex;
                    gap: 8px;
                }

                .dy-debug-label {
                    font-weight: 600;
                    color: #333;
                    min-width: 100px;
                }

                .dy-debug-value {
                    flex: 1;
                    word-break: break-all;
                    font-family: 'Courier New', monospace;
                }

                .dy-debug-value.success {
                    color: #00D68F;
                }

                .dy-debug-value.error {
                    color: #FF3B5C;
                }

                .dy-debug-value.warning {
                    color: #FFB800;
                }

                .dy-current-video-display {
                    margin-top: 8px;
                    padding: 10px;
                    background: linear-gradient(135deg, rgba(254, 45, 82, 0.1) 0%, rgba(255, 107, 157, 0.1) 100%);
                    border-radius: 6px;
                    border: 1px solid rgba(254, 45, 82, 0.2);
                }

                .dy-current-video-display strong {
                    color: #FE2D52;
                    font-size: 11px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }

                .dy-current-video-display div {
                    margin-top: 6px;
                    font-size: 12px;
                    color: #333;
                    word-break: break-all;
                    font-family: 'Courier New', monospace;
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
                            placeholder="粘贴视频链接或分享文本，或点击下方按钮自动获取当前视频链接..."
                            rows="3"></textarea>
                        <div class="dy-input-actions">
                            <button id="dy-btn-paste" class="dy-btn dy-btn-small dy-btn-secondary">📋 粘贴</button>
                            <button id="dy-btn-get-current" class="dy-btn dy-btn-small dy-btn-primary">📱 获取当前视频</button>
                            <button id="dy-btn-monitor" class="dy-btn dy-btn-small dy-btn-secondary">🔄 自动检测: OFF</button>
                        </div>
                        <div class="dy-input-hint">
                            💡 提示：点击"获取当前视频"按钮可自动获取当前页面的视频链接，无需手动复制粘贴
                        </div>

                        <!-- 实时视频检测状态显示 -->
                        <div class="dy-current-video-display" id="dy-current-video-status" style="display: none;">
                            <strong>🎯 当前检测到的视频</strong>
                            <div id="dy-current-video-url">未检测到视频</div>
                        </div>

                        <!-- 调试信息（可折叠） -->
                        <div class="dy-debug-info collapsed" id="dy-debug-info">
                            <div class="dy-debug-header" id="dy-debug-toggle">
                                <span>🔍 调试信息</span>
                                <span id="dy-debug-arrow">▼</span>
                            </div>
                            <div class="dy-debug-body" id="dy-debug-body">
                                <div class="dy-debug-row">
                                    <div class="dy-debug-label">页面类型:</div>
                                    <div class="dy-debug-value" id="dy-debug-page-type">-</div>
                                </div>
                                <div class="dy-debug-row">
                                    <div class="dy-debug-label">检测策略:</div>
                                    <div class="dy-debug-value" id="dy-debug-strategy">-</div>
                                </div>
                                <div class="dy-debug-row">
                                    <div class="dy-debug-label">置信度评分:</div>
                                    <div class="dy-debug-value" id="dy-debug-score">-</div>
                                </div>
                                <div class="dy-debug-row">
                                    <div class="dy-debug-label">视频元素数:</div>
                                    <div class="dy-debug-value" id="dy-debug-video-count">-</div>
                                </div>
                                <div class="dy-debug-row">
                                    <div class="dy-debug-label">最后更新:</div>
                                    <div class="dy-debug-value" id="dy-debug-last-update">-</div>
                                </div>
                            </div>
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
                        <div class="dy-input-actions">
                            <button id="dy-btn-test-webdav" class="dy-btn dy-btn-small dy-btn-secondary">🔧 测试连接</button>
                            <button id="dy-btn-fix-password" class="dy-btn dy-btn-small dy-btn-warning">🔑 修复密码</button>
                        </div>
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
            
            // 获取当前视频按钮
            document.getElementById('dy-btn-get-current').addEventListener('click', () => {
                this.getCurrentVideoLink();
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
            
            // 测试WebDAV连接按钮
            document.getElementById('dy-btn-test-webdav').addEventListener('click', () => {
                this.testWebDAVConnection();
            });
            
            // 修复密码按钮
            document.getElementById('dy-btn-fix-password').addEventListener('click', () => {
                this.fixWebDAVPassword();
            });

            // 调试信息折叠/展开
            const debugToggle = document.getElementById('dy-debug-toggle');
            if (debugToggle) {
                debugToggle.addEventListener('click', () => {
                    const debugInfo = document.getElementById('dy-debug-info');
                    const debugArrow = document.getElementById('dy-debug-arrow');
                    if (debugInfo.classList.contains('collapsed')) {
                        debugInfo.classList.remove('collapsed');
                        debugArrow.textContent = '▲';
                    } else {
                        debugInfo.classList.add('collapsed');
                        debugArrow.textContent = '▼';
                    }
                });
            }
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
                    // 尝试从分享文本中提取抖音链接
                    const extractedUrl = this.extractDouyinUrl(text);
                    const finalText = extractedUrl || text;
                    
                    document.getElementById('dy-video-url').value = finalText;
                    
                    if (extractedUrl) {
                        Utils.showToast('已从分享文本中提取抖音链接', 'success');
                    } else {
                        Utils.showToast('已粘贴剪贴板内容', 'success');
                    }
                } else {
                    Utils.showToast('剪贴板为空', 'warning');
                }
            } catch (error) {
                Utils.showToast('无法读取剪贴板', 'error');
            }
        }
        
        // 从文本中提取抖音链接
        extractDouyinUrl(text) {
            if (!text) return null;
            
            // 匹配抖音链接的正则表达式
            const douyinUrlRegex = /(https?:\/\/(?:www\.)?(?:douyin\.com|v\.douyin\.com|iesdouyin\.com)\/[^\s]+)/g;
            const matches = text.match(douyinUrlRegex);
            
            if (matches && matches.length > 0) {
                return matches[0];
            }
            
            // 尝试匹配短链接
            const shortUrlRegex = /(https?:\/\/[^\s]*douyin[^\s]*)/g;
            const shortMatches = text.match(shortUrlRegex);
            
            if (shortMatches && shortMatches.length > 0) {
                return shortMatches[0];
            }
            
            return null;
        }
        
        // 获取当前视频链接
        getCurrentVideoLink() {
            try {
                console.log('[抖音上传助手] 开始获取当前视频链接...');

                // 强制刷新：清除所有缓存，重新检测
                this.currentVideoUrl = null;
                this.lastVideoCheck = 0;
                
                // 清除页面数据缓存（如果存在）
                if (this.cachedPageData) {
                    this.cachedPageData = null;
                }

                // 显示提示信息
                Utils.showToast('正在检测当前视频...', 'info', 1000);

                // 增加延迟时间到500ms，确保页面数据已经完全更新
                // 特别是在视频切换后，页面的全局变量需要时间更新
                setTimeout(() => {
                    this.performGetCurrentVideoLink();
                }, 500);

            } catch (error) {
                console.error('[抖音上传助手] 获取当前视频链接失败:', error);
                Utils.showToast('无法获取当前视频链接，请手动输入', 'error');
            }
        }

        // 执行获取当前视频链接
        performGetCurrentVideoLink() {
            try {
                console.log('[抖音上传助手] ====== 开始获取当前视频链接 ======');
                console.log('[抖音上传助手] 当前页面URL:', window.location.href);
                
                // 强制刷新页面数据缓存
                if (this.cachedPageData) {
                    console.log('[抖音上传助手] 清除页面数据缓存');
                    this.cachedPageData = null;
                }
                
                // 强制清除视频元素缓存，确保获取最新的播放视频
                if (this.currentVideoElement) {
                    console.log('[抖音上传助手] 清除视频元素缓存');
                    this.currentVideoElement = null;
                }

                // 使用多策略方法获取视频链接，并验证匹配度
                // 调整策略顺序，优先使用最可靠的方法
                const strategies = [
                    { name: 'PageURL', func: this.tryGetVideoLinkFromPageURL.bind(this) },
                    { name: 'PageData', func: this.tryGetVideoLinkFromPageData.bind(this) },
                    { name: 'VideoElement', func: this.tryGetVideoLinkFromVideoElement.bind(this) },
                    { name: 'VideoContainer', func: this.tryGetVideoLinkFromVideoContainer.bind(this) }, // 新增
                    { name: 'VisibleLinks', func: this.tryGetVideoLinkFromVisibleLinks.bind(this) },
                    { name: 'ActiveElements', func: this.tryGetVideoLinkFromActiveElements.bind(this) },
                    { name: 'DOMSearch', func: this.tryGetVideoLinkFromDOMSearch.bind(this) } // 新增
                ];

                let bestResult = null;
                let bestScore = -1;
                let allResults = [];

                for (const strategy of strategies) {
                    try {
                        console.log(`[抖音上传助手] 尝试策略: ${strategy.name}`);
                        const result = strategy.func();
                        if (result) {
                            const score = this.evaluateVideoLinkResult(result);
                            console.log(`[抖音上传助手] ✓ 策略 ${strategy.name} 成功 - 评分: ${score}`, result);
                            allResults.push({ strategy: strategy.name, result, score });

                            if (score > bestScore) {
                                bestScore = score;
                                bestResult = result;
                            }
                        } else {
                            console.log(`[抖音上传助手] ✗ 策略 ${strategy.name} 未返回结果`);
                        }
                    } catch (error) {
                        console.warn(`[抖音上传助手] ✗ 策略 ${strategy.name} 执行失败:`, error);
                    }
                }

                console.log('[抖音上传助手] 所有策略结果:', allResults);
                console.log('[抖音上传助手] 最佳评分:', bestScore);

                if (bestResult && bestScore > 0) {
                    console.log('[抖音上传助手] ====== 成功获取视频链接 ======');
                    console.log('[抖音上传助手] 选择最佳视频链接:', bestResult);

                    // 验证URL格式
                    const videoId = this.extractVideoId(bestResult.url);
                    if (!videoId) {
                        console.error('[抖音上传助手] ✗ 提取的URL格式不正确:', bestResult.url);
                        Utils.showToast('⚠️ 获取的链接格式不正确，请手动输入', 'warning', 3000);

                        // 更新调试信息（格式错误）
                        this.updateDebugInfo({
                            strategy: bestResult.source + ' (格式错误)',
                            score: 0
                        });

                        return;
                    }

                    console.log('[抖音上传助手] ✓ 视频ID验证通过:', videoId);
                    document.getElementById('dy-video-url').value = bestResult.url;
                    this.currentVideoUrl = bestResult.url;

                    // 更新调试信息
                    this.updateDebugInfo({
                        strategy: bestResult.source,
                        score: bestScore
                    });

                    // 根据评分给出不同的提示
                    if (bestScore >= 80) {
                        Utils.showToast('✅ 已获取当前视频链接（高置信度）', 'success');
                    } else if (bestScore >= 50) {
                        Utils.showToast('✅ 已获取当前视频链接', 'success');
                    } else if (bestScore >= 30) {
                        Utils.showToast('⚠️ 已获取视频链接（置信度较低）', 'warning', 3000);
                    } else {
                        Utils.showToast('⚠️ 已获取视频链接，但可能不匹配当前播放的视频', 'warning', 3000);
                    }
                    return;
                }

                // 如果所有策略都失败，提供降级方案
                console.log('[抖音上传助手] ====== 所有自动检测策略失败 ======');
                
                // 检查当前页面类型
                const currentUrl = window.location.href;
                console.log('[抖音上传助手] 当前页面URL:', currentUrl);
                
                // 判断是否在视频详情页
                const isVideoDetailPage = currentUrl.includes('/video/');
                
                if (isVideoDetailPage) {
                    // 在视频详情页但检测失败，尝试分享功能
                    console.log('[抖音上传助手] 在视频详情页，尝试通过分享功能获取链接...');
                    Utils.showToast('自动检测失败，尝试通过分享功能获取链接...', 'info', 2000);
                    
                    // 更新调试信息（检测失败）
                    this.updateDebugInfo({
                        strategy: '所有策略失败 - 尝试分享',
                        score: 0
                    });
                    
                    this.simulateShareAction();
                } else {
                    // 不在视频详情页，提供更有用的指引
                    console.log('[抖音上传助手] 不在视频详情页，无法自动获取链接');
                    
                    // 更新调试信息
                    this.updateDebugInfo({
                        strategy: '非视频详情页',
                        score: 0
                    });
                    
                    // 提供操作建议
                    if (currentUrl.includes('/user/') || currentUrl === 'https://www.douyin.com/' || currentUrl === 'https://douyin.com/') {
                        Utils.showToast('💡 请先点击进入视频详情页，或手动复制视频链接后粘贴', 'warning', 4000);
                        console.log('[抖音上传助手] 建议：点击视频进入详情页后再获取链接');
                    } else {
                        Utils.showToast('⚠️ 当前页面无法自动获取链接，请手动输入或复制视频链接', 'warning', 3000);
                    }
                }

            } catch (error) {
                console.error('[抖音上传助手] 执行获取当前视频链接失败:', error);
                Utils.showToast('无法获取当前视频链接，请手动输入', 'error');
            }
        }
        
        // 评估视频链接结果的质量
        evaluateVideoLinkResult(result) {
            let score = 0;
            
            try {
                // 1. 基础分数
                score += 10;
                
                // 2. URL格式评分
                if (result.url && result.url.includes('/video/')) {
                    score += 20;
                }
                
                // 3. 视频ID匹配评分
                if (result.videoId) {
                    score += 15;
                    
                    // 检查与当前页面URL的匹配度
                    const currentPageId = this.extractVideoId(window.location.href);
                    if (currentPageId && currentPageId === result.videoId) {
                        score += 30;
                        console.log('[抖音上传助手] 视频ID与当前页面匹配，+30分');
                    }
                }
                
                // 4. 视频元素匹配评分
                if (result.fromVideoElement) {
                    score += 25;
                    
                    // 检查视频元素是否正在播放
                    if (result.isPlaying) {
                        score += 20;
                        console.log('[抖音上传助手] 视频元素正在播放，+20分');
                    }
                }
                
                // 5. 可见性评分
                if (result.isVisible) {
                    score += 15;
                }
                
                // 6. 数据来源评分
                if (result.source === 'pageURL') {
                    score += 25;
                } else if (result.source === 'pageData') {
                    score += 20;
                } else if (result.source === 'videoElement') {
                    score += 15;
                } else if (result.source === 'visibleLinks') {
                    score += 10;
                }
                
                // 7. 标题匹配评分
                if (result.title) {
                    score += 5;
                    
                    // 检查标题是否与页面标题相关
                    const pageTitle = document.title;
                    if (pageTitle && pageTitle.includes(result.title.substring(0, 10))) {
                        score += 10;
                        console.log('[抖音上传助手] 标题与页面标题匹配，+10分');
                    }
                }
                
                console.log(`[抖音上传助手] 视频链接结果总评分: ${score}`);
                return score;
                
            } catch (error) {
                console.error('[抖音上传助手] 评估视频链接结果失败:', error);
                return 0;
            }
        }
        
        // 策略1: 从页面URL获取视频链接
        tryGetVideoLinkFromPageURL() {
            const currentUrl = window.location.href;
            console.log('[抖音上传助手] 检查页面URL:', currentUrl);
            
            if (currentUrl.includes('/video/')) {
                // 确保URL是完整的
                let fullUrl = currentUrl;
                if (!fullUrl.startsWith('http')) {
                    fullUrl = 'https://www.douyin.com' + fullUrl;
                }
                
                const videoId = this.extractVideoId(fullUrl);
                console.log('[抖音上传助手] ✓ 从页面URL提取视频ID:', videoId);
                
                return {
                    url: fullUrl,
                    videoId: videoId,
                    source: 'pageURL',
                    title: document.title
                };
            }
            
            console.log('[抖音上传助手] ✗ 页面URL不包含视频ID');
            return null;
        }
        
        // 策略2: 从页面数据获取视频链接
        tryGetVideoLinkFromPageData() {
            console.log('[抖音上传助手] 尝试从页面数据获取视频链接...');
            
            const pageData = this.getPageVideoData();
            if (pageData && pageData.videoUrl) {
                console.log('[抖音上传助手] ✓ 从页面数据获取成功:', pageData.videoId);
                return {
                    url: pageData.videoUrl,
                    videoId: pageData.videoId,
                    source: 'pageData',
                    title: pageData.title
                };
            }
            
            console.log('[抖音上传助手] ✗ 从页面数据获取失败');
            return null;
        }
        
        // 策略3: 从视频元素获取链接
        tryGetVideoLinkFromVideoElement() {
            console.log('[抖音上传助手] 尝试从视频元素获取链接...');
            
            const currentVideoElement = this.getCurrentPlayingVideo();
            if (currentVideoElement) {
                console.log('[抖音上传助手] 找到当前播放的视频元素');
                const videoLink = this.getVideoLinkFromElement(currentVideoElement);
                if (videoLink) {
                    console.log('[抖音上传助手] ✓ 从视频元素获取成功:', videoLink);
                    return {
                        url: videoLink,
                        videoId: this.extractVideoId(videoLink),
                        source: 'videoElement',
                        fromVideoElement: true,
                        isPlaying: !currentVideoElement.paused && !currentVideoElement.ended,
                        isVisible: this.getVisibleArea(currentVideoElement) > 0
                    };
                } else {
                    console.log('[抖音上传助手] ✗ 无法从视频元素提取链接');
                }
            } else {
                console.log('[抖音上传助手] ✗ 未找到当前播放的视频元素');
            }
            return null;
        }
        
        // 策略4: 从可见链接获取视频链接
        tryGetVideoLinkFromVisibleLinks() {
            console.log('[抖音上传助手] 尝试从可见链接获取...');
            
            const videoLinks = document.querySelectorAll('a[href*="/video/"]');
            console.log(`[抖音上传助手] 找到 ${videoLinks.length} 个视频链接`);
            
            if (videoLinks.length === 0) {
                console.log('[抖音上传助手] ✗ 页面上没有视频链接');
                return null;
            }
            
            let bestLink = null;
            let bestScore = -1;
            let visibleCount = 0;
            
            for (const link of videoLinks) {
                if (this.isElementInViewport(link)) {
                    visibleCount++;
                    const linkUrl = link.href;
                    if (linkUrl.includes('/video/')) {
                        // 计算链接的可见性和位置评分
                        const rect = link.getBoundingClientRect();
                        const visibleArea = this.getVisibleArea(link);
                        const centerX = window.innerWidth / 2;
                        const centerY = window.innerHeight / 2;
                        const linkCenterX = rect.left + rect.width / 2;
                        const linkCenterY = rect.top + rect.height / 2;
                        const distanceFromCenter = Math.sqrt(
                            Math.pow(centerX - linkCenterX, 2) +
                            Math.pow(centerY - linkCenterY, 2)
                        );
                        
                        // 综合评分
                        const score = visibleArea - distanceFromCenter;
                        
                        if (score > bestScore) {
                            bestScore = score;
                            bestLink = linkUrl;
                        }
                    }
                }
            }
            
            console.log(`[抖音上传助手] 可见的视频链接: ${visibleCount} 个`);
            
            if (bestLink) {
                console.log('[抖音上传助手] ✓ 从可见链接获取成功:', bestLink);
                return {
                    url: bestLink,
                    videoId: this.extractVideoId(bestLink),
                    source: 'visibleLinks',
                    isVisible: true
                };
            }
            
            console.log('[抖音上传助手] ✗ 未找到合适的可见链接');
            return null;
        }
        
        // 策略5: 从激活元素获取视频链接
        tryGetVideoLinkFromActiveElements() {
            // 查找当前激活的元素
            const activeElements = document.querySelectorAll('[class*="active"], [class*="playing"], [class*="current"], [class*="selected"]');
            
            for (const element of activeElements) {
                // 从元素本身或其子元素中查找视频链接
                const link = element.querySelector('a[href*="/video/"]') ||
                           (element.tagName === 'A' && element.href.includes('/video/') ? element : null);
                
                if (link) {
                    return {
                        url: link.href,
                        videoId: this.extractVideoId(link.href),
                        source: 'activeElements',
                        isVisible: this.isElementInViewport(link)
                    };
                }
            }
            return null;
        }
        
        // 策略6: 从视频容器智能提取（新增 - 专门针对推荐流）
        tryGetVideoLinkFromVideoContainer() {
            console.log('[抖音上传助手] 尝试从视频容器智能提取...');
            
            try {
                // 获取当前播放的视频
                const currentVideo = this.getCurrentPlayingVideo();
                if (!currentVideo) {
                    console.log('[抖音上传助手] ✗ 未找到当前播放视频');
                    return null;
                }
                
                console.log('[抖音上传助手] 找到当前播放视频，开始分析容器...');
                
                // 查找视频的最近父容器（通常包含视频卡片）
                let container = currentVideo;
                let foundContainer = null;
                let depth = 0;
                
                // 向上遍历寻找包含aweme-id或video-id的容器
                while (container && depth < 20) {
                    // 检查各种可能的属性
                    const attrs = [
                        'data-e2e',
                        'data-aweme-id',
                        'data-video-id',
                        'id',
                        'className'
                    ];
                    
                    for (const attr of attrs) {
                        const value = container.getAttribute?.(attr) || container[attr];
                        if (value && typeof value === 'string') {
                            // 查找19位或15+位的数字ID
                            const match = value.match(/(\d{19}|\d{15,})/);
                            if (match && match[1]) {
                                console.log(`[抖音上传助手] ✓ 从容器${attr}属性提取ID:`, match[1]);
                                return {
                                    url: `https://www.douyin.com/video/${match[1]}`,
                                    videoId: match[1],
                                    source: 'videoContainer',
                                    fromVideoElement: true
                                };
                            }
                        }
                    }
                    
                    // 在容器内查找视频链接
                    if (container.querySelector) {
                        const link = container.querySelector('a[href*="/video/"]');
                        if (link && link.href.includes('/video/')) {
                            const videoId = this.extractVideoId(link.href);
                            if (videoId) {
                                console.log('[抖音上传助手] ✓ 从容器内的链接提取ID:', videoId);
                                return {
                                    url: link.href,
                                    videoId: videoId,
                                    source: 'videoContainer',
                                    fromLink: true
                                };
                            }
                        }
                    }
                    
                    container = container.parentElement;
                    depth++;
                }
                
                console.log('[抖音上传助手] ✗ 未能从视频容器提取ID');
                return null;
                
            } catch (error) {
                console.error('[抖音上传助手] 从视频容器提取失败:', error);
                return null;
            }
        }
        
        // 策略7: DOM深度搜索（新增 - 最后的手段）
        tryGetVideoLinkFromDOMSearch() {
            console.log('[抖音上传助手] 尝试DOM深度搜索...');
            
            try {
                // 获取所有可能包含视频ID的元素
                const allElements = document.querySelectorAll('[data-e2e], [data-aweme-id], [data-video-id], [id*="video"], [class*="video"]');
                console.log(`[抖音上传助手] 找到 ${allElements.length} 个候选元素`);
                
                const candidates = [];
                
                for (const element of allElements) {
                    // 检查元素是否在视口中
                    if (!this.isElementInViewport(element)) {
                        continue;
                    }
                    
                    // 提取所有可能的ID
                    const attrs = element.attributes;
                    for (let i = 0; i < attrs.length; i++) {
                        const attr = attrs[i];
                        const match = attr.value.match(/(\d{19}|\d{15,})/);
                        if (match && match[1]) {
                            // 计算元素的可见性评分
                            const visibleArea = this.getVisibleArea(element);
                            candidates.push({
                                id: match[1],
                                element: element,
                                visibleArea: visibleArea,
                                attr: attr.name
                            });
                        }
                    }
                }
                
                console.log(`[抖音上传助手] 找到 ${candidates.length} 个候选视频ID`);
                
                if (candidates.length > 0) {
                    // 按可见区域排序，选择最可见的
                    candidates.sort((a, b) => b.visibleArea - a.visibleArea);
                    const best = candidates[0];
                    console.log('[抖音上传助手] ✓ DOM搜索找到最佳候选:', best.id);
                    
                    return {
                        url: `https://www.douyin.com/video/${best.id}`,
                        videoId: best.id,
                        source: 'domSearch',
                        confidence: 'low'
                    };
                }
                
                console.log('[抖音上传助手] ✗ DOM搜索未找到有效ID');
                return null;
                
            } catch (error) {
                console.error('[抖音上传助手] DOM搜索失败:', error);
                return null;
            }
        }
        
        // 启动视频链接监控
        startVideoLinkMonitor() {
            // 监听URL变化
            let lastUrl = window.location.href;

            // 检查URL变化
            const checkUrlChange = () => {
                const currentUrl = window.location.href;
                if (currentUrl !== lastUrl) {
                    lastUrl = currentUrl;
                    console.log('[抖音上传助手] 检测到URL变化:', currentUrl);

                    // URL变化时，清除所有缓存
                    this.currentVideoUrl = null;
                    this.lastVideoCheck = 0;
                    if (this.cachedPageData) {
                        this.cachedPageData = null;
                    }
                    if (this.currentVideoElement) {
                        this.currentVideoElement = null;
                    }

                    // 如果是视频详情页，等待DOM更新后再检测
                    if (currentUrl.includes('/video/')) {
                        setTimeout(() => {
                            this.detectCurrentVideo();
                        }, 300);
                    }
                }
            };

            // 使用MutationObserver监听DOM变化
            const observer = new MutationObserver((mutations) => {
                // 检查是否有视频相关的变化
                let hasVideoChange = false;
                for (const mutation of mutations) {
                    if (mutation.type === 'childList') {
                        for (const node of mutation.addedNodes) {
                            if (node.nodeType === Node.ELEMENT_NODE) {
                                // 检查是否添加了视频相关元素
                                if (node.tagName === 'VIDEO' ||
                                    node.querySelector && node.querySelector('video') ||
                                    node.getAttribute && node.getAttribute('data-e2e') === 'video-player' ||
                                    node.className && node.className.includes('video')) {
                                    hasVideoChange = true;
                                    break;
                                }
                            }
                        }
                    }
                }

                if (hasVideoChange) {
                    console.log('[抖音上传助手] 检测到视频元素变化，清除缓存');
                    // 清除所有缓存
                    this.currentVideoUrl = null;
                    this.lastVideoCheck = 0;
                    if (this.cachedPageData) {
                        this.cachedPageData = null;
                    }
                    if (this.currentVideoElement) {
                        this.currentVideoElement = null;
                    }
                    
                    // 延迟检测，等待DOM稳定
                    setTimeout(() => {
                        this.detectCurrentVideo();
                    }, 500);
                }
            });

            // 开始观察
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            // 定期检查URL变化 - 频率提高
            setInterval(checkUrlChange, 500);

            // 监听视频播放事件
            document.addEventListener('play', (e) => {
                if (e.target && e.target.tagName === 'VIDEO') {
                    console.log('[抖音上传助手] 检测到视频播放事件，清除缓存');
                    
                    // 清除缓存，确保获取最新的视频信息
                    this.currentVideoUrl = null;
                    this.lastVideoCheck = 0;
                    if (this.cachedPageData) {
                        this.cachedPageData = null;
                    }
                    if (this.currentVideoElement) {
                        this.currentVideoElement = null;
                    }
                    
                    setTimeout(() => {
                        this.detectCurrentVideo();
                    }, 200);
                }
            }, true);

            // 初始检测
            setTimeout(() => {
                this.detectCurrentVideo();
            }, 2000);

            console.log('[抖音上传助手] 视频链接监控已启动');
        }

        // 启动交互追踪
        startInteractionTracking() {
            console.log('[抖音上传助手] 启动视频交互追踪...');

            // 1. 设置IntersectionObserver来追踪视频可见性
            this.setupIntersectionObserver();

            // 2. 监听右键点击事件（用户分享视频的主要方式）
            document.addEventListener('contextmenu', (e) => {
                const target = e.target;

                // 检查是否点击在视频元素或其容器上
                let videoElement = null;
                if (target.tagName === 'VIDEO') {
                    videoElement = target;
                } else {
                    // 查找最近的视频元素
                    const container = target.closest('[data-e2e*="video"], [class*="video"], [class*="player"]');
                    if (container) {
                        videoElement = container.querySelector('video');
                    }
                }

                if (videoElement) {
                    console.log('[抖音上传助手] 检测到视频右键点击，记录交互:', videoElement);
                    this.recordVideoInteraction(videoElement, 'contextmenu');
                }
            }, true); // 使用捕获阶段，确保优先捕获

            // 3. 监听点击事件
            document.addEventListener('click', (e) => {
                const target = e.target;

                // 查找点击的视频元素
                let videoElement = null;
                if (target.tagName === 'VIDEO') {
                    videoElement = target;
                } else {
                    const container = target.closest('[data-e2e*="video"], [class*="video"], [class*="player"]');
                    if (container) {
                        videoElement = container.querySelector('video');
                    }
                }

                if (videoElement) {
                    console.log('[抖音上传助手] 检测到视频点击，记录交互');
                    this.recordVideoInteraction(videoElement, 'click');
                }
            }, true);

            // 4. 监听鼠标悬停（权重较低）
            document.addEventListener('mouseover', (e) => {
                const target = e.target;

                if (target.tagName === 'VIDEO') {
                    this.recordVideoInteraction(target, 'hover');
                }
            }, true);

            console.log('[抖音上传助手] 视频交互追踪已启动');
        }

        // 设置IntersectionObserver
        setupIntersectionObserver() {
            try {
                // 创建IntersectionObserver来追踪视频元素的可见性
                this.videoIntersectionObserver = new IntersectionObserver((entries) => {
                    let mostVisibleVideo = null;
                    let maxVisibilityRatio = 0;

                    entries.forEach(entry => {
                        if (entry.isIntersecting && entry.intersectionRatio > maxVisibilityRatio) {
                            maxVisibilityRatio = entry.intersectionRatio;
                            mostVisibleVideo = entry.target;
                        }
                    });

                    if (mostVisibleVideo && maxVisibilityRatio > 0.5) {
                        // 只有当视频可见度超过50%时才更新
                        if (this.currentVisibleVideo !== mostVisibleVideo) {
                            console.log('[抖音上传助手] 检测到新的可见视频，可见度:', (maxVisibilityRatio * 100).toFixed(1) + '%');
                            this.currentVisibleVideo = mostVisibleVideo;

                            // 延迟检测，确保DOM稳定
                            setTimeout(() => {
                                this.detectCurrentVideo();
                            }, 300);
                        }
                    }
                }, {
                    threshold: [0, 0.25, 0.5, 0.75, 1.0] // 多个阈值，更精确地追踪可见度
                });

                // 监听DOM变化，动态观察新添加的视频元素
                const observeVideos = () => {
                    const videos = document.querySelectorAll('video');
                    videos.forEach(video => {
                        this.videoIntersectionObserver.observe(video);
                    });
                };

                // 初始观察
                observeVideos();

                // 使用MutationObserver监听新增的视频元素
                const videoMutationObserver = new MutationObserver(() => {
                    observeVideos();
                });

                videoMutationObserver.observe(document.body, {
                    childList: true,
                    subtree: true
                });

                console.log('[抖音上传助手] IntersectionObserver已设置');
            } catch (error) {
                console.error('[抖音上传助手] 设置IntersectionObserver失败:', error);
            }
        }

        // 记录视频交互
        recordVideoInteraction(videoElement, interactionType) {
            if (!videoElement) return;

            const now = Date.now();

            // 更新最后交互的视频元素
            this.lastInteractedVideo = videoElement;
            this.lastInteractionTime = now;

            console.log(`[抖音上传助手] 记录视频交互 [${interactionType}]:`, {
                src: videoElement.src.substring(0, 100),
                paused: videoElement.paused,
                currentTime: videoElement.currentTime
            });

            // 立即触发检测（对于右键和点击）
            if (interactionType === 'contextmenu' || interactionType === 'click') {
                setTimeout(() => {
                    this.detectCurrentVideo();
                }, 100);
            }
        }

        // 检测当前视频
        detectCurrentVideo() {
            try {
                const now = Date.now();

                // 适度限制检测频率，避免过于频繁（从1000ms降低到500ms）
                if (now - this.lastVideoCheck < 500) {
                    return;
                }
                this.lastVideoCheck = now;

                console.log('[抖音上传助手] 开始检测当前视频...');

                // 使用多策略方法获取视频链接，并验证匹配度
                const strategies = [
                    this.tryGetVideoLinkFromPageURL.bind(this),
                    this.tryGetVideoLinkFromPageData.bind(this),
                    this.tryGetVideoLinkFromVideoElement.bind(this),
                    this.tryGetVideoLinkFromVisibleLinks.bind(this),
                    this.tryGetVideoLinkFromActiveElements.bind(this)
                ];

                let bestResult = null;
                let bestScore = -1;

                for (const strategy of strategies) {
                    try {
                        const result = strategy();
                        if (result) {
                            const score = this.evaluateVideoLinkResult(result);
                            console.log(`[抖音上传助手] 检测策略结果评分: ${score}`, result);

                            if (score > bestScore) {
                                bestScore = score;
                                bestResult = result;
                            }
                        }
                    } catch (error) {
                        console.warn('[抖音上传助手] 检测策略执行失败:', error);
                    }
                }

                if (bestResult && bestScore > 0) {
                    // 检查URL是否变化或是否需要更新
                    const shouldUpdate = !this.currentVideoUrl ||
                                       this.currentVideoUrl !== bestResult.url ||
                                       bestScore > 100; // 如果新的评分很高，也更新

                    if (shouldUpdate) {
                        const oldUrl = this.currentVideoUrl;
                        this.currentVideoUrl = bestResult.url;

                        if (oldUrl !== bestResult.url) {
                            console.log('[抖音上传助手] 检测到新视频URL:', bestResult.url);
                            console.log('[抖音上传助手] 旧URL:', oldUrl);
                        }

                        // 如果评分较低，记录警告
                        if (bestScore < 50) {
                            console.warn('[抖音上传助手] 检测到的视频链接可能不匹配当前播放的视频，评分较低:', bestScore);
                        } else {
                            console.log('[抖音上传助手] 视频链接匹配度良好，评分:', bestScore);
                        }

                        // 更新调试信息显示
                        this.updateDebugInfo({
                            strategy: bestResult.source,
                            score: bestScore
                        });
                    }
                    return;
                }

                console.log('[抖音上传助手] 未检测到有效的视频链接');

                // 更新调试信息显示（未检测到）
                this.updateDebugInfo({
                    strategy: '未检测到',
                    score: 0
                });

            } catch (error) {
                console.error('[抖音上传助手] 检测当前视频失败:', error);
            }
        }

        // 更新调试信息显示
        updateDebugInfo(detectionResult) {
            try {
                const currentVideoStatus = document.getElementById('dy-current-video-status');
                const currentVideoUrl = document.getElementById('dy-current-video-url');
                const debugInfo = document.getElementById('dy-debug-info');

                if (!currentVideoStatus || !currentVideoUrl) return;

                // 更新当前检测到的视频URL
                if (this.currentVideoUrl) {
                    currentVideoStatus.style.display = 'block';
                    // 截断过长的URL
                    const displayUrl = this.currentVideoUrl.length > 80
                        ? this.currentVideoUrl.substring(0, 80) + '...'
                        : this.currentVideoUrl;
                    currentVideoUrl.textContent = displayUrl;
                    currentVideoUrl.title = this.currentVideoUrl; // 完整URL显示在tooltip中
                } else {
                    currentVideoStatus.style.display = 'none';
                }

                // 如果有检测结果，显示调试信息
                if (detectionResult) {
                    if (debugInfo) {
                        debugInfo.style.display = 'block';
                    }

                    // 更新页面类型
                    const pageType = document.getElementById('dy-debug-page-type');
                    if (pageType) {
                        const url = window.location.href;
                        if (url.includes('/video/')) {
                            pageType.textContent = '视频详情页';
                            pageType.className = 'dy-debug-value success';
                        } else {
                            pageType.textContent = 'Feed流页面';
                            pageType.className = 'dy-debug-value warning';
                        }
                    }

                    // 更新检测策略
                    const strategy = document.getElementById('dy-debug-strategy');
                    if (strategy && detectionResult.strategy) {
                        strategy.textContent = detectionResult.strategy;
                        strategy.className = 'dy-debug-value';
                    }

                    // 更新置信度评分
                    const score = document.getElementById('dy-debug-score');
                    if (score && detectionResult.score !== undefined) {
                        score.textContent = `${detectionResult.score} 分`;
                        if (detectionResult.score >= 80) {
                            score.className = 'dy-debug-value success';
                        } else if (detectionResult.score >= 50) {
                            score.className = 'dy-debug-value';
                        } else {
                            score.className = 'dy-debug-value warning';
                        }
                    }

                    // 更新视频元素数
                    const videoCount = document.getElementById('dy-debug-video-count');
                    if (videoCount) {
                        const allVideos = document.querySelectorAll('video');
                        videoCount.textContent = `${allVideos.length} 个`;
                        videoCount.className = 'dy-debug-value';
                    }

                    // 更新最后更新时间
                    const lastUpdate = document.getElementById('dy-debug-last-update');
                    if (lastUpdate) {
                        const now = new Date();
                        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
                        lastUpdate.textContent = timeStr;
                        lastUpdate.className = 'dy-debug-value';
                    }
                }
            } catch (error) {
                console.error('[抖音上传助手] 更新调试信息失败:', error);
            }
        }

        // 从页面数据中获取视频信息
        getPageVideoData() {
            try {
                console.log('[抖音上传助手] ====== 开始从页面数据中获取视频信息 ======');

                // 1. 尝试从全局变量中获取视频数据
                if (window.__NUXT__) {
                    console.log('[抖音上传助手] 找到 window.__NUXT__');
                    if (window.__NUXT__.data && window.__NUXT__.data[0]) {
                        const nuxtData = window.__NUXT__.data[0];
                        console.log('[抖音上传助手] NUXT数据结构:', Object.keys(nuxtData));

                        // 检查是否有视频详情数据
                        if (nuxtData.videoDetail) {
                            const videoDetail = nuxtData.videoDetail;
                            if (videoDetail.aweme_id) {
                                console.log('[抖音上传助手] 从NUXT videoDetail获取视频信息:', videoDetail.aweme_id);
                                return {
                                    videoId: videoDetail.aweme_id,
                                    videoUrl: `https://www.douyin.com/video/${videoDetail.aweme_id}`,
                                    title: videoDetail.desc
                                };
                            }
                        }

                        // 检查其他可能的数据结构
                        if (nuxtData.aweme && nuxtData.aweme.detail) {
                            const awemeDetail = nuxtData.aweme.detail;
                            if (awemeDetail.aweme_id) {
                                console.log('[抖音上传助手] 从NUXT aweme.detail获取视频信息:', awemeDetail.aweme_id);
                                return {
                                    videoId: awemeDetail.aweme_id,
                                    videoUrl: `https://www.douyin.com/video/${awemeDetail.aweme_id}`,
                                    title: awemeDetail.desc
                                };
                            }
                        }

                        // 检查更多可能的数据结构
                        if (nuxtData.data && nuxtData.data.awemeDetail) {
                            const awemeDetail = nuxtData.data.awemeDetail;
                            if (awemeDetail.aweme_id) {
                                console.log('[抖音上传助手] 从NUXT data.awemeDetail获取视频信息:', awemeDetail.aweme_id);
                                return {
                                    videoId: awemeDetail.aweme_id,
                                    videoUrl: `https://www.douyin.com/video/${awemeDetail.aweme_id}`,
                                    title: awemeDetail.desc
                                };
                            }
                        }
                    }
                }
                
                // 2. 尝试从页面脚本中获取视频数据
                const scripts = document.querySelectorAll('script[type="application/json"]');
                console.log(`[抖音上传助手] 找到 ${scripts.length} 个JSON脚本`);
                for (const script of scripts) {
                    try {
                        const data = JSON.parse(script.textContent);
                        if (data && data.props && data.props.pageProps && data.props.pageProps.videoDetail) {
                            const videoDetail = data.props.pageProps.videoDetail;
                            if (videoDetail.aweme_id) {
                                console.log('[抖音上传助手] 从页面脚本获取视频信息:', videoDetail.aweme_id);
                                return {
                                    videoId: videoDetail.aweme_id,
                                    videoUrl: `https://www.douyin.com/video/${videoDetail.aweme_id}`,
                                    title: videoDetail.desc
                                };
                            }
                        }
                    } catch (e) {
                        // 忽略解析错误，继续下一个脚本
                    }
                }
                
                // 3. 尝试从所有脚本标签中查找视频数据
                const allScripts = document.querySelectorAll('script');
                for (const script of allScripts) {
                    try {
                        const scriptText = script.textContent;
                        if (scriptText.includes('aweme_id') || scriptText.includes('videoDetail')) {
                            // 尝试匹配视频ID - 只匹配数字ID
                            const awemeIdMatch = scriptText.match(/aweme_id['":\s]*['"](\d{19}|\d{10,})['"]/);
                            if (awemeIdMatch && awemeIdMatch[1]) {
                                console.log('[抖音上传助手] 从脚本中匹配到视频ID:', awemeIdMatch[1]);
                                return {
                                    videoId: awemeIdMatch[1],
                                    videoUrl: `https://www.douyin.com/video/${awemeIdMatch[1]}`,
                                    title: document.title || '未知标题'
                                };
                            }
                        }
                    } catch (e) {
                        // 忽略解析错误，继续下一个脚本
                    }
                }
                
                // 4. 尝试从页面标题和URL中推断
                const title = document.title;
                // 只匹配数字ID，避免匹配到类名
                const urlMatch = window.location.href.match(/\/video\/(\d{19}|\d{10,})/);
                if (urlMatch && urlMatch[1]) {
                    console.log('[抖音上传助手] 从URL匹配到视频ID:', urlMatch[1]);
                    return {
                        videoId: urlMatch[1],
                        videoUrl: window.location.href,
                        title: title
                    };
                }

                // 5. 尝试从当前播放的视频元素中获取信息
                const currentVideo = this.getCurrentPlayingVideo();
                if (currentVideo) {
                    // 尝试从视频元素的父容器中获取视频信息
                    let container = currentVideo.parentElement;
                    let depth = 0;
                    while (container && container !== document.body && depth < 20) {
                        // 检查容器是否有包含视频ID的属性
                        const dataE2e = container.getAttribute('data-e2e');
                        const containerId = container.getAttribute('id');

                        // 优先检查 data-e2e 和 id 属性（更可靠）
                        if (dataE2e) {
                            const idMatch = dataE2e.match(/(\d{19}|\d{10,})/);
                            if (idMatch && idMatch[1]) {
                                console.log('[抖音上传助手] 从视频容器data-e2e获取视频ID:', idMatch[1]);
                                return {
                                    videoId: idMatch[1],
                                    videoUrl: `https://www.douyin.com/video/${idMatch[1]}`,
                                    title: document.title || '未知标题'
                                };
                            }
                        }

                        if (containerId) {
                            const idMatch = containerId.match(/(\d{19}|\d{10,})/);
                            if (idMatch && idMatch[1]) {
                                console.log('[抖音上传助手] 从视频容器id获取视频ID:', idMatch[1]);
                                return {
                                    videoId: idMatch[1],
                                    videoUrl: `https://www.douyin.com/video/${idMatch[1]}`,
                                    title: document.title || '未知标题'
                                };
                            }
                        }

                        container = container.parentElement;
                        depth++;
                    }
                }
                
                console.log('[抖音上传助手] 未能从页面数据中获取视频信息');
                return null;
            } catch (error) {
                console.error('[抖音上传助手] 获取页面视频数据失败:', error);
                return null;
            }
        }
        
        // 获取当前播放的视频元素
        getCurrentPlayingVideo() {
            try {
                console.log('[抖音上传助手] 开始获取当前播放的视频元素...');
                
                const allVideos = document.querySelectorAll('video');
                console.log(`[抖音上传助手] 找到 ${allVideos.length} 个视频元素`);
                
                if (allVideos.length === 0) {
                    console.log('[抖音上传助手] 未找到任何视频元素');
                    return null;
                }
                
                // 使用评分系统找到最可能是当前播放的视频
                let bestVideo = null;
                let bestScore = -1;
                
                for (let i = 0; i < allVideos.length; i++) {
                    const video = allVideos[i];
                    const score = this.calculateVideoScore(video);
                    console.log(`[抖音上传助手] 视频 ${i} 评分: ${score}`, {
                        src: video.src,
                        paused: video.paused,
                        currentTime: video.currentTime,
                        duration: video.duration
                    });
                    
                    if (score > bestScore) {
                        bestScore = score;
                        bestVideo = video;
                    }
                }
                
                if (bestVideo) {
                    console.log('[抖音上传助手] 选择最佳视频:', {
                        src: bestVideo.src,
                        score: bestScore,
                        paused: bestVideo.paused,
                        currentTime: bestVideo.currentTime,
                        duration: bestVideo.duration
                    });
                } else {
                    console.log('[抖音上传助手] 未找到合适的视频元素');
                }
                
                return bestVideo;
                
            } catch (error) {
                console.error('[抖音上传助手] 获取当前播放视频失败:', error);
                return null;
            }
        }
        
        // 计算视频元素的评分
        calculateVideoScore(video) {
            let score = 0;

            try {
                // 0. 用户交互评分（最高优先级）
                if (this.lastInteractedVideo === video) {
                    const timeSinceInteraction = Date.now() - this.lastInteractionTime;

                    // 如果交互发生在10秒内，给予极高优先级
                    if (timeSinceInteraction < 10000) {
                        score += 5000; // 用户刚交互的视频获得最高分
                        console.log('[抖音上传助手] 用户最近交互的视频，+5000分');
                    } else if (timeSinceInteraction < 30000) {
                        score += 2500; // 30秒内交互仍有较高优先级
                        console.log('[抖音上传助手] 用户近期交互的视频，+2500分');
                    }
                }

                // 0.1 视口可见性评分（基于IntersectionObserver）
                if (this.currentVisibleVideo === video) {
                    score += 1500; // IntersectionObserver确认的可见视频
                    console.log('[抖音上传助手] IntersectionObserver确认的可见视频，+1500分');
                }

                // 1. 播放状态评分（最重要）- 提高权重
                if (!video.paused && !video.ended) {
                    score += 2000; // 正在播放的视频优先级最高（提高至2000）
                    console.log('[抖音上传助手] 视频正在播放，+2000分');

                    // 额外奖励：如果播放时间较长，说明用户正在观看
                    if (video.currentTime > 1) {
                        score += 300;
                        console.log('[抖音上传助手] 视频已播放超过1秒，+300分');
                    }
                } else if (video.currentTime > 0 && !video.ended) {
                    score += 500; // 有播放进度的视频
                    console.log('[抖音上传助手] 视频有播放进度，+500分');
                }

                // 2. 可见性评分（提高权重）
                const visibleArea = this.getVisibleArea(video);
                const viewportArea = window.innerWidth * window.innerHeight;
                const visibleRatio = visibleArea / viewportArea;

                // 对可见性要求更高
                if (visibleRatio > 0.3) {
                    score += visibleRatio * 500; // 提高可见区域分数权重
                    console.log(`[抖音上传助手] 视频可见比例: ${(visibleRatio * 100).toFixed(2)}%, +${Math.round(visibleRatio * 500)}分`);
                } else {
                    // 可见度低，大幅降低分数
                    score += visibleRatio * 100;
                    console.log(`[抖音上传助手] 视频可见比例较低: ${(visibleRatio * 100).toFixed(2)}%, +${Math.round(visibleRatio * 100)}分`);
                }

                // 3. 位置评分（中心位置优先）
                const rect = video.getBoundingClientRect();
                const centerX = window.innerWidth / 2;
                const centerY = window.innerHeight / 2;
                const videoCenterX = rect.left + rect.width / 2;
                const videoCenterY = rect.top + rect.height / 2;
                const distanceFromCenter = Math.sqrt(
                    Math.pow(centerX - videoCenterX, 2) +
                    Math.pow(centerY - videoCenterY, 2)
                );
                const maxDistance = Math.sqrt(Math.pow(centerX, 2) + Math.pow(centerY, 2));
                const centerScore = (1 - distanceFromCenter / maxDistance) * 200;
                score += centerScore;
                console.log(`[抖音上传助手] 视频中心距离: ${distanceFromCenter.toFixed(2)}, +${Math.round(centerScore)}分`);

                // 4. 尺寸评分（较大的视频优先）
                const videoArea = rect.width * rect.height;
                const sizeScore = Math.min(videoArea / (viewportArea * 0.5), 1) * 150;
                score += sizeScore;
                console.log(`[抖音上传助手] 视频尺寸: ${videoArea}, +${Math.round(sizeScore)}分`);

                // 5. 音频评分（有音频的视频优先）- 提高权重
                if (video.muted === false && video.volume > 0) {
                    score += 200; // 提高音频分数
                    console.log('[抖音上传助手] 视频有音频，+200分');
                }

                // 6. 播放进度评分（有播放进度的视频优先）
                if (video.currentTime > 0) {
                    const progressScore = Math.min(video.currentTime / 10, 1) * 50; // 最多50分
                    score += progressScore;
                    console.log(`[抖音上传助手] 播放进度: ${video.currentTime.toFixed(2)}秒, +${Math.round(progressScore)}分`);
                }

                // 7. 容器状态评分（检查父容器是否有激活状态）- 提高权重
                let container = video.parentElement;
                let depth = 0;
                while (container && container !== document.body && depth < 10) {
                    const className = container.className || '';
                    const isActive = className.includes('active') ||
                                   className.includes('playing') ||
                                   className.includes('current') ||
                                   className.includes('selected');

                    if (isActive) {
                        score += 150; // 提高容器激活状态分数
                        console.log('[抖音上传助手] 视频容器处于激活状态，+150分');
                        break;
                    }
                    container = container.parentElement;
                    depth++;
                }

                // 8. 数据属性评分（检查是否有特定的数据属性）
                const dataE2e = video.getAttribute('data-e2e');
                if (dataE2e && dataE2e.includes('video')) {
                    score += 30;
                    console.log('[抖音上传助手] 视频有相关数据属性，+30分');
                }

                // 9. 视频就绪状态评分（新增）
                if (video.readyState >= 2) { // HAVE_CURRENT_DATA 或更高
                    score += 50;
                    console.log('[抖音上传助手] 视频已就绪，+50分');
                }

                // 10. 视频时长评分（新增）- 排除广告等极短视频
                if (video.duration > 5 && video.duration < 600) { // 5秒到10分钟
                    score += 80;
                    console.log(`[抖音上传助手] 视频时长合理(${video.duration.toFixed(1)}秒)，+80分`);
                }

                console.log(`[抖音上传助手] 视频总评分: ${Math.round(score)}`);
                return score;

            } catch (error) {
                console.error('[抖音上传助手] 计算视频评分失败:', error);
                return 0;
            }
        }
        
        // 计算元素的可见区域大小
        getVisibleArea(element) {
            try {
                if (!element) return 0;
                
                const rect = element.getBoundingClientRect();
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;
                
                // 计算元素在视口中的可见部分
                const visibleLeft = Math.max(0, rect.left);
                const visibleTop = Math.max(0, rect.top);
                const visibleRight = Math.min(viewportWidth, rect.right);
                const visibleBottom = Math.min(viewportHeight, rect.bottom);
                
                // 如果元素不在视口中，返回0
                if (visibleRight <= visibleLeft || visibleBottom <= visibleTop) {
                    return 0;
                }
                
                // 计算可见区域的宽度和高度
                const visibleWidth = visibleRight - visibleLeft;
                const visibleHeight = visibleBottom - visibleTop;
                
                // 计算可见区域的面积
                return visibleWidth * visibleHeight;
            } catch (error) {
                console.error('[抖音上传助手] 计算可见区域失败:', error);
                return 0;
            }
        }
        
        // 从元素获取视频链接
        getVideoLinkFromElement(element) {
            try {
                console.log('[抖音上传助手] 尝试从元素获取视频链接...');

                // 1. 直接从元素本身获取链接
                if (element.href && element.href.includes('/video/')) {
                    console.log('[抖音上传助手] 从元素href获取链接:', element.href);
                    return element.href;
                }

                // 2. 如果是视频元素，不要使用src/currentSrc（这些是CDN地址）
                // 而是直接从data属性和父容器中查找视频ID
                if (element.tagName === 'VIDEO') {
                    console.log('[抖音上传助手] 检测到VIDEO元素，跳过src检查，直接查找ID...');
                    
                    // ⚠️ 不再检查 element.src 和 element.currentSrc
                    // 因为这些通常是CDN地址（如 v3-web.douyinvod.com）
                    // 而不是视频详情页链接

                    // 尝试从视频元素的data属性中提取视频ID
                    const videoId = element.getAttribute('data-video-id') ||
                                   element.getAttribute('data-aweme-id') ||
                                   element.getAttribute('data-id');
                    if (videoId && /^\d{10,}$/.test(videoId)) {
                        console.log('[抖音上传助手] 从视频data属性获取ID:', videoId);
                        return `https://www.douyin.com/video/${videoId}`;
                    }

                    // 尝试从父容器的data属性中提取视频ID
                    let container = element.parentElement;
                    let depth = 0;
                    while (container && depth < 15) {
                        // 检查更多可能的属性
                        const containerId = container.getAttribute('data-video-id') ||
                                          container.getAttribute('data-aweme-id') ||
                                          container.getAttribute('data-e2e') ||
                                          container.getAttribute('data-aweme') ||
                                          container.getAttribute('id') ||
                                          container.className;

                        if (containerId) {
                            // 尝试匹配19位或10+位的数字ID
                            const idMatch = containerId.match(/(\d{19}|\d{15,})/);
                            if (idMatch && idMatch[1]) {
                                console.log('[抖音上传助手] 从父容器data属性获取ID:', idMatch[1]);
                                return `https://www.douyin.com/video/${idMatch[1]}`;
                            }
                        }
                        
                        // 检查容器中是否有视频链接
                        const containerLink = container.querySelector('a[href*="/video/"]');
                        if (containerLink && containerLink.href.includes('/video/')) {
                            console.log('[抖音上传助手] 从父容器中的链接获取:', containerLink.href);
                            return containerLink.href;
                        }

                        container = container.parentElement;
                        depth++;
                    }
                    
                    // 特别处理：尝试从video元素的所有属性中查找ID
                    console.log('[抖音上传助手] 尝试从视频元素的所有属性中查找ID...');
                    const allAttrs = element.attributes;
                    for (let i = 0; i < allAttrs.length; i++) {
                        const attr = allAttrs[i];
                        const idMatch = attr.value.match(/(\d{19}|\d{15,})/);
                        if (idMatch && idMatch[1]) {
                            console.log(`[抖音上传助手] 从视频属性 ${attr.name} 获取ID:`, idMatch[1]);
                            return `https://www.douyin.com/video/${idMatch[1]}`;
                        }
                    }
                }

                // 3. 从页面数据中获取当前视频信息
                console.log('[抖音上传助手] 尝试从页面数据获取...');
                const pageData = this.getPageVideoData();
                if (pageData && pageData.videoUrl) {
                    console.log('[抖音上传助手] 从页面数据获取链接:', pageData.videoUrl);
                    return pageData.videoUrl;
                }

                // 4. 从父元素查找链接
                console.log('[抖音上传助手] 尝试从父元素查找链接...');
                let parent = element.parentElement;
                let parentDepth = 0;
                while (parent && parent !== document.body && parentDepth < 10) {
                    const link = parent.querySelector('a[href*="/video/"]');
                    if (link && link.href.includes('/video/')) {
                        console.log('[抖音上传助手] 从父元素找到链接:', link.href);
                        return link.href;
                    }
                    parent = parent.parentElement;
                    parentDepth++;
                }

                // 5. 从兄弟元素查找链接
                console.log('[抖音上传助手] 尝试从兄弟元素查找链接...');
                let sibling = element.nextElementSibling;
                let siblingCount = 0;
                while (sibling && siblingCount < 5) {
                    if (sibling.href && sibling.href.includes('/video/')) {
                        console.log('[抖音上传助手] 从兄弟元素href找到链接:', sibling.href);
                        return sibling.href;
                    }
                    const link = sibling.querySelector('a[href*="/video/"]');
                    if (link && link.href.includes('/video/')) {
                        console.log('[抖音上传助手] 从兄弟元素内找到链接:', link.href);
                        return link.href;
                    }
                    sibling = sibling.nextElementSibling;
                    siblingCount++;
                }

                // 6. 从祖先元素查找链接
                console.log('[抖音上传助手] 尝试从祖先元素查找链接...');
                let ancestor = element.parentElement;
                let ancestorDepth = 0;
                while (ancestor && ancestor !== document.body && ancestorDepth < 15) {
                    if (ancestor.href && ancestor.href.includes('/video/')) {
                        console.log('[抖音上传助手] 从祖先元素href找到链接:', ancestor.href);
                        return ancestor.href;
                    }

                    // 检查祖先元素的data属性
                    const ancestorId = ancestor.getAttribute('data-video-id') ||
                                     ancestor.getAttribute('data-aweme-id');
                    if (ancestorId && /^\d{10,}$/.test(ancestorId)) {
                        console.log('[抖音上传助手] 从祖先元素data属性获取ID:', ancestorId);
                        return `https://www.douyin.com/video/${ancestorId}`;
                    }

                    ancestor = ancestor.parentElement;
                    ancestorDepth++;
                }

                // 7. 最后尝试从当前URL构建
                const currentUrl = window.location.href;
                if (currentUrl.includes('/video/')) {
                    console.log('[抖音上传助手] 从当前URL获取链接:', currentUrl);
                    return currentUrl;
                }

                console.log('[抖音上传助手] 所有方法都未能获取到视频链接');
                return null;

            } catch (error) {
                console.error('[抖音上传助手] 从元素获取视频链接失败:', error);
                return null;
            }
        }
        
        // 检查元素是否在视口中可见
        isElementInViewport(element) {
            try {
                if (!element) return false;
                
                const rect = element.getBoundingClientRect();
                return (
                    rect.top >= 0 &&
                    rect.left >= 0 &&
                    rect.bottom <= window.innerHeight &&
                    rect.right <= window.innerWidth &&
                    rect.width > 0 &&
                    rect.height > 0
                );
            } catch (error) {
                console.error('[抖音上传助手] 检查元素可见性失败:', error);
                return false;
            }
        }
        
        // 模拟分享操作
        simulateShareAction() {
            try {
                // 首先尝试使用精确选择器查找分享按钮
                const shareButton = document.querySelector('#sliderVideo > div.E7R0E__S.playerContainer.hide-animation-if-not-suport-gpu.TkocvtkE > div > div.vqN35AZ4.basePlayerContainer.xg5nzy2Q.chapterPlayerStyle.MediaNotSupportStyle.lowPopup > div.i2VIB6P0 > div > div > div.WU6dkKao > div.JPLz9DCE > div > div.UDziQYJt > div > div > svg');
                
                if (shareButton) {
                    this.performShareAction(shareButton);
                    return;
                }
                
                // 如果精确选择器找不到，尝试多种备用选择器
                const fallbackShareSelectors = [
                    // 通用分享按钮选择器
                    'svg[class*="share"]',
                    '[data-e2e="browse-video-share"]',
                    'button[aria-label*="分享"]',
                    'div[title*="分享"]',
                    // 抖音特定的分享按钮选择器
                    '[class*="share"]',
                    '[class*="Share"]',
                    'div[class*="action-bar"] button',
                    '.action-bar button',
                    // 视频播放器中的分享按钮
                    '.player-container button',
                    '[class*="player"] button',
                    // 通用按钮选择器
                    'button svg',
                    'div[role="button"] svg'
                ];
                
                let shareButtonFound = null;
                for (const selector of fallbackShareSelectors) {
                    const elements = document.querySelectorAll(selector);
                    for (const element of elements) {
                        // 检查元素是否可见
                        if (this.isElementVisible(element)) {
                            // 检查是否是分享相关的按钮
                            if (this.isShareButton(element)) {
                                shareButtonFound = element;
                                break;
                            }
                        }
                    }
                    if (shareButtonFound) break;
                }
                
                if (shareButtonFound) {
                    this.performShareAction(shareButtonFound);
                } else {
                    // 如果还是找不到，尝试文本匹配
                    const allButtons = document.querySelectorAll('button, div[role="button"], svg');
                    for (const btn of allButtons) {
                        if (this.isElementVisible(btn) && this.isShareButton(btn)) {
                            this.performShareAction(btn);
                            return;
                        }
                    }
                    
                    Utils.showToast('未找到分享按钮，请手动输入链接', 'warning');
                }
            } catch (error) {
                console.error('[抖音上传助手] 模拟分享操作失败:', error);
                Utils.showToast('自动获取失败，请手动输入链接', 'error');
            }
        }
        
        // 执行分享操作
        performShareAction(shareButton) {
            try {
                // 点击分享按钮
                shareButton.click();
                Utils.showToast('已点击分享按钮，正在查找复制链接...', 'info');
                
                // 等待分享菜单出现
                setTimeout(() => {
                    this.findAndClickCopyButton();
                }, 1000);
            } catch (error) {
                console.error('[抖音上传助手] 执行分享操作失败:', error);
                Utils.showToast('分享操作失败，请手动输入链接', 'error');
            }
        }
        
        // 查找并点击复制链接按钮
        findAndClickCopyButton() {
            try {
                // 首先尝试使用精确选择器查找复制链接按钮
                const copyButton = document.querySelector('div > div > div:nth-child(2) > div > button.FmP4URQv.y1puhiha');
                
                if (copyButton && this.isElementVisible(copyButton)) {
                    this.performCopyAction(copyButton);
                    return;
                }
                
                // 如果精确选择器找不到，尝试多种备用选择器
                const fallbackCopySelectors = [
                    // 通用复制按钮选择器
                    'button[class*="copy"]',
                    'button[aria-label*="复制"]',
                    'div[class*="copy"]',
                    '[data-e2e="copy-link"]',
                    // 抖音特定的复制按钮选择器
                    '[class*="Copy"]',
                    'button[class*="link"]',
                    'div[class*="link"]',
                    // 分享菜单中的按钮
                    '.share-menu button',
                    '.share-popup button',
                    '[class*="share-menu"] button',
                    '[class*="share-popup"] button'
                ];
                
                let copyButtonFound = null;
                for (const selector of fallbackCopySelectors) {
                    const elements = document.querySelectorAll(selector);
                    for (const element of elements) {
                        if (this.isElementVisible(element) && this.isCopyButton(element)) {
                            copyButtonFound = element;
                            break;
                        }
                    }
                    if (copyButtonFound) break;
                }
                
                if (copyButtonFound) {
                    this.performCopyAction(copyButtonFound);
                } else {
                    // 如果还是找不到，尝试文本匹配
                    const allButtons = document.querySelectorAll('button, div[role="button"]');
                    for (const btn of allButtons) {
                        if (this.isElementVisible(btn) && this.isCopyButton(btn)) {
                            this.performCopyAction(btn);
                            return;
                        }
                    }
                    
                    Utils.showToast('未找到复制链接按钮，请手动复制', 'warning');
                }
            } catch (error) {
                console.error('[抖音上传助手] 查找复制按钮失败:', error);
                Utils.showToast('查找复制按钮失败，请手动复制', 'error');
            }
        }
        
        // 执行复制操作
        performCopyAction(copyButton) {
            try {
                copyButton.click();
                Utils.showToast('已复制链接，正在获取...', 'info');
                
                // 等待一下，然后尝试从剪贴板获取
                setTimeout(() => {
                    this.pasteFromClipboard();
                }, 500);
            } catch (error) {
                console.error('[抖音上传助手] 执行复制操作失败:', error);
                Utils.showToast('复制操作失败，请手动复制', 'error');
            }
        }
        
        // 检查元素是否可见
        isElementVisible(element) {
            if (!element) return false;
            
            const style = window.getComputedStyle(element);
            return style.display !== 'none' &&
                   style.visibility !== 'hidden' &&
                   style.opacity !== '0' &&
                   element.offsetWidth > 0 &&
                   element.offsetHeight > 0;
        }
        
        // 检查是否是分享按钮
        isShareButton(element) {
            if (!element) return false;
            
            // 检查属性
            const ariaLabel = element.getAttribute('aria-label') || '';
            const title = element.getAttribute('title') || '';
            const className = element.className || '';
            const textContent = element.textContent || '';
            
            // 检查是否包含分享相关的关键词
            const shareKeywords = ['分享', 'share', '发送', 'send'];
            
            for (const keyword of shareKeywords) {
                if (ariaLabel.includes(keyword) ||
                    title.includes(keyword) ||
                    className.includes(keyword) ||
                    textContent.includes(keyword)) {
                    return true;
                }
            }
            
            // 检查SVG元素
            if (element.tagName === 'SVG') {
                // 检查SVG的viewBox或其他属性是否表明这是分享图标
                const parent = element.parentElement;
                if (parent) {
                    const parentAriaLabel = parent.getAttribute('aria-label') || '';
                    const parentTitle = parent.getAttribute('title') || '';
                    const parentClassName = parent.className || '';
                    
                    for (const keyword of shareKeywords) {
                        if (parentAriaLabel.includes(keyword) ||
                            parentTitle.includes(keyword) ||
                            parentClassName.includes(keyword)) {
                            return true;
                        }
                    }
                }
            }
            
            return false;
        }
        
        // 检查是否是复制按钮
        isCopyButton(element) {
            if (!element) return false;
            
            // 检查属性
            const ariaLabel = element.getAttribute('aria-label') || '';
            const title = element.getAttribute('title') || '';
            const className = element.className || '';
            const textContent = element.textContent || '';
            
            // 检查是否包含复制相关的关键词
            const copyKeywords = ['复制', 'copy', '链接', 'link'];
            
            for (const keyword of copyKeywords) {
                if (ariaLabel.includes(keyword) ||
                    title.includes(keyword) ||
                    className.includes(keyword) ||
                    textContent.includes(keyword)) {
                    return true;
                }
            }
            
            return false;
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
                
                // 验证解析的视频是否与当前播放的视频匹配
                const isMatch = this.verifyVideoMatch(videoUrl, videoInfo);
                if (!isMatch) {
                    Utils.showToast('⚠️ 警告：解析的视频可能与当前播放的视频不匹配', 'warning', 5000);
                    console.warn('[抖音上传助手] 视频匹配验证失败', {
                        inputUrl: videoUrl,
                        parsedUrl: videoInfo.url,
                        currentUrl: this.currentVideoUrl,
                        pageUrl: window.location.href
                    });
                } else {
                    console.log('[抖音上传助手] 视频匹配验证成功');
                }
                
                this.showVideoPreview(videoInfo);
                Utils.showToast('解析成功', 'success');
                
            } catch (error) {
                Utils.showToast(error.message, 'error');
            }
        }
        
        // 验证解析的视频是否与当前播放的视频匹配
        verifyVideoMatch(inputUrl, videoInfo) {
            try {
                // 1. 检查输入URL与当前页面URL是否匹配
                const currentPageUrl = window.location.href;
                const inputVideoId = this.extractVideoId(inputUrl);
                const currentPageVideoId = this.extractVideoId(currentPageUrl);
                
                if (inputVideoId && currentPageVideoId && inputVideoId !== currentPageVideoId) {
                    console.warn('[抖音上传助手] 输入URL与当前页面URL不匹配', {
                        inputVideoId,
                        currentPageVideoId
                    });
                    return false;
                }
                
                // 2. 检查解析的视频URL与当前缓存的URL是否匹配
                if (this.currentVideoUrl) {
                    const currentVideoId = this.extractVideoId(this.currentVideoUrl);
                    const parsedVideoId = this.extractVideoId(videoInfo.url);
                    
                    if (currentVideoId && parsedVideoId && currentVideoId !== parsedVideoId) {
                        console.warn('[抖音上传助手] 解析的视频URL与当前缓存的URL不匹配', {
                            currentVideoId,
                            parsedVideoId,
                            currentUrl: this.currentVideoUrl,
                            parsedUrl: videoInfo.url
                        });
                        return false;
                    }
                }
                
                // 3. 检查当前播放的视频元素源是否与解析的URL匹配
                const currentVideoElement = this.getCurrentPlayingVideo();
                if (currentVideoElement && currentVideoElement.src) {
                    const elementVideoId = this.extractVideoId(currentVideoElement.src);
                    const parsedVideoId = this.extractVideoId(videoInfo.url);
                    
                    if (elementVideoId && parsedVideoId && elementVideoId !== parsedVideoId) {
                        console.warn('[抖音上传助手] 视频元素源与解析的URL不匹配', {
                            elementVideoId,
                            parsedVideoId,
                            elementSrc: currentVideoElement.src,
                            parsedUrl: videoInfo.url
                        });
                        return false;
                    }
                }
                
                // 4. 检查页面中是否有可见的视频链接与解析的URL匹配
                const videoLinks = document.querySelectorAll('a[href*="/video/"]');
                for (const link of videoLinks) {
                    if (this.isElementInViewport(link)) {
                        const linkVideoId = this.extractVideoId(link.href);
                        const parsedVideoId = this.extractVideoId(videoInfo.url);
                        
                        if (linkVideoId && parsedVideoId && linkVideoId === parsedVideoId) {
                            // 找到匹配的可见链接，认为验证通过
                            return true;
                        }
                    }
                }
                
                // 如果没有找到明确的匹配项，但也没有发现不匹配，则认为验证通过
                return true;
                
            } catch (error) {
                console.error('[抖音上传助手] 视频匹配验证失败:', error);
                // 验证过程出错时，不阻止解析流程
                return true;
            }
        }
        
        // 从URL中提取视频ID
        extractVideoId(url) {
            if (!url) return null;
            
            try {
                // ⚠️ 首先检查并拒绝CDN地址
                // CDN地址通常包含 .douyinvod.com, .douyinpic.com 等
                if (url.includes('douyinvod.com') || 
                    url.includes('douyinpic.com') ||
                    url.includes('douyinstatic.com') ||
                    url.includes('/tos/') ||
                    url.includes('.mp4') ||
                    url.includes('aweme/v1')) {
                    console.log('[抖音上传助手] ✗ 拒绝CDN地址:', url.substring(0, 100));
                    return null;
                }
                
                // 抖音视频URL格式: https://www.douyin.com/video/xxxxx
                // 抖音视频ID通常是19位数字
                const videoMatch = url.match(/\/video\/(\d{19})/);
                if (videoMatch && videoMatch[1]) {
                    console.log('[抖音上传助手] ✓ 提取到19位视频ID:', videoMatch[1]);
                    return videoMatch[1];
                }

                // 短链接格式: https://v.douyin.com/xxxxx
                const shortMatch = url.match(/v\.douyin\.com\/([A-Za-z0-9]{7,11})/);
                if (shortMatch && shortMatch[1]) {
                    console.log('[抖音上传助手] ✓ 提取到短链接ID:', shortMatch[1]);
                    return shortMatch[1];
                }

                // 备用：尝试匹配任意长度的数字ID（但必须包含 /video/ 路径）
                const numericIdMatch = url.match(/\/video\/(\d+)/);
                if (numericIdMatch && numericIdMatch[1] && numericIdMatch[1].length >= 10) {
                    console.log('[抖音上传助手] ✓ 提取到数字视频ID:', numericIdMatch[1]);
                    return numericIdMatch[1];
                }

                console.log('[抖音上传助手] ✗ URL格式不匹配:', url.substring(0, 100));
                return null;
            } catch (error) {
                console.error('[抖音上传助手] 提取视频ID失败:', error);
                return null;
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
            
            // 禁用上传按钮，防止重复点击
            const uploadButton = document.getElementById('dy-btn-upload');
            const originalText = uploadButton.textContent;
            uploadButton.disabled = true;
            uploadButton.textContent = '⏳ 上传中...';
            
            // 创建进度显示元素
            const progressContainer = document.createElement('div');
            progressContainer.className = 'dy-upload-progress';
            progressContainer.innerHTML = `
                <div class="dy-progress-bar">
                    <div class="dy-progress-fill" style="width: 0%"></div>
                </div>
                <div class="dy-progress-text">准备上传...</div>
            `;
            
            // 插入进度条到上传按钮后面
            uploadButton.parentNode.insertBefore(progressContainer, uploadButton.nextSibling);
            
            try {
                AppState.isUploading = true;
                
                const uploadPath = await UploadService.uploadToWebDAV(
                    AppState.currentVideoInfo,
                    webdavConfig,
                    (progress, message) => {
                        // 更新进度条
                        const progressFill = progressContainer.querySelector('.dy-progress-fill');
                        const progressText = progressContainer.querySelector('.dy-progress-text');
                        
                        if (progressFill) {
                            progressFill.style.width = `${progress}%`;
                        }
                        
                        if (progressText) {
                            progressText.textContent = message || `上传进度: ${progress}%`;
                        }
                        
                        // 只在关键节点显示Toast通知
                        if (progress === 100) {
                            Utils.showToast('上传完成！', 'success');
                        } else if (progress < 10) {
                            Utils.showToast('开始上传...', 'info', 2000);
                        }
                    }
                );
                
                // 显示成功消息，包含文件路径
                Utils.showToast(`上传成功！文件已保存到: ${uploadPath}`, 'success', 5000);
                
                // 添加到历史记录（如果有的话）
                this.addToHistory(AppState.currentVideoInfo, uploadPath);
                
            } catch (error) {
                console.error('[抖音上传助手] 上传失败:', error);
                
                // 显示详细错误信息
                const errorMessage = error.message || '上传失败';
                Utils.showToast(errorMessage, 'error', 5000);
                
                // 如果是认证错误，提供解决方案
                if (errorMessage.includes('身份验证') || errorMessage.includes('401')) {
                    setTimeout(() => {
                        Utils.showToast('提示：请检查WebDAV配置中的用户名和密码是否正确', 'info', 5000);
                    }, 1000);
                }
                
            } finally {
                AppState.isUploading = false;
                
                // 恢复上传按钮
                uploadButton.disabled = false;
                uploadButton.textContent = originalText;
                
                // 延迟移除进度条
                setTimeout(() => {
                    if (progressContainer.parentNode) {
                        progressContainer.parentNode.removeChild(progressContainer);
                    }
                }, 3000);
            }
        }
        
        // 添加到历史记录
        addToHistory(videoInfo, uploadPath) {
            try {
                const history = GM_getValue(STORAGE_KEYS.HISTORY, '[]');
                const historyData = JSON.parse(history);
                
                const historyItem = {
                    id: Date.now(),
                    title: videoInfo.title,
                    author: videoInfo.author,
                    duration: videoInfo.duration,
                    size: videoInfo.size,
                    uploadPath: uploadPath,
                    uploadTime: new Date().toISOString(),
                    videoUrl: videoInfo.url
                };
                
                // 添加到历史记录开头
                historyData.unshift(historyItem);
                
                // 限制历史记录数量
                if (historyData.length > 100) {
                    historyData.splice(100);
                }
                
                GM_setValue(STORAGE_KEYS.HISTORY, JSON.stringify(historyData));
                console.log('[抖音上传助手] 已添加到历史记录:', historyItem);
                
            } catch (error) {
                console.error('[抖音上传助手] 添加历史记录失败:', error);
            }
        }
        
        // 测试WebDAV连接
        async testWebDAVConnection() {
            const webdavSelect = document.getElementById('dy-webdav-select');
            const webdavId = webdavSelect.value;
            
            if (!webdavId) {
                Utils.showToast('请先选择WebDAV服务器', 'warning');
                return;
            }
            
            const webdavConfigs = ConfigManager.getWebDAVConfigs();
            let webdavConfig = webdavConfigs.find(c => c.id === webdavId);
            
            if (!webdavConfig) {
                Utils.showToast('WebDAV配置错误', 'error');
                return;
            }
            
            // 验证和修复WebDAV配置
            try {
                webdavConfig = ConfigManager.validateAndFixWebDAVConfig(webdavConfig);
                console.log('[抖音上传助手] 验证后的WebDAV配置:', webdavConfig);
            } catch (error) {
                Utils.showToast(`WebDAV配置验证失败: ${error.message}`, 'error');
                return;
            }
            
            // 禁用测试按钮，防止重复点击
            const testButton = document.getElementById('dy-btn-test-webdav');
            const originalText = testButton.textContent;
            testButton.disabled = true;
            testButton.textContent = '⏳ 测试中...';
            
            try {
                Utils.showToast('正在测试WebDAV连接...', 'info');
                
                // 构建测试路径
                const baseUrl = webdavConfig.url.replace(/\/$/, '');
                let testUrl = baseUrl;
                
                if (webdavConfig.basePath) {
                    const normalizedBasePath = webdavConfig.basePath.replace(/^\/+|\/+$/g, '');
                    if (normalizedBasePath) {
                        testUrl = `${baseUrl}/${normalizedBasePath}`;
                    }
                }
                
                // 发送PROPFIND请求测试连接
                const auth = btoa(`${webdavConfig.username}:${webdavConfig.password}`);
                
                GM_xmlhttpRequest({
                    method: 'PROPFIND',
                    url: testUrl,
                    headers: {
                        'Authorization': `Basic ${auth}`,
                        'Depth': '0',
                        'Content-Type': 'application/xml'
                    },
                    onload: (response) => {
                        // 恢复测试按钮
                        testButton.disabled = false;
                        testButton.textContent = originalText;
                        
                        if (response.status === 207 || response.status === 200) {
                            Utils.showToast('WebDAV连接测试成功！', 'success');
                            
                            // 检查写入权限
                            this.checkWebDAVWritePermission(webdavConfig, testUrl);
                        } else if (response.status === 401) {
                            Utils.showToast('身份验证失败：请检查用户名和密码是否正确', 'error');
                        } else if (response.status === 403) {
                            Utils.showToast('权限不足：请检查用户权限设置', 'error');
                        } else if (response.status === 404) {
                            Utils.showToast('服务器地址错误：请检查WebDAV地址是否正确', 'error');
                        } else {
                            Utils.showToast(`连接测试失败: HTTP ${response.status}`, 'error');
                        }
                    },
                    onerror: (error) => {
                        // 恢复测试按钮
                        testButton.disabled = false;
                        testButton.textContent = originalText;
                        
                        console.error('[抖音上传助手] WebDAV连接测试错误:', error);
                        Utils.showToast('连接测试失败：请检查网络连接', 'error');
                    },
                    ontimeout: () => {
                        // 恢复测试按钮
                        testButton.disabled = false;
                        testButton.textContent = originalText;
                        
                        Utils.showToast('连接测试超时：请检查网络连接', 'error');
                    },
                    timeout: 10000
                });
                
            } catch (error) {
                // 恢复测试按钮
                testButton.disabled = false;
                testButton.textContent = originalText;
                
                console.error('[抖音上传助手] 测试WebDAV连接失败:', error);
                Utils.showToast('测试失败：请检查配置信息', 'error');
            }
        }
        
        // 检查WebDAV写入权限
        checkWebDAVWritePermission(webdavConfig, testUrl) {
            try {
                // 创建一个测试文件来检查写入权限
                const testFileName = `.test_${Date.now()}.txt`;
                const testFileUrl = `${testUrl}/${testFileName}`;
                const testContent = 'WebDAV写入权限测试文件';
                
                const auth = btoa(`${webdavConfig.username}:${webdavConfig.password}`);
                
                GM_xmlhttpRequest({
                    method: 'PUT',
                    url: testFileUrl,
                    headers: {
                        'Authorization': `Basic ${auth}`,
                        'Content-Type': 'text/plain',
                        'Content-Length': testContent.length.toString()
                    },
                    data: testContent,
                    onload: (response) => {
                        if (response.status === 201 || response.status === 204 || response.status === 200) {
                            // 删除测试文件
                            this.deleteTestFile(testFileUrl, auth);
                            Utils.showToast('WebDAV写入权限正常', 'success');
                        } else {
                            Utils.showToast('写入权限不足：请检查WebDAV服务器权限设置', 'error');
                        }
                    },
                    onerror: () => {
                        Utils.showToast('写入权限测试失败：请检查WebDAV服务器权限设置', 'error');
                    },
                    timeout: 5000
                });
                
            } catch (error) {
                console.error('[抖音上传助手] 检查写入权限失败:', error);
            }
        }
        
        // 删除测试文件
        deleteTestFile(testFileUrl, auth) {
            try {
                GM_xmlhttpRequest({
                    method: 'DELETE',
                    url: testFileUrl,
                    headers: {
                        'Authorization': `Basic ${auth}`
                    },
                    onload: () => {
                        console.log('[抖音上传助手] 测试文件已删除');
                    },
                    onerror: () => {
                        console.warn('[抖音上传助手] 删除测试文件失败，可能需要手动清理');
                    },
                    timeout: 5000
                });
            } catch (error) {
                console.error('[抖音上传助手] 删除测试文件失败:', error);
            }
        }
        
        // 修复WebDAV密码
        fixWebDAVPassword() {
            const webdavSelect = document.getElementById('dy-webdav-select');
            const webdavId = webdavSelect.value;
            
            if (!webdavId) {
                Utils.showToast('请先选择WebDAV服务器', 'warning');
                return;
            }
            
            const webdavConfigs = ConfigManager.getWebDAVConfigs();
            const webdavConfig = webdavConfigs.find(c => c.id === webdavId);
            
            if (!webdavConfig) {
                Utils.showToast('WebDAV配置错误', 'error');
                return;
            }
            
            // 创建密码输入对话框
            const passwordDialog = document.createElement('div');
            passwordDialog.className = 'dy-password-dialog';
            passwordDialog.innerHTML = `
                <div class="dy-password-overlay"></div>
                <div class="dy-password-content">
                    <div class="dy-password-header">
                        <h3>🔑 修复WebDAV密码</h3>
                        <button class="dy-btn-close">×</button>
                    </div>
                    <div class="dy-password-body">
                        <div class="dy-form-group">
                            <label>服务器名称</label>
                            <input type="text" id="fix-server-name" class="dy-form-input" value="${webdavConfig.name}" readonly>
                        </div>
                        <div class="dy-form-group">
                            <label>服务器地址</label>
                            <input type="text" id="fix-server-url" class="dy-form-input" value="${webdavConfig.url}" readonly>
                        </div>
                        <div class="dy-form-group">
                            <label>用户名</label>
                            <input type="text" id="fix-server-username" class="dy-form-input" value="${webdavConfig.username}" readonly>
                        </div>
                        <div class="dy-form-group">
                            <label>密码</label>
                            <input type="password" id="fix-server-password" class="dy-form-input" placeholder="请输入正确的密码">
                        </div>
                        <div class="dy-form-group">
                            <label class="dy-checkbox-label">
                                <input type="checkbox" id="fix-save-plaintext" checked>
                                <span class="dy-checkbox"></span>
                                保存为明文（不加密）
                            </label>
                        </div>
                    </div>
                    <div class="dy-password-footer">
                        <button id="fix-password-cancel" class="dy-btn dy-btn-secondary">取消</button>
                        <button id="fix-password-save" class="dy-btn dy-btn-primary">保存</button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(passwordDialog);
            
            // 绑定事件
            passwordDialog.querySelector('.dy-btn-close').addEventListener('click', () => {
                document.body.removeChild(passwordDialog);
            });
            
            passwordDialog.querySelector('.dy-password-overlay').addEventListener('click', () => {
                document.body.removeChild(passwordDialog);
            });
            
            passwordDialog.querySelector('#fix-password-cancel').addEventListener('click', () => {
                document.body.removeChild(passwordDialog);
            });
            
            passwordDialog.querySelector('#fix-password-save').addEventListener('click', () => {
                this.saveFixedPassword(webdavConfig, passwordDialog);
            });
            
            // 显示动画
            setTimeout(() => {
                passwordDialog.classList.add('show');
            }, 10);
        }
        
        // 保存修复后的密码
        saveFixedPassword(webdavConfig, dialog) {
            const newPassword = dialog.querySelector('#fix-server-password').value;
            const saveAsPlaintext = dialog.querySelector('#fix-save-plaintext').checked;
            
            if (!newPassword) {
                Utils.showToast('请输入密码', 'warning');
                return;
            }
            
            try {
                // 获取所有WebDAV配置
                const webdavConfigs = ConfigManager.getWebDAVConfigs();
                const configIndex = webdavConfigs.findIndex(c => c.id === webdavConfig.id);
                
                if (configIndex !== -1) {
                    // 更新配置
                    webdavConfigs[configIndex].password = saveAsPlaintext ? newPassword : ConfigManager.encrypt(newPassword);
                    
                    // 保存配置
                    if (ConfigManager.saveWebDAVConfigs(webdavConfigs)) {
                        Utils.showToast('密码已更新，请重新测试连接', 'success');
                        
                        // 刷新选择框
                        this.refreshSelects();
                        
                        // 移除对话框
                        document.body.removeChild(dialog);
                        
                        // 自动测试连接
                        setTimeout(() => {
                            this.testWebDAVConnection();
                        }, 1000);
                    } else {
                        Utils.showToast('保存失败', 'error');
                    }
                }
            } catch (error) {
                console.error('[抖音上传助手] 保存密码失败:', error);
                Utils.showToast('保存失败', 'error');
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
            this.configDialog.show();
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
    
    // 将配置对话框实例暴露到全局作用域
    window.configDialog = null;
    
    // 启动应用
    const app = new DouyinUploadHelper();
    window.configDialog = app.configDialog;
    
})();