# OpenCode for VSCode - TODO

> 最后更新: 2026-03-21
> 当前分支: `main` (所有 feature 已合并)
> VSIX 大小: 待打包

---

## 已完成

| # | 功能 | 原分支 | 备注 |
|---|------|--------|------|
| 1 | KaTeX 数学公式渲染 | main | marked-katex-extension |
| 2 | Tool call 展示优化 | main | 紧凑 UPPERCASE 样式 |
| 3 | Subagent 展示 | main | SubtaskPart |
| 4 | Session 自动刷新 | main | SSE 事件驱动 |
| 5 | Workspace 变更检测 | main | 服务器 CWD 跟踪 |
| 6 | 文件点击跳转 | main | 支持行号/列号 |
| 7 | MCP 实时状态 | main | 轮询 + 状态展示 |
| 8 | API 审计修复 | main | 10 处 API 不匹配修复 |
| 9 | VSIX 打包优化 | main | 1.39 MB → 1.41 MB |
| 10 | Chat UI 重新设计 | feature/ui-redesign | 消息渲染、Part 过滤、两列布局、Provider 图标、AgentSelector |
| 11 | Editor Panel | feature/editor-panel | SessionEditorPanelProvider, 共享 HTML, SSE 路由, 4 命令 |
| 12 | 右键上下文菜单 | feature/context-menu | Explain/Improve Code, chat:autoSend |
| 13 | 虚拟化滚动 | feature/virtual-scroll | @tanstack/react-virtual, 40 条阈值 |
| 14 | Settings 页面重写 (7→5 Tab) | feature/settings-redesign | Connection/Chat/Models/Integrations/Permissions |
| 15 | 防闪烁主题切换 | feature/theme-flash-fix | CSS transition suppression + 双帧 rAF |
| 16 | Reasoning Traces 增强 | feature/reasoning-traces | useElapsedTime 计时器 + textCleaning + spinner |
| 17 | Agent 后端数据验证 + Form Controls | feature/agent-validation | agentStore + dynamic Dropdown + slider theming |
| 18 | 合并 8 个 feature 分支到 main | - | 所有冲突已解决，双端构建通过 |
| 19 | ANSI 颜色渲染 (Tool Output) | feature/final-polish | 自研 ansiToHtml 解析器, SGR 0-107, 256色, truecolor |
| 20 | Light/Dark 主题兼容性修复 | feature/final-polish | 10 处硬编码颜色替换为 CSS 变量, 亮色主题覆盖 |
| 21 | Slash Command 系统增强 | feature/slash-command-enhancement | commandStore + 缓存/去重 + 加载/空状态 + 命令参数 + 键盘提示 |

---

## 待完成

暂无。所有计划功能已完成。

---

## 分支状态

所有 feature 分支已合并到 main，可以清理：

| 分支 | 状态 |
|------|------|
| `feature/ui-redesign` | ✅ 已合并 |
| `feature/editor-panel` | ✅ 已合并 |
| `feature/virtual-scroll` | ✅ 已合并 |
| `feature/context-menu` | ✅ 已合并 |
| `feature/settings-redesign` | ✅ 已合并 |
| `feature/theme-flash-fix` | ✅ 已合并 |
| `feature/reasoning-traces` | ✅ 已合并 |
| `feature/agent-validation` | ✅ 已合并 |
| `feature/final-polish` | ✅ 已合并 |
| `feature/slash-command-enhancement` | ✅ 已合并 |
