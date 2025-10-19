# 历史记录视频切换问题修复

## 问题描述
用户在历史记录页面点击播放某个视频后，切换到其他历史记录时，视频预览没有正确切换，仍然显示之前的视频。

## 问题原因
1. **VideoPreview 组件状态管理问题**：组件内部使用 useState 管理播放状态（isPlaying、isMuted、hasError等），但当父组件传入新的 videoUrl 时，这些状态没有被重置。
2. **缺少 useEffect 来监听 URL 变化**：VideoPreview 组件没有监听 videoUrl prop 的变化，无法自动重置播放器状态。
3. **React key 缺失**：所有使用 VideoPreview 的地方都缺少 key 属性，导致 React 无法正确识别组件实例的变化。

## 解决方案

### 1. 修改 VideoPreview.tsx
- 添加 `useRef` 钩子来获取视频元素引用
- 添加 `useEffect` 钩子监听 `videoUrl` 变化
- 当 `videoUrl` 改变时，重置以下状态：
  - `currentTime = 0`（重置播放位置）
  - `pause()`（停止播放）
  - `isPlaying = false`
  - `hasError = false`
  - `showProxyTip = false`
  - `isMuted = false`
- 用 ref 替换固定的 id="preview-video"

### 2. 添加 key 属性到所有使用 VideoPreview 的地方
已修改的文件：
- `src/app/history/page.tsx`：key={`${selectedRecord.id}-${parsedInfo.url}`}
- `src/components/preview/PreviewArea.tsx`：key={mediaInfo.url}
- `src/components/preview/TwoColumnPreview.tsx`：key={mediaInfo.url}
- `src/components/preview/CompactPreview.tsx`：key={mediaInfo.url}
- `src/components/player/Player.tsx`：key={mediaInfo.url}

## 效果
- ✅ 点击不同历史记录时，视频会立即切换
- ✅ 播放状态、错误提示等会被正确重置
- ✅ 组件会被正确地重新初始化
