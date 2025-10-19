# 视频加载失败修复方案

## 问题分析

用户报告的问题是：视频链接虽然通过解析API成功获取，但在预览时加载失败。这不是解析问题，而是**直链访问问题**。

### 根本原因

1. **缺少请求头**：浏览器直接访问外部视频链接时，缺少必要的请求头（如Referer、User-Agent等），导致某些服务器拒绝访问
2. **CORS跨域限制**：某些视频服务器可能有跨域限制
3. **直链有时效性**：即使解析成功，短视频平台的直链也可能在短时间内过期

## 实现的解决方案

### 1. 创建视频代理API (`/api/proxy/video`)

新增文件：`src/app/api/proxy/video/route.ts`

**功能**：
- 代理外部视频链接请求
- 自动添加必要的请求头：
  - `User-Agent`：模拟浏览器
  - `Referer`：设置为抖音等平台域名
  - `Accept`：指定视频MIME类型
  - `Sec-Fetch-*`：添加安全相关头
- 支持GET/HEAD/OPTIONS请求
- 添加CORS响应头允许跨域访问
- 实现流式返回以支持视频进度条

**工作流程**：
```
浏览器 → /api/proxy/video?url=外部直链
    ↓
服务器添加请求头
    ↓
获取外部视频
    ↓
返回视频流给浏览器
```

### 2. 改进 VideoPreview 组件

**修改文件**：`src/components/preview/VideoPreview.tsx`

**改进项**：

1. **自动代理URL生成**：
   - 新增 `useProxy` prop（默认true）
   - 使用 `useMemo` 生成代理URL
   - 自动检测并转换外部链接

```typescript
const proxiedVideoUrl = useMemo(() => {
  if (!videoUrl || !useProxy) return videoUrl
  // 将直链转换为代理URL
  const proxyUrl = new URL('/api/proxy/video', window.location.origin)
  proxyUrl.searchParams.set('url', videoUrl)
  return proxyUrl.toString()
}, [videoUrl, useProxy])
```

2. **使用代理URL访问视频**：
   - `<source src={proxiedVideoUrl}>` 替代直接的 `videoUrl`
   - 提高视频加载成功率

3. **改进错误提示**：
   - 显示当前使用的加载方式（代理/直链）
   - 详细说明可能的原因
   - 提供明确的解决步骤
   - 添加Zap图标展示代理状态

### 3. 错误处理流程

```
视频加载失败
    ↓
显示详细错误提示
    ↓
用户点击"重新解析"
    ↓
获取新的视频直链
    ↓
代理URL重新尝试加载
```

## 使用流程

1. **用户输入视频链接** → 点击"解析和预览"
2. **后端调用解析API** → 获取视频直链
3. **前端自动生成代理URL** → 通过 `/api/proxy/video?url=...` 访问
4. **代理API添加请求头** → 解决访问限制问题
5. **视频正常播放**

## 如果代理仍然失败

1. **检查视频是否真的已过期**：
   - 点击"重新解析"获取最新直链
   - 等待服务器返回新的视频链接

2. **选择其他解析API**：
   - 在设置中配置多个解析API
   - 某些解析器可能返回更稳定的直链

3. **直接使用直链模式**（如需要）：
   - VideoPreview 组件支持 `useProxy={false}` 来禁用代理
   - 仅当代理失败时使用此选项

## 技术细节

### 代理API的关键特性

1. **Referer头的重要性**：
   ```typescript
   'Referer': 'https://www.douyin.com/'  // 某些直链需要有效的Referer
   ```

2. **CORS响应头**：
   ```typescript
   'Access-Control-Allow-Origin': '*'  // 允许跨域访问
   ```

3. **内容范围支持**：
   ```typescript
   'Accept-Ranges': 'bytes'  // 支持视频进度条拖动
   ```

### 性能考虑

- 代理会增加服务器负载
- 视频流量会经过服务器（可能影响带宽）
- 缓存设置为1小时（`Cache-Control: public, max-age=3600`）

## 测试验证

1. **成功场景**：
   - 解析得到有效直链
   - 代理成功添加请求头
   - 视频正常播放

2. **失败场景**：
   - 直链确实已过期 → 显示错误提示 → 用户重新解析
   - 网络问题 → 显示相应错误消息
   - 格式不支持 → 浏览器显示不支持提示

## 后续改进方向

1. **智能降级**：如代理失败，自动尝试直链
2. **缓存优化**：缓存成功的代理链接
3. **负载均衡**：对接多个CDN或代理服务
4. **监控日志**：记录代理失败率，用于优化
5. **用户配置**：允许用户选择代理模式
