# AGENTS.md — OpenCode for VSCode

> **This file is loaded in full into the AI Agent context. It contains only the essential information that affects coding decisions.**
> For detailed architecture, conventions, build instructions, etc., see `README.md`.

## One-Liner

VSCode extension that connects to the `opencode serve` backend via REST API + SSE, providing a full OpenCode AI coding assistant UI inside VS Code. **MIT License.**

## Reference Resources (Must-Know)

### Live Instance

A running opencode instance is available at `http://127.0.0.1:23452`:

- **Read-only** — use it to verify actual API responses (GET requests, SSE event formats)
- Cross-validate against `docs/` documentation
- **Do NOT** perform write operations (POST prompt, etc.)

### Reference Source Code

| Directory | Content | License | Usage |
|-----------|---------|---------|-------|
| `vendor/opencode-official/` | OpenCode CLI/Server official source | MIT | Freely reference for API behavior investigation |
| `vendor/continue/` | Continue VS Code extension + GUI source | Apache-2.0 | Freely reference command/keybinding/webview integration patterns; still prefer borrowing ideas over large code copies |
| `vendor/OpenCodeUI/` | Community OpenCode Desktop WebUI | **GPL-3.0** | **Read for understanding only — do NOT copy/paste any source code** (GPL virality is incompatible with this project's MIT license) |

All three directories are `.gitignore`d and not committed to this repository.

### Research Documentation (docs/)

`docs/research/` contains key findings accumulated from previous investigations. **Always check these files before re-investigating.**

| File | Content |
|------|---------|
| `opencode-api-reference.md` | REST API endpoints, SSE event types, TypeScript types, SDK usage, message fetching caveats |
| `desktop-features-comparison.md` | Desktop vs Extension feature matrix, Desktop UI architecture analysis |
| `vscode-extension-api.md` | WebviewView API, TreeView, Configuration, editor integration, postMessage patterns |
| `feature-gap-analysis.md` | Feature gap analysis, implementation roadmap |
| `opencode-server-official.md` | opencode server internals analysis |
| `openchamber-feature-reference.md` | OpenChamber feature/reference notes for extension ideas |
| `opencode-tui-tips.md` | TUI interaction patterns reference |
| `vscode-settings-ui-research.md` | Settings UI implementation research |

**Fixed order for troubleshooting API issues:**

1. Check `docs/research/opencode-api-reference.md` first
2. Cross-reference with `vendor/opencode-official/` source to confirm actual structure
3. Only then probe the live instance at `127.0.0.1:23452`

**If new information is discovered during investigation, it MUST be written into the corresponding file under `docs/research/` to keep documentation up to date.**

## Architecture (Key Constraints)

```
Extension Host (src/)          Webview (webview-ui/src/)
  Node.js runtime                Browser runtime (React)
  Full VSCode API access         No VSCode API access
  No DOM access                  Communicates with Extension only via postMessage
       │                                │
       └─── postMessage (typed) ────────┘
       │
       └─── REST API + SSE (@opencode-ai/sdk) ──→ opencode serve
```

- **Type safety:** Extension ↔ Webview messages MUST be typed in `src/types/messages.ts`. API responses MUST have TypeScript interfaces. Use discriminated unions. No unvalidated `any`.
- **Build:** Extension uses esbuild via `scripts/esbuild.mjs`, Webview uses Vite.
- **State management:** Webview side uses Zustand.

## Key Directories

```
src/
  extension.ts          — Activation entry point
  commands/             — VSCode commands
  providers/            — WebviewViewProvider, TreeDataProvider, etc.
  managers/             — SessionManager, StatusBarManager
  services/             — OpenCodeClient, ServerManager, EventBus, etc.
  types/                — Message types, event types, API types
scripts/                — Build/asset helper scripts
webview-ui/src/
  panels/chat/          — Chat panel (ChatApp.tsx)
  panels/settings/      — Settings panel (SettingsApp.tsx)
  components/           — UI components
  components/message/   — Message rendering (MessageBubble, parts/*)
  stores/               — Zustand stores
  hooks/                — Custom React hooks
  utils/                — Utility functions
```

## Workflow Rules

### Task Planning

- **All long-term TODOs go into `todo.md`** — plan the direction before starting work. Check before each session, update after completion.
- Task order: major refactors first, small details after. Finish all tasks before stopping.

### Git

- **Create a new branch before any changes** (`feature/<name>` / `fix/<name>`) — never modify `main` directly.
- Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, etc.
- When multiple subagents work sequentially, each must use a different branch to avoid workspace pollution.

### Naming Conventions

- Files: `camelCase.ts` / `PascalCase.tsx` (components)
- Classes/Types/Interfaces: `PascalCase`, no `I` prefix
- Functions/Variables: `camelCase`
- Constants: `UPPER_SNAKE_CASE`

## ⚠️ Known Constraints

- WebviewView cannot be programmatically placed in auxiliary sidebar (user must drag)
- Webview has no direct filesystem access (must go through Extension Host)
- SSE connection must handle reconnection gracefully
- Windows process management requires `taskkill /T`

## More Information

See `README.md` for:

- Full feature list and current status
- Installation, build, and dev commands
- Detailed architecture with component responsibilities
- Common development patterns (adding commands/message types/settings)
- Dependency list and performance notes
- Release and CI/CD workflow
