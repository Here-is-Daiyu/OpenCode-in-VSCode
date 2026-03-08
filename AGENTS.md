# AGENTS.md - OpenCode for VSCode Development Guide

## Project Overview
OpenCode for VSCode is a VSCode extension that provides a full-featured OpenCode AI coding assistant interface within Visual Studio Code. It communicates with the `opencode serve` backend via REST API + SSE.

## Architecture Principles

### Separation of Concerns
- **Extension Host** (src/): Node.js runtime, VSCode API access, no DOM
- **Webview** (webview-ui/): Browser runtime, React UI, no VSCode API (only postMessage)
- **Types** (src/types/): Shared type definitions
- **Services** (src/services/): Business logic, API communication
- **Providers** (src/providers/): VSCode view providers
- **Managers** (src/managers/): State management on extension side

### Communication Patterns
1. **Extension ↔ OpenCode Server**: REST API + SSE via @opencode-ai/sdk
2. **Extension ↔ Webview**: postMessage (typed, bidirectional)
3. **Components**: Event-driven via typed EventBus

### Key Design Decisions
- **React** for webview UI (complex interactive UI needs component framework)
- **Zustand** for webview state management (lightweight, TypeScript-friendly)
- **esbuild** for extension bundling (fast, simple)
- **Vite** for webview bundling (HMR in dev, optimized production builds)
- **Shiki** for code highlighting (matches VSCode themes perfectly)
- **KaTeX** for LaTeX rendering
- **marked** for Markdown parsing
- **Nonce-based CSP** for webview security

### Type Safety
- All message types between extension and webview MUST be typed
- All API response types from OpenCode MUST have TypeScript interfaces
- Use discriminated unions for message/event types
- NO `any` types except at API boundaries with proper validation

## Documentation Index

The `docs/` directory contains detailed research notes — read them before duplicating investigation:

| File | Content |
|------|---------|
| `docs/research/opencode-api-reference.md` | Complete REST API endpoints, SSE event types, TypeScript types, SDK usage, message fetching notes (timestamp format, `?limit=` behavior, payload size) |
| `docs/research/desktop-features-comparison.md` | Feature matrix (Desktop vs Extension), Desktop chat UI architecture deep dive (SolidJS, part registry, throttled rendering, context tool grouping, overflow-anchor scrolling) |
| `docs/research/vscode-extension-api.md` | WebviewView API, TreeView, Configuration, Editor integration, build systems (esbuild + Vite), postMessage patterns (large payload, race conditions, caching/resend) |

- 遇到 endpoint response / request format 问题时，排查顺序必须固定：先查本地 docs（优先 `docs/research/opencode-api-reference.md`），再对照 `opencode` / `opencode desktop` 源码确认真实结构，最后才连到 `23452` 端口做实测，避免过早依赖 runtime probing。

## OpenCode API Reference
See `docs/research/opencode-api-reference.md` for the complete API documentation.

Key points:
- Base URL: `http://{hostname}:{port}`
- Authentication: HTTP Basic Auth (optional, via env vars)
- SSE endpoint: `GET /event` for real-time updates
- Async prompts: `POST /session/:id/prompt_async` (preferred for UI)
- Session-centric: All conversations are within sessions

## File Conventions

### Extension Source (src/)
- One class/module per file
- Use barrel exports (index.ts) for directories
- Services are singletons, created in extension.ts activate()
- Providers implement VSCode provider interfaces
- Commands are registered in commands/index.ts

### Webview Source (webview-ui/src/)
- Components: PascalCase, one component per file
- Hooks: camelCase, prefixed with "use"
- Stores: camelCase, one store per domain
- Utils: camelCase, pure functions
- CSS: CSS Modules or Tailwind (TBD)

### Naming Conventions
- Files: camelCase.ts / PascalCase.tsx (components)
- Classes: PascalCase
- Functions: camelCase
- Constants: UPPER_SNAKE_CASE
- Types/Interfaces: PascalCase, no I-prefix
- Events: PascalCase with descriptive names

## Git Workflow
- Main branch: `main`
- Feature branches: `feature/<name>`
- Fix branches: `fix/<name>`
- Commit messages: Conventional Commits (feat:, fix:, docs:, refactor:, etc.)
- Each logical change = one commit
- 后续如果需要开多个 subagent 顺序修复问题，每个 subagent 必须在不同的 git 分支里进行修改，避免相互污染工作区与上下文。

## Testing
- Extension: Use VSCode Extension Testing framework
- Webview: Use Vitest + React Testing Library
- API Client: Mock-based unit tests

## Common Patterns

### Adding a New Command
1. Define command ID in package.json contributes.commands
2. Create handler in src/commands/
3. Register in src/commands/index.ts
4. Add keyboard shortcut if appropriate

### Adding a New Webview Message Type
1. Define type in src/types/messages.ts
2. Add handler in the relevant provider (src/providers/)
3. Add sender in the webview component
4. Test bidirectional communication

### Adding a New Setting
1. Add to package.json contributes.configuration
2. Add to settings webview UI
3. Add change handler if needed
4. Document in README.md

## Known Constraints
- WebviewView cannot be programmatically placed in auxiliary sidebar (user must drag)
- Webview has no direct filesystem access (must go through extension)
- SSE connection must handle reconnection gracefully
- Windows process management requires special handling (taskkill /T)

## Dependencies
- `@opencode-ai/sdk` - Official OpenCode SDK
- `vscode` - VSCode Extension API (devDependency)
- React 18+ - Webview UI framework
- Zustand - State management
- Shiki - Syntax highlighting
- KaTeX - Math rendering
- marked - Markdown parsing

## Performance Considerations
- Use virtual scrolling for long message lists
- Debounce SSE updates to webview at ~60fps
- Lazy-load Shiki languages
- Use requestAnimationFrame for streaming text updates
- Keep webview alive with retainContextWhenHidden for active sessions
