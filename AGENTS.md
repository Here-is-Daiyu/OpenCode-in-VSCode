# AGENTS.md

## 项目概述

本项目是 OpenCode 的 VSCode 扩展，通过 Webview 聊天面板、会话管理 TreeView 和完整的 API 集成，将 OpenCode（AI 编程助手 CLI 工具）的所有功能嵌入 VSCode。

扩展通过 HTTP REST API + SSE 与 `opencode serve` 进程通信。

## 技术栈

- **语言**: TypeScript
- **运行时**: VSCode Extension Host (Node.js)
- **构建工具**: esbuild
- **UI**: VSCode Webview API + TreeView API
- **通信**: HTTP REST + SSE（Server-Sent Events）

## 项目结构

```
src/
├── extension.ts    # 扩展入口，注册命令和事件
├── chatPanel.ts    # Webview 聊天面板（HTML/CSS/JS 内联）
├── client.ts       # OpenCode HTTP API 客户端封装
├── server.ts       # opencode serve 进程生命周期管理
└── treeViews.ts    # 会话列表 + 服务状态 TreeView Provider
```

## 构建与调试

```bash
npm install          # 安装依赖
npm run compile      # 类型检查 + esbuild 打包
npm run watch        # 开发模式（监听文件变更）
```

按 `F5` 启动 Extension Development Host 调试。

## 开发规范

- **不使用** `@opencode-ai/sdk` npm 包，使用 `src/client.ts` 中的轻量 HTTP 客户端
- Webview 的 CSP 策略为 `script-src 'nonce-...'`，**禁止内联事件处理器**（`onclick` 等），必须使用 `addEventListener`
- API 类型定义集中在 `src/client.ts` 顶部
- 所有用户可见文本使用中文

## 关键 API 端点

| 端点 | 说明 |
|------|------|
| `GET /config` | 获取完整配置（model, agent, enabled_providers 等） |
| `PATCH /config` | 更新配置（设置 model, default_agent 等） |
| `GET /provider` | 获取所有 provider 及 connected 列表 |
| `GET /config/providers` | 获取 provider 列表及默认模型 |
| `GET /agent` | 获取所有 agent 列表 |
| `GET /event` | SSE 实时事件流 |

## 工作流程

每修复或完成一个独立问题后，执行一次 git commit，保持提交粒度清晰。
