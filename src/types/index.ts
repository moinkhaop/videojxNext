// 视频解析API配置类型
export interface VideoParserConfig {
  id: string;
  name: string;
  apiUrl: string;
  apiKey?: string;
  isDefault?: boolean;
  useGetMethod?: boolean; // 是否使用GET请求方式
  requestMethod?: 'GET' | 'POST'; // 明确请求方法
  urlParamName?: string; // URL参数名称，默认为'url'
  // {{ AURA: Add - 新增自定义参数支持 }}
  customHeaders?: Record<string, string>; // 自定义请求头
  customBodyParams?: Record<string, any>; // POST请求时的自定义参数
  customQueryParams?: Record<string, string>; // GET请求时的自定义查询参数
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
  time?: number | string; // 发布时间戳或日期字符串
  description?: string; // 描述文本
  mediaType: MediaType; // 媒体类型：视频或图集
  viewCount?: string; // {{ AURA: Add - 添加观看次数字段 }}
  uploadDate?: string; // {{ AURA: Add - 添加上传日期字段 }}
  
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

// 历史记录类型
export interface HistoryRecord {
  id: string;
  type: 'single' | 'batch';
  task: ConversionTask | BatchTask;
  createdAt: Date;
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
