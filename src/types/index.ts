// {{ AURA: Add - 解析器能力枚举 }}
export enum ParserCapability {
  SINGLE_VIDEO = 'single_video',
  USER_PAGE = 'user_page',
  BATCH_PROCESSING = 'batch_processing'
}

// {{ AURA: Add - 平台支持枚举 }}
export enum SupportedPlatform {
  DOUYIN = 'douyin',
  KUAISHOU = 'kuaishou',
  BILIBILI = 'bilibili',
  XIAOHONGSHU = 'xiaohongshu',
  UNIVERSAL = 'universal'
}

// 视频解析API配置类型
export interface VideoParserConfig {
  id: string;
  name: string;
  apiUrl: string;
  apiKey?: string;
  isDefault?: boolean;
  disabled?: boolean; // {{ AURA: Add - 是否禁用（用于内置配置）}}
  isBuiltin?: boolean; // {{ AURA: Add - 是否为内置配置（内置配置不允许编辑和查看详细信息）}}
  useGetMethod?: boolean; // 是否使用GET请求方式
  requestMethod?: 'GET' | 'POST'; // 明确请求方法
  urlParamName?: string; // URL参数名称，默认为'url'
  // {{ AURA: Add - 新增自定义参数支持 }}
  customHeaders?: Record<string, string>; // 自定义请求头
  customBodyParams?: Record<string, any>; // POST请求时的自定义参数
  customQueryParams?: Record<string, string>; // GET请求时的自定义查询参数
  // {{ AURA: Add - 解析器能力标识 }}
  capabilities?: ParserCapability[]; // 支持的解析能力
  supportedPlatforms?: SupportedPlatform[]; // 支持的平台
  userPageEndpoint?: string; // 用户主页专用端点
  responseAdapter?: string; // 响应适配器标识
}

// {{ AURA: Add - 增强的解析器配置接口 }}
export interface EnhancedVideoParserConfig extends VideoParserConfig {
  capabilities: ParserCapability[]; // 必填
  supportedPlatforms: SupportedPlatform[]; // 必填
  responseAdapter: string; // 必填
}

// WebDAV服务器配置类型
export interface WebDAVConfig {
  id: string;
  name: string;
  url: string;
  username: string;
  password: string;
  basePath?: string;
  isDefault?: boolean;
  disabled?: boolean; // {{ AURA: Add - 是否禁用（用于内置配置）}}
  isBuiltin?: boolean; // {{ AURA: Add - 是否为内置配置（内置配置不允许编辑和查看详细信息）}}
}

// 任务状态枚举
export enum TaskStatus {
  PENDING = 'pending',
  PARSING = 'parsing',
  PARSED = 'parsed',      // 新增：解析完成，等待预览确认
  PREVIEWING = 'previewing', // 新增：预览中
  UPLOADING = 'uploading',
  SUCCESS = 'success',
  FAILED = 'failed'
}

// 单个转存任务类型
export interface ConversionTask {
  id: string;
  videoUrl: string;
  videoTitle?: string;
  status: TaskStatus;
  progress?: number;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
  parsedVideoInfo?: ParsedVideoInfo;
  uploadResult?: UploadResult;
}

// 批量任务类型
export interface BatchTask {
  id: string;
  name: string;
  status: TaskStatus;
  totalTasks: number;
  completedTasks: number;
  tasks: ConversionTask[];
  parserConfig: VideoParserConfig;
  webdavConfig: WebDAVConfig;
  createdAt: Date;
  completedAt?: Date;
}

// 媒体内容类型枚举
export enum MediaType {
  VIDEO = 'video',
  IMAGE_ALBUM = 'image_album'
}

// 图片信息类型
export interface ImageInfo {
  url: string;
  filename?: string;
  fileSize?: number;
}

// 解析的媒体信息类型（支持视频和图集）
export interface ParsedVideoInfo {
  title: string;
  author?: string; // 作者信息
  avatar?: string; // 作者头像URL
  signature?: string; // 作者签名
  short_id?: string; // 短ID
  uid?: string; // 用户ID
  like?: number; // 点赞数
  cover?: string; // 封面URL
  time?: number | string; // 发布时间戳或日期字符串
  publishTime?: Date; // {{ AURA: Add - 发布时间Date对象 }}
  description?: string; // 描述文本
  mediaType: MediaType; // 媒体类型：视频或图集
  viewCount?: string; // {{ AURA: Add - 添加观看次数字段 }}
  uploadDate?: string; // {{ AURA: Add - 添加上传日期字段 }}
  width?: number; // {{ AURA: Add - 视频宽度 }}
  height?: number; // {{ AURA: Add - 视频高度 }}

  // 视频相关字段
  url?: string; // 视频URL（视频类型时使用）
  duration?: number;
  fileSize?: number;
  format?: string;
  thumbnail?: string;

  // 图集相关字段
  images?: ImageInfo[]; // 图片列表（图集类型时使用）
  imageCount?: number; // 图片数量
}

// 上传结果类型
export interface UploadResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

// 清理配置接口
export interface CleanupConfig {
  // 是否启用自动清理
  enabled: boolean;
  // 保留最近几天的文件（0表示不保留，全部清理）
  retainDays: number;
  // 是否保留成功任务的文件
  retainSuccessfulTasks: boolean;
  // 是否保留失败任务的文件
  retainFailedTasks: boolean;
  // 自定义保留的文件扩展名
  retainExtensions: string[];
  // 清理时间（cron表达式格式，如 "0 2 * * *" 表示每天凌晨2点）
  cleanupSchedule: string;
}

// 清理日志条目接口
export interface CleanupLogEntry {
  id: string;
  timestamp: Date;
  filesDeleted: number;
  spaceFreed: number; // 以字节为单位
  details: string;
}

// {{ AURA: Add - 标签类型 }}
export interface Tag {
  id: string;
  name: string;
  color: string; // 标签颜色，如 'blue', 'red', 'green' 等
  createdAt: Date;
}

// {{ AURA: Add - 历史记录视图模式 }}
export enum HistoryViewMode {
  LIST = 'list',       // 列表视图
  GRID = 'grid',       // 网格视图
  COMPACT = 'compact'  // 紧凑列表视图
}

// {{ AURA: Add - 历史记录排序选项 }}
export enum HistorySortOption {
  DATE_DESC = 'date_desc',     // 时间降序（最新在前）
  DATE_ASC = 'date_asc',       // 时间升序（最旧在前）
  TITLE_ASC = 'title_asc',     // 标题升序
  TITLE_DESC = 'title_desc',   // 标题降序
  STATUS = 'status'            // 按状态排序
}

// 历史记录类型
export interface HistoryRecord {
  id: string;
  type: 'single' | 'batch';
  task: ConversionTask | BatchTask;
  createdAt: Date;
  isFavorite?: boolean; // {{ AURA: Add - 收藏标记 }}
  tags?: string[]; // {{ AURA: Add - 自定义标签（标签ID数组）}}
  notes?: string; // {{ AURA: Add - 备注 }}
  lastViewedAt?: Date; // {{ AURA: Add - 最后查看时间 }}
}

// {{ AURA: Add - 历史记录统计数据 }}
export interface HistoryStats {
  totalRecords: number;
  totalSuccess: number;
  totalFailed: number;
  totalPending: number;
  successRate: number;
  todayRecords: number;
  thisWeekRecords: number;
  thisMonthRecords: number;
  favoriteCount: number;
  tagUsage: Record<string, number>; // 标签使用统计
}

// 应用配置类型
export interface AppConfig {
  parsers: VideoParserConfig[];
  webdavServers: WebDAVConfig[];
  theme: 'light' | 'dark' | 'system';
}

// API响应类型
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  rawData?: any; // {{ AURA: Add - 添加原始数据字段，用于调试 }}
}

// 视频解析API响应类型
export interface VideoParseResponse {
  success: boolean;
  data: ParsedVideoInfo;
  error?: string;
  rawData?: any; // {{ AURA: Add - 添加原始数据字段，用于调试 }}
}

// 预览解析API响应类型（继承自VideoParseResponse）
export interface PreviewParseResponse extends VideoParseResponse {
  message?: string;
}

// WebDAV上传响应类型
export interface WebDAVUploadResponse {
  success: boolean;
  filePath?: string;
  error?: string;
}

// 预览状态类型
export interface PreviewState {
  isPreviewMode: boolean;     // 是否处于预览模式
  showPreview: boolean;       // 是否显示预览内容
  previewData: ParsedVideoInfo | null; // 预览数据
}

// {{ AURA: Add - 抖音用户API返回数据结构定义 }}
// 抖音单个视频信息
export interface DouyinVideoItem {
  aweme_id: string;
  nickname: string;
  avatar: string;
  share_url: string;
  author: string;
  title: string;
  comment: number;
  play: number;
  like: number;
  pic: string;
  pic_list: string[];
  type: string;
  video_info: {
    id: string;
    pic: string;
    pic_list: string[];
    height: number;
    width: number;
    size: string;
    url: string;
    download: string;
    download2: string;
  };
  music_info: {
    id: number;
    title: string;
    author: string;
    pic: string;
    pic_list: string[];
    url: string;
    url_list: string[];
    duration: string;
    height: number;
    width: number;
    owner_nickname: string;
  };
  images_info: {
    images: string[];
    height: string;
    width: string;
  };
  hot_words: {
    text_extra: string[];
    hashtag_id: string;
    start: number;
  };
  time: string;
}

// 抖音用户API响应类型
export interface DouyinUserApiResponse {
  code: number;
  msg: string;
  data: DouyinVideoItem[];
}

// 抖音用户解析请求类型
export interface DouyinUserParseRequest {
  url: string; // 用户主页链接
  limit?: number; // 解析数量限制，默认20
}

// 批量处理输入模式枚举
export enum BatchInputMode {
  NORMAL = 'normal',    // 普通模式：多个视频链接
  DOUYIN_USER = 'douyin_user'  // 抖音用户模式：用户主页链接
}

// 扩展的批量任务类型
export interface ExtendedBatchTask extends BatchTask {
  inputMode: BatchInputMode;
  sourceUrl?: string; // 用户主页链接（抖音用户模式时使用）
  totalSourceVideos?: number; // 源用户总视频数量
}
