// {{ AURA: Add - API能力自动检测系统 }}
import { 
  VideoParserConfig, 
  EnhancedVideoParserConfig, 
  ParserCapability, 
  SupportedPlatform 
} from '@/types'

export class ApiCapabilityDetector {
  // 检测解析器的用户主页解析能力
  async detectUserPageCapability(parser: VideoParserConfig): Promise<boolean> {
    // 基于API URL模式进行智能推断
    const urlPatterns = {
      douyin_user: [
        /douyin.*user\.php/i,
        /user.*douyin/i,
        /cenguigui.*user/i
      ],
      generic_user: [
        /user/i,
        /profile/i,
        /channel/i
      ]
    };
    
    // 检查URL模式
    for (const patterns of Object.values(urlPatterns)) {
      for (const pattern of patterns) {
        if (pattern.test(parser.apiUrl)) {
          return true;
        }
      }
    }
    
    // 检查是否有明确的用户主页端点配置
    if (parser.userPageEndpoint) {
      return true;
    }
    
    return false;
  }
  
  // 推断支持的平台
  inferSupportedPlatforms(parser: VideoParserConfig): SupportedPlatform[] {
    const url = parser.apiUrl.toLowerCase();
    const name = parser.name.toLowerCase();
    
    const platforms: SupportedPlatform[] = [];
    
    if (url.includes('douyin') || name.includes('抖音') || name.includes('douyin')) {
      platforms.push(SupportedPlatform.DOUYIN);
    }
    
    if (url.includes('kuaishou') || name.includes('快手') || name.includes('kuaishou')) {
      platforms.push(SupportedPlatform.KUAISHOU);
    }
    
    if (url.includes('bilibili') || name.includes('b站') || name.includes('bilibili')) {
      platforms.push(SupportedPlatform.BILIBILI);
    }
    
    if (url.includes('xiaohongshu') || name.includes('小红书') || name.includes('xhs')) {
      platforms.push(SupportedPlatform.XIAOHONGSHU);
    }
    
    // 如果没有特定平台标识，认为是通用的
    if (platforms.length === 0) {
      platforms.push(SupportedPlatform.UNIVERSAL);
    }
    
    return platforms;
  }
  
  // 检测响应格式类型
  detectResponseFormat(parser: VideoParserConfig): string {
    const url = parser.apiUrl.toLowerCase();
    
    // 抖音用户API
    if (url.includes('cenguigui.cn') && url.includes('user.php')) {
      return 'douyin_user_api';
    }
    
    // 曾贵贵单视频API
    if (url.includes('cenguigui.cn')) {
      return 'cenguigui_single_api';
    }
    
    // 默认通用格式
    return 'universal_api';
  }
  
  // 批量更新解析器能力信息
  async updateParserCapabilities(parsers: VideoParserConfig[]): Promise<EnhancedVideoParserConfig[]> {
    const enhanced: EnhancedVideoParserConfig[] = [];
    
    console.log(`[能力检测] 开始检测 ${parsers.length} 个解析器的能力`);
    
    for (const parser of parsers) {
      const capabilities: ParserCapability[] = [ParserCapability.SINGLE_VIDEO]; // 默认都支持单视频
      const supportedPlatforms = this.inferSupportedPlatforms(parser);
      const responseAdapter = this.detectResponseFormat(parser);
      
      // 检测用户主页能力
      if (await this.detectUserPageCapability(parser)) {
        capabilities.push(ParserCapability.USER_PAGE);
        console.log(`[能力检测] ${parser.name} 支持用户主页解析`);
      }
      
      // 检测批量处理能力（基于名称和描述推断）
      if (parser.name.toLowerCase().includes('batch') || 
          parser.name.toLowerCase().includes('批量')) {
        capabilities.push(ParserCapability.BATCH_PROCESSING);
      }
      
      enhanced.push({
        ...parser,
        capabilities,
        supportedPlatforms,
        responseAdapter
      });
      
      console.log(`[能力检测] ${parser.name} - 能力: ${capabilities.join(', ')} | 平台: ${supportedPlatforms.join(', ')} | 适配器: ${responseAdapter}`);
    }
    
    return enhanced;
  }
  
  // 创建默认的抖音用户解析器配置
  createDouyinUserParser(): EnhancedVideoParserConfig {
    return {
      id: 'douyin_user_builtin',
      name: '内置抖音用户解析',
      apiUrl: 'https://api.cenguigui.cn/api/douyin/user.php',
      isDefault: false,
      capabilities: [ParserCapability.USER_PAGE],
      supportedPlatforms: [SupportedPlatform.DOUYIN],
      responseAdapter: 'douyin_user_api',
      userPageEndpoint: 'https://api.cenguigui.cn/api/douyin/user.php'
    };
  }
}

// 全局检测器实例
export const apiCapabilityDetector = new ApiCapabilityDetector();