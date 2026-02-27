# OpenCode in VSCode

> 本项目大量使用AI

将 OpenCode CLI 的核心能力嵌入 VS Code：在侧边栏提供聊天面板、会话管理与服务状态，并通过 HTTP REST + SSE 与 `opencode serve` 通信。

## 功能特性

- Webview 聊天面板，支持流式消息与工具调用展示
- 会话列表 TreeView，支持新建、切换、刷新等操作
- 服务状态 TreeView，查看连接与运行状态
- 侧边栏齿轮按钮 ⚙ 打开 Webview 设置面板，支持模型 / Agent / Provider 等配置项的快速切换
- 设置项 blur 自动保存，布尔值使用开关切换，文本 / 数字使用输入框
- 模型、Agent、推理强度等配置可在聊天面板内快速切换
- 代码高亮、token 使用条、消息局部更新等交互能力
- 健壮的服务器连接流程：自动重试、健康检查、SSE 断线重连

## 技术栈

- TypeScript
- VS Code Extension API（Webview / TreeView）
- esbuild
- HTTP REST + SSE

## 项目结构

```text
src/
├── extension.ts      # 扩展入口，注册命令和事件
├── chatPanel.ts      # Webview 聊天面板（HTML/CSS/JS 内联）
├── settingsPanel.ts  # Webview 设置面板（齿轮按钮触发）
├── client.ts         # OpenCode HTTP API 客户端
├── server.ts         # opencode serve 进程生命周期管理
└── treeViews.ts      # 会话列表 + 服务状态 TreeView Provider
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

- `src/client.ts` 基于 `@opencode-ai/sdk/client` 封装，SDK 未覆盖的端点通过 `rawRequest` 回退
- Webview 使用严格 CSP（`script-src 'nonce-...'`），禁止内联事件处理器
- Webview 内联 JS 位于模板字符串中，反斜杠需要双重转义（如 `'\\n'` 而非 `'\n'`）
- 用户可见文案默认使用中文

## 许可证

MIT
