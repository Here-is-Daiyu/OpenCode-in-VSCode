# OpenCode for VSCode - TODO

> 最后更新: 2026-03-22
> 当前分支: `feature/gap-features`
> VSIX 大小: 待打包

### 2026-03-22 修复记录

- ✅ Status 面板修复：注入 client/logger、开启自动刷新、模型/Agent 读取与 live config 对齐（`default_agent`、`model = null` → `auto`）
- ✅ Chat UI 修复：assistant 仅在 footer 显示模型/Provider、滚动跟随更稳、composer 间距收紧、异常字符串渲染加保护与日志
- ✅ Settings 页修复：改为共享 webview shell 载入样式资源，模型/Agent 配置读写改正，页面头部摘要补齐
- ✅ 验证流程：typecheck / build / reviewer

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

## 进行中

| # | 功能 | 分支 | 状态 | 备注 |
|---|------|------|------|------|
| 22 | API 类型修正 + MCP/Provider/Model 修复 | fix/mcp-providers-models-and-ui | 🔄 待合并 | MCPStatus 联合类型、LSPStatus id/root、Agent name 主键、SSE 重连刷新 |
| 23 | Settings 页面视觉重构 V2 | feature/settings-redesign-v2 | 🔄 进行中 | 从 fix 分支衍生，纯 CSS + Codicons 重构 |

**详细内容 (fix/mcp-providers-models-and-ui):**
- ✅ API 文档更新 (docs/research/opencode-api-reference.md) — 对照 live server 验证所有端点
- ✅ MCPStatus 改为 5 种状态的 discriminated union (connected/disabled/failed/needs_auth/needs_client_registration)
- ✅ LSPStatus: 添加 id/root 字段，'running' → 'connected'，移除 languages
- ✅ Agent 类型: 移除 id，以 name 为主键，添加 mode/native/prompt/model/hidden/temperature/permission/options
- ✅ 所有下游消费者修复 (commands/index.ts, agentStore.ts, AgentSelector.tsx, ModelsTab.tsx)
- ✅ StatusTreeProvider 显示逻辑更新 (mcpStatusColor, getMCPChildren, getLSPChildren)
- ✅ Chat 输入框高度优化 (min-height 48→36px, textarea 32→24px)
- ✅ Markdown 表格窄屏适配 (移除 display:block, 改用 table-wrapper overflow-x)
- ✅ SSE 重连自动数据刷新 (onReconnected 回调 + handleSSEReconnect + 并发防护)
- ✅ 双端编译通过 (tsc --noEmit + vite build)

**详细内容 (feature/settings-redesign-v2):**
- ✅ `@vscode/codicons` 安装并在 settings webview 中导入
- ✅ Unicode 图标 → Codicons (plug, comment-discussion, sparkle, extensions, shield)
- ✅ Chevron `›` → `codicon codicon-chevron-right`
- ✅ Settings header 简化: 移除 eyebrow、描述段落、panel eyebrow、status pill
- ✅ 空状态 loading 图标: Unicode `✦` → `codicon codicon-loading codicon-modifier-spin`
- ✅ CSS 间距标准化到 8px 网格 (17+ 处修改)
- ✅ `.settings-panel` 移除 `min-height: 100%`
- ✅ Panel header 添加 `border-bottom` 分隔线
- ✅ 孤立 CSS 规则清理
- ✅ IntegrationsTab.tsx (1045→75行) 拆分为 3 个子模块:
  - `integrations/MCPSection.tsx` — MCP 服务器卡片 + 添加表单
  - `integrations/CommandsSection.tsx` — 自定义命令卡片 + 添加/编辑表单
  - `integrations/ProvidersSection.tsx` — 自定义 Provider 卡片 + 添加/编辑表单
- ✅ 双端编译通过 (tsc --noEmit + vite build)

## 待完成

> 基于 2026-03-21 功能差距分析 (详见 `docs/research/feature-gap-analysis.md`)

### Phase 1 — Quick Wins (XS-S)

| # | 功能 | 复杂度 | 优先级 | 备注 |
|---|------|--------|--------|------|
| 24 | Context Window Usage Bar | XS | 中 | 进度条显示 context 使用量 vs 模型上限 |
| 25 | Session 时间分组 | S | 中 | Today/Yesterday/Previous 7 Days 分桶 |
| 26 | 可折叠的用户消息 | S | 中 | 长消息 8 行预览 + Show more/less |
| 27 | Turn Duration 显示 | S | 中 | user→assistant 往返时间 |
| 28 | Session 搜索 | S | 中 | 实时过滤 session 列表 |
| 29 | 输入历史 | S | 低 | ↑↓ 箭头浏览已发送消息 |

### Phase 2 — Core Enhancements (S-M)

| # | 功能 | 复杂度 | 优先级 | 备注 |
|---|------|--------|--------|------|
| 30 | 缺失的 Message Part 渲染 | M | 高 | snapshot/patch/agent/retry/compaction 5 种 |
| 31 | Retry Status Inline | S | 中 | 重试倒计时 + 可展开错误详情 |
| 32 | Agent Variant 选择器 | S | 中 | default/fast/deep 思考模式下拉 |
| 33 | Tool-Specific Renderers | M | 中 | TaskRenderer/TodoRenderer/DefaultRenderer |

### Phase 3 — Major Features (M-L)

| # | 功能 | 复杂度 | 优先级 | 备注 |
|---|------|--------|--------|------|
| 34 | @-Mention 系统 | L | 高 | 文件选择器、搜索 API、mention 解析、pill UI |
| 35 | Fisheye Outline Index | L | 低 | 浮动右侧消息导航 |
| 36 | Tool Timeline 布局 | M | 低 | 垂直时间线连接器 |
| 37 | Active Sessions Tab | M | 低 | 侧边栏活跃 session 视图 |
| 38 | 通知系统 | M | 低 | Toast + 历史面板 |

### 未消费的 Server API

| 端点 | 用途 | 关联功能 |
|------|------|----------|
| `GET /file`, `GET /file/content` | 文件浏览 | @-Mention (#34) |
| `GET /find`, `GET /find/file`, `GET /find/symbol` | 搜索 | @-Mention (#34) |
| `POST /session/:id/summarize` | AI 上下文压缩 | compaction part (#30) |
| `POST /session/:id/shell` | Session 内 shell 执行 | 未规划 |
| `GET /provider/auth` | Provider 认证方式 | Settings 增强 |
| `GET /experimental/tool/ids`, `GET /experimental/tool` | 工具 schema | Tool renderers (#33) |
| `GET /experimental/resource` | MCP 资源 | 未规划 |
| `GET /experimental/workspace`, `POST /experimental/workspace` | 工作区管理 | 未规划 |
| `GET /experimental/worktree` | Git worktree | 未规划 |
| `GET /vcs` | VCS/Git 信息 | 未规划 |
| `GET /command` | 服务端命令列表 | Slash commands 增强 |
| `GET /skill` | 可用 skills | 未规划 |

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
| `fix/mcp-providers-models-and-ui` | 🔄 待合并 |
| `feature/settings-redesign-v2` | 🔄 进行中 |
