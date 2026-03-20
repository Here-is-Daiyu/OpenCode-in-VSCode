# OpenCode for VSCode - TODO

> 最后更新: 2026-03-20
> 当前分支: `feature/settings-redesign`

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
| - | Chat UI 重新设计 | feature/ui-redesign (606a6f0, 5a4d240, af825be) | 消息渲染、Part 过滤、两列布局、Provider 图标、AgentSelector |
| - | Editor Panel | feature/editor-panel (b523d65) | SessionEditorPanelProvider, 共享 HTML, SSE 路由, 4 命令 |
| - | 右键上下文菜单 | feature/context-menu (84991f6) | Explain/Improve Code, chat:autoSend |
| - | 虚拟化滚动 | feature/virtual-scroll (e4f84fe) | @tanstack/react-virtual, 40 条阈值 |

---

## 进行中 / 待完成

### P0 - 高优先级

#### 1. Settings 页面全面重写
- **状态:** 🔨 进行中
- **复杂度:** 高
- **分支:** `feature/settings-redesign`
- **方案 (已确认):**
  - 从 7 Tab 精简为 5 Tab:
    1. **Connection** — 服务器 hostname/port、自动启动、可执行文件路径
    2. **Chat** — 字体大小、时间戳、自动换行、图片大小、tool call 显示、编辑器集成
    3. **Models** — 模型选择 (分组列表)、Agent 选择、推理力度、Provider 可用性开关
    4. **Integrations** — MCP Servers + 自定义 Slash Commands + Custom Provider CRUD
    5. **Permissions** — 权限规则 + Bash 命令模式覆盖 + 重置按钮
  - 蓝色主题 (#3b82f6) 卡片式布局，12px 圆角
  - 旧文件: SettingsApp.tsx (289行), 7 个 tab 组件, settings.css (1749行)

#### 2. 实际安装测试 + 视觉验收
- **状态:** 未开始
- **复杂度:** 低
- **思路:** 打包 VSIX → 安装 → 验证所有新 UI 在亮/暗主题下的效果
- **依赖:** Settings 重写完成后

### P1 - 中优先级

#### 3. 防闪烁主题切换 (Theme Transition Suppression)
- **状态:** 未开始
- **复杂度:** 极低 (~20 行)
- **思路:** CSS transition suppression + 双帧 rAF

#### 4. Reasoning Traces 推理痕迹增强
- **状态:** 部分完成 (ReasoningPart 已有基础)
- **复杂度:** 低
- **思路:** 折叠/展开 + 计时器 + 文本清洗

#### 5. Extension host 侧 Agent 数据验证
- **状态:** 未验证
- **复杂度:** 低-中

#### 6. ANSI 颜色渲染 (Tool Output)
- **状态:** 未开始
- **复杂度:** 低

### P3 - 收尾

#### 7. Light/Dark 主题兼容性检查
#### 8. 合并所有 feature 分支到 main
#### 9. 最终打包 VSIX

---

## 分支状态

| 分支 | 状态 | 基于 |
|------|------|------|
| `main` | 基线 | - |
| `feature/ui-redesign` | ✅ 已提交 | main |
| `feature/editor-panel` | ✅ 已提交 | main |
| `feature/context-menu` | ✅ 已提交 | editor-panel |
| `feature/virtual-scroll` | ✅ 已提交 | editor-panel |
| `feature/settings-redesign` | 🔨 进行中 | main |
