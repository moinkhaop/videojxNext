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
        /api\.mmp\.cc\/api\/dyhome/i,
        /douyin.*user\.php/i,
        /user.*douyin/i,
        /cenguigui.*user/i,
        /dyhome/i
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
    const name = parser.name.toLowerCase();

    // MMP dyhome 用户主页API
    if (url.includes('api.mmp.cc') && url.includes('/api/dyhome')) {
      return 'simplified_douyin_user_api';
    }

    // 抖音用户API（优先检测曾贵贵的用户API）
    if (url.includes('cenguigui.cn') && url.includes('user.php')) {
      return 'simplified_douyin_user_api'; // 使用简化适配器
    }

    // 其他抖音用户主页API（通用检测）
    if (parser.capabilities?.includes(ParserCapability.USER_PAGE) &&
        (url.includes('douyin') && url.includes('user'))) {
      return 'simplified_douyin_user_api'; // 默认使用简化适配器
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
      let capabilities: ParserCapability[];

      // 优先使用手动设置的能力
      if (parser.capabilities && parser.capabilities.length > 0) {
        capabilities = [...parser.capabilities];
        console.log(`[能力检测] ${parser.name} 使用手动设置的能力: ${capabilities.join(', ')}`);
      } else {
        // 只在没有手动设置时才自动检测
        capabilities = [ParserCapability.SINGLE_VIDEO]; // 默认都支持单视频

        // 检测用户主页能力
        if (await this.detectUserPageCapability(parser)) {
          capabilities.push(ParserCapability.USER_PAGE);
          console.log(`[能力检测] ${parser.name} 自动检测到用户主页解析能力`);
        }

        // 检测批量处理能力（基于名称和描述推断）
        if (parser.name.toLowerCase().includes('batch') ||
            parser.name.toLowerCase().includes('批量')) {
          capabilities.push(ParserCapability.BATCH_PROCESSING);
        }

        console.log(`[能力检测] ${parser.name} 自动检测能力: ${capabilities.join(', ')}`);
      }

      const supportedPlatforms = this.inferSupportedPlatforms(parser);
      const responseAdapter = this.detectResponseFormat(parser);

      enhanced.push({
        ...parser,
        capabilities,
        supportedPlatforms,
        responseAdapter
      });

      console.log(`[能力检测] ${parser.name} - 最终能力: ${capabilities.join(', ')} | 平台: ${supportedPlatforms.join(', ')} | 适配器: ${responseAdapter}`);
    }

    return enhanced;
  }
  
  // 创建默认的抖音用户解析器配置
  createDouyinUserParser(): EnhancedVideoParserConfig {
    return {
      id: 'douyin_user_builtin',
      name: '内置抖音用户解析',
      apiUrl: 'https://api.mmp.cc/api/dyhome',
      isDefault: false,
      capabilities: [ParserCapability.USER_PAGE],
      supportedPlatforms: [SupportedPlatform.DOUYIN],
      responseAdapter: 'simplified_douyin_user_api',
      userPageEndpoint: 'https://api.mmp.cc/api/dyhome'
    };
  }
}

// 全局检测器实例
export const apiCapabilityDetector = new ApiCapabilityDetector();
