# Feature Gap Analysis: Extension vs Desktop vs Server API

> Generated: 2026-03-21
> Extension branch: `feature/settings-redesign-v2`
> Desktop reference: `vendor/OpenCodeUI/` (SolidJS/Tauri, GPL-3.0 — read-only reference)
> Server reference: `vendor/opencode-official/` (v1.2.26)
>
> **Status update (2026-03-28):** this audit snapshot is now partially historical. Core gaps from the original pass — file-path `@` mention autocomplete + prompt resolution, specialized part renderers, tool-specific renderers, outline index, tool timeline, turn-duration footer, collapsible user messages, context usage bar, session time grouping, the **Last API Response** panel (latest assistant message only), clickable `read` line jumps, and external URL opening for `webfetch` / Markdown links — are now implemented. The sections below focus on the still-relevant gaps and remaining desktop-parity limits.

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
| Message Parts | 11+ part/view types | `text`, `reasoning`, `tool`, `step-start`, `file`, `subtask`, `snapshot`, `patch`, `agent`, `retry`, `compaction` |
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
| File references | `@` mentions | Debounced file search + prompt payload resolution in chat/webview providers |
| Message Rendering | Specialized part views | `snapshot`, `patch`, `agent`, `retry`, and `compaction` renderers now ship |
| Tool Rendering | Specialized cards | Dedicated `TaskRenderer`, `TodoRenderer`, `BashRenderer`, and `EditRenderer` |
| Chat Navigation | Outline index | `OutlineIndex.tsx` provides fisheye message navigation |
| Tool Layout | Timeline grouping | `MessageContent.tsx` + `ToolCallPart.tsx` render grouped timeline rails |
| Message Footer | Turn duration | `MessageFooter.tsx` shows per-turn elapsed time |
| User Messages | Collapse / expand | `MessageBubble.tsx` collapses long user prompts with Show more / less |
| Composer Meta | Context usage bar | `TokenUsageBar.tsx` renders context/token usage inline in the composer |
| Session List | Time grouping | `SessionTreeProvider.ts` groups sessions into Today / Yesterday / Previous 7 / 30 Days / Older |
| Response Inspection | Wide panel | **Last API Response** shows the latest visible assistant message |
| Link / File Opening | Click-through actions | Markdown links, `webfetch` URLs, and `read` line numbers open directly |

---

## Remaining Feature Gaps

### HIGH Priority

#### 1. @-Mention Desktop Parity (Complexity: M)

**Status:** 🟡 PARTIALLY IMPLEMENTED

**What exists now:**
- `ChatInput.tsx` opens a debounced mention menu on `@`
- `useMentionSearch.ts` + `chatViewProvider.ts` / `sessionEditorPanelProvider.ts` perform file lookup and return results
- Selected file paths are sent as `mentions` and resolved into prompt file parts before submission

**Still missing vs desktop:**
- Pill/chip UI for inserted mentions
- Symbol/provider-registry style mention sources
- Broader server-backed parity around symbol/file-context lookup

**Desktop reference:** `src/features/mention/` directory with fuller mention/provider coverage

#### 2. Notification History / Center (Complexity: M)

**Status:** 🟡 TOASTS ONLY

**What exists now:** `NotificationToastContainer` surfaces transient in-chat notifications.

**What's still missing:** persistent cross-session history / inbox UI comparable to desktop.

### MEDIUM Priority

#### 3. Active Sessions View (Complexity: M)

**Status:** 🟡 PARTIAL

**Current state:** the chat header shows an `activeSessionCount` badge, but there is still no dedicated multi-session busy/active sessions panel.

#### 4. Session Search UI (Complexity: S)

**Status:** 🟡 INTERNAL PLUMBING ONLY

**Current state:** `SessionTreeProvider` already has filter logic, but there is no exposed search command / TreeView search affordance for users.

#### 5. Input History (Complexity: S)

Navigate through previously sent messages using Up/Down arrow keys in the chat input.

**Desktop:** `useInputHistory.ts`

---

## Server API Endpoints Not Yet Consumed

### Mention / File-System Parity Follow-ups

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/file` | GET | Directory listing for richer file pickers / mention providers |
| `/file/content` | GET | Server-side file content retrieval (not needed for current workspace-local mention resolution) |
| `/find` | GET | Glob/text search UI beyond current filename mention lookup |
| `/find/symbol` | GET | Symbol-level `@` mention search |

### Session Operations

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/session/:id/summarize` | POST | AI context compaction/summarization |

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
| `/skill` | GET | Available skills |

---

## Recommended Implementation Order

### Phase 1 — Small UX Gaps (1-2 days)

1. **Session Search UI** (S) — Expose the existing tree filter capability through a user-facing command/control
2. **Input History** (S) — Add Up/Down recall for previously sent prompts

### Phase 2 — Parity Polish (2-4 days)

3. **@-Mention polish** (M) — Pill UI + better desktop parity for mention sources
4. **Notification history** (M) — Persist / review recent notifications instead of toast-only surfacing

### Phase 3 — Larger Sidebar Work (3-5 days)

5. **Active Sessions view** (M) — Dedicated busy-session list instead of header badge only

---

## Documentation Corrections

| File | Section | Previous issue | Current correction |
|------|---------|----------------|--------------------|
| `desktop-features-comparison.md` | Feature Matrix | `File references (@)` was still treated as missing | Updated to reflect current file-path `@` mention support and remaining parity limits |
