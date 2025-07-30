import { ConversionTask, BatchTask, TaskStatus, VideoParserConfig, WebDAVConfig, ParsedVideoInfo, MediaType } from '@/types'
import { CleanupService } from './cleanup'
import { FilenameSanitizer } from './filename-sanitizer'





export class ConversionService {
  // 解析视频链接
  static async parseVideo(videoUrl: string, parserConfig: VideoParserConfig): Promise<ParsedVideoInfo> {
    // 首先验证输入参数
    if (!videoUrl || typeof videoUrl !== 'string' || !videoUrl.trim()) {
      throw new Error('视频URL为空')
    }
    
    if (!parserConfig || !parserConfig.apiUrl) {
      throw new Error('解析API配置无效')
    }
    
    try {
      // 处理分享文本，提取真实URL
      const extractedUrl = this.extractRealUrl(videoUrl)
      console.log(`[转存] 提取到URL: ${extractedUrl}`)
      console.log(`[转存] 发送解析请求，URL: ${extractedUrl.substring(0, 50)}...`)
      
      const response = await fetch('/api/proxy/parser', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          videoUrl: extractedUrl, // 使用提取后的URL
          parserConfig
        })
      })

      // {{ AURA: Modify - 添加解析API的JSON错误处理 }}
      let result;
      try {
        const responseText = await response.text();
        console.log(`[转存] 解析API响应状态: ${response.status}, 内容长度: ${responseText.length}`);
        
        if (!responseText.trim()) {
          throw new Error(`解析服务器返回空响应 (HTTP ${response.status})`);
        }
        
        result = JSON.parse(responseText);
      } catch (parseError) {
        console.error('[转存] 解析API JSON解析失败:', parseError);
        console.error('[转存] 解析API响应状态:', response.status, response.statusText);
        
        // 尝试获取部分响应内容用于调试
        const responseText = await response.text().catch(() => '无法获取响应文本');
        const truncatedText = responseText.substring(0, 500);
        
        throw new Error(`解析API JSON解析失败 (HTTP ${response.status}): ${parseError instanceof Error ? parseError.message : '未知解析错误'}. 响应片段: ${truncatedText}`);
      }
      
      if (!result.success) {
        throw new Error(result.error || '视频解析失败')
      }
      
      // 验证返回的数据
      if (!result.data) {
        throw new Error('API返回的数据为空')
      }
      
      // {{ AURA: Modify - 移除测试API调用，直接验证数据完整性 }}
      // 对于视频类型，检查URL字段
      if (result.data.mediaType === MediaType.VIDEO && !result.data.url) {
        throw new Error('视频解析成功但未返回有效的视频URL')
      }
      
      // 对于视频类型，确保URL字段是有效的网址
      if (result.data.mediaType === MediaType.VIDEO && result.data.url) {
        try {
          new URL(result.data.url)
        } catch {
          throw new Error(`返回的URL无效: ${result.data.url}`)
        }
      }
      
      // 对于图集类型，检查图片数组
      if (result.data.mediaType === MediaType.IMAGE_ALBUM) {
        if (!result.data.images || result.data.images.length === 0) {
          throw new Error('图集解析成功但没有找到任何图片')
        }
        console.log(`[转存] 图集解析成功，包含 ${result.data.images.length} 张图片`)
      }

      console.log(`[转存] 解析成功，获取到${result.data.mediaType === MediaType.VIDEO ? '视频' : '图集'}: ${result.data.title}`)
      // {{ AURA: Modify - 修复图集解析时url.substring错误，添加类型判断 }}
      if (result.data.mediaType === MediaType.VIDEO && result.data.url && typeof result.data.url === 'string') {
        console.log(`[转存] 视频URL: ${result.data.url.substring(0, 50)}...`)
      } else if (result.data.mediaType === MediaType.IMAGE_ALBUM && result.data.images) {
        console.log(`[转存] 图集包含 ${result.data.images.length} 张图片`)
      }
      
      return result.data
    } catch (error) {
      console.error('[转存] 视频解析错误:', error)
      throw error
    }
  }

  // 上传媒体到WebDAV
  static async uploadToWebDAV(
    mediaInfo: ParsedVideoInfo,
    webdavConfig: WebDAVConfig,
    folderPath?: string
  ): Promise<string> {
    const maxRetries = 5; // 增加最大重试次数到5次
    let attempt = 0;
    let lastError;
    
    // 根据媒体类型生成文件名
    let fileName = '';
    if (mediaInfo.mediaType === MediaType.VIDEO && mediaInfo.url) {
      // 视频文件名
      const format = this.inferVideoFormat(mediaInfo.format, mediaInfo.url);
      fileName = this.generateFileName(mediaInfo.title, format);
    } else if (mediaInfo.mediaType === MediaType.IMAGE_ALBUM && mediaInfo.images && mediaInfo.images.length > 0) {
      // 图集文件夹名 - 使用解析后的标题名称
      fileName = this.generateFolderName(mediaInfo.title);
    }
    
    while (attempt < maxRetries) {
      try {
        attempt++;
        console.log(`[转存] WebDAV上传尝试 ${attempt}/${maxRetries}: ${mediaInfo.mediaType === MediaType.VIDEO ? '视频' : '图集'}`);
        
        const response = await fetch('/api/proxy/webdav', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            videoUrl: mediaInfo.mediaType === MediaType.VIDEO ? mediaInfo.url : undefined, // 视频URL
            images: mediaInfo.mediaType === MediaType.IMAGE_ALBUM ? mediaInfo.images : undefined, // 图集图片列表
            webdavConfig,
            fileName, // 文件名
            folderPath: folderPath || ''
          })
        });

        // {{ AURA: Modify - 添加更强的JSON解析错误处理 }}
        let result;
        try {
          const responseText = await response.text();
          console.log(`[转存] 原始响应状态: ${response.status}, 内容长度: ${responseText.length}`);
          
          if (!responseText.trim()) {
            throw new Error(`服务器返回空响应 (HTTP ${response.status})`);
          }
          
          result = JSON.parse(responseText);
        } catch (parseError) {
          console.error('[转存] JSON解析失败:', parseError);
          console.error('[转存] 响应状态:', response.status, response.statusText);
          
          // 尝试获取部分响应内容用于调试
          const responseText = await response.text().catch(() => '无法获取响应文本');
          const truncatedText = responseText.substring(0, 500);
          
          throw new Error(`JSON解析失败 (HTTP ${response.status}): ${parseError instanceof Error ? parseError.message : '未知解析错误'}. 响应片段: ${truncatedText}`);
        }
        
        if (!result.success) {
          // 对于403/401错误，在第一次尝试时进行重试
          const shouldRetryImmediately =
            (result.error?.includes('403') || result.error?.includes('401')) &&
            attempt === 1;
            
          if (shouldRetryImmediately) {
            console.log('[转存] 权限错误，立即进行重试');
            // 等待一小段时间后立即重试
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
          }
          
          // 对于404错误，提供更具体的错误信息
          let errorMessage = result.error || '媒体上传失败';
          if (result.error?.includes('404')) {
            errorMessage = `上传路径不存在 (404)。请检查WebDAV服务器地址和路径配置是否正确。错误详情: ${result.error}`;
          }
          
          throw new Error(errorMessage);
        }

        console.log(`[转存] 上传成功，尝试次数: ${attempt}`);
        return result.filePath;
        
      } catch (error) {
        lastError = error;
        console.error(`[转存] 上传尝试 ${attempt} 失败:`, error);
        
        // 检查是否需要重试
        const shouldRetry = this.shouldRetryUpload(error, attempt);
        if (attempt < maxRetries && shouldRetry) {
          // 使用指数退避策略
          const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // 最大等待10秒
          console.log(`[转存] 等待 ${waitTime/1000} 秒后重试...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        } else {
          break; // 不再重试
        }
      }
    }
    
    // 所有尝试都失败
    console.error('[转存] 所有上传尝试均失败');
    throw lastError || new Error('视频上传失败，已达到最大重试次数');
  }

  // 单个视频转存
  static async convertSingle(
    task: ConversionTask,
    parserConfig: VideoParserConfig,
    webdavConfig: WebDAVConfig,
    onProgress?: (progress: number, status: TaskStatus) => void
  ): Promise<ConversionTask> {
    try {
      // 更新状态为解析中
      task.status = TaskStatus.PARSING
      onProgress?.(20, TaskStatus.PARSING)
      
      console.log(`[转存] 开始解析视频: ${task.videoUrl}`)
      console.log(`[转存] 使用解析器: ${parserConfig.name} (${parserConfig.apiUrl})`)

      // 解析视频
      try {
        // 添加视频URL格式检查
        if (!this.isValidUrl(task.videoUrl)) {
          throw new Error('视频链接格式无效，请确保以http://或https://开头')
        }
        
        // {{ AURA: Modify - 移除备用测试模式，直接使用主解析结果 }}
        let parsedInfo;
        
        try {
          parsedInfo = await this.parseVideo(task.videoUrl, parserConfig)
          console.log(`[转存] 解析成功，媒体类型: ${parsedInfo.mediaType}`)
        } catch (parseError) {
          console.error('[转存] 解析失败:', parseError)
          throw parseError
        }
        
        task.parsedVideoInfo = parsedInfo
        task.videoTitle = parsedInfo.title
        console.log(`[转存] 解析完成: ${parsedInfo.title}`)
      } catch (error) {
        console.error('[转存] 视频解析失败:', error)
        task.status = TaskStatus.FAILED
        let errorMsg = error instanceof Error ? error.message : '视频解析失败'
        
        // 添加更友好的错误信息
        if (errorMsg.includes('URL为空')) {
          errorMsg = 'URL为空 - 解析API无法提取视频URL，请尝试其他解析API或检查链接'
        }
        
        task.error = errorMsg
        task.completedAt = new Date()
        return task
      }

      onProgress?.(50, TaskStatus.PARSING)
      
      // 更新状态为上传中
      task.status = TaskStatus.UPLOADING
      onProgress?.(60, TaskStatus.UPLOADING)

      // 上传媒体
      const filePath = await this.uploadToWebDAV(
        task.parsedVideoInfo!, 
        webdavConfig
      )

      // 更新任务状态
      task.status = TaskStatus.SUCCESS
      task.completedAt = new Date()
      task.uploadResult = {
        success: true,
        filePath
      }

      onProgress?.(100, TaskStatus.SUCCESS)

// 任务完成后执行清理
      await CleanupService.cleanupAfterTaskCompletion(task);
      return task
    } catch (error) {
      // 更新任务为失败状态
      task.status = TaskStatus.FAILED
      task.completedAt = new Date()
      task.error = error instanceof Error ? error.message : '转存过程中发生未知错误'
      task.uploadResult = {
        success: false,
        error: task.error
      }

// 任务完成后执行清理
      await CleanupService.cleanupAfterTaskCompletion(task);
      onProgress?.(0, TaskStatus.FAILED)

      return task
    }
  }

  // 批量转存
  static async convertBatch(
    batchTask: BatchTask,
    onProgress?: (batchProgress: number, currentTask?: ConversionTask) => void
  ): Promise<BatchTask> {
    batchTask.status = TaskStatus.PARSING
    
    const totalTasks = batchTask.tasks.length
    let completedTasks = 0

    for (let i = 0; i < batchTask.tasks.length; i++) {
      const task = batchTask.tasks[i]
      
      try {
        // 处理单个任务
        const updatedTask = await this.convertSingle(
          task,
          batchTask.parserConfig,
          batchTask.webdavConfig,
          (progress, status) => {
            // 计算总体进度
            const taskProgress = (completedTasks + progress / 100) / totalTasks * 100
            onProgress?.(taskProgress, task)
          }
        )

        batchTask.tasks[i] = updatedTask
        
        if (updatedTask.status === TaskStatus.SUCCESS) {
          completedTasks++
        }

      } catch (error) {
        console.error(`批量任务中的单个任务失败:`, error)
        // 继续处理下一个任务
      }

      // 更新批量任务状态
      batchTask.completedTasks = completedTasks
      
      // 计算总体进度
      const overallProgress = (i + 1) / totalTasks * 100
      onProgress?.(overallProgress, task)

      // 添加延迟避免请求过于频繁
      if (i < batchTask.tasks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    // 更新批量任务最终状态
    batchTask.completedAt = new Date()
    
    if (completedTasks === totalTasks) {
      batchTask.status = TaskStatus.SUCCESS
// 批量任务完成后执行清理
      await CleanupService.cleanupAfterTaskCompletion(batchTask);
    } else if (completedTasks === 0) {
      batchTask.status = TaskStatus.FAILED
    } else {
      batchTask.status = TaskStatus.SUCCESS // 部分成功也标记为成功
    }

    return batchTask
  }

  // 生成文件名
  private static generateFileName(title: string, format: string): string {
    // {{ AURA: Modify - 使用FilenameSanitizer进行文件名规范化 }}
    const sanitizedTitle = FilenameSanitizer.sanitize(title, {
      replacement: '_',
      maxLength: 100,
      preserveExtension: false,
      addTimestamp: true
    });

    // 移除可能的扩展名，确保格式正确
    const nameWithoutExt = sanitizedTitle.replace(/\.[^.]*$/, '');
    return `${nameWithoutExt}.${format}`;
  }

  // 生成文件夹名（用于图集）
  private static generateFolderName(title: string): string {
    // {{ AURA: Modify - 使用FilenameSanitizer进行文件夹名规范化 }}
    return FilenameSanitizer.sanitize(title, {
      replacement: '_',
      maxLength: 100,
      preserveExtension: false,
      addTimestamp: false
    });
  }

  // 测试WebDAV连接
  static async testWebDAVConnection(webdavConfig: WebDAVConfig): Promise<{ success: boolean; message: string }> {
    try {
      // 确保URL编码正确，避免特殊字符问题
      const params = new URLSearchParams({
        serverUrl: encodeURIComponent(webdavConfig.url),
        username: encodeURIComponent(webdavConfig.username),
        password: encodeURIComponent(webdavConfig.password)
      })

      console.log(`[WebDAV] 测试连接: ${webdavConfig.url}`)
      const response = await fetch(`/api/proxy/webdav?${params.toString()}`)
      const result = await response.json()

      return {
        success: result.success,
        message: result.success ? '连接测试成功' : result.error || '连接测试失败'
      }
    } catch (error) {
      console.error('[WebDAV] 连接测试错误:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : '连接测试失败'
      }
    }
  }

  // {{ AURA: Add - 文件名规范化方法，用于处理用户上传的文件 }}
  static sanitizeUploadFilename(filename: string): string {
    console.log(`[文件名规范化] 原始文件名: ${filename}`);
    
    // 检测特殊符号
    const specialChars = FilenameSanitizer.detectSpecialChars(filename);
    if (specialChars.length > 0) {
      console.log(`[文件名规范化] 检测到特殊符号: ${specialChars.join(', ')}`);
    }
    
    // 进行规范化处理
    const sanitized = FilenameSanitizer.sanitize(filename, {
      replacement: '_',
      maxLength: 150,
      preserveExtension: true,
      addTimestamp: false
    });
    
    console.log(`[文件名规范化] 规范化后文件名: ${sanitized}`);
    return sanitized;
  }

  // {{ AURA: Add - 批量文件名规范化方法 }}
  static sanitizeUploadFilenames(filenames: string[]): string[] {
    console.log(`[批量文件名规范化] 处理 ${filenames.length} 个文件名`);
    
    const sanitized = FilenameSanitizer.sanitizeBatch(filenames, {
      replacement: '_',
      maxLength: 150,
      preserveExtension: true,
      addTimestamp: false
    });
    
    // 输出处理结果
    for (let i = 0; i < filenames.length; i++) {
      if (filenames[i] !== sanitized[i]) {
        console.log(`[批量文件名规范化] ${filenames[i]} -> ${sanitized[i]}`);
      }
    }
    
    return sanitized;
  }

  // {{ AURA: Add - 验证文件名是否符合规范 }}
  static validateFilename(filename: string): {
    isValid: boolean;
    issues: string[];
    sanitized: string;
  } {
    const validation = FilenameSanitizer.validate(filename);
    const sanitized = this.sanitizeUploadFilename(filename);
    
    return {
      isValid: validation.isValid,
      issues: validation.issues,
      sanitized: sanitized
    };
  }

  // 生成任务ID
  static generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  // 生成批量任务ID
  static generateBatchId(): string {
    return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  // 解析视频链接列表
  static parseVideoUrls(text: string): string[] {
    const lines = text.split('\n')
    const urls: string[] = []
    
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed) {
        // 尝试从包含其他文字的输入中提取URL
        const extractedUrl = this.extractRealUrl(trimmed)
        if (extractedUrl && this.isValidUrl(extractedUrl)) {
          urls.push(extractedUrl)
        }
      }
    }
    
    return urls
  }

  // 验证URL格式
  private static isValidUrl(url: string): boolean {
    try {
      // 首先提取抖音等平台的真实链接
      const extractedUrl = this.extractRealUrl(url)
      new URL(extractedUrl)
      return true
    } catch {
      return false
    }
  }
  
  // 处理短视频分享文本，提取真实URL
  private static extractRealUrl(input: string): string {
    // 如果已经是有效URL，直接返回
    try {
      new URL(input)
      return input
    } catch {
      // 不是有效URL，尝试提取
    }
    
    // 处理抖音分享文本格式
    // 例如: "7.97 DUL:/ 02/05 z@T.yg 不知道啊被季莹莹抽了之后就这样了# 永劫无间手游 # 季莹莹 # 胡桃 # cos # 猎奇  https://v.douyin.com/d689EsOAlug/ 复制此链接，打开Dou音搜索，直接观看视频！"
    // 改进的URL正则表达式，能够更好地匹配各种分享文本中的URL
    const urlRegex = /(https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&=\/=]*))/g
    const matches = input.match(urlRegex)
    
    if (matches && matches.length > 0) {
      // 返回第一个匹配的URL并移除末尾斜杠
      return matches[0].replace(/\/$/, '')
    }
    
    return input
  }

  // 估算文件大小（基于时长）
  static estimateFileSize(duration?: number): number {
    if (!duration) return 0
    // 假设平均码率为 1Mbps
    return duration * 1024 * 1024 / 8
  }

  // 格式化文件大小
  static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B'
    
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  // 格式化时长
  static formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    } else {
      return `${minutes}:${secs.toString().padStart(2, '0')}`
    }
  }
  
  // {{ AURA: Add - 智能视频格式推断方法 }}
  private static inferVideoFormat(providedFormat: string | undefined, videoUrl?: string): string {
    // 支持的视频格式列表
    const validFormats = [
      'mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv', 'm4v',
      '3gp', 'f4v', 'asf', 'rm', 'rmvb', 'vob', 'ogv', 'm2ts', 'mts'
    ];
    
    // 验证提供的格式
    if (providedFormat && validFormats.includes(providedFormat.toLowerCase())) {
      return providedFormat.toLowerCase();
    }
    
    // 从URL推断
    if (videoUrl) {
      const urlFormat = this.extractFormatFromUrl(videoUrl);
      if (urlFormat && validFormats.includes(urlFormat.toLowerCase())) {
        return urlFormat.toLowerCase();
      }
    }
    
    // 默认mp4
    return 'mp4';
  }
  
  // {{ AURA: Add - 从URL提取格式扩展名 }}
  private static extractFormatFromUrl(url: string): string | null {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const lastDotIndex = pathname.lastIndexOf('.');
      
      if (lastDotIndex !== -1) {
        const extension = pathname.substring(lastDotIndex + 1);
        return extension.toLowerCase();
      }
    } catch (e) {
      // URL解析失败，忽略错误
    }
    
    return null;
  }
  
  // {{ AURA: Add - 验证视频格式是否有效 }}
  private static isValidVideoFormat(format: string): boolean {
    const validFormats = [
      'mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv', 'm4v',
      '3gp', 'f4v', 'asf', 'rm', 'rmvb', 'vob', 'ogv', 'm2ts', 'mts'
    ];
    return validFormats.includes(format.toLowerCase());
  }
  
  // {{ AURA: Add - 判断是否应该重试上传 }}
  private static shouldRetryUpload(error: any, attempt: number): boolean {
    // 如果是最后一次尝试，不重试
    if (attempt >= 5) {
      return false;
    }
    
    // 检查错误类型
    if (error) {
      const errorMessage = (error.message || error.toString()).toLowerCase();
      
      // 对于网络错误始终重试
      if (errorMessage.includes('network error') ||
          errorMessage.includes('fetch failed') ||
          errorMessage.includes('econnreset') ||
          errorMessage.includes('timeout')) {
        return true;
      }
      
      // 对于服务器错误(5xx)始终重试
      if (errorMessage.includes('500') ||
          errorMessage.includes('502') ||
          errorMessage.includes('503') ||
          errorMessage.includes('504')) {
        return true;
      }
      
      // 对于权限错误(403/401)仅在第一次尝试时重试
      if ((errorMessage.includes('403') || errorMessage.includes('401')) && attempt === 1) {
        return true;
      }
    }
    
    // 默认情况下，对于前几次尝试允许重试
    return attempt < 3;
  }
}
