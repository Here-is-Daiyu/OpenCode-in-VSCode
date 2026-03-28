# OpenChamber 功能借鉴参考

> 源仓库: <https://github.com/openchamber/openchamber>
> 用途: 为 OpenCode-in-VSCode 扩展开发提供功能实现参考
> 注意: MIT 协议，可借鉴思路；代码仅供阅读理解，需独立实现

---

## 实施优先级总览

| # | 功能 | 复杂度 | 借鉴价值 | 建议顺序 |
|---|------|--------|----------|----------|
| 1 | 右键 Explain / Improve Code | 极低 | 极高 | **第一批** |
| 2 | 防闪烁 Theme Suppression | 极低 | 中 | **第一批** |
| 3 | 推理痕迹 Reasoning Traces | 低 | 高 | **第一批** |
| 4 | Editor Panel | 中 | 极高 | **第二批** |
| 5 | 虚拟化滚动 | 中 | 极高 | **第二批** |
| 6 | ANSI 颜色 | 低 | 中 | **第二批** |

---

## 1. 右键上下文菜单（Add to Context / Explain / Improve Code）

### 代码位置

| 文件 | 作用 |
|------|------|
| `packages/vscode/package.json` | `contributes.commands` + `contributes.submenus` + `contributes.menus.editor/context` |
| `packages/vscode/src/extension.ts` (L225-317) | 三个命令的完整实现 |
| `packages/vscode/src/ChatViewProvider.ts` (L95-121) | `addTextToInput()` + `createNewSessionWithPrompt()` |
| `packages/vscode/webview/main.tsx` (L570-621) | webview 端 `onCommand` 处理器 |

### 核心机制

**package.json 注册结构:**

```jsonc
// commands
{ "command": "openchamber.addToContext", "category": "OpenChamber", "title": "Add to Context" },
{ "command": "openchamber.explain", "category": "OpenChamber", "title": "Explain" },
{ "command": "openchamber.improveCode", "category": "OpenChamber", "title": "Improve Code" }

// submenus
{ "id": "openchamber.submenu", "label": "OpenChamber" }

// menus
"editor/context": [
  { "submenu": "openchamber.submenu", "group": "navigation" }
],
"openchamber.submenu": [
  { "command": "openchamber.explain" },
  { "command": "openchamber.improveCode" },
  { "command": "openchamber.addToContext" }
]
```

**三个命令的行为差异:**

| 命令 | Prompt 模板 | 行为 |
|------|-------------|------|
| **Add to Context** | `{filepath}:{lineRange}\n\`\`\`{lang}\n{code}\n\`\`\`` | **追加到输入框**，不发送 |
| **Explain** | `"Explain the following Code / Text:\n\n{同上}"` | **新建 session 并自动发送** |
| **Improve Code** | `"Improve the following Code:\n\n{同上}"` | **新建 session 并自动发送** |

**Extension 端实现模式 (extension.ts):**

```typescript
// 共用的选区信息获取
const editor = vscode.window.activeTextEditor;
const selection = editor.selection;
const selectedText = editor.document.getText(selection);
const filePath = vscode.workspace.asRelativePath(editor.document.uri);
const languageId = editor.document.languageId;
const startLine = selection.start.line + 1;
const endLine = selection.end.line + 1;
const lineRange = startLine === endLine ? `${startLine}` : `${startLine}-${endLine}`;

// Add to Context: 追加到输入框
const contextText = `${filePath}:${lineRange}\n\`\`\`${languageId}\n${selectedText}\n\`\`\``;
chatViewProvider?.addTextToInput(contextText);

// Explain: 新建 session + 自动发送（无选区时解释整个文件）
const prompt = selectedText
  ? `Explain the following Code / Text:\n\n${filePath}:${lineRange}\n\`\`\`${languageId}\n${selectedText}\n\`\`\``
  : `Explain the following Code / Text:\n\n${filePath}`;
chatViewProvider?.createNewSessionWithPrompt(prompt);

// Improve Code: 必须有选区
const prompt = `Improve the following Code:\n\n${filePath}:${lineRange}\n\`\`\`${languageId}\n${selectedText}\n\`\`\``;
chatViewProvider?.createNewSessionWithPrompt(prompt);
```

**ChatViewProvider 端 (ChatViewProvider.ts):**

```typescript
// 追加文本到输入框
public addTextToInput(text: string) {
  this._view?.show(true);
  this._view?.webview.postMessage({
    type: 'command', command: 'addToContext', payload: { text }
  });
}

// 创建新 session 并发送 prompt
public createNewSessionWithPrompt(prompt: string) {
  this._view?.show(true);
  this._view?.webview.postMessage({
    type: 'command', command: 'createSessionWithPrompt', payload: { prompt }
  });
}
```

**Webview 端 (main.tsx):**

```typescript
// addToContext -> 追加到 store 的输入文本
onCommand('addToContext', (payload) => {
  const { text } = payload;
  useSessionStore.getState().setPendingInputText(text, 'append');
});

// createSessionWithPrompt -> 开新 session 草稿 + 自动发送
onCommand('createSessionWithPrompt', (payload) => {
  const { prompt } = payload;
  const sessionStore = useSessionStore.getState();
  sessionStore.openNewSessionDraft();
  // 获取当前 provider/model 配置后自动调用 sendMessage()
});
```

### 消息流

```
Extension (获取选区) → ChatViewProvider.postMessage() → Webview onCommand → Zustand Store
```

### 借鉴价值: 极高，成本极低

三个命令加起来不到 100 行逻辑，package.json 加一个 submenu + 3 个 menu item。我们已经有 `addToContext` 命令，只需补 Explain 和 Improve Code 两个。投入产出比最佳的改进点。

---

## 2. 防闪烁主题切换（Theme Transition Suppression）

### 代码位置

| 文件 | 作用 |
|------|------|
| `packages/ui/src/index.css` | CSS 规则: `.oc-theme-switching` |
| `packages/ui/src/contexts/ThemeSystemContext.tsx` | JS 控制逻辑 + `useIsomorphicLayoutEffect` |

### 核心机制

**CSS 部分 (index.css) - 仅 3 行:**

```css
:root.oc-theme-switching *,
:root.oc-theme-switching *::before,
:root.oc-theme-switching *::after {
  transition: none !important;
  animation: none !important;
}
```

**JS 部分 (ThemeSystemContext.tsx) - 双帧 rAF 模式:**

```typescript
const suppressTransitionsForThemeSwitch = () => {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  root.classList.add('oc-theme-switching');

  const frame = window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      root.classList.remove('oc-theme-switching');
    });
  });

  return () => {
    window.cancelAnimationFrame(frame);
    root.classList.remove('oc-theme-switching');
  };
};
```

**应用时机 (useLayoutEffect):**

```typescript
useIsomorphicLayoutEffect(() => {
  const restoreTransitions = suppressTransitionsForThemeSwitch();
  cssGenerator.apply(currentTheme);
  // ... 应用主题变量 ...
  return restoreTransitions;
}, [currentTheme]);
```

**原理:**

1. 添加 `oc-theme-switching` class -> 强制禁用所有 transition/animation
2. 在 `useLayoutEffect` 中应用新主题 CSS 变量
3. 第一个 `requestAnimationFrame` -> 第二个嵌套 `requestAnimationFrame` -> 移除 class
4. 双帧确保浏览器已完成渲染后才恢复 transition，避免中间态闪烁

### 借鉴价值: 中，成本极低

总共不到 20 行代码，能消除 VSCode 亮/暗主题切换时 webview 的视觉闪烁。5 分钟就能加上。

---

## 3. 推理痕迹（Reasoning Traces）

### 代码位置

| 文件 | 作用 |
|------|------|
| `packages/ui/src/components/chat/message/parts/ReasoningPart.tsx` | 核心组件 (单文件) |

### 核心机制

**两种变体:**

- `'thinking'` - 脑图标 (RiBrainLine)
- `'justification'` - 聊天图标 (RiChat3Line)

**折叠态:**

- 显示截断摘要（首行或到第一个句号）
- 点击 header 切换展开/折叠
- 箭头图标: `RiArrowDownSLine` (展开) / `RiArrowRightSLine` (折叠)

**展开态:**

- `ScrollableOverlay` + `max-h-80` 限高可滚动区域
- 样式: `typography-meta italic text-muted-foreground/70`

**流式计时器:**

- 流式输出时显示 `LiveDuration` 实时计时器 (250ms tick)
- 格式: `X.Xs` (如 "1.5s", "12.3s")

**文本清洗:**

```typescript
const cleanReasoningText = (text: string): string => {
  return text
    .split('\n')
    .map((line) => line.replace(/^>\s?/, '').trimEnd())  // 移除 markdown 引用前缀
    .filter((line) => line.trim().length > 0)
    .join('\n')
    .trim();
};
```

**组件结构:**

```
<div data-reasoning-block-id={blockId}>
  <header onClick={toggle}>
    <icon /> <label: "Thinking..." / "Justification">
    <LiveDuration />  // 流式时显示
    <arrow icon />
  </header>
  {isExpanded && (
    <ScrollableOverlay maxHeight="max-h-80">
      <p class="italic text-muted-foreground/70">
        {cleanedText}
      </p>
    </ScrollableOverlay>
  )}
</div>
```

### 借鉴价值: 高

现在 Claude、DeepSeek 等模型都有 thinking 输出，好的推理痕迹展示能大幅提升用户对 AI 决策过程的理解。组件本身不复杂（单文件），关键在于正确解析 SDK 中的 `reasoning` part type 并做折叠/计时 UI。

---

## 4. Editor Panel（Session 在编辑器区域打开）

### 代码位置

| 文件 | 作用 |
|------|------|
| `packages/vscode/src/SessionEditorPanelProvider.ts` (238行) | 核心 Provider，WebviewPanel 创建/复用/销毁 |
| `packages/vscode/src/extension.ts` (L105, L119-143) | 命令注册 |
| `packages/vscode/src/webviewHtml.ts` (143行) | 共享 HTML 生成器，通过 `viewMode` 区分 |
| `packages/vscode/src/ChatViewProvider.ts` | 对照: sidebar 用 WebviewViewProvider |

### 核心机制

**Panel 类型:**

- 使用 `vscode.WebviewPanel`（非 WebviewViewProvider）
- 打开位置: `vscode.ViewColumn.Beside`（编辑器旁边）
- `retainContextWhenHidden: true`

**多实例管理:**

```typescript
type SessionPanelState = {
  panel: vscode.WebviewPanel;
  sseStreams: Map<string, AbortController>;  // 每个 panel 独立的 SSE 流
};

// 以 sessionId 为 key 管理多个 panel
private _panels = new Map<string, SessionPanelState>();
```

**创建/复用逻辑:**

```typescript
public createOrShow(sessionId: string, title?: string): void {
  const existing = this._panels.get(sessionId);
  if (existing) {
    existing.panel.reveal();  // 已存在则激活
    return;
  }
  this._createPanel(sessionId, sessionTitle, sessionId);  // 不存在则新建
}

// 新 session 草稿用唯一 ID
public createOrShowNewSession(): void {
  const panelId = `new_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  this._createPanel(panelId, 'New Session', null);
}
```

**与 Sidebar 的关系:**

- 完全独立: 各有自己的 SSE 连接
- 共享: 通过 `OpenCodeManager` 单例共享后端
- 同一套 webview HTML，靠 `window.__VSCODE_CONFIG__.viewMode` (`'editor'` vs `'sidebar'`) 区分布局

**Webview HTML 区分:**

```typescript
// Editor Panel
return getWebviewHtml({
  webview, extensionUri, workspaceFolder,
  panelType: 'chat',
  viewMode: 'editor',         // <-- 关键区别
  initialSessionId: sessionId,
});

// Sidebar (默认)
return getWebviewHtml({
  webview, extensionUri, workspaceFolder,
  // viewMode 默认 'sidebar'
});
```

**注册的命令:**

| 命令 | 功能 |
|------|------|
| `openchamber.openActiveSessionInEditor` | 把当前活跃 session 在编辑器中打开 |
| `openchamber.openSessionInEditor` | 打开指定 session |
| `openchamber.openNewSessionInEditor` | 新建 session 草稿 |
| `openchamber.openCurrentOrNewSessionInEditor` | 有活跃 session 则打开，否则新建 |

**生命周期清理:**

```typescript
private _disposePanel(sessionId: string) {
  const entry = this._panels.get(sessionId);
  if (!entry) return;
  for (const controller of entry.sseStreams.values()) {
    controller.abort();  // 终止所有 SSE 连接
  }
  entry.sseStreams.clear();
  this._panels.delete(sessionId);
}
```

### 借鉴价值: 极高

这是最重要的功能差异。我们目前所有交互挤在 sidebar 一个面板里，Editor Panel 能让用户在编辑器区域同时打开多个 session tab，显著提升多任务工作流。实现量适中（~240行 Provider + 命令注册），我们的 `webviewHtml` 已有类似基础设施，改造成本可控。

---

## 5. 虚拟化滚动（Virtualized Message List）

### 代码位置

| 文件 | 作用 |
|------|------|
| `packages/ui/src/components/chat/MessageList.tsx` (685+ 行) | 主组件，含自定义 virtualizer hook |
| `packages/ui/src/components/chat/hooks/useChatScrollManager.ts` | 滚动管理 hooks |
| `packages/ui/src/components/chat/lib/turns/stageTurns.ts` | Turn 分阶段渲染逻辑 |
| `packages/ui/src/components/chat/message/parts/VirtualizedCodeBlock.tsx` | 代码块虚拟化 |

### 核心机制

**虚拟化库:** `@tanstack/react-virtual`

**阈值激活 (智能启停):**

```typescript
const MESSAGE_VIRTUALIZE_THRESHOLD = 40;  // 消息数阈值
const shouldVirtualize = Boolean(resolveScrollContainer()) && stagedEntries.length >= 40;
// 少于 40 条消息不启用虚拟化，零开销
```

**Turn-based 分组:**

- 消息被组织成 "turns"（用户消息 + 关联助手消息为一个 turn）
- Turn 作为虚拟化的基本单位，而非单条消息
- 渲染条目类型: `'turn'` (分组) 和 `'ungrouped'` (独立)

**自定义 Virtualizer Hook:**

```typescript
const useMessageListVirtualizer = <TItemElement extends Element>(
  options: MessageListVirtualizerOptions<TItemElement>,
): Virtualizer<HTMLElement, TItemElement> => {
  // 使用 flushSync 确保同步更新
  // 返回 Virtualizer 实例: elementScroll, observeElementRect, observeElementOffset
};
```

**动态高度估算:**

```typescript
const estimateEntrySize = (index: number): number => {
  if (entry.kind === 'turn') {
    const assistantCount = entry.turn.assistantMessages.length;
    return Math.min(1400, 120 + assistantCount * 120);  // base 120px + 每条助手 120px
  }
  return role === 'user' ? 100 : 220;  // 用户 100px, 助手 220px
};
```

**Overscan 配置:**

```typescript
const MESSAGE_VIRTUAL_OVERSCAN_MOBILE = 2;
const MESSAGE_VIRTUAL_OVERSCAN_DESKTOP = 4;
overscan: isMobile ? 2 : 4;
```

**视口锚定 (防止内容更新时跳动):**

```typescript
// 捕获当前视口锚点
captureViewportAnchor: () => { messageId: string; offsetTop: number } | null;

// 内容更新后恢复锚点位置
restoreViewportAnchor: (anchor) => boolean;
```

**滚动到指定位置:**

```typescript
// 滚动到指定 turn
scrollToTurnId: (turnId: string, options?: { behavior?: ScrollBehavior }) => {
  const index = turnIndexMap.get(turnId);
  if (shouldVirtualize) {
    scrollVirtualizerToIndex(index, behavior);
    // 额外通过 requestAnimationFrame 做 DOM 滚动精确对齐
  } else {
    turnElement.scrollIntoView({ behavior, block: 'start' });
  }
};

// 滚动到指定消息
scrollToMessageId: (messageId: string, options?: { behavior?: ScrollBehavior }) => {
  // 类似逻辑，支持虚拟化/非虚拟化两种路径
  // 如果元素尚未渲染，通过 requestAnimationFrame 重试
};
```

**防闪烁:**

- `lastNonEmptyVirtualRowsRef` 保留上次有效的虚拟行数据
- virtualizer 重新计算期间不会显示空白

### 借鉴价值: 极高

长对话场景（100+ 消息）没有虚拟化会严重卡顿。`@tanstack/react-virtual` 是成熟库，阈值激活模式很聪明（短对话零开销）。重点关注:

- Turn-based 分组作为虚拟化单元（减少 item 数量）
- 视口锚定（内容更新时保持位置）
- 阈值 40 条才启用（避免短对话的不必要开销）

---

## 6. ANSI 颜色渲染

### 代码位置

| 文件 | 作用 |
|------|------|
| `packages/ui/src/components/layout/ProjectActionsButton.tsx` | ANSI escape 剥离 (URL 提取用) |
| `packages/ui/src/lib/terminal/SerializeAddon.ts` | 完整 ANSI 序列化 (16色/256色/RGB 24位) |

### 核心机制

**无外部 ANSI 库**，全部自定义实现。

**ANSI escape 正则:**

```typescript
const ANSI_ESCAPE_PREFIX = String.fromCharCode(27);
const ANSI_ESCAPE_PATTERN = new RegExp(`${ANSI_ESCAPE_PREFIX}\\[[0-9;?]*[ -/]*[@-~]`, 'g');

// 剥离 ANSI:
const cleaned = value.replace(ANSI_ESCAPE_PATTERN, '');
```

**颜色编码 (SerializeAddon.ts):**

```typescript
private _appendColorCode(codes: number[], color: number, isForeground: boolean): void {
  const base = isForeground ? 30 : 40;
  const extBase = isForeground ? 38 : 48;

  if (color < 8) {
    codes.push(base + color);                    // 基础 8 色
  } else if (color < 16) {
    codes.push(base + 60 + (color - 8));         // 亮色 8 色
  } else if (color < 256) {
    codes.push(extBase, 5, color);               // 256 色
  } else {
    const rgb = color - 0x1000000;               // RGB 24 位真彩色
    codes.push(extBase, 2, (rgb >> 16) & 0xFF, (rgb >> 8) & 0xFF, rgb & 0xFF);
  }
}
```

**支持的文本属性:** bold, italic, underline, faint, strikethrough, blink, inverse, invisible, dim

### 借鉴价值: 中

OpenChamber 的 ANSI 处理主要服务于其内嵌终端（ghostty-web），不是直接用于 tool output 展示。对我们来说，推荐用轻量库如 `ansi-to-html` 或 `ansi-to-react` 来处理 bash tool output 中的 ANSI 着色，无需从零实现。**借鉴思路而非代码**。

---

## 附录: OpenChamber 项目结构速查

```
openchamber/openchamber (monorepo)
├── packages/
│   ├── ui/          # 共享 React UI (Web/Desktop/VSCode 三端复用)
│   │   ├── src/
│   │   │   ├── App.tsx                    # 主入口，按 runtime 分发布局
│   │   │   ├── components/
│   │   │   │   ├── chat/
│   │   │   │   │   ├── MessageList.tsx    # 虚拟化消息列表
│   │   │   │   │   ├── message/parts/
│   │   │   │   │   │   ├── ReasoningPart.tsx  # 推理痕迹
│   │   │   │   │   │   ├── ToolPart.tsx       # 工具输出 (86KB)
│   │   │   │   │   │   └── VirtualizedCodeBlock.tsx
│   │   │   │   │   └── hooks/
│   │   │   │   │       └── useChatScrollManager.ts
│   │   │   │   └── views/agent-manager/   # Agent Manager UI
│   │   │   ├── contexts/
│   │   │   │   └── ThemeSystemContext.tsx  # 主题系统 + 防闪烁
│   │   │   ├── stores/                    # 50+ Zustand stores
│   │   │   ├── lib/
│   │   │   │   ├── terminal/SerializeAddon.ts  # ANSI 处理
│   │   │   │   └── theme/                 # 主题 CSS 生成
│   │   │   └── index.css                  # 全局样式 + .oc-theme-switching
│   │   └── package.json
│   ├── vscode/      # VSCode Extension
│   │   ├── src/
│   │   │   ├── extension.ts               # 入口 + 命令注册
│   │   │   ├── ChatViewProvider.ts        # Sidebar webview
│   │   │   ├── SessionEditorPanelProvider.ts  # Editor panel
│   │   │   ├── AgentManagerPanelProvider.ts   # Agent Manager panel
│   │   │   ├── bridge.ts                  # fetch 代理桥 (140KB)
│   │   │   ├── webviewHtml.ts             # HTML 模板生成
│   │   │   └── opencode.ts               # API 连接管理
│   │   ├── webview/
│   │   │   └── main.tsx                   # webview 入口 + 命令处理
│   │   └── package.json
│   ├── desktop/     # Tauri macOS 桌面应用
│   └── docs/        # 文档站
└── package.json     # monorepo root (bun workspace)
```
