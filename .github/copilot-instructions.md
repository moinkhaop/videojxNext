# GitHub Copilot 工作区指令

## 项目概述
这是一个现代化的视频分享链接转存工具，基于 Next.js、TypeScript、TailwindCSS 和 Shadcn UI 构建。

## 技术栈
- **前端框架**: Next.js 14 (App Router)
- **类型系统**: TypeScript
- **样式框架**: TailwindCSS
- **UI组件库**: Shadcn UI + Radix UI
- **图标库**: Lucide React
- **状态管理**: React Hooks + localStorage
- **API代理**: Next.js API Routes

## 项目结构
```
src/
├── app/                    # Next.js App Router 页面
│   ├── api/               # API 路由
│   │   └── proxy/        # 代理API
│   ├── convert/          # 单链接转存页面
│   ├── batch/            # 批量转存页面
│   ├── history/          # 历史记录页面
│   └── settings/         # 设置页面
├── components/            # React 组件
│   ├── ui/               # 基础UI组件
│   └── navigation.tsx    # 导航组件
├── lib/                  # 工具库
│   ├── utils.ts          # 通用工具函数
│   ├── storage.ts        # 本地存储管理
│   └── conversion.ts     # 转存服务
└── types/                # TypeScript 类型定义
    └── index.ts          # 核心类型定义
```

## 核心功能模块

### 1. 存储管理 (src/lib/storage.ts)
- `ConfigManager`: 配置管理类，处理解析器和WebDAV配置
- `HistoryManager`: 历史记录管理类
- `DataManager`: 数据导入导出工具
- `StorageEncryption`: 简单的数据加密工具

### 2. 转存服务 (src/lib/conversion.ts)
- `ConversionService`: 核心转存服务类
- 支持单个和批量视频转存
- 进度跟踪和错误处理
- WebDAV连接测试

### 3. API代理 (src/app/api/proxy/)
- `/api/proxy/parser`: 视频解析API代理
- `/api/proxy/webdav`: WebDAV上传代理
- 解决CORS跨域问题

### 4. 类型定义 (src/types/index.ts)
- 完整的TypeScript类型定义
- 涵盖所有业务实体和API响应

## 开发准则

### 代码风格
- 使用 TypeScript 严格模式
- 遵循 ESLint 和 Prettier 规范
- 组件使用函数式组件 + Hooks
- 优先使用 Shadcn UI 组件

### 组件开发
- 所有客户端组件标记 `'use client'`
- 使用 `cn()` 函数合并 className
- 遵循 Radix UI 的组件模式
- 保持组件的可复用性和可测试性

### 状态管理
- 使用 localStorage 进行数据持久化
- 敏感数据使用简单加密
- 通过 React Context 共享全局状态（如需要）

### API设计
- 统一的错误处理格式
- 详细的日志记录
- 支持GET请求用于测试

### 样式规范
- 使用 TailwindCSS 原子类
- 遵循设计系统的颜色和间距
- 响应式设计优先
- 支持明暗主题

## 待实现功能
1. 批量转存页面 (/batch)
2. 历史记录页面 (/history)  
3. 设置页面 (/settings)
4. WebDAV配置管理
5. 解析器配置管理
6. 主题切换功能
7. 数据导入导出
8. 错误边界和加载状态

## 常用命令
- `npm run dev`: 启动开发服务器
- `npm run build`: 构建生产版本
- `npm run lint`: 代码检查
- `npm run type-check`: 类型检查

## 注意事项
- 所有用户数据存储在 localStorage 中
- 敏感信息需要加密存储
- API请求需要适当的错误处理
- 保持良好的用户体验和进度反馈
