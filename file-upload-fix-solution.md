# 文件上传问题修复方案

## 问题概述

本文档详细描述了两个关键技术问题的解决方案：
1. **文件扩展名缺失问题**：上传的文件缺少正确的格式后缀
2. **WebDAV自定义路径问题**：用户配置的存储路径未正确应用

## 🔧 问题1：文件扩展名缺失修复

### 原因分析
- 解析器返回的format字段可能为空或不准确
- 缺少从视频URL或HTTP响应头推断格式的机制
- 没有验证文件格式的有效性

### 解决方案

#### 1.1 智能格式推断系统
```typescript
// 新增方法：inferVideoFormat
// 优先级：provided format > URL extension > default mp4
private static inferVideoFormat(providedFormat: string, videoUrl?: string): string {
  // 1. 验证提供的格式
  if (providedFormat && this.isValidVideoFormat(providedFormat)) {
    return providedFormat.toLowerCase();
  }
  // 2. 从URL推断
  if (videoUrl) {
    const urlFormat = this.extractFormatFromUrl(videoUrl);
    if (urlFormat && this.isValidVideoFormat(urlFormat)) {
      return urlFormat.toLowerCase();
    }
  }
  // 3. 默认mp4
  return 'mp4';
}
```

#### 1.2 格式验证机制
```typescript
// 支持的视频格式列表
const validFormats = [
  'mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv', 'm4v', 
  '3gp', 'f4v', 'asf', 'rm', 'rmvb', 'vob', 'ogv', 'm2ts', 'mts'
];
```

#### 1.3 Content-Type检测
在WebDAV API中添加了基于HTTP响应头的格式检测：
```typescript
function optimizeFileName(originalFileName: string, response: Response, videoUrl: string) {
  const contentType = response.headers.get('content-type');
  const mimeToExtension = {
    'video/mp4': 'mp4',
    'video/avi': 'avi', 
    'video/quicktime': 'mov',
    // ... 更多MIME类型映射
  };
}
```

## 🛠️ 问题2：WebDAV自定义路径修复

### 原因分析
- uploadToWebDAV方法未处理WebDAV配置中的basePath字段
- 路径构建逻辑过于简单，缺少路径规范化
- 没有正确处理路径分隔符和路径合并

### 解决方案

#### 2.1 智能路径构建
```typescript
function buildWebDAVPath(serverUrl: string, basePath?: string, folderPath?: string, fileName?: string): string {
  // 规范化路径组件
  const normalizePathComponent = (path: string): string => {
    if (!path) return '';
    return path.replace(/^\/+|\/+$/g, ''); // 移除前后的斜杠
  };

  // 构建路径组件数组
  const pathComponents = [
    serverUrl.replace(/\/+$/, ''),
    normalizePathComponent(basePath || ''),
    normalizePathComponent(folderPath || ''),
    fileName || ''
  ].filter(component => component !== '');

  return pathComponents.join('/');
}
```

#### 2.2 配置传递优化
- 修改`uploadToWebDAV`调用，传入完整的WebDAV配置
- 确保`basePath`字段正确传递到API层

#### 2.3 路径构建日志
添加详细的路径构建日志，便于调试：
```typescript
console.log(`[WebDAV] 路径构建详情:`, {
  serverUrl,
  basePath: basePath || '(未设置)',
  folderPath: folderPath || '(未设置)', 
  fileName: fileName || '(未设置)',
  fullPath
});
```

## 📋 修改文件清单

### 主要修改文件
1. **`src/lib/conversion.ts`**
   - 新增智能格式推断方法
   - 改进文件名生成逻辑
   - 更新uploadToWebDAV调用参数

2. **`src/app/api/proxy/webdav/route.ts`**
   - 新增路径构建辅助函数
   - 添加文件名优化功能
   - 改进Content-Type检测

### 新增功能
- **格式推断系统**：多层次的文件格式检测
- **路径规范化**：智能处理WebDAV路径构建
- **MIME类型映射**：基于HTTP头的格式推断
- **调试日志**：详细的执行过程记录

## 🎯 预期效果

### 文件扩展名问题
- ✅ 自动推断正确的文件格式
- ✅ 支持多种视频格式识别
- ✅ 提供格式验证机制
- ✅ 兼容现有API返回数据

### WebDAV路径问题
- ✅ 正确应用用户配置的basePath
- ✅ 智能处理路径分隔符
- ✅ 避免路径构建错误
- ✅ 提供详细的调试信息

## 🧪 测试建议

### 扩展名测试
1. 测试不同视频平台的链接
2. 验证各种格式的视频文件
3. 检查Content-Type头部检测
4. 测试格式推断优先级

### 路径测试
1. 测试有/无basePath配置的情况
2. 验证特殊字符的路径处理
3. 检查路径分隔符规范化
4. 测试嵌套文件夹路径

## 🔍 故障排除

### 常见问题
1. **扩展名仍然不正确**
   - 检查API返回的format字段
   - 查看Content-Type检测日志
   - 验证URL格式推断逻辑

2. **路径构建错误**
   - 检查WebDAV配置中的basePath设置
   - 查看路径构建详情日志
   - 验证服务器URL格式

### 调试日志位置
- 浏览器开发者工具Console面板
- 服务器端API日志输出
- WebDAV路径构建详情

## 📝 维护建议

1. **定期更新格式支持列表**：根据新出现的视频格式更新validFormats数组
2. **MIME类型映射维护**：定期检查和更新mimeToExtension映射表
3. **路径处理测试**：针对不同WebDAV服务器进行兼容性测试
4. **日志监控**：监控格式推断失败的情况，及时优化逻辑
