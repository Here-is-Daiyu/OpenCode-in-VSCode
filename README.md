# OpenCode-in-VSCode

OpenCode-in-VSCode is a Visual Studio Code extension that brings [OpenCode](https://github.com/anomalyco/opencode) AI coding assistant into VS Code as native chat, session, status, and settings experiences. It manages or connects to `opencode serve`, syncs against the global event stream, and keeps the extension host and webview UI aligned through typed messages.

> This is not built by the OpenCode team and is not affiliated with OpenCode in any way.

**License: MIT**

---

## Features

### Chat UI

- Activity bar chat panel closely matching the official OpenCode experience
- Streaming text with `requestAnimationFrame`-based throttled updates
- Markdown rendering via `marked` with KaTeX math, Shiki syntax highlighting, and ANSI color output
- Clickable Markdown links (open URLs externally)
- Virtualized scrolling (`@tanstack/react-virtual`) for long message lists (40+ messages)
- Reasoning traces with elapsed-time spinner during streaming
- Permission request cards (approve / deny tool permissions inline)
- Question cards (respond to server questions inline)
- Notification toast system
- Error boundary for graceful crash recovery
- **Current model badge** — displays the active model in the chat header (resolved from the latest assistant message or global config); click to switch models

### Input System

- **`@` file mentions** — fuzzy search project files, auto-attach file content to context
- **`!` shell commands** — execute shell commands, pipe output back into AI context
- **`/` slash commands** — server-side command discovery with caching and autocomplete menu
- **Image attachments** — via file picker, drag-and-drop, and clipboard paste
- **Pending message queue** — queue multiple messages, cancel individual items, auto-restore to input on cancel, **drag-and-drop reorder**
- **Code insertion from editor** — insert current editor selection/file into chat input with source annotation
- **Context usage bar** — compact token usage visualization inside the input shell, showing input/output/reasoning/cache segments with percentage and hover tooltip
- **Multi-line optimization** — Shift+Enter for new lines, unified auto-resize height limit, placeholder hint

### Session Management

- Create, switch, delete, fork, and share sessions
- Compact sessions via `/compact` command
- Default auto-resume into the most recent session on startup
- Session tree view in activity bar with time-grouped ordering (Today, Yesterday, etc.)
- Batched older-history hydration for large session lists
- Active session count indicator (shows how many other sessions are busy)
- **Session search / filter** — search button in the session tree title bar; filters by title, id, or slug with persistent state

### Message Controls

- **Undo / Redo** — revert to previous user messages or restore reverted messages (Git-backed)
- **Abort / Pause** — stop the current session mid-response (`Escape` keybinding)

### Tool Call Rendering

Every tool call is displayed as a compact card with collapsible results. Specialized renderers exist for:

| Tool | Renderer | Interactive Features |
|------|----------|---------------------|
| `edit` / `write` | EditRenderer | Click to open diff in VS Code editor |
| `bash` / `shell` | BashRenderer | ANSI-colored output, command display |
| `read` | GenericToolCallPart | Clickable line numbers → open file at line |
| `glob` / `grep` / `list` | ContextToolGroup | Grouped display for consecutive context lookups |
| `webfetch` | GenericToolCallPart | Clickable URL → open in browser |
| `task` | TaskRenderer | Open subagent session button |
| `todowrite` | TodoRenderer | Checklist-style display |

- **Context tool grouping** — consecutive read/glob/grep/list calls collapse into a single group
- **Tool timeline** — 2+ consecutive non-context tools render in a timeline layout with connector lines
- Step start/finish indicators, snapshot parts, patch parts, agent parts, retry parts, compaction parts

### Subagent / Task Navigation

- Click task tool results to enter the subagent's child session
- Back navigation to return to the parent session
- Subtask part rendering with session linking

### Editor Integration

- **Inline diff decorations** — when AI edits a file, changed lines are highlighted in the editor (green for additions, red for deletions) via `file.edited` SSE events; decorations auto-clear on save or session idle
- **Show Diff** — open file diffs from edit tool results directly in VS Code's diff editor, or view full session diff
- **Multi-file diff review** — review all session changes at once in a multi-diff editor (with fallback to grouped tabs)
- **Open File at Line** — click read tool line numbers to jump to exact lines
- **Diagnostics auto-attach** — automatically appends current file errors/warnings to messages; includes a dedicated "Fix Diagnostics" command
- **Git context awareness** — "Review My Changes" and "Generate Commit Message" commands using VS Code's built-in Git API
- **CodeLens** — optional AI CodeLens suggestions (configurable)
- **Right-click context menu** — Explain Code, Improve Code, Add Selection to Prompt, Add File to Prompt, Insert Editor Code to Chat

### Terminal Integration

- **Open Terminal** — launch a terminal pre-configured with `OPENCODE_BASE_URL`
- **Shared PTY terminal** — server-backed pseudo-terminal via WebSocket (`/pty` API), enabling AI and user to share a terminal session with resize support and reconnection
- **Terminal output capture** — captures shell execution output; "Send Terminal Output" and "Send Terminal Error" commands forward context to AI chat

### Editor Panel

- Open any session in a full VS Code editor tab via `SessionEditorPanelProvider`
- Open current session, new session, or pick from session tree
- Keybinding: `Ctrl+Shift+E` / `Cmd+Shift+E`

### Agent & Model Selection

- **Agent selector** — switch between agent variants (e.g., build / plan modes)
- **Model selector** — pick from all available provider models with capability badges (Reasoning, Attachments, Context size)
- Both available as Quick Pick commands and in-chat UI dropdowns

### Settings

Dedicated settings webview with a **sticky horizontal nav bar** and 5 sections in a single scrollable page (with IntersectionObserver-based anchor sync):

| Section | Features |
|---------|----------|
| **Connection** | Server mode (local / external), hostname, port, external URL, auto-start, executable path |
| **Chat** | Font size, timestamps, word wrap, max image size, tool call display mode |
| **Models** | Browse and switch models across all providers |
| **Integrations** | MCP server enable/disable, provider status, slash commands |
| **Permissions** | Tool permission management |

- Open project `opencode.jsonc` config file directly from status tree (follows official config resolution logic)

### Status & Monitoring

- **Status tree view** — connection state, server version/URL, model info, providers, MCP servers, LSP
- **Status bar** — connection indicator, active model, busy spinner, token usage display
- **MCP server toggle** — enable/disable MCP servers from the status tree context menu
- **Auto-refresh** — periodic status polling

### Server Management

- Auto-start `opencode serve` on extension activation
- **External server mode** — connect to a remote/Docker/SSH OpenCode instance by URL, skipping local auto-start
- Start / Stop / Restart server commands (adapted for both local and external modes)
- Health check verification on connect
- Automatic restart prompt on workspace folder change
- Configuration change detection with restart prompt
- Windows-compatible process management (`taskkill /T`)

### Real-time Sync

- SSE (Server-Sent Events) driven session, message, and status updates
- Automatic reconnection with full data refresh on reconnect
- Debounced updates to webview at ~60fps
- Handles: `session.created`, `session.updated`, `session.deleted`, `session.status`, `message.updated`, `message.part.updated`, `message.part.delta`, `message.removed`, `permission.asked`, `permission.responded`, `question.asked`, `question.replied`, `config.updated`, `todo.updated`, `file.edited`, `mcp.tools.changed`, `pty.created`, `pty.updated`, `pty.exited`, `pty.deleted`

### Command Palette

All commands are organized with semantic prefixes for easy discovery:

| Prefix | Commands |
|--------|----------|
| `Session:` | New, Delete, Switch, Fork, Share, Compact, Abort, Filter, Clear Filter |
| `AI:` | Explain Code, Improve Code, Fix Diagnostics, Review Changes, Generate Commit Message |
| `Context:` | Add File, Add Selection, Insert Editor Code |
| `Terminal:` | Open, Open Shared PTY, Send Output, Send Error |
| `Diff:` | Show Session, Review All Changes |
| `Server:` | Start, Stop, Restart |
| `Model:` / `Agent:` | Select |

Commands that require a server connection are hidden from the palette when disconnected.

### Wide-screen Layout

- When the chat panel is wide enough (> 1.5× max conversation width), a **Last API Response** side panel appears showing the most recent API response for the active session

### Theme Support

- Anti-flash theme switching (no white flash on dark/light toggle)
- Full light / dark / high-contrast compatibility via CSS variable theming
- Theme change events forwarded to all webview panels

### Outline Index

- Message outline navigation for long conversations

## Requirements

- VS Code `^1.94.0`
- Node.js `20+`
- `npm`
- OpenCode CLI installed and available as `opencode`, or configured via `opencode.server.executablePath`

If the server uses auth, launch VS Code with the appropriate env vars available to the extension host.

## Installation

### From a local VSIX

```bash
npm ci
npm ci --prefix webview-ui
npm run build
npm run package
```

Then install the generated `.vsix` via **Extensions: Install from VSIX...** in VS Code.

## Keyboard Shortcuts

| Shortcut | Command |
|----------|---------|
| `Ctrl+Shift+O` / `Cmd+Shift+O` | Focus Chat Panel |
| `Ctrl+Shift+N` / `Cmd+Shift+N` | New Session |
| `Ctrl+Shift+E` / `Cmd+Shift+E` | Open Session in Editor |
| `Ctrl+Shift+M` / `Cmd+Shift+M` | Select Model |
| `Ctrl+Shift+D` / `Cmd+Shift+D` | Show Session Diff |
| `Ctrl+Shift+K` / `Cmd+Shift+K` | Compact Session |
| `Ctrl+Alt+Shift+C` / `Cmd+Alt+Shift+C` | Insert Editor Code into Chat |
| `Escape` | Abort Current Session (when busy) |

## Development

```bash
npm ci
npm ci --prefix webview-ui
```

| Command | Purpose |
|---------|---------|
| `npm run dev` | Watch extension + webview builds during development |
| `npm run build` | Production build (extension bundle + webview UI) |
| `npm run typecheck` | Type-check both extension and webview code |
| `npm run package` | Package into `.vsix` |

Root build helpers live in [`scripts/`](./scripts/) ([`esbuild.mjs`](./scripts/esbuild.mjs) for extension bundling/watch mode, [`generate-icon.js`](./scripts/generate-icon.js) for icon asset generation).

To debug locally:

1. Open this repo in VS Code
2. Run the `Run Extension` launch config (or `F5`)
3. Test in the Extension Development Host

## Architecture

### High-Level Separation

```
Extension Host (src/)           Webview (webview-ui/src/)
  Node.js runtime                 Browser runtime (React 18+)
  Full VSCode API access          No VSCode API (postMessage only)
  No DOM access                   Full DOM control
       │                                │
       └──── postMessage (typed) ───────┘
       │
       └──── REST API + SSE + WebSocket (@opencode-ai/sdk) ──→ opencode serve
```

### Communication Patterns

1. **Extension ↔ OpenCode Server** — REST API + SSE + WebSocket (PTY) via [`@opencode-ai/sdk`](https://www.npmjs.com/package/@opencode-ai/sdk)
2. **Extension ↔ Webview** — Typed bidirectional `postMessage`
3. **Internal** — Event-driven via [`EventBus`](./src/services/eventBus.ts)

### Directory Structure

```
src/
  extension.ts                    — Activation entry point
  commands/index.ts               — Command registration (40+ commands)
  providers/
    chatViewProvider.ts           — Chat WebviewViewProvider
    settingsViewProvider.ts       — Settings WebviewViewProvider
    sessionTreeProvider.ts        — Session TreeDataProvider (with search/filter, time grouping)
    statusTreeProvider.ts         — Status TreeDataProvider
    sessionEditorPanelProvider.ts — Full editor tab panel
    codeLensProvider.ts           — CodeLens integration
  managers/
    sessionManager.ts             — Session switching & batched history loading
    statusBarManager.ts           — Status bar item management
  services/
    openCodeClient.ts             — REST + SSE + PTY client for OpenCode
    serverManager.ts              — Start/stop/monitor opencode serve
    eventBus.ts                   — Typed event bus
    diffService.ts                — Inline diff decorations & multi-file diff review
    diagnosticsService.ts         — VS Code diagnostics auto-attach
    gitContextService.ts          — Git diff context via VS Code Git API
    ptyTerminalService.ts         — Server-backed PTY terminal via WebSocket
    terminalOutputService.ts      — Terminal shell execution output capture
    modelPreferences.ts           — Model preference persistence
    logger.ts                     — Extension logging
  types/
    messages.ts                   — Extension ↔ Webview message types
    events.ts                     — Internal event types (including PTY events)
    opencode.ts                   — OpenCode API response types (including PTY types)
  utils/
    webviewHtml.ts                — Webview HTML generation with nonce CSP
    opencodeConfig.ts             — Config resolution helpers

webview-ui/src/
  panels/
    chat/ChatApp.tsx              — Main chat panel (with model badge)
    settings/SettingsApp.tsx      — Settings panel with sticky nav bar
  components/
    ChatInput.tsx                 — Message input with @mention/!shell//slash support
    CurrentModelBadge.tsx         — Active model display badge
    VirtualizedMessageList.tsx    — Virtualized message rendering
    MarkdownRenderer.tsx          — Markdown + KaTeX + Shiki rendering
    ModelSelector.tsx             — Model switching dropdown
    AgentSelector.tsx             — Agent variant selector
    TokenUsageBar.tsx             — Token usage visualization (in input shell)
    LastApiResponsePanel.tsx      — Wide-screen side panel
    MentionMenu.tsx               — @ file mention autocomplete
    SlashCommandMenu.tsx          — / slash command autocomplete
    QueuedMessageList.tsx         — Pending message queue with drag reorder
    PermissionCard.tsx            — Permission request UI
    QuestionCard.tsx              — Question response UI
    OutlineIndex.tsx              — Message outline navigation
    NotificationToast.tsx         — Toast notifications
    ErrorBoundary.tsx             — Crash recovery
    message/
      MessageBubble.tsx           — Message container
      MessageContent.tsx          — Part dispatcher with grouping logic
      MessageHeader.tsx           — Role/timestamp header
      MessageFooter.tsx           — Message actions footer
      parts/                      — 15+ specialized part renderers
    settings/                     — Reusable settings form components
  stores/
    chatStore.ts                  — Chat state (Zustand)
    modelStore.ts                 — Model/provider state
    settingsStore.ts              — Settings state
    agentStore.ts                 — Agent state
    commandStore.ts               — Slash command state
    messageQueueStore.ts          — Pending message queue (with reorder)
    notificationStore.ts          — Notification state
  hooks/
    useMentionSearch.ts           — File mention search
    useQueuedMessageAutoSend.ts   — Auto-send queued messages
    useElapsedTime.ts             — Elapsed time for streaming
    useThrottledValue.ts          — Value throttling
    useMessageListener.ts         — Webview message handler
  utils/
    ansiToHtml.ts                 — ANSI escape → HTML
    renderText.ts                 — Text processing & image marker handling
    markdown.ts                   — Markdown configuration
    slashCommands.ts              — Slash command utilities
    textCleaning.ts               — Text cleanup
    modelUtils.ts                 — Model display helpers
    opencodeConfig.ts             — Config utilities
    vscodeApi.ts                  — VS Code API bridge
```

### Key Design Decisions

| Choice | Rationale |
|--------|-----------|
| React 18+ | Complex interactive UI needs component framework |
| Zustand | Lightweight, TypeScript-friendly state management |
| esbuild | Fast extension bundling |
| Vite | HMR in dev, optimized production webview builds |
| Shiki | Syntax highlighting that matches VSCode themes |
| KaTeX | LaTeX math rendering |
| marked | Markdown parsing |
| Nonce-based CSP | Webview security |

### Type Safety

- All Extension ↔ Webview messages typed in [`src/types/messages.ts`](./src/types/messages.ts)
- All API response types have TypeScript interfaces
- Discriminated unions for message/event types
- No `any` types except at API boundaries with proper validation

## Performance Notes

- Virtual scrolling for long message lists (40+ messages)
- Debounced SSE updates to webview at ~60fps
- Lazy-load Shiki languages
- `requestAnimationFrame` for streaming text updates
- `retainContextWhenHidden` to keep webview alive during active sessions
- Context tool grouping reduces DOM node count
- Tool timeline grouping for consecutive tool calls

## Known Constraints

- `WebviewView` cannot be programmatically placed in auxiliary sidebar (user must drag)
- Webview has no direct filesystem access (goes through extension host)
- SSE connection must handle reconnection gracefully
- Windows process management requires `taskkill /T`
- PTY terminal requires server-side `/pty` API support (not all OpenCode versions may include this)

## Dependencies

### Runtime

| Package | Purpose |
|---------|---------|
| `@opencode-ai/sdk` | Official OpenCode SDK (REST + SSE) |
| `react`, `react-dom` | Webview UI framework |
| `zustand` | State management |
| `shiki` | Syntax highlighting |
| `katex`, `marked-katex-extension` | Math rendering |
| `marked` | Markdown parsing |
| `@tanstack/react-virtual` | Virtual scrolling |
| `@vscode/codicons` | VS Code icon set |

### Dev

| Package | Purpose |
|---------|---------|
| `vscode` (types) | Extension API types |
| `esbuild` | Extension bundling |
| `vite` | Webview bundling |
| `typescript` | Type checking |

## Release / CI

The workflow in [`.github/workflows/release-vsix-on-tag.yml`](./.github/workflows/release-vsix-on-tag.yml):

- Pushes to `main` → install, build, typecheck only
- Tags matching `v*` / `V*` → also package into VSIX and upload as workflow artifact
- Does **not** auto-create GitHub Releases

## References

The following repositories are used for read-only comparison during development:

| Repository | License | Notes |
|------------|---------|-------|
| [`anomalyco/opencode`](https://github.com/anomalyco/opencode) | MIT | First stop for official behavior |
| [`openchamber/openchamber`](https://github.com/openchamber/openchamber) | MIT | Useful for settings, session UX, terminal, and VS Code ideas |
| [`continuedev/continue`](https://github.com/continuedev/continue) | Apache-2.0 | Useful for extension/webview patterns |
| [`lehhair/OpenCodeUI`](https://github.com/lehhair/OpenCodeUI) | GPL-3.0 | Reference only — do not copy code |
