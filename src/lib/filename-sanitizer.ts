/**
 * 文件名规范化工具
 * 处理文件名中的特殊符号，确保符合标准命名规范
 */

export interface FilenameOptions {
  /** 替换字符，默认为下划线 */
  replacement?: string;
  /** 最大长度限制，默认100字符 */
  maxLength?: number;
  /** 是否保留文件扩展名，默认true */
  preserveExtension?: boolean;
  /** 是否添加时间戳，默认false */
  addTimestamp?: boolean;
  /** 自定义允许的字符正则表达式 */
  allowedCharsRegex?: RegExp;
}

export class FilenameSanitizer {
  // {{ AURA: Add - 定义需要处理的特殊符号集合 }}
  private static readonly SPECIAL_CHARS = new Set([
    '#', '%', '&', '@', '!', '*', '(', ')', '[', ']', '{', '}', 
    '|', '\\', ':', ';', '"', "'", '<', '>', '?', '/',
    '\x00', '\x01', '\x02', '\x03', '\x04', '\x05', '\x06', '\x07',
    '\x08', '\x09', '\x0A', '\x0B', '\x0C', '\x0D', '\x0E', '\x0F',
    '\x10', '\x11', '\x12', '\x13', '\x14', '\x15', '\x16', '\x17',
    '\x18', '\x19', '\x1A', '\x1B', '\x1C', '\x1D', '\x1E', '\x1F'
  ]);

  // {{ AURA: Add - Windows系统保留文件名 }}
  private static readonly RESERVED_NAMES = new Set([
    'CON', 'PRN', 'AUX', 'NUL',
    'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
    'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
  ]);

  // {{ AURA: Add - 默认非法字符正则表达式 }}
  private static readonly DEFAULT_ILLEGAL_CHARS_REGEX = /[<>:"/\\|?*\x00-\x1F]/g;

  // {{ AURA: Add - emoji和unicode特殊字符的正则表达式（ES5兼容） }}
  private static readonly EMOJI_REGEX = /[\uD83C-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF]|[\uD83C][\uDF00-\uDFFF]/g;
  
  // {{ AURA: Add - 扩展的危险字符正则表达式（ES5兼容） }}
  private static readonly EXTENDED_UNSAFE_CHARS = /[<>:"/\\|?*\x00-\x1F\x7F\u200B-\u200F\u2028\u2029\uFEFF]|[\uD83C-\uDBFF][\uDC00-\uDFFF]/g;

  /**
   * 检测文件名中是否包含特殊符号（包括emoji）
   * @param filename 文件名
   * @returns 包含的特殊符号数组
   */
  static detectSpecialChars(filename: string): string[] {
    const specialChars: string[] = [];
    
    // 检测基本特殊字符
    for (const char of filename) {
      if (this.SPECIAL_CHARS.has(char)) {
        if (!specialChars.includes(char)) {
          specialChars.push(char);
        }
      }
    }
    
    // {{ AURA: Add - 检测emoji和扩展unicode字符 }}
    const emojiMatches = filename.match(this.EMOJI_REGEX);
    if (emojiMatches) {
      for (const emoji of emojiMatches) {
        if (!specialChars.includes(emoji)) {
          specialChars.push(emoji);
        }
      }
    }
    
    return specialChars;
  }

  /**
   * 规范化文件名，处理特殊符号
   * @param filename 原始文件名
   * @param options 配置选项
   * @returns 规范化后的文件名
   */
  static sanitize(filename: string, options: FilenameOptions = {}): string {
    const {
      replacement = '_',
      maxLength = 100,
      preserveExtension = true,
      addTimestamp = false,
      allowedCharsRegex
    } = options;

    if (!filename || typeof filename !== 'string') {
      return 'unnamed_file';
    }

    let sanitized = filename.trim();
    let extension = '';

    // {{ AURA: Modify - 分离文件扩展名 }}
    if (preserveExtension) {
      const lastDotIndex = sanitized.lastIndexOf('.');
      if (lastDotIndex > 0 && lastDotIndex < sanitized.length - 1) {
        extension = sanitized.substring(lastDotIndex);
        sanitized = sanitized.substring(0, lastDotIndex);
      }
    }

    // {{ AURA: Modify - 使用自定义正则或默认处理，包括emoji }}
    if (allowedCharsRegex) {
      sanitized = sanitized.replace(allowedCharsRegex, replacement);
    } else {
      // 首先处理emoji和扩展unicode字符
      sanitized = sanitized.replace(this.EXTENDED_UNSAFE_CHARS, replacement);
      // 然后处理基本特殊字符
      sanitized = this.replaceSpecialChars(sanitized, replacement);
    }

    // {{ AURA: Modify - 处理连续的替换字符 }}
    if (replacement) {
      const replacementRegex = new RegExp(`\\${replacement}+`, 'g');
      sanitized = sanitized.replace(replacementRegex, replacement);
    }

    // {{ AURA: Modify - 移除开头和结尾的替换字符 }}
    if (replacement) {
      const trimRegex = new RegExp(`^\\${replacement}|\\${replacement}$`, 'g');
      sanitized = sanitized.replace(trimRegex, '');
    }

    // {{ AURA: Modify - 处理空白字符 }}
    sanitized = sanitized.replace(/\s+/g, '_');

    // {{ AURA: Modify - 检查是否为保留名称 }}
    if (this.RESERVED_NAMES.has(sanitized.toUpperCase())) {
      sanitized = sanitized + '_file';
    }

    // {{ AURA: Modify - 确保不为空 }}
    if (!sanitized) {
      sanitized = 'unnamed';
    }

    // {{ AURA: Modify - 限制长度（考虑扩展名） }}
    const maxNameLength = maxLength - extension.length;
    if (sanitized.length > maxNameLength) {
      sanitized = sanitized.substring(0, maxNameLength);
    }

    // {{ AURA: Modify - 添加时间戳，确保WebDAV兼容性 }}
    if (addTimestamp) {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
      
      // 创建WebDAV安全的时间戳格式：YYYY-MM-DD-HH-MM-SS-mmm
      const timestamp = `${year}-${month}-${day}-${hours}-${minutes}-${seconds}-${milliseconds}`;
      const timestampPart = `_${timestamp}`;
      const availableLength = maxNameLength - timestampPart.length;
      
      if (availableLength > 0) {
        sanitized = sanitized.substring(0, availableLength) + timestampPart;
      }
    }

    return sanitized + extension;
  }

  /**
   * 替换特殊字符
   * @param text 原始文本
   * @param replacement 替换字符
   * @returns 处理后的文本
   */
  private static replaceSpecialChars(text: string, replacement: string): string {
    let result = '';
    for (const char of text) {
      if (this.SPECIAL_CHARS.has(char)) {
        result += replacement;
      } else {
        result += char;
      }
    }
    return result;
  }

  /**
   * 批量处理文件名
   * @param filenames 文件名数组
   * @param options 配置选项
   * @returns 处理后的文件名数组
   */
  static sanitizeBatch(filenames: string[], options: FilenameOptions = {}): string[] {
    const processedNames = new Set<string>();
    const result: string[] = [];

    for (const filename of filenames) {
      let sanitized = this.sanitize(filename, options);
      
      // {{ AURA: Modify - 处理重名问题，添加序号 }}
      let counter = 1;
      let uniqueName = sanitized;
      
      while (processedNames.has(uniqueName)) {
        const { name, ext } = this.splitNameAndExtension(sanitized);
        uniqueName = `${name}_${counter}${ext}`;
        counter++;
      }
      
      processedNames.add(uniqueName);
      result.push(uniqueName);
    }

    return result;
  }

  /**
   * 分离文件名和扩展名
   * @param filename 完整文件名
   * @returns 分离后的名称和扩展名
   */
  private static splitNameAndExtension(filename: string): { name: string; ext: string } {
    const lastDotIndex = filename.lastIndexOf('.');
    if (lastDotIndex > 0 && lastDotIndex < filename.length - 1) {
      return {
        name: filename.substring(0, lastDotIndex),
        ext: filename.substring(lastDotIndex)
      };
    }
    return { name: filename, ext: '' };
  }

  /**
   * 验证文件名是否符合规范
   * @param filename 文件名
   * @returns 验证结果
   */
  static validate(filename: string): { 
    isValid: boolean; 
    issues: string[];
    suggestions: string[];
  } {
    const issues: string[] = [];
    const suggestions: string[] = [];

    if (!filename || typeof filename !== 'string') {
      issues.push('文件名为空或无效');
      suggestions.push('请提供有效的文件名');
      return { isValid: false, issues, suggestions };
    }

    const trimmed = filename.trim();
    if (trimmed !== filename) {
      issues.push('文件名包含首尾空格');
      suggestions.push('移除文件名首尾的空格');
    }

    const specialChars = this.detectSpecialChars(filename);
    if (specialChars.length > 0) {
      issues.push(`文件名包含特殊字符: ${specialChars.join(', ')}`);
      suggestions.push('将特殊字符替换为下划线或其他安全字符');
    }

    const nameWithoutExt = this.splitNameAndExtension(filename).name;
    if (this.RESERVED_NAMES.has(nameWithoutExt.toUpperCase())) {
      issues.push(`文件名"${nameWithoutExt}"是系统保留名称`);
      suggestions.push('更改文件名或添加后缀');
    }

    if (filename.length > 255) {
      issues.push('文件名过长（超过255字符）');
      suggestions.push('缩短文件名长度');
    }

    const isValid = issues.length === 0;
    
    if (!isValid) {
      suggestions.push(`建议使用规范化后的文件名: ${this.sanitize(filename)}`);
    }

    return { isValid, issues, suggestions };
  }

  /**
   * 生成安全的文件名（用于下载和保存）
   * @param originalName 原始文件名
   * @param options 配置选项
   * @returns 安全的文件名
   */
  static generateSafeFilename(originalName: string, options: FilenameOptions = {}): string {
    const defaultOptions: FilenameOptions = {
      replacement: '_',
      maxLength: 100,
      preserveExtension: true,
      addTimestamp: true,
      ...options
    };

    return this.sanitize(originalName, defaultOptions);
  }

  /**
   * 获取支持的文件扩展名列表
   * @returns 支持的扩展名数组
   */
  static getSupportedExtensions(): string[] {
    return [
      // 视频格式
      '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv', '.m4v',
      '.3gp', '.f4v', '.asf', '.rm', '.rmvb', '.vob', '.ogv', '.m2ts', '.mts',
      // 图片格式
      '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico',
      '.tiff', '.tif', '.psd', '.raw', '.cr2', '.nef', '.orf', '.sr2',
      // 音频格式
      '.mp3', '.wav', '.flac', '.aac', '.ogg', '.wma', '.m4a', '.opus'
    ];
  }
}