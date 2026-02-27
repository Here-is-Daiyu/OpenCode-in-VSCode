# OpenCode in VSCode

> 本项目大量使用AI

将 OpenCode CLI 的核心能力嵌入 VS Code：在侧边栏提供聊天面板、会话管理与服务状态，并通过 HTTP REST + SSE 与 `opencode serve` 通信。

## 功能特性

- Webview 聊天面板，支持流式消息与工具调用展示
- 会话列表 TreeView，支持新建、切换、刷新等操作
- 服务状态 TreeView，查看连接与运行状态
- 模型、Agent、推理强度等配置项可在面板内快速切换
- 代码高亮、token 使用条、消息局部更新等交互能力

## 技术栈

- TypeScript
- VS Code Extension API（Webview / TreeView）
- esbuild
- HTTP REST + SSE

## 项目结构

```text
src/
├── extension.ts    # 扩展入口，注册命令和事件
├── chatPanel.ts    # Webview 聊天面板（HTML/CSS/JS 内联）
├── client.ts       # OpenCode HTTP API 客户端
├── server.ts       # opencode serve 进程生命周期管理
└── treeViews.ts    # 会话列表 + 服务状态 TreeView Provider
```

## 环境要求

- Node.js 18+
- VS Code 1.94+
- 本地可用的 `opencode` 命令（用于启动 `opencode serve`）

## 快速开始

```bash
npm install
npm run compile
```

在 VS Code 中按 `F5` 启动 Extension Development Host 进行调试。

## 常用开发命令

```bash
npm run compile   # 类型检查 + 打包
npm run watch     # 监听构建
```

## 设计约束

- 不使用 `@opencode-ai/sdk`，统一走 `src/client.ts` 的轻量 HTTP 客户端
- Webview 使用严格 CSP（`script-src 'nonce-...'`），禁止内联事件处理器
- 用户可见文案默认使用中文

## 许可证

MIT
