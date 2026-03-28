# OpenCode API Reference

> Verified against live OpenCode server v1.2.26 at port 23452 on 2026-03-21

> Note: This document is compiled from corresponding official public documentation and publicly available project materials. Copyright in the original source materials belongs to the respective official owners.

Complete API reference for OpenCode's server, SDK, configuration, and event system.

---

## OpenCode Server (`opencode serve`)

### Server Startup

```bash
opencode serve --port 4096 --hostname 127.0.0.1 --mdns --cors "http://localhost:3000"
```

**Authentication:**

- `OPENCODE_SERVER_PASSWORD` — env var for server password
- `OPENCODE_SERVER_USERNAME` — env var for username (default: `opencode`)

---

## Complete REST API Endpoints

### Global

| Method | Path | Response |
|--------|------|----------|
| GET | `/global/health` | `{ healthy: true, version: string }` |
| GET | `/global/event` | SSE Event Stream |

### Project

| Method | Path | Response |
|--------|------|----------|
| GET | `/project` | `Project[]` |
| GET | `/project/current` | `Project` |

### Path & VCS

| Method | Path | Response |
|--------|------|----------|
| GET | `/path` | `Path` |
| GET | `/vcs` | `VcsInfo` |

### Instance

| Method | Path | Response |
|--------|------|----------|
| POST | `/instance/dispose` | `boolean` |

### Config

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/config` | — | `Config` |
| PATCH | `/config` | partial config | `Config` |
| GET | `/config/providers` | — | `{ providers: Provider[], default: Record<string, string> }` — **NOTE:** uses `providers` key (not `all` like `/provider`) |

> **Storage note:** `PATCH /config` writes the project-local file `<Path.directory>/config.json` (verified against official server source: `Config.update()`), not the global config directory returned by `Path.config`. Global files under `Path.config` (`opencode.jsonc`, `opencode.json`, `config.json`) are load sources and are used by `Config.updateGlobal()` instead.
>
> **Read vs write mismatch:** Official config reads are broader than `PATCH /config` writes. The read precedence is: remote `/.well-known/opencode` → global config dir (`Path.config`) → `OPENCODE_CONFIG` → project `opencode.jsonc` / `opencode.json` found from `Path.directory` up to `Path.worktree` → `.opencode/opencode.jsonc` / `.opencode/opencode.json` on that same upward walk → `OPENCODE_CONFIG_CONTENT`. This means the file most likely affecting manual edits is not always `<Path.directory>/config.json`.
>
> **Extension strategy:** the VS Code extension's “Open local config” action should prefer the highest-precedence *observable project-local* config source it can infer from `GET /path`, then fall back to creating `<Path.directory>/opencode.jsonc`. It cannot be perfectly identical to official resolution because the API does not expose env-driven overrides such as `OPENCODE_CONFIG`, `OPENCODE_CONFIG_DIR`, or `OPENCODE_CONFIG_CONTENT`.

### Provider

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/provider` | — | `{ all: Provider[], default: Record<string, string>, connected: string[] }` |
| GET | `/provider/auth` | — | `{ [providerID]: ProviderAuthMethod[] }` |
| POST | `/provider/{id}/oauth/authorize` | — | `ProviderAuthAuthorization` |
| POST | `/provider/{id}/oauth/callback` | — | `boolean` |

### Session

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/session` | — | `Session[]` |
| POST | `/session` | `{ parentID?, title?, mcpServers? }` | `Session` |
| GET | `/session/status` | — | `{ [sessionID]: SessionStatus }` |
| GET | `/session/:id` | — | `Session` |
| DELETE | `/session/:id` | — | `boolean` |
| PATCH | `/session/:id` | `{ title? }` | `Session` |
| GET | `/session/:id/children` | — | `Session[]` |
| GET | `/session/:id/todo` | — | `Todo[]` |
| POST | `/session/:id/init` | `{ messageID, providerID, modelID }` | `boolean` |
| POST | `/session/:id/fork` | `{ messageID? }` | `Session` |
| POST | `/session/:id/abort` | — | `boolean` |
| POST | `/session/:id/share` | — | `Session` |
| DELETE | `/session/:id/share` | — | `Session` |
| GET | `/session/:id/diff` | query: `?messageID` | `FileDiff[]` |
| POST | `/session/:id/summarize` | `{ providerID, modelID }` | `boolean` |
| POST | `/session/:id/revert` | `{ messageID, partID? }` | `boolean` |
| POST | `/session/:id/unrevert` | — | `boolean` |
| POST | `/session/:id/permissions/:permissionID` | `{ response, remember? }` | `boolean` |

> **Undo/redo mapping:** official `/undo` and `/redo` UX is frontend behavior layered on top of `POST /session/:id/revert` and `POST /session/:id/unrevert`.
>
> **Server-side revert behavior:** official server `SessionRevert.revert()` stores `session.revert`, captures the current snapshot on first revert, replays `patch` parts through the snapshot subsystem, and records a `diff` summary. `SessionRevert.unrevert()` restores the saved snapshot and clears `session.revert`.
>
> **Client rendering caveat:** reverted messages are still returned by `GET /session/:id/message` until the server later runs revert cleanup (for example before a new prompt, compact, or explicit cleanup paths). Clients that want undo/redo UX must hide messages from `session.revert.messageID` onward in the visible conversation. This extension now keeps the raw message list in store and derives `visibleMessages` by slicing everything before that revert point; if the revert boundary has not been loaded yet during batched history hydration, the visible list is treated as empty until that boundary arrives.

### Messages

| Method | Path | Body / Query | Response |
|--------|------|--------------|----------|
| GET | `/session/:id/message` | query: `?limit` | `{ info: Message, parts: Part[] }[]` — see [Message Fetching Notes](#message-fetching-notes) |
| POST | `/session/:id/message` | `{ messageID?, model?, agent?, noReply?, system?, tools?, parts }` | `{ info: Message, parts: Part[] }` |
| GET | `/session/:id/message/:messageID` | — | `{ info: Message, parts: Part[] }` |
| POST | `/session/:id/prompt_async` | same body as `/message`; `parts` required in practice | `204 No Content` |
| POST | `/session/:id/command` | `{ messageID?, agent?, model?, command, arguments }` | `{ info: Message, parts: Part[] }` |
| POST | `/session/:id/shell` | `{ agent, model?, command }` | `{ info: Message, parts: Part[] }` |

> **Shell execution note:** official TUI `!` input is only a frontend shortcut. Actual execution goes through `POST /session/:id/shell`, not a client-side `child_process` call.
>
> **Shell response shape:** the server creates an assistant message whose primary visible content is a `tool` part with `tool: "bash"`. Output is streamed by normal session SSE updates (`message.updated` / `message.part.updated` / `message.part.delta`), so clients should reuse the standard session message pipeline rather than inventing a separate terminal result channel.

### Commands

| Method | Path | Response |
|--------|------|----------|
| GET | `/command` | `Command[]` |

### Files

| Method | Path | Query | Response |
|--------|------|-------|----------|
| GET | `/find` | `?pattern=` | `Match[]` |
| GET | `/find/file` | `?query=` | `string[]` |
| GET | `/find/symbol` | `?query=` | `Symbol[]` |
| GET | `/file` | `?path=` | `FileNode[]` |
| GET | `/file/content` | `?path=` | `FileContent` |
| GET | `/file/status` | — | `File[]` |

### Tools (Experimental)

| Method | Path | Query | Response |
|--------|------|-------|----------|
| GET | `/experimental/tool/ids` | — | `string[]` |
| GET | `/experimental/tool` | `?provider=` | `ToolList` |

### LSP / Formatters / MCP

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/lsp` | — | `LSPStatus[]` |
| GET | `/formatter` | — | `FormatterStatus[]` |
| GET | `/mcp` | — | `{ [name]: MCPStatus }` |
| POST | `/mcp` | `{ name, config }` | `MCPStatus` |

### Agents

| Method | Path | Response |
|--------|------|----------|
| GET | `/agent` | `Agent[]` |

### Auth

| Method | Path | Response |
|--------|------|----------|
| PUT | `/auth/:id` | `boolean` |

### Logging

| Method | Path | Response |
|--------|------|----------|
| POST | `/log` | `boolean` |

### TUI Control

| Method | Path | Response |
|--------|------|----------|
| POST | `/tui/append-prompt` | `boolean` |
| POST | `/tui/open-help` | `boolean` |
| POST | `/tui/open-sessions` | `boolean` |
| POST | `/tui/open-themes` | `boolean` |
| POST | `/tui/open-models` | `boolean` |
| POST | `/tui/submit-prompt` | `boolean` |
| POST | `/tui/clear-prompt` | `boolean` |
| POST | `/tui/execute-command` | `boolean` |
| POST | `/tui/show-toast` | `boolean` |
| GET | `/tui/control/next` | `Control request` |
| POST | `/tui/control/response` | `boolean` |

### Docs

| Method | Path | Response |
|--------|------|----------|
| GET | `/doc` | OpenAPI 3.1 spec |

---

## SSE Event Types

Events are received via `GET /global/event` as a Server-Sent Events stream. Each event is a JSON object with a `type` field (dot-notation format) and a `properties` field. The global endpoint wraps events in `{ directory, payload: { type, properties } }`.

> **Important:** The `server.connected` event has **no `directory` field** (it is a global event). All other events include a `directory` field indicating which project they belong to.

> **SSE wire format example:**
> ```
> data: {"payload":{"type":"server.connected","properties":{}}}
>
> data: {"directory":"C:\\Users\\ExampleUser\\project","payload":{"type":"message.part.delta","properties":{"sessionID":"...","messageID":"...","partID":"...","field":"text","delta":"some text"}}}
> ```

> **Note:** The OpenAPI spec schema names use PascalCase (e.g., `EventSessionCreated`), but the actual `type` field sent on the wire uses **dot-notation** (e.g., `session.created`). The PascalCase names are TypeScript type names only.

### Session Events

| Wire Type | Schema Name | Properties |
|-----------|-------------|------------|
| `session.created` | `EventSessionCreated` | `{ info: Session }` |
| `session.updated` | `EventSessionUpdated` | `{ info: Session }` |
| `session.deleted` | `EventSessionDeleted` | `{ info: Session }` |
| `session.status` | `EventSessionStatus` | `{ info: SessionStatus, sessionID: string }` |
| `session.idle` | `EventSessionIdle` | `{ sessionID: string }` |
| `session.compacted` | `EventSessionCompacted` | `{ sessionID: string }` |
| `session.diff` | `EventSessionDiff` | `{ sessionID: string, diffs: FileDiff[] }` |
| `session.error` | `EventSessionError` | `{ sessionID: string, error: string }` |

### Message Events

| Wire Type | Schema Name | Properties |
|-----------|-------------|------------|
| `message.updated` | `EventMessageUpdated` | `{ info: Message }` |
| `message.removed` | `EventMessageRemoved` | `{ messageID: string, sessionID: string }` |
| `message.part.updated` | `EventMessagePartUpdated` | `{ part: Part }` |
| `message.part.delta` | `EventMessagePartDelta` | `{ sessionID, messageID, partID, field, delta }` — `field` indicates which part field is being updated (e.g., `"text"`) |
| `message.part.removed` | `EventMessagePartRemoved` | `{ partID: string, sessionID: string, messageID: string }` |

### Permission Events

| Wire Type | Schema Name |
|-----------|-------------|
| `permission.asked` | `EventPermissionAsked` |
| `permission.replied` | `EventPermissionReplied` |

### Question Events

| Wire Type | Schema Name |
|-----------|-------------|
| `question.asked` | `EventQuestionAsked` |
| `question.replied` | `EventQuestionReplied` |
| `question.rejected` | `EventQuestionRejected` |

### File Events

| Wire Type | Schema Name |
|-----------|-------------|
| `file.edited` | `EventFileEdited` |
| `file.watcher.updated` | `EventFileWatcherUpdated` |

### Project Events

| Wire Type | Schema Name |
|-----------|-------------|
| `project.updated` | `EventProjectUpdated` |

### System Events

| Wire Type | Schema Name |
|-----------|-------------|
| `server.connected` | `EventServerConnected` |
| `server.instance.disposed` | `EventServerInstanceDisposed` |
| `installation.updated` | `EventInstallationUpdated` |
| `installation.update.available` | `EventInstallationUpdateAvailable` |

### Other Events

| Wire Type | Schema Name |
|-----------|-------------|
| `todo.updated` | `EventTodoUpdated` |
| `command.executed` | `EventCommandExecuted` |
| `tui.prompt.append` | `EventTuiPromptAppend` |
| `tui.toast.show` | `EventTuiToastShow` |
| `lsp.client.diagnostics` | `EventLspClientDiagnostics` |
| `vcs.branch.updated` | `EventVcsBranchUpdated` |
| `pty.created` | `EventPtyCreated` |
| `pty.updated` | `EventPtyUpdated` |
| `pty.exited` | `EventPtyExited` |
| `pty.deleted` | `EventPtyDeleted` |

---

## Message Fetching Notes

### `GET /session/:id/message`

Important behavioral details discovered through live server probing:

#### Timestamp Format

All `time.created` and `time.completed` fields across Session, UserMessage, and AssistantMessage are **epoch milliseconds** (not seconds). Example observed value: `1772332788695`.

To convert: `new Date(info.time.created)` works directly in JavaScript (no `* 1000` needed).

#### Without `?limit=` — Full History

Calling `GET /session/:id/message` **without** a `?limit=` query parameter returns the **complete message history** for that session.

- Long-running sessions can have **300+ messages**
- Response payload can be **4MB+** in size
- All messages are returned in a flat array of `{ info: Message, parts: Part[] }` objects

#### With `?limit=N` — Newest N Messages

Adding `?limit=N` returns the **newest N messages**, but still sorted in **ascending order** (oldest first).

```
GET /session/abc123/message?limit=20
→ Returns the 20 most recent messages, sorted oldest→newest
```

This is ideal for initial page load — fetch the last ~50 messages, then load earlier history on demand (scroll-up pagination).

#### Message Ordering

Messages are **always sorted ascending by `info.time.created`** (oldest first), regardless of whether `?limit=` is used. This matches natural chat display order (scroll down = newer).

#### Large Payload Considerations for Webview Integration

| Concern | Detail |
|---------|--------|
| **Serialization cost** | 4MB+ JSON payloads take measurable time to serialize/deserialize through `postMessage` |
| **Memory pressure** | Webview holds full message list in memory; consider pagination or virtualization |
| **Initial load** | Use `?limit=50` for initial session load, then lazy-load earlier messages on scroll |
| **Incremental updates** | After initial load, use SSE events (`EventMessagePartDelta`, etc.) for real-time updates — don't re-fetch full history |

---

## Prompt Submission Notes

### `POST /session/:id/message` and `POST /session/:id/prompt_async`

`prompt_async` uses the same request body shape as `/message`. In practice, text prompts must still be sent via `parts`; sending only `content` is rejected by validation.

#### Text Payloads

Accepted (`prompt_async` returns `HTTP 204 No Content`):

```json
{
  "parts": [
    { "type": "text", "text": "What is the weather today?" }
  ]
}
```

Rejected:

```json
{
  "content": "What is the weather today?"
}
```

Observed validation response:

```json
HTTP 400
{
  "data": {
    "content": "What is the weather today?"
  },
  "error": [
    {
      "expected": "array",
      "code": "invalid_type",
      "path": ["parts"],
      "message": "Invalid input: expected array, received undefined"
    }
  ],
  "success": false
}
```

#### File / Image Parts

Accepted request shape:

```json
{
  "parts": [
    { "type": "text", "text": "Please describe this image briefly." },
    {
      "type": "file",
      "mime": "image/png",
      "filename": "pixel.png",
      "url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X8ZkAAAAASUVORK5CYII="
    }
  ]
}
```

Also accepted without `filename`:

```json
{
  "parts": [
    { "type": "text", "text": "Please describe this image briefly." },
    {
      "type": "file",
      "mime": "image/png",
      "url": "data:image/png;base64,..."
    }
  ]
}
```

Use `mime` (not `mimeType`). Rejected example:

```json
{
  "parts": [
    { "type": "text", "text": "Please describe this image briefly." },
    {
      "type": "file",
      "mimeType": "image/png",
      "filename": "pixel.png",
      "url": "data:image/png;base64,..."
    }
  ]
}
```

Observed validation response:

```json
HTTP 400
{
  "error": [
    {
      "expected": "string",
      "code": "invalid_type",
      "path": ["parts", 1, "mime"],
      "message": "Invalid input: expected string, received undefined"
    }
  ]
}
```

#### Stored File Part Shape Returned by `GET /session/:id/message`

Observed file parts include request fields plus server-assigned identifiers:

```json
{
  "type": "file",
  "mime": "image/png",
  "filename": "pixel.png",
  "url": "data:image/png;base64,...",
  "id": "prt_...",
  "sessionID": "ses_...",
  "messageID": "msg_..."
}
```

---

## TypeScript Types

### Session

```typescript
type Session = {
  id: string
  slug: string
  projectID: string
  directory: string
  parentID?: string
  summary?: { additions: number; deletions: number; files: number; diffs?: FileDiff[] }
  share?: { url: string }
  title: string
  version: string
  time: { created: number; updated: number; compacting?: number; archived?: number }
  // NOTE: All `time` fields are epoch MILLISECONDS (not seconds).
  // Example observed value: 1772332788695 (≈ year 2026 in ms)
  permission?: PermissionRule[]   // Array of permission rules (NOT a map)
  revert?: { messageID: string; partID?: string; snapshot?: string; diff?: string }
}
```

### Message

```typescript
type Message = UserMessage | AssistantMessage

type UserMessage = {
  id: string; sessionID: string; role: "user"
  time: { created: number }
  // NOTE: `time.created` is epoch MILLISECONDS (not seconds).
  // Example: 1772332788695
  format?: OutputFormat
  agent: string
  model: { providerID: string; modelID: string }
  system?: string
  tools?: { [key: string]: boolean }
}

type AssistantMessage = {
  id: string; sessionID: string; role: "assistant"
  time: { created: number; completed?: number }  // epoch MILLISECONDS
  error?: ProviderAuthError | UnknownError
  parentID: string
  modelID: string; providerID: string
  mode: string; agent: string
  path: { cwd: string; root: string }
  summary?: boolean; cost: number
  tokens: { total?: number; input: number; output: number; reasoning: number; cache: { read: number; write: number } }
  structured?: unknown
  finish?: string
}
```

### Part

```typescript
type Part = TextPart | FilePart | ToolPart | ReasoningPart | SubtaskPart | StepStartPart | StepFinishPart | SnapshotPart | PatchPart | AgentPart | RetryPart | CompactionPart
```

### PermissionRule

```typescript
type PermissionRule = {
  permission: string        // e.g. "todowrite", "bash", "edit"
  action: "allow" | "deny" | "ask"
  pattern: string           // e.g. "*"
}
```

### SessionStatus

```typescript
type SessionStatus = {
  type: "idle" | "busy" | string
}
// GET /session/status returns Record<string, SessionStatus>
// e.g. { "ses_xxx": { "type": "busy" } }
```

### Provider

```typescript
type Provider = {
  id: string                    // e.g. "fireai"
  name: string                  // e.g. "Fire AI"
  source: "custom" | "config"   // origin of provider definition
  env: string[]                 // required env var names, e.g. ["OPENAI_API_KEY"]
  options: {                    // provider-specific options
    baseURL?: string
    apiKey?: string             // SENSITIVE — only present for connected providers
  }
  models: Record<string, Model> // modelId -> Model
  key?: string                  // API key (only present for connected providers) - SENSITIVE
}
```

### Model

```typescript
type Model = {
  id: string                    // e.g. "gpt-5.2"
  providerID: string            // parent provider ID
  name: string                  // human-readable name, e.g. "GPT 5.2"
  family: string                // model family, e.g. "llama", "" if unset
  api: {
    id: string                  // same as model id
    url?: string                // custom API URL
    npm: string                 // SDK package, e.g. "@ai-sdk/openai"
  }
  status: "active"              // observed value
  headers: Record<string, string>  // usually empty {}
  options: Record<string, any>     // model-specific options, e.g. { useResponsesApi: true }
  cost: {
    input: number
    output: number
    cache: { read: number; write: number }
  }
  limit: {
    context: number
    output: number
    input?: number              // optional, observed on some models
  }
  capabilities: {
    temperature?: boolean
    reasoning: boolean
    attachment: boolean
    toolcall: boolean
    input: { text: boolean; audio: boolean; image: boolean; video: boolean; pdf: boolean }
    output: { text: boolean; audio: boolean; image: boolean; video: boolean; pdf: boolean }
    interleaved: boolean | { field: string }  // can be { field: "reasoning_content" }
  }
  release_date: string          // ISO date or ""
  variants: Record<string, {    // model variants with thinking configs
    reasoningEffort?: string
    reasoningSummary?: string
    include?: string[]
    thinking?: { type: "enabled" | "adaptive"; budgetTokens?: number }
    effort?: string
  }>
}
```

### Agent

```typescript
type Agent = {
  name: string              // e.g. "build", "plan", "coder", "explore"
  description: string       // human-readable description
  options: Record<string, any>  // e.g. { thinking: { type: "enabled" } }
  permission: PermissionRule[]  // array of permission rules
  mode: "primary" | "subagent"
  native: boolean
  prompt?: string           // system prompt (can be very long)
  model?: { providerID: string; modelID: string }  // only on some agents
  hidden?: boolean
  temperature?: number
}
// Observed agents: build, plan, general, explore, compaction, title, summary, reviewer, digest, coder
```

### Path

```typescript
type Path = {
  home: string              // e.g. "C:\\Users\\ExampleUser"
  state: string             // e.g. "C:\\Users\\ExampleUser\\.local\\state\\opencode"
  config: string            // e.g. "C:\\Users\\ExampleUser\\.config\\opencode"
  worktree: string          // e.g. "/"
  directory: string         // e.g. "C:\\Users\\ExampleUser\\project"
}
```

- `config` is the global config directory (`Global.Path.config` in the official source).
- `directory` is the current project directory used by `PATCH /config` and as the start point for upward config lookup.
- `worktree` is the stop boundary for upward project config searches (`findUp` / `.opencode` scans).

### VcsInfo

```typescript
type VcsInfo = {
  sha?: string
  branch?: string
}
// Returns empty object {} when no VCS is detected.
```

### Project

```typescript
type Project = {
  id: string                // e.g. "global" or hash
  worktree: string
  vcs?: string              // e.g. "git" — absent for global project
  icon?: { color: string }  // e.g. { color: "orange" }
  time: { created: number; updated: number }  // epoch milliseconds
  sandboxes: any[]          // observed as empty array
}
```

### LSPStatus

```typescript
type LSPStatus = {
  id: string                // e.g. "gopls"
  name: string              // e.g. "gopls"
  root: string              // root directory, "" if not set
  status: string            // observed: "connected"
}
```

### FormatterStatus

```typescript
type FormatterStatus = {
  name: string              // e.g. "gofmt", "zig"
  extensions: string[]      // e.g. [".go"], [".zig", ".zon"]
  enabled: boolean
}
```

### MCPStatus

```typescript
type MCPStatus = {
  status: "connected" | "disabled" | "failed" | "needs_auth" | "needs_client_registration"
  error?: string            // present when status is "failed" or "needs_auth"
}
// GET /mcp returns Record<string, MCPStatus>
// e.g. { "chrome-devtools": { "status": "connected" } }
```

### Command

```typescript
type Command = {
  name: string
  description: string
  source: "command" | "skill"
  template: string
  subtask?: boolean
  hints: string[]
}
```

### ProviderAuthMethod

```typescript
type ProviderAuthMethod = {
  type: "oauth" | "api"
  label: string             // e.g. "ChatGPT Pro/Plus (browser)", "Manually enter API Key"
}
// GET /provider/auth returns Record<string, ProviderAuthMethod[]>
```

### Config

```typescript
type Config = {
  $schema: string
  disabled_providers: string[]
  agent: Record<string, AgentConfig>      // agent name -> agent-specific config overrides
  provider: Record<string, ProviderConfig>  // provider configs from config file
  mcp: Record<string, MCPConfig>          // MCP server configs
  mode: Record<string, any>
  plugin: any[]
  command: Record<string, any>
  username: string
}
```

---

## Configuration Schema

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "provider/model-id",
  "agent": "build|plan",
  "theme": "dark|light|system",
  "permission": {
    "*": "allow|ask|deny",
    "read": "allow",
    "edit": "ask",
    "bash": { "pattern": "allow|ask|deny" },
    "external_directory": ["~/projects/*"]
  },
  "mcp": {
    "server-name": {
      "type": "local|remote",
      "command": ["bunx", "-y", "package-name"],
      "environment": { "API_KEY": "value" },
      "url": "https://mcp.example.com/mcp",
      "headers": { "Authorization": "Bearer token" },
      "enabled": true,
      "timeout": 5000
    }
  },
  "command": {
    "custom-command": {
      "template": "Prompt template...",
      "description": "Command description",
      "agent": "agent-name",
      "subtask": true,
      "model": "provider/model"
    }
  }
}
```

### Permission Keys

| Key | Description |
|-----|-------------|
| `read` | Read file contents |
| `edit` | Edit/write files |
| `glob` | Glob file patterns |
| `grep` | Search file contents |
| `list` | List directory contents |
| `bash` | Execute shell commands |
| `task` | Run subtasks |
| `skill` | Load skills |
| `lsp` | Language server operations |
| `todoread` | Read todo items |
| `todowrite` | Write todo items |
| `webfetch` | Fetch web content |
| `websearch` | Web search |
| `codesearch` | Code search |
| `external_directory` | Access directories outside project |
| `doom_loop` | Doom loop detection |

---

## SDK Usage

### Installation

```typescript
import { createOpencode, createOpencodeClient, createOpencodeServer } from "@opencode-ai/sdk"
```

### Full Mode (Client + Server)

```typescript
const { client, server } = await createOpencode({ hostname: "127.0.0.1", port: 4096 })
```

### Client Only

```typescript
const client = createOpencodeClient({ baseUrl: "http://localhost:4096" })
```

### Key Client Methods

#### Session Management

```typescript
client.session.create   // Create a new session
client.session.list     // List all sessions
client.session.get      // Get a specific session
client.session.delete   // Delete a session
client.session.abort    // Abort current session operation
client.session.share    // Share a session
client.session.unshare  // Unshare a session
client.session.fork     // Fork a session
client.session.revert   // Revert session changes
client.session.unrevert // Undo revert
client.session.summarize // Summarize session
```

#### Messaging

```typescript
client.session.prompt   // Send a prompt
client.session.messages // Get session messages
```

#### Configuration

```typescript
client.config.get       // Get current config
client.config.providers // Get available providers
```

#### Events

```typescript
client.event.subscribe() // Subscribe to SSE events
// Usage:
for await (const event of events.stream) {
  // Handle event
}
```

#### File Operations

```typescript
client.find.text    // Search text in files
client.find.files   // Find files by query
client.find.symbols // Find symbols by query
client.file.read    // Read file content
client.file.status  // Get file status
```

#### Authentication

```typescript
client.auth.set // Set authentication
```

#### Health

```typescript
client.global.health // Check server health
```
