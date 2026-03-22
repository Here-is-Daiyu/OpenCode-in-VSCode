# OpenCode for VSCode

A Visual Studio Code extension that brings [OpenCode](https://github.com/nicepkg/opencode) AI coding assistant into VS Code as native chat, session, status, and settings experiences. It manages or connects to `opencode serve`, syncs against the global event stream, and keeps the extension host and webview UI aligned through typed messages.

> This is not built by the OpenCode team and is not affiliated with OpenCode in any way.

**License: MIT**

---

## Features

- **Chat UI** — Activity bar chat panel closely matching the official OpenCode experience, with streaming text, tool call rendering, ANSI color output, KaTeX math, and code highlighting via Shiki
- **Real-time sync** — SSE-driven session/message updates with automatic reconnection
- **Session management** — Tree view with create, switch, delete, fork, share, and recent-first loading with batched older-history hydration
- **Image attachments** — Via picker, drag and drop, and paste
- **Settings webview** — VS Code settings plus OpenCode configuration (Connection, Chat, Models, Integrations, Permissions tabs)
- **Status tree & status bar** — Connection state, model info, providers, MCP, LSP, and token usage
- **Editor integration** — Show diffs, open terminals, add files/selections to prompts, right-click context menu (Explain/Improve Code)
- **Slash commands** — `/` command system with server-side command discovery and caching
- **Agent selector** — Switch between agent variants (default/fast/deep thinking modes)
- **Virtualized scrolling** — @tanstack/react-virtual for long message lists (40-message threshold)
- **Editor panel** — Open chat in a full editor tab via `SessionEditorPanelProvider`
- **Reasoning traces** — Elapsed time display with spinner for streaming reasoning blocks
- **Theme-aware** — Anti-flash theme switching, light/dark compatible with CSS variable theming

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

Root build helpers live in `scripts/` (`esbuild.mjs` for extension bundling/watch mode, `generate-icon.js` for icon asset generation).

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
       └──── REST API + SSE (@opencode-ai/sdk) ──→ opencode serve
```

### Communication Patterns

1. **Extension ↔ OpenCode Server** — REST API + SSE via `@opencode-ai/sdk`
2. **Extension ↔ Webview** — Typed bidirectional `postMessage`
3. **Internal** — Event-driven via typed `EventBus`

### Directory Structure

```
src/
  extension.ts                    — Activation entry point
  commands/index.ts               — Command registration
  providers/
    chatViewProvider.ts           — Chat WebviewViewProvider
    settingsViewProvider.ts       — Settings WebviewViewProvider
    sessionTreeProvider.ts        — Session TreeDataProvider
    statusTreeProvider.ts         — Status TreeDataProvider
    sessionEditorPanelProvider.ts — Full editor tab panel
    codeLensProvider.ts           — CodeLens integration
  managers/
    sessionManager.ts             — Session switching & batched history loading
    statusBarManager.ts           — Status bar item management
  services/
    openCodeClient.ts             — REST + SSE client for OpenCode
    serverManager.ts              — Start/stop/monitor opencode serve
    eventBus.ts                   — Typed event bus
    diffService.ts                — Diff viewing
    decorationService.ts          — Editor decorations
    fileReferenceService.ts       — File reference handling
    terminalService.ts            — Terminal integration
    modelPreferences.ts           — Model preference persistence
    logger.ts                     — Extension logging
  types/
    messages.ts                   — Extension ↔ Webview message types
    events.ts                     — Internal event types
    opencode.ts                   — OpenCode API response types
  utils/
    webviewHtml.ts                — Webview HTML generation with nonce CSP

scripts/
  esbuild.mjs                     — Extension bundling/watch entry
  generate-icon.js                — Icon asset generation helper

webview-ui/src/
  panels/
    chat/ChatApp.tsx              — Main chat panel
    settings/SettingsApp.tsx       — Settings panel with 5 tabs
  components/
    ChatInput.tsx                 — Message input with mention/slash support
    VirtualizedMessageList.tsx    — Virtualized message rendering
    MarkdownRenderer.tsx          — Markdown + KaTeX + Shiki rendering
    ModelSelector.tsx             — Model switching dropdown
    AgentSelector.tsx             — Agent variant selector
    message/                      — Message bubble & 15 part renderers
    settings/                     — Settings form components
  stores/
    chatStore.ts                  — Chat state (Zustand)
    modelStore.ts                 — Model/provider state
    settingsStore.ts              — Settings state
    agentStore.ts                 — Agent state
    commandStore.ts               — Slash command state
  hooks/                          — Custom React hooks (5)
  utils/                          — Utility functions (ansiToHtml, markdown, etc.)
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

- All Extension ↔ Webview messages typed in `src/types/messages.ts`
- All API response types have TypeScript interfaces
- Discriminated unions for message/event types
- No `any` types except at API boundaries with proper validation

## Common Development Patterns

### Adding a New Command

1. Define command ID in `package.json` → `contributes.commands`
2. Create handler in `src/commands/`
3. Register in `src/commands/index.ts`
4. Add keyboard shortcut if appropriate

### Adding a New Webview Message Type

1. Define type in `src/types/messages.ts`
2. Add handler in the relevant provider (`src/providers/`)
3. Add sender in the webview component
4. Test bidirectional communication

### Adding a New Setting

1. Add to `package.json` → `contributes.configuration`
2. Add to settings webview UI
3. Add change handler if needed

## Naming Conventions

| Entity | Convention | Example |
|--------|-----------|---------|
| Files | `camelCase.ts` / `PascalCase.tsx` (components) | `eventBus.ts`, `ChatApp.tsx` |
| Classes/Types/Interfaces | `PascalCase`, no `I` prefix | `SessionManager`, `ChatMessage` |
| Functions/Variables | `camelCase` | `handleMessage`, `isConnected` |
| Constants | `UPPER_SNAKE_CASE` | `MAX_RETRY_COUNT` |
| Events | `PascalCase` with descriptive names | `SessionSwitched` |

## Performance Notes

- Virtual scrolling for long message lists (40+ messages)
- Debounced SSE updates to webview at ~60fps
- Lazy-load Shiki languages
- `requestAnimationFrame` for streaming text updates
- `retainContextWhenHidden` to keep webview alive during active sessions

## Known Constraints

- `WebviewView` cannot be programmatically placed in auxiliary sidebar (user must drag)
- Webview has no direct filesystem access (goes through extension host)
- SSE connection must handle reconnection gracefully
- Windows process management requires `taskkill /T`

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

The workflow in `.github/workflows/release-vsix-on-tag.yml`:

- Pushes to `main` → install, build, typecheck only
- Tags matching `v*` / `V*` → also package into VSIX and upload as workflow artifact
- Does **not** auto-create GitHub Releases

## Research Documentation

The `docs/research/` directory contains accumulated research notes:

| File | Content |
|------|---------|
| `opencode-api-reference.md` | REST API endpoints, SSE events, TypeScript types, SDK usage, message fetching caveats |
| `desktop-features-comparison.md` | Desktop vs Extension feature matrix, Desktop UI architecture (SolidJS, part registry, throttled rendering) |
| `vscode-extension-api.md` | WebviewView API, TreeView, Configuration, postMessage patterns |
| `feature-gap-analysis.md` | Feature gap analysis and implementation roadmap |
| `opencode-server-official.md` | Server internals analysis |
| `openchamber-feature-reference.md` | OpenChamber feature/reference notes for extension ideas |
| `opencode-tui-tips.md` | TUI interaction patterns reference |
| `vscode-settings-ui-research.md` | Settings UI implementation research |

## Git Workflow

- Main branch: `main`
- Feature branches: `feature/<name>`
- Fix branches: `fix/<name>`
- Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, etc.
- Each logical change = one commit
- Never commit directly to `main`
