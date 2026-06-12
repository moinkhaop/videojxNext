// {{ AURA: Add - 多API响应适配器系统 }}
import { ParsedVideoInfo, MediaType, ParserCapability } from '@/types'

// 响应适配器接口
export interface IResponseAdapter {
  readonly id: string;
  readonly supportedCapabilities: ParserCapability[];
  
  // 检测是否能处理该响应
  canHandle(rawResponse: any): boolean;
  
  // 单视频解析适配
  adaptSingleVideo(rawResponse: any): ParsedVideoInfo;
  
  // 用户主页解析适配
  adaptUserPage(rawResponse: any): ParsedVideoInfo[];
  
  // 错误处理适配
  extractError(rawResponse: any): string | null;
}

// 抖音用户API专用适配器
export class DouyinUserAdapter implements IResponseAdapter {
  readonly id = 'douyin_user_api';
  readonly supportedCapabilities = [ParserCapability.USER_PAGE];
  
  canHandle(rawResponse: any): boolean {
    return rawResponse?.code === 200 && rawResponse?.data?.aweme_list;
  }
  
  adaptSingleVideo(rawResponse: any): ParsedVideoInfo {
    throw new Error('抖音用户API不支持单视频解析');
  }
  
  adaptUserPage(rawResponse: any): ParsedVideoInfo[] {
    if (!this.canHandle(rawResponse)) {
      throw new Error('无法处理此响应格式');
    }
    
    return rawResponse.data.aweme_list.map((aweme: any) => ({
      title: aweme.desc || `抖音视频-${aweme.aweme_id}`,
      url: aweme.video.play_addr.url_list[0],
      thumbnail: aweme.video.cover.url_list[0],
      mediaType: MediaType.VIDEO,
      duration: aweme.video.duration / 1000,
      author: rawResponse.data.user.nickname,
      avatar: rawResponse.data.user.avatar,
      publishTime: new Date(aweme.create_time * 1000),
      description: aweme.desc,
      viewCount: aweme.statistics?.play_count?.toString(),
      width: aweme.video.width,
      height: aweme.video.height
    }));
  }
  
  extractError(rawResponse: any): string | null {
    if (rawResponse?.code !== 200) {
      return rawResponse?.msg || '抖音用户解析失败';
    }
    return null;
  }
}

// 通用解析API适配器
export class UniversalAdapter implements IResponseAdapter {
  readonly id = 'universal_api';
  readonly supportedCapabilities = [ParserCapability.SINGLE_VIDEO];
  
  canHandle(rawResponse: any): boolean {
    return rawResponse?.success === true && rawResponse?.data;
  }
  
  adaptSingleVideo(rawResponse: any): ParsedVideoInfo {
    if (!this.canHandle(rawResponse)) {
      throw new Error('无法处理此响应格式');
    }
    return rawResponse.data; // 已经是标准格式
  }
  
  adaptUserPage(rawResponse: any): ParsedVideoInfo[] {
    throw new Error('通用API不支持用户主页解析');
  }
  
  extractError(rawResponse: any): string | null {
    if (rawResponse?.success !== true) {
      return rawResponse?.error || '解析失败';
    }
    return null;
  }
}

// 曾贵贵API适配器（针对单视频解析）
export class CenguiguiSingleAdapter implements IResponseAdapter {
  readonly id = 'cenguigui_single_api';
  readonly supportedCapabilities = [ParserCapability.SINGLE_VIDEO];

  canHandle(rawResponse: any): boolean {
    return rawResponse?.code === 200 && rawResponse?.data && !rawResponse?.data?.aweme_list;
  }

  adaptSingleVideo(rawResponse: any): ParsedVideoInfo {
    if (!this.canHandle(rawResponse)) {
      throw new Error('无法处理此响应格式');
    }

    const data = rawResponse.data;
    return {
      title: data.title || data.desc || '未知标题',
      url: data.video_info?.url || data.url,
      thumbnail: data.pic || data.video_info?.pic,
      mediaType: data.type === 'image' ? MediaType.IMAGE_ALBUM : MediaType.VIDEO,
      duration: data.video_info?.duration ? parseInt(data.video_info.duration) : undefined,
      author: data.author || data.nickname,
      avatar: data.avatar,
      publishTime: data.time ? new Date(data.time) : undefined,
      description: data.desc || data.title,
      viewCount: data.play?.toString(),
      images: data.type === 'image' ? data.pic_list?.map((url: string) => ({ url })) : undefined,
      width: data.video_info?.width,
      height: data.video_info?.height
    };
  }

  adaptUserPage(rawResponse: any): ParsedVideoInfo[] {
    throw new Error('曾贵贵单视频API不支持用户主页解析');
  }

  extractError(rawResponse: any): string | null {
    if (rawResponse?.code !== 200) {
      return rawResponse?.msg || '解析失败';
    }
    return null;
  }
}

// 简化抖音用户API适配器（仅返回视频URL列表）
export class SimplifiedDouyinUserAdapter implements IResponseAdapter {
  readonly id = 'simplified_douyin_user_api';
  readonly supportedCapabilities = [ParserCapability.USER_PAGE];

  canHandle(rawResponse: any): boolean {
    const urls = this.collectVideoUrls(rawResponse);
    return urls.length > 0;
  }

  adaptSingleVideo(rawResponse: any): ParsedVideoInfo {
    throw new Error('简化抖音用户API不支持单视频解析');
  }

  adaptUserPage(rawResponse: any): ParsedVideoInfo[] {
    if (!this.canHandle(rawResponse)) {
      throw new Error('无法处理此响应格式');
    }

    const nickname = rawResponse.nickname || rawResponse?.data?.nickname || '抖音用户';
    const videoUrls = this.collectVideoUrls(rawResponse);

    console.log(`[简化适配器] 解析到 ${videoUrls.length} 个视频URL，用户: ${nickname}`);

    // 将每个视频URL转换为ParsedVideoInfo
    return videoUrls.map((url: string, index: number) => {
      // 尝试从URL中提取video_id作为标识
      let videoId = `video_${index + 1}`;
      const videoIdMatch = url.match(/video_id=([^&]+)/);
      if (videoIdMatch) {
        videoId = videoIdMatch[1].substring(0, 12); // 截取前12位作为简短ID
      }

      return {
        title: `${nickname} 的视频 #${index + 1} (${videoId})`,
        url: url,
        thumbnail: undefined, // 没有缩略图信息
        mediaType: MediaType.VIDEO,
        duration: undefined, // 没有时长信息
        author: nickname,
        avatar: undefined,
        publishTime: undefined,
        description: `来自 ${nickname} 的抖音视频`,
        viewCount: undefined,
        format: 'mp4' // 默认格式
      };
    });
  }

  extractError(rawResponse: any): string | null {
    // 检查是否有错误标识
    if (rawResponse?.error) {
      return rawResponse.error;
    }
    if (rawResponse?.msg && Number(rawResponse?.code) && Number(rawResponse?.code) !== 200) {
      return String(rawResponse.msg);
    }
    if (rawResponse?.detail) {
      return String(rawResponse.detail);
    }
    if (rawResponse?.message && !rawResponse?.video_urls) {
      return rawResponse.message;
    }
    return null;
  }

  private collectVideoUrls(rawResponse: any): string[] {
    const candidate = rawResponse?.video_urls ?? rawResponse?.data?.video_urls;
    const values = Array.isArray(candidate)
      ? candidate
      : (candidate && typeof candidate === 'object' ? Object.values(candidate) : []);

    const urls: string[] = [];
    for (const item of values) {
      if (typeof item === 'string' && /^https?:\/\//i.test(item)) {
        urls.push(item);
      }
    }
    return urls;
  }
}

// 适配器注册表
export class AdapterRegistry {
  private adapters = new Map<string, IResponseAdapter>();
  
  constructor() {
    // 注册内置适配器
    this.register(new DouyinUserAdapter());
    this.register(new SimplifiedDouyinUserAdapter()); // 简化抖音用户API适配器
    this.register(new UniversalAdapter());
    this.register(new CenguiguiSingleAdapter());
  }
  
  register(adapter: IResponseAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }
  
  get(id: string): IResponseAdapter | undefined {
    return this.adapters.get(id);
  }
  
  // 根据响应内容自动选择合适的适配器
  getCompatibleAdapter(rawResponse: any): IResponseAdapter | undefined {
    const adapters = Array.from(this.adapters.values());
    for (const adapter of adapters) {
      if (adapter.canHandle(rawResponse)) {
        return adapter;
      }
    }
    return undefined;
  }
  
  // 根据能力需求获取适配器
  getAdaptersByCapability(capability: ParserCapability): IResponseAdapter[] {
    const adapters = Array.from(this.adapters.values());
    return adapters.filter(adapter =>
      adapter.supportedCapabilities.includes(capability)
    );
  }
}

// 全局适配器注册表实例
export const adapterRegistry = new AdapterRegistry();
