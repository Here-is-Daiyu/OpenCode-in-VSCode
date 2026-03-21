# OpenCode for VSCode - TODO

> 最后更新: 2026-03-21
> 当前分支: `main` (合并中)

---

## 已完成

| # | 功能 | 分支 | 备注 |
|---|------|------|------|
| - | KaTeX 数学公式渲染 | main | marked-katex-extension |
| - | Tool call 展示优化 | main | 紧凑 UPPERCASE 样式 |
| - | Subagent 展示 | main | SubtaskPart |
| - | Session 自动刷新 | main | SSE 事件驱动 |
| - | Workspace 变更检测 | main | 服务器 CWD 跟踪 |
| - | 文件点击跳转 | main | 支持行号/列号 |
| - | MCP 实时状态 | main | 轮询 + 状态展示 |
| - | API 审计修复 | main | 10 处 API 不匹配修复 |
| - | VSIX 打包优化 | main | 1.39 MB |
| - | Chat UI 重新设计 | feature/ui-redesign | 消息渲染、Part 过滤、两列布局、Provider 图标、AgentSelector |
| - | Editor Panel | feature/editor-panel | SessionEditorPanelProvider, 共享 HTML, SSE 路由, 4 命令 |
| - | 右键上下文菜单 | feature/context-menu | Explain/Improve Code, chat:autoSend |
| - | 虚拟化滚动 | feature/virtual-scroll | @tanstack/react-virtual, 40 条阈值 |
| - | Settings 页面重写 (7→5 Tab) | feature/settings-redesign | Connection/Chat/Models/Integrations/Permissions |
| - | 防闪烁主题切换 | feature/theme-flash-fix | CSS transition suppression + 双帧 rAF |
| - | Reasoning Traces 增强 | feature/reasoning-traces | 计时器 + 文本清洗 + spinner |
| - | Agent 后端数据验证 + Form Controls | feature/agent-validation | agentStore + dynamic Dropdown + slider theming |

---

## 进行中

### 🔨 合并所有 feature 分支到 main
- **状态:** 进行中
- 8 个分支 → main

---

## 待完成

### P3 - 收尾

#### 1. Light/Dark 主题兼容性检查
- **状态:** 未开始
- **思路:** 逐一检查新 UI 在 VSCode 亮色/暗色主题下的表现

#### 2. ANSI 颜色渲染 (Tool Output)
- **状态:** 未开始
- **复杂度:** 低
- **思路:** 使用 `ansi-to-html` 或 `ansi-to-react` 处理 bash tool output 中的 ANSI 着色

#### 3. 最终打包 VSIX
- **状态:** 等全部功能完成
- **思路:** `npm run package` → 检查大小 → 发布

---

## 分支状态

| 分支 | 状态 | 合并到 main |
|------|------|-------------|
| `feature/ui-redesign` | ✅ 已合并 | ✅ |
| `feature/editor-panel` | ✅ 已合并 | ✅ |
| `feature/virtual-scroll` | ✅ 已合并 | ✅ |
| `feature/context-menu` | ✅ 已合并 | ✅ |
| `feature/settings-redesign` | 🔨 合并中 | - |
| `feature/theme-flash-fix` | 待合并 | - |
| `feature/reasoning-traces` | 待合并 | - |
| `feature/agent-validation` | 待合并 | - |
