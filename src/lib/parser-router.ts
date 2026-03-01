// {{ AURA: Add - 解析器智能路由系统 }}
import { 
  VideoParserConfig, 
  EnhancedVideoParserConfig, 
  BatchInputMode, 
  ParserCapability, 
  SupportedPlatform 
} from '@/types'
import { adapterRegistry } from './response-adapters'

// 解析器路由器
export class ParserRouter {
  // 智能选择解析器
  selectBestParser(
    inputMode: BatchInputMode,
    platform: SupportedPlatform = SupportedPlatform.DOUYIN,
    parsers: EnhancedVideoParserConfig[]
  ): {
    primary: EnhancedVideoParserConfig | null;
    fallbacks: EnhancedVideoParserConfig[];
  } {
    
    if (inputMode === BatchInputMode.DOUYIN_USER) {
      // 抖音用户模式：优先选择专用抖音用户API
      const userPageCapable = parsers.filter(p => 
        p.capabilities?.includes(ParserCapability.USER_PAGE) &&
        (p.supportedPlatforms?.includes(platform) || p.supportedPlatforms?.includes(SupportedPlatform.UNIVERSAL))
      );
      
      // 按优先级排序：专用API > 默认API > 其他
      const sortedParsers = userPageCapable.sort((a, b) => {
        if (a.responseAdapter === 'simplified_douyin_user_api' && b.responseAdapter !== 'simplified_douyin_user_api') return -1;
        if (b.responseAdapter === 'simplified_douyin_user_api' && a.responseAdapter !== 'simplified_douyin_user_api') return 1;
        if (a.responseAdapter === 'douyin_user_api' && b.responseAdapter !== 'douyin_user_api') return -1;
        if (b.responseAdapter === 'douyin_user_api' && a.responseAdapter !== 'douyin_user_api') return 1;
        if (a.isDefault && !b.isDefault) return -1;
        if (b.isDefault && !a.isDefault) return 1;
        return 0;
      });
      
      // 降级备选方案：单视频解析器
      const fallbacks = parsers.filter(p => 
        p.capabilities?.includes(ParserCapability.SINGLE_VIDEO) &&
        !userPageCapable.includes(p)
      );
      
      return {
        primary: sortedParsers[0] || null,
        fallbacks: fallbacks
      };
    }
    
    // 普通模式：选择单视频解析器
    const singleVideoCapable = parsers.filter(p =>
      p.capabilities?.includes(ParserCapability.SINGLE_VIDEO) &&
      (p.supportedPlatforms?.includes(platform) || p.supportedPlatforms?.includes(SupportedPlatform.UNIVERSAL))
    );
    
    const sortedParsers = singleVideoCapable.sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (b.isDefault && !a.isDefault) return 1;
      return 0;
    });
    
    return {
      primary: sortedParsers[0] || null,
      fallbacks: singleVideoCapable.slice(1)
    };
  }
  
  // 构建请求参数
  buildRequest(
    parser: EnhancedVideoParserConfig,
    url: string,
    capability: ParserCapability
  ): {
    endpoint: string;
    method: string;
    body?: any;
    headers?: Record<string, string>;
  } {
    
    // 用户主页解析请求
    if (capability === ParserCapability.USER_PAGE) {
      if (parser.userPageEndpoint) {
        return {
          endpoint: `${parser.userPageEndpoint}?url=${encodeURIComponent(url)}`,
          method: 'GET',
          headers: parser.customHeaders
        };
      }
      
      // 如果是抖音用户API适配器，使用特定端点
      if (parser.responseAdapter === 'douyin_user_api') {
        return {
          endpoint: `https://api.cenguigui.cn/api/douyin/user.php?url=${encodeURIComponent(url)}`,
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        };
      }

      if (parser.responseAdapter === 'simplified_douyin_user_api') {
        const endpoint = parser.apiUrl.includes('?')
          ? `${parser.apiUrl}&url=${encodeURIComponent(url)}`
          : `${parser.apiUrl}?url=${encodeURIComponent(url)}`;
        return {
          endpoint,
          method: 'GET',
          headers: parser.customHeaders
        };
      }
    }
    
    // 标准单视频请求
    const method = parser.requestMethod || 'POST';
    
    if (method === 'GET') {
      const paramName = parser.urlParamName || 'url';
      const queryParams = new URLSearchParams({
        [paramName]: url,
        ...parser.customQueryParams
      });
      
      return {
        endpoint: `${parser.apiUrl}?${queryParams.toString()}`,
        method: 'GET',
        headers: parser.customHeaders
      };
    }
    
    // POST 请求
    return {
      endpoint: parser.apiUrl,
      method: 'POST',
      body: { 
        videoUrl: url, 
        ...parser.customBodyParams 
      },
      headers: {
        'Content-Type': 'application/json',
        ...parser.customHeaders
      }
    };
  }
  
  // 执行解析请求
  async executeParseRequest(
    parser: EnhancedVideoParserConfig,
    url: string,
    capability: ParserCapability,
    limit?: number
  ): Promise<any> {
    const request = this.buildRequest(parser, url, capability);
    
    try {
      console.log(`[解析器路由] 使用 ${parser.name} 执行${capability === ParserCapability.USER_PAGE ? '用户主页' : '单视频'}解析`);
      
      const response = await fetch(request.endpoint, {
        method: request.method,
        headers: request.headers,
        body: request.body ? JSON.stringify(request.body) : undefined
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const rawResponse = await response.json();

      // 首先尝试使用指定的适配器
      let adapter = adapterRegistry.get(parser.responseAdapter);
      if (!adapter) {
        console.warn(`[解析器路由] 未找到指定适配器: ${parser.responseAdapter}，尝试自动选择`);
        adapter = adapterRegistry.getCompatibleAdapter(rawResponse);
        if (!adapter) {
          throw new Error(`无法找到兼容的适配器处理此响应`);
        }
        console.log(`[解析器路由] 自动选择了适配器: ${adapter.id}`);
      }

      // 如果指定的适配器无法处理，尝试自动选择
      if (!adapter.canHandle(rawResponse)) {
        console.warn(`[解析器路由] 适配器 ${adapter.id} 无法处理响应，尝试自动选择`);

        // 尝试自动选择兼容的适配器
        const compatibleAdapter = adapterRegistry.getCompatibleAdapter(rawResponse);
        if (compatibleAdapter) {
          console.log(`[解析器路由] 自动选择了适配器: ${compatibleAdapter.id}`);
          adapter = compatibleAdapter;
        } else {
          const error = adapter.extractError(rawResponse);
          if (error) {
            throw new Error(error);
          }
          throw new Error('响应格式不匹配，且无法找到兼容的适配器');
        }
      }

      // 根据能力类型调用相应的适配方法
      if (capability === ParserCapability.USER_PAGE) {
        const videos = adapter.adaptUserPage(rawResponse);
        return limit ? videos.slice(0, limit) : videos;
      } else {
        return adapter.adaptSingleVideo(rawResponse);
      }
      
    } catch (error) {
      console.error(`[解析器路由] ${parser.name} 解析失败:`, error);
      throw error;
    }
  }
}

// 全局路由器实例
export const parserRouter = new ParserRouter();
