/**
 * 剪贴板工具类
 * 用于自动检测和提取剪贴板中的视频链接
 */

// 支持的视频平台域名模式
const VIDEO_PLATFORMS = [
  'douyin.com',
  'tiktok.com',
  'bilibili.com',
  'youtube.com',
  'youtu.be',
  'xiaohongshu.com',
  'xhslink.com',
  'kuaishou.com',
  'weibo.com',
  'instagram.com',
  'twitter.com',
  'x.com',
  'facebook.com',
  'vimeo.com',
]

export class ClipboardDetector {
  private static lastDetectedUrl: string = ''
  private static isMonitoring: boolean = false
  private static monitorInterval: NodeJS.Timeout | null = null

  /**
   * 检测文本中是否包含视频链接
   */
  static detectVideoUrl(text: string): string | null {
    if (!text || typeof text !== 'string') return null

    // 提取所有URL
    const urlRegex = /(https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&=\/]*))/g
    const urls = text.match(urlRegex)

    if (!urls || urls.length === 0) return null

    // 查找第一个视频平台链接
    for (const url of urls) {
      if (this.isVideoUrl(url)) {
        return url.replace(/\/$/, '') // 移除末尾斜杠
      }
    }

    return null
  }

  /**
   * 判断URL是否为支持的视频平台链接
   */
  static isVideoUrl(url: string): boolean {
    try {
      const urlObj = new URL(url)
      return VIDEO_PLATFORMS.some(platform =>
        urlObj.hostname.includes(platform)
      )
    } catch {
      return false
    }
  }

  /**
   * 从剪贴板读取并检测视频链接
   */
  static async detectFromClipboard(): Promise<string | null> {
    try {
      // 检查浏览器是否支持剪贴板API
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        console.warn('浏览器不支持剪贴板API')
        return null
      }

      const text = await navigator.clipboard.readText()
      const videoUrl = this.detectVideoUrl(text)

      // 避免重复检测相同的URL
      if (videoUrl && videoUrl !== this.lastDetectedUrl) {
        this.lastDetectedUrl = videoUrl
        return videoUrl
      }

      return null
    } catch (error) {
      // 用户可能拒绝了剪贴板权限，静默处理
      console.debug('剪贴板读取失败:', error)
      return null
    }
  }

  /**
   * 开始监听剪贴板变化
   * @param callback 检测到新视频链接时的回调函数
   * @param intervalMs 检测间隔（毫秒），默认1000ms
   */
  static startMonitoring(
    callback: (url: string) => void,
    intervalMs: number = 1000
  ): void {
    if (this.isMonitoring) {
      console.warn('剪贴板监听已在运行')
      return
    }

    this.isMonitoring = true
    this.monitorInterval = setInterval(async () => {
      const url = await this.detectFromClipboard()
      if (url) {
        callback(url)
      }
    }, intervalMs)

    console.log('剪贴板监听已启动')
  }

  /**
   * 停止监听剪贴板
   */
  static stopMonitoring(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval)
      this.monitorInterval = null
    }
    this.isMonitoring = false
    console.log('剪贴板监听已停止')
  }

  /**
   * 重置检测状态（用于清除上次检测的URL）
   */
  static reset(): void {
    this.lastDetectedUrl = ''
  }

  /**
   * 手动触发一次检测
   */
  static async checkOnce(): Promise<string | null> {
    return await this.detectFromClipboard()
  }

  /**
   * 请求剪贴板权限（某些浏览器需要）
   */
  static async requestPermission(): Promise<boolean> {
    try {
      // 尝试读取剪贴板以触发权限请求
      await navigator.clipboard.readText()
      return true
    } catch (error) {
      console.error('剪贴板权限请求失败:', error)
      return false
    }
  }
}
