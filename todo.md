# OpenCode for VSCode - TODO

> 最后更新: 2026-03-20
> 当前分支: `feature/ui-redesign`

---

## 已完成

| # | 功能 | 完成日期 | 备注 |
|---|------|----------|------|
| - | KaTeX 数学公式渲染 | 已完成 | marked-katex-extension |
| - | Tool call 展示优化 | 已完成 | 紧凑 UPPERCASE 样式 |
| - | Subagent 展示 | 已完成 | SubtaskPart |
| - | Session 自动刷新 | 已完成 | SSE 事件驱动 |
| - | Workspace 变更检测 | 已完成 | 服务器 CWD 跟踪 |
| - | 文件点击跳转 | 已完成 | 支持行号/列号 |
| - | MCP 实时状态 | 已完成 | 轮询 + 状态展示 |
| - | API 审计修复 | 已完成 | 10 处 API 不匹配修复 |
| - | VSIX 打包优化 | 已完成 | 1.39 MB |
| - | Chat UI 重新设计 | 已完成 | 消息渲染、Part 过滤、两列布局、Provider 图标 |
| - | ToolCallPart 简化 | 已完成 | 413→262 行，紧凑风格 |
| - | Agent 选择器 | 已完成 | AgentSelector + toolbar + store |

---

## 进行中 / 待完成

### P0 - 高优先级

#### 1. Settings 页面全面重写
- **状态:** 未开始
- **复杂度:** 高
- **分支:** `feature/ui-redesign` (当前) 或新建 `feature/settings-redesign`
- **思路:**
  - Tab 结构全部重新规划（雨薇说"全部重新规划"）
  - 蓝色主题 (#3b82f6) 卡片式布局，12px 圆角
  - 参考 OpenCode Desktop SettingsDialog 的分类方式
  - 当前 7 个 tab 组件需要重新组织
- **涉及文件:**
  - `webview-ui/src/panels/settings/SettingsApp.tsx` (289 行)
  - `webview-ui/src/panels/settings/tabs/` (7 个 tab 组件)
  - `webview-ui/src/styles/settings.css`

#### 2. 实际安装测试 + 视觉验收
- **状态:** 未开始
- **复杂度:** 低
- **思路:** 打包 VSIX → 安装 → 验证 Chat UI 新设计在亮/暗主题下的效果
- **依赖:** 雨薇姐姐亲眼看效果后可能有调整意见

### P1 - 中优先级 (来自 openchamber-feature-reference.md)

#### 3. 右键上下文菜单: Explain / Improve Code
- **状态:** 未开始
- **复杂度:** 极低 (~100 行)
- **借鉴:** OpenChamber `packages/vscode/src/extension.ts` L225-317
- **思路:**
  - package.json: 添加 submenu `opencode.submenu` + 3 个命令 (Add to Context / Explain / Improve Code)
  - extension.ts: 获取选区 → 构造 prompt → 分别调用 addTextToInput / createNewSessionWithPrompt
  - ChatViewProvider: 添加 `addTextToInput()` + `createNewSessionWithPrompt()` 方法
  - Webview 端: 处理 `addToContext` / `createSessionWithPrompt` 命令
- **投入产出:** 极高，5-10 分钟搞定

#### 4. 防闪烁主题切换 (Theme Transition Suppression)
- **状态:** 未开始
- **复杂度:** 极低 (~20 行)
- **借鉴:** OpenChamber `ThemeSystemContext.tsx` 双帧 rAF 模式
- **思路:**
  - CSS: `.oc-theme-switching * { transition: none !important; animation: none !important; }`
  - JS: 切主题时 add class → 双帧 rAF → remove class
- **投入产出:** 极高，5 分钟搞定

#### 5. Reasoning Traces 推理痕迹增强
- **状态:** 部分完成 (ReasoningPart 已有基础，已改为 "THINKING" 大写)
- **复杂度:** 低
- **借鉴:** OpenChamber `ReasoningPart.tsx`
- **思路:**
  - 折叠/展开 + 截断摘要 (首行或到第一个句号)
  - 流式输出时显示实时计时器 (250ms tick)
  - 文本清洗: 移除 markdown `>` 引用前缀
  - 区分 thinking vs justification 变体
- **涉及文件:** `webview-ui/src/components/message/parts/ReasoningPart.tsx`

#### 6. Extension host 侧 Agent 数据验证
- **状态:** 未验证
- **复杂度:** 低-中
- **思路:**
  - 确认 extension.ts 是否从 OpenCode server 获取 agent 列表
  - 确认 SSE 是否有 agent 相关事件
  - 如无，需添加 API 调用 + 转发逻辑到 webview
- **涉及文件:** `src/extension.ts`, `src/services/openCodeClient.ts`

### P2 - 低优先级 (大功能)

#### 7. Editor Panel (Session 在编辑器区域打开)
- **状态:** 未开始
- **复杂度:** 中 (~240 行 Provider + 命令注册)
- **借鉴:** OpenChamber `SessionEditorPanelProvider.ts`
- **思路:**
  - 新建 `SessionEditorPanelProvider.ts` 使用 `vscode.WebviewPanel`
  - 多实例管理: Map<sessionId, panel>，每个 panel 独立 SSE
  - 共享 webview HTML，通过 `viewMode: 'editor'` 区分布局
  - 注册命令: openActiveSessionInEditor / openNewSessionInEditor 等
  - 生命周期清理: panel 关闭时 abort SSE
- **涉及文件:**
  - 新建 `src/providers/sessionEditorPanelProvider.ts`
  - 修改 `src/extension.ts` (命令注册)
  - 修改 `package.json` (contributes.commands)
  - 可能修改 webview HTML 生成逻辑

#### 8. 虚拟化滚动 (Virtualized Message List)
- **状态:** 未开始
- **复杂度:** 高 (~500+ 行)
- **借鉴:** OpenChamber `MessageList.tsx` + `@tanstack/react-virtual`
- **思路:**
  - 阈值激活: 40 条消息以上才启用 (短对话零开销)
  - Turn-based 分组作为虚拟化单元
  - 视口锚定 (内容更新时保持位置)
  - 动态高度估算: base 120px + 每条助手消息 120px
  - 防闪烁: 保留上次有效虚拟行数据
- **涉及文件:**
  - `webview-ui/src/panels/chat/ChatApp.tsx` 消息列表部分
  - 新建虚拟化相关 hooks

#### 9. ANSI 颜色渲染 (Tool Output)
- **状态:** 未开始
- **复杂度:** 低
- **思路:** 使用 `ansi-to-html` 或 `ansi-to-react` 轻量库处理 bash tool output 中的 ANSI 着色，无需从零实现
- **涉及文件:** `webview-ui/src/components/message/parts/ToolCallPart.tsx`

### P3 - 收尾

#### 10. Light/Dark 主题兼容性检查
- **状态:** 未开始
- **思路:** 逐一检查新 UI 在 VSCode 亮色/暗色主题下的表现

#### 11. Git commit UI redesign 工作
- **状态:** 等验收后
- **思路:** `feature/ui-redesign` 分支上的所有修改提交

#### 12. 最终打包 VSIX
- **状态:** 等全部功能完成
- **思路:** `npm run package` → 检查大小 → 发布

---

## 建议实施顺序

```
第一批 (快速胜利, 极低成本):
  3. 右键 Explain / Improve Code  →  极低复杂度, 极高价值
  4. 防闪烁主题切换               →  极低复杂度, 中价值

第二批 (UI 收尾):
  1. Settings 页面重写            →  高复杂度, 高价值
  2. 安装测试 + 视觉验收          →  低复杂度, 必做
  5. Reasoning Traces 增强        →  低复杂度, 高价值
  6. Agent 后端数据验证            →  低复杂度, 必做

第三批 (大功能):
  7. Editor Panel                 →  中复杂度, 极高价值
  8. 虚拟化滚动                   →  高复杂度, 极高价值
  9. ANSI 颜色渲染                →  低复杂度, 中价值

收尾:
  10-12. 主题检查 / Git commit / 打包
```
