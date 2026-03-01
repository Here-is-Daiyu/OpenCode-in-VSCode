# Desktop vs Extension Feature Comparison

Comparison between OpenCode Desktop application features and our planned VS Code extension implementation.

---

## Feature Matrix

| Feature | Desktop | Our Extension | Notes |
|---------|---------|---------------|-------|
| Chat UI | ✅ Full | ✅ WebviewView in sidebar | Use React for rich UI |
| Streaming messages | ✅ | ✅ SSE + postMessage | |
| Tool call visualization | ✅ | ✅ Collapsible cards | |
| File diff display | ✅ Built-in | ✅ VSCode diff editor | Better: native diff support |
| Image attachments | ✅ | ✅ Drag/drop/paste | |
| Markdown rendering | ✅ | ✅ marked + highlight.js | |
| Code highlighting | ✅ Shiki | ✅ Shiki (match VSCode themes) | |
| Session management | ✅ | ✅ TreeView | |
| Session fork/revert | ✅ | ✅ | |
| Model selection | ✅ | ✅ QuickPick + settings | |
| Agent selection | ✅ | ✅ | |
| Permission cards | ✅ | ✅ Inline in chat | |
| Question cards | ✅ | ✅ | |
| Settings page | ✅ | ✅ Custom Webview | All settings editable |
| MCP management | ✅ | ✅ In settings | |
| Provider management | ✅ | ✅ | |
| Terminal/Shell | ✅ Built-in | ✅ VSCode terminal | Better: native terminal |
| File explorer | ✅ Built-in | ✅ VSCode explorer | Better: native explorer |
| Git integration | ✅ | ✅ VSCode Git | Better: native Git |
| LaTeX rendering | ✅ KaTeX | ✅ KaTeX | |
| Token usage tracking | ✅ | ✅ Status bar + inline | |
| Context usage | ✅ | ✅ | |
| Todo list | ✅ | ✅ Panel in sidebar | |
| Slash commands | ✅ | ✅ | |
| File references (@) | ✅ | ✅ Autocomplete | |
| Voice input | ❌ (OpenGUI has it) | 🔮 Future | |
| Prompt queue | ❌ (OpenGUI has it) | 🔮 Future | |
| Multi-project | ✅ | ✅ VSCode workspaces | Better: native workspaces |

---

## Areas Where VSCode Extension Is Better

### Native Diff Support

The VS Code extension has a significant advantage in file diff display. Instead of implementing a custom diff viewer, we can leverage VS Code's built-in diff editor which users are already familiar with.

```typescript
vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title)
```

### Native Terminal

No need to implement a terminal emulator — VS Code provides a fully featured integrated terminal. We can create terminals, send commands, and monitor output via the Terminal API.

### Native File Explorer

VS Code's built-in file explorer provides full file system navigation, search, and management. Our extension can focus on AI-specific features without duplicating file management functionality.

### Native Git Integration

VS Code's Git integration (source control panel, gutter indicators, blame, etc.) is mature and well-tested. We leverage this instead of building custom VCS UI.

### Native Multi-Project / Workspaces

VS Code's workspace system natively supports multi-root workspaces, allowing users to work across multiple projects simultaneously.

---

## Areas Requiring Custom Implementation

### Chat UI (WebviewView)

The core chat experience needs to be custom-built as a webview, including:

- Message bubbles with streaming support
- Tool call visualization with collapsible cards
- Permission and question cards inline in the conversation
- Code blocks with syntax highlighting (Shiki)
- Markdown rendering with LaTeX support (KaTeX)
- Image attachment support (drag/drop/paste)

### Session Management (TreeView)

Session listing and navigation via VS Code's TreeView API:

- Session list with titles and timestamps
- Session fork/revert controls
- Active session indicator

### Settings Page (Custom Webview)

A dedicated webview for managing:

- Model and provider configuration
- MCP server management
- Permission rules
- Custom commands

### Status Bar Integration

Token usage tracking and context usage displayed in VS Code's status bar for at-a-glance monitoring.

---

## Future Features (🔮)

### Voice Input

OpenGUI (the open-source desktop client) implements voice input. This could be added to our extension in the future using the Web Speech API or a dedicated speech-to-text service within the webview.

### Prompt Queue

OpenGUI also supports prompt queuing. This feature would allow users to queue multiple prompts for sequential execution, which could be valuable for batch operations.

---

## Desktop Chat UI Architecture (Deep Dive)

Detailed analysis of the OpenCode Desktop application's chat architecture, based on source code research of the official monorepo.

### Tech Stack

- **Framework:** SolidJS + Tauri (Rust backend)
- **Monorepo structure:** `packages/desktop` (Tauri shell), `packages/app` (main application logic), `packages/ui` (shared UI components)
- **Styling:** Tailwind CSS + CSS custom properties as design tokens (e.g., `--background-base`, `--text-strong`, `--color-divider`, etc.)

### Core Chat Components

| Component | Purpose |
|-----------|---------|
| **SessionTurn** | Renders a single conversation turn (user or assistant). Groups context tools together and manages the layout for each turn. |
| **MessagePart** | Uses a **registry pattern** to dispatch rendering of each part type to a specialized sub-component. This is the central routing point for all part types. |
| **BasicTool** | Collapsible tool visualization with shimmer loading animation. Shows tool name, status, and expandable details. |
| **Markdown** | Markdown renderer with **LRU cache** for parsed output + **morphdom** for efficient incremental DOM patching during streaming. |
| **TextShimmer** | Animated loading placeholder (shimmer effect) shown while assistant text is streaming in. |

### Part Types Handled

The `MessagePart` registry dispatches the following part types:

- `text` — Main assistant/user text content
- `reasoning` — Model reasoning/thinking blocks
- `tool` — Tool call invocations and results
- `file` — File references and content
- `agent` — Agent delegation markers
- `step-start` / `step-finish` — Step boundary markers for multi-step operations
- `snapshot` — File system snapshots (for revert)
- `patch` — File diffs/patches
- `compaction` — Context compaction markers
- `retry` — Retry indicators
- `subtask` — Subtask delegation markers

### Key UX Patterns

#### Throttled Text Rendering

Desktop throttles streaming text updates to **100ms intervals** to avoid excessive DOM updates during fast token generation. This prevents UI jank while maintaining a smooth streaming appearance.

#### Context Tool Grouping

Related context-gathering tools are **visually grouped** together in the UI:
- `read`, `glob`, and `grep` calls are collapsed into a single "Context" group
- This reduces visual noise when the assistant performs multiple file reads in sequence
- Each group is expandable to show individual tool calls

#### Lazy Message Rendering

Uses **Intersection Observer** for lazy rendering of messages:
- Only messages visible in the viewport (plus a buffer) are fully rendered
- Off-screen messages use lightweight placeholder elements
- Dramatically improves performance for long conversations (300+ messages)

#### Pill-Based @Mentions

File and symbol references use a **pill UI pattern**:
- `@filename.ts` renders as a clickable pill/chip
- Pills show file icons and are visually distinct from regular text
- Autocomplete dropdown appears when typing `@`

#### Dynamic Overflow-Anchor Scrolling

Scroll behavior uses **CSS `overflow-anchor`** for stable scrolling:
- New content appended at the bottom doesn't cause scroll jumps when the user is reading earlier messages
- Auto-scroll to bottom is engaged only when the user is already at/near the bottom
- Smooth transition between "following" and "browsing" scroll modes

### Implications for Our VSCode Extension

| Desktop Pattern | Our Adaptation |
|----------------|----------------|
| SolidJS reactivity | React + Zustand (already decided) |
| morphdom incremental DOM | React's virtual DOM diffing (similar outcome) |
| LRU markdown cache | Implement similar cache in our Markdown component |
| 100ms text throttle | Use `requestAnimationFrame` or similar throttle for streaming |
| Intersection Observer lazy render | Use `react-virtuoso` or `@tanstack/react-virtual` (already planned) |
| Tool grouping | Implement context tool grouping in our ToolCard component |
| CSS custom properties tokens | Map to `--vscode-*` CSS variables for theme integration |
| overflow-anchor scrolling | Implement same pattern in our chat scroll container |
