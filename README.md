# 视频分享链接转存工具

一个现代化的视频分享链接转存工具，基于 Next.js、TypeScript、TailwindCSS 和 Shadcn UI 构建。

## ✨ 特性

- 🎯 **单链接转存**: 输入视频分享链接，快速解析并上传到WebDAV服务器
- 📦 **批量处理**: 支持多个链接的批量转存，智能队列管理
- 📚 **历史记录**: 完整的转存历史，支持搜索和筛选
- ⚙️ **配置管理**: 可视化管理WebDAV服务器和解析API配置
- 🔒 **数据安全**: 敏感信息本地加密存储
- 📱 **响应式设计**: 完美支持桌面和移动设备
- 🌙 **主题支持**: 支持明暗主题切换
- 🧹 **自动清理**: 智能清理过期临时文件和缓存数据
- 💾 **数据备份**: 支持配置和历史记录的导入导出

## 🚀 快速开始

### 环境要求

- Node.js 18+ 
- npm 或 yarn

### 安装

```bash
# 克隆项目
git clone https://github.com/your-username/dyjx.git
cd dyjx

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

访问 `http://localhost:3000` 查看应用。

### 构建生产版本

```bash
npm run build
npm start
```

## 📖 使用指南

### 1. 配置设置

首次使用前，需要配置：

1. **WebDAV服务器**: 配置你的云存储服务器信息
2. **解析API**: 配置视频解析服务的API信息

### 2. 单链接转存

1. 在首页选择"单链接转存"
2. 粘贴视频分享链接
3. 选择解析API和WebDAV服务器
4. 点击"开始转存"

### 3. 批量转存

1. 选择"批量转存"功能
2. 每行输入一个视频链接
3. 选择统一的配置
4. 开始批量处理

### 4. 历史记录

- 查看所有转存记录
- 搜索特定视频
- 删除不需要的记录
- 导出历史数据

## 🛠️ 技术栈

- **前端框架**: Next.js 14 (App Router)
- **类型系统**: TypeScript
- **样式框架**: TailwindCSS
- **UI组件**: Shadcn UI + Radix UI
- **图标**: Lucide React
- **状态管理**: React Hooks + localStorage

## 📁 项目结构

```
src/
├── app/                    # Next.js 页面和API路由
│   ├── api/               # API接口
│   ├── convert/           # 单链接转存页面
│   ├── batch/             # 批量转存页面
│   ├── history/           # 历史记录页面
│   └── settings/          # 设置页面
├── components/            # React组件
│   ├── ui/                # 基础UI组件
│   └── navigation.tsx     # 导航组件
├── lib/                   # 工具库
│   ├── storage.ts         # 存储管理
│   ├── conversion.ts      # 转存服务
│   ├── cleanup.ts         # 清理服务
│   └── utils.ts           # 工具函数
└── types/                 # TypeScript类型定义
```

## 🔧 开发

### 可用命令

```bash
# 开发服务器
npm run dev

# 构建项目
npm run build

# 启动生产服务器
npm start

# 代码检查
npm run lint

# 类型检查
npm run type-check
```

### 环境变量

项目使用本地存储，无需环境变量配置。所有配置通过界面管理。

## 🤝 贡献

欢迎提交 Pull Request！请确保：

1. 代码遵循项目的 ESLint 规范
2. 提交前运行 `npm run lint` 和 `npm run type-check`
3. 添加适当的 TypeScript 类型定义
4. 更新相关文档

## 📝 许可证

[MIT License](LICENSE)

## 🆘 支持

如果遇到问题：

1. 查看 [Issues](https://github.com/your-username/dyjx/issues)
2. 创建新的 Issue 描述问题
3. 查看项目文档和代码注释

## 🔄 更新日志

### v1.0.0
- ✅ 基础架构搭建
- ✅ 单链接转存功能
- ✅ 存储管理系统
- ✅ API代理层
- ✅ 响应式UI设计
- 🧹 **自动清理功能**: 智能清理过期临时文件和缓存数据

### 计划功能
- 🔄 批量转存功能
- 🔄 历史记录管理
- 🔄 设置页面
- 🔄 主题切换
- 🔄 数据导入导出

---

⭐ 如果这个项目对你有帮助，请给一个Star！
