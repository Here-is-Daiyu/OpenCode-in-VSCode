# Feature Gap Analysis: Extension vs Desktop vs Server API

> Generated: 2026-03-21
> Extension branch: `feature/settings-redesign-v2`
> Desktop reference: `vendor/OpenCodeUI/` (SolidJS/Tauri, GPL-3.0 — read-only reference)
> Server reference: `vendor/opencode-official/` (v1.2.26)

---

## Methodology

Three parallel analyses were performed:

1. **OpenCodeUI Desktop exploration** — component-level feature inventory of the SolidJS/Tauri app
2. **opencode-official server API exploration** — all REST endpoints, SSE events, data types
3. **Extension cross-verification** — confirmed what is actually implemented vs. what docs claim

All findings were cross-verified against the live server at `http://127.0.0.1:23452`.

---

## What the Extension ALREADY Has (Verified ✅)

| Category | Feature | Implementation |
|----------|---------|----------------|
| SSE Events | 14 event types | `session.created/updated/deleted/status`, `message.updated/removed`, `message.part.updated/delta`, `permission.asked`, `question.asked`, `config.updated`, `todo.updated`, `file.edited`, `mcp.tools.changed` |
| Message Parts | 7 part types rendered | `text`, `reasoning`, `tool`, `step-start`, `step-finish`, `file`, `subtask` |
| Permissions | Full system | PermissionCard.tsx with approve/deny + API integration |
| Questions | Full system | QuestionCard.tsx with response submission |
| Token/Cost | Detailed display | TokenUsageBar.tsx with input/output/reasoning/cache segments |
| Session Ops | Fork/Revert/Unrevert | Full API + VS Code commands |
| Attachments | Image support | Drag/drop/paste in ChatInput.tsx |
| Streaming | Real-time | `message.part.delta` SSE events → `appendPartDelta` in chatStore |
| Session Status | Full tracking | idle/active/error/compacting/retry states |
| Diff View | Native integration | diffService.ts with VS Code diff editor |
| Slash Commands | Full system | Caching, filtering, keyboard navigation |
| Virtual Scroll | Performance | @tanstack/react-virtual with 40-message threshold |
| Editor Panel | Side-by-side | SessionEditorPanelProvider with shared HTML |
| Context Menu | Code actions | Explain/Improve Code with autoSend |
| Settings | 5-tab redesign | Connection/Chat/Models/Integrations/Permissions |
| ANSI Colors | Tool output | Custom ansiToHtml parser (SGR 0-107, 256-color, truecolor) |
| Themes | Light/Dark | CSS variables, anti-flash transition suppression |

---

## Genuine Feature Gaps

### HIGH Priority

#### 1. @-Mention System (Complexity: L)

**Status:** ❌ NOT IMPLEMENTED (docs incorrectly claimed it was)

**What exists:** ChatInput placeholder text says `(@ for files, / for commands)` — but there is NO actual implementation.

**What's missing:**
- File picker / autocomplete dropdown when typing `@`
- Mention parsing in input text
- Context provider registry
- File/symbol search integration
- Pill-based UI for inserted mentions

**Desktop reference:** `src/features/mention/` directory with full mention system

**Server endpoints needed:**
- `GET /file?path=` — File listing
- `GET /file/content?path=` — File content retrieval
- `GET /find?pattern=` — Glob search
- `GET /find/file?query=` — File name search
- `GET /find/symbol?query=` — Symbol search

#### 2. Missing Message Part Types (Complexity: M)

**Status:** ❌ 5 part types explicitly filtered out

**What's skipped in `MessageContent.tsx:159-187`:**

| Part Type | Purpose | Desktop Renderer |
|-----------|---------|-----------------|
| `snapshot` | File system snapshot for revert | Visual indicator with revert action |
| `patch` | File diffs/patches | Inline diff display |
| `agent` | Agent delegation markers | Agent badge/indicator |
| `retry` | Retry indicators | Countdown + error details |
| `compaction` | Context compaction markers | Compaction summary |

#### 3. Tool-Specific Renderers (Complexity: M)

**Status:** ❌ All tools use generic `ToolCallPart`

**Desktop has specialized renderers:**

| Renderer | Purpose | Desktop Location |
|----------|---------|-----------------|
| TaskRenderer | Nested sub-session view for agent tasks | `src/features/message/tools/renderers/TaskRenderer` |
| TodoRenderer | Interactive checklist for todo operations | `src/features/message/tools/renderers/TodoRenderer` |
| DefaultRenderer | Structured input/output/diagnostics display | `src/features/message/tools/renderers/DefaultRenderer` |

### MEDIUM Priority

#### 4. Fisheye Outline Index (Complexity: L)

Floating right-side message navigation with hover-fisheye effect showing message titles/summaries.

**Desktop:** `src/components/OutlineIndex.tsx`

#### 5. Tool Timeline Layout (Complexity: M)

Multi-tool calls displayed with vertical timeline connectors and grouped rendering, showing execution flow.

**Desktop:** `src/features/message/parts/ToolPartView.tsx`

#### 6. Turn Duration Display (Complexity: S)

Show total round-trip time for user → assistant message pairs (e.g., "Took 12.3s").

**Desktop:** `MessageRenderer.tsx:109-158`

#### 7. Retry Status Inline (Complexity: S)

When the model retries, show a countdown with expandable error details inline in the conversation.

**Desktop:** `RetryStatusInline.tsx`

#### 8. Active Sessions Tab (Complexity: M)

Dedicated sidebar view showing busy/active sessions across all projects with status dots and progress indicators.

**Desktop:** `SidePanel.tsx:533-669`

#### 9. Session Search (Complexity: S)

Real-time search/filter through session titles in the session list.

**Desktop:** `SessionList.tsx:122-146`

#### 10. Agent Variant Selection (Complexity: S)

Dropdown in the chat input toolbar to select agent "thinking" variants: default, fast, deep thinking.

**Desktop:** `InputToolbar.tsx:251-312`

#### 11. Input History (Complexity: S)

Navigate through previously sent messages using Up/Down arrow keys in the chat input.

**Desktop:** `useInputHistory.ts`

#### 12. Notification History / Toast System (Complexity: M)

Cross-session event notifications with a persistent notification center/history panel.

**Desktop:** `notificationStore.ts`

#### 13. Collapsible User Messages (Complexity: S)

Long user messages automatically collapse to an 8-line preview with "Show more" / "Show less" toggle.

#### 14. Context Window Usage Bar (Complexity: XS)

Visual progress bar showing current context token usage vs. model's maximum context window size.

**Desktop:** `SidebarFooter.tsx`

#### 15. Session Time Grouping (Complexity: S)

Sessions grouped by relative time buckets: Today / Yesterday / Previous 7 Days / Previous 30 Days / Older.

---

## Server API Endpoints Not Yet Consumed

### File System & Search (needed for @-mention)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/file` | GET | List files at path |
| `/file/content` | GET | Read file content |
| `/find` | GET | Glob pattern search |
| `/find/file` | GET | Fuzzy file name search |
| `/find/symbol` | GET | Symbol search across files |

### Session Operations

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/session/:id/summarize` | POST | AI context compaction/summarization |
| `/session/:id/shell` | POST | Execute shell command in session context |

### Provider & Auth

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/provider/auth` | GET | Authentication methods per provider |

### Experimental / Advanced

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/experimental/tool/ids` | GET | List available tool IDs |
| `/experimental/tool` | GET | Get tool schemas |
| `/experimental/resource` | GET | MCP resources |
| `/experimental/workspace` | GET/POST | Workspace management |
| `/experimental/worktree` | GET | Git worktree management |
| `/vcs` | GET | VCS/Git information |
| `/command` | GET | Server-side command list |
| `/skill` | GET | Available skills |

---

## Recommended Implementation Order

### Phase 1 — Quick Wins (1-2 days)

1. **Context Window Usage Bar** (XS) — Simple progress bar, data already available
2. **Session Time Grouping** (S) — Pure UI grouping logic
3. **Collapsible User Messages** (S) — CSS + toggle state
4. **Turn Duration Display** (S) — Timestamp diff calculation
5. **Session Search** (S) — Filter existing session list
6. **Input History** (S) — Array + arrow key handler

### Phase 2 — Core Enhancements (3-5 days)

7. **Missing Part Types** (M) — Add renderers for snapshot/patch/agent/retry/compaction
8. **Retry Status Inline** (S) — Depends on retry part type
9. **Agent Variant Selection** (S) — Dropdown + API integration
10. **Tool-Specific Renderers** (M) — TaskRenderer, TodoRenderer, DefaultRenderer

### Phase 3 — Major Features (1-2 weeks)

11. **@-Mention System** (L) — File picker, search API, mention parsing, pill UI
12. **Fisheye Outline Index** (L) — Custom floating navigation component
13. **Tool Timeline Layout** (M) — Visual timeline connectors
14. **Active Sessions Tab** (M) — New sidebar view
15. **Notification System** (M) — Toast + history panel

---

## Documentation Corrections

| File | Line | Issue | Fix |
|------|------|-------|-----|
| `desktop-features-comparison.md` | 37 | Claims `File references (@)` is `✅ Autocomplete` | Should be `❌ Not implemented` — only placeholder text exists |
