# RustDesk Workspace

> 一个高性能、本地优先、安全、可扩展的个人生产力中心。

RustDesk Workspace 是一个基于 **Rust + Tauri 2.0 + React** 构建的跨平台桌面工作台应用，融合了：

- 📝 **Notion** 的知识管理
- 🔗 **Obsidian** 的本地知识库 + 双向链接
- ⚡ **Raycast** 的快捷操作 + Command Palette
- 📊 **Linear** 的极简项目管理
- 🛠️ **VS Code** 的开发者体验

## ✨ 特性

- **本地优先** — 所有数据存储在你的设备上（SQLite + 本地文件系统）
- **高性能** — Rust 后端 + 60FPS 流畅动画
- **跨平台** — Windows / macOS / Linux
- **隐私安全** — 无云依赖，可选 WebDAV / Git / S3 同步
- **AI Native** — 内置 AI 助手，可接入任意 LLM
- **现代 UI** — 极简设计、高级灰色调、流畅动画

## 🏗️ 技术栈

| 层级 | 技术 |
| --- | --- |
| 核心语言 | Rust 1.75+ |
| 桌面框架 | Tauri 2.0 |
| 前端 | React 18 + TypeScript + Vite |
| 样式 | Tailwind CSS |
| 数据库 | SQLite (本地) |
| 状态管理 | Zustand |
| 动画 | Framer Motion + CSS |
| Markdown | react-markdown + remark-gfm |

## 📁 项目结构

```
rustdesk-workspace/
├── rustdesk-workspace-backend/   # Rust + Tauri 后端
│   ├── src/
│   │   ├── main.rs              # 入口
│   │   ├── lib.rs               # 应用主逻辑
│   │   ├── config.rs            # 配置 / 路径
│   │   ├── database.rs          # SQLite 初始化
│   │   ├── models.rs            # 数据模型
│   │   └── commands.rs          # Tauri 命令
│   ├── Cargo.toml
│   └── tauri.conf.json
├── rustdesk-workspace-frontend/  # React 前端
│   ├── src/
│   │   ├── App.tsx              # 主应用
│   │   ├── main.tsx             # 入口
│   │   ├── store.ts             # Zustand 状态
│   │   ├── api.ts               # Tauri 命令封装
│   │   ├── types.ts             # TypeScript 类型
│   │   ├── utils.ts             # 工具函数
│   │   ├── index.css            # 全局样式
│   │   ├── components/          # 通用组件
│   │   │   ├── Sidebar.tsx
│   │   │   ├── MainArea.tsx
│   │   │   ├── CommandPalette.tsx
│   │   │   └── AiPanel.tsx
│   │   └── pages/               # 页面
│   │       ├── Dashboard.tsx
│   │       ├── Projects.tsx
│   │       ├── Tasks.tsx
│   │       ├── Notes.tsx
│   │       ├── Knowledge.tsx
│   │       ├── Calendar.tsx
│   │       ├── Analytics.tsx
│   │       └── Settings.tsx
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── tailwind.config.js
└── package.json                  # 工作空间根
```

## 🚀 快速开始

### 环境要求

- **Rust** 1.75+
- **Node.js** 18+
- **Tauri 2.0** 依赖（参见 [Tauri 文档](https://tauri.app/start/prerequisites/)）

### 安装依赖

```bash
# 根工作空间
npm install

# 后端依赖（首次运行时会自动下载）
cd rustdesk-workspace-backend
cargo fetch
```

### 开发模式

```bash
# 根目录
npm run tauri:dev
```

### 构建发布版本

```bash
npm run tauri:build
```

构建产物位于：
- Windows: `target/release/rustdesk-workspace.exe`
- macOS: `target/release/bundle/macos/RustDesk Workspace.app`
- Linux: `target/release/bundle/deb/`

## ⌨️ 键盘快捷键

| 快捷键 | 操作 |
| --- | --- |
| `⌘/Ctrl + K` | 打开命令面板 |
| `⌘/Ctrl + Space` | 命令面板（备用） |
| `⌘/Ctrl + Shift + Space` | AI 助手 |
| `⌘/Ctrl + N` | 快速新建 |
| `⌘/Ctrl + 1~8` | 切换模块 |
| `Esc` | 关闭面板 |

## 📦 模块

### 🏠 Dashboard
- 问候语与今日进度
- 今日任务列表
- 活跃项目状态
- 最近活动时间线
- 快速记录面板

### 📁 Projects
- 项目列表 + 进度条
- 项目详情（Overview / Tasks / Activity）
- 颜色标签、负责人、截止日期
- 项目进度可视化编辑

### ✅ Tasks
- **列表视图** — 紧凑型任务流
- **看板视图** — Linear / Trello 风格拖拽
- **日历视图** — 按月查看任务分布
- 优先级 / 状态 / 项目筛选
- 任务字段：Title、Description、Priority、Status、Due Date、Tags

### 📝 Notes
- 三栏式 Markdown 编辑器
- **双向链接** `[[wikilink]]`
- 实时预览（编辑 / 拆分 / 预览）
- 标签、置顶、字数统计
- 全文搜索

### 📚 Knowledge
- **知识图谱** — 可视化笔记关系
- 标签筛选 + 全文搜索
- 节点大小反映关联数量

### 📅 Calendar
- 月历视图
- 事件管理（标题、时间、颜色）
- 全天事件支持

### 📊 Analytics
- 关键指标卡片
- 优先级 / 状态分布
- 项目任务分布
- 完成率环形图

### ⚙️ Settings
- 主题切换（Light / Dark / System）
- 键盘快捷键一览
- 数据导出（Markdown）
- AI 配置

## 🎨 设计语言

- **配色**：
  - 主色：`#111827`（深灰）
  - 背景：`#F8FAFC`
  - 强调色：`#3B82F6`（蓝）
  - 成功：`#22C55E`
  - 警告：`#F59E0B`
- **字体**：Inter（正文）+ JetBrains Mono（代码）
- **风格**：Linear 极简、Apple 设计语言、VS Code 效率感
- **动效**：60FPS，所有过渡使用 `cubic-bezier(0.16, 1, 0.3, 1)`

## 🔒 数据与隐私

- 所有数据存储在本地 SQLite 数据库
- 文件路径：`~/Library/Application Support/RustDeskWorkspace/`
- 无任何遥测与外部请求（除你主动配置的 AI 服务）
- 可选 WebDAV / Git / S3 同步

## 🗺️ 路线图

- [ ] 全文搜索（SQLite FTS5）
- [ ] 文件附件支持
- [ ] PDF / 图片预览
- [ ] WebDAV 同步
- [ ] 插件系统
- [ ] LLM 集成（OpenAI / Anthropic / Ollama）
- [ ] 移动端响应式布局

## 📝 许可

MIT

---

> **RustDesk Workspace** — Rust 开发者专属的个人操作系统。