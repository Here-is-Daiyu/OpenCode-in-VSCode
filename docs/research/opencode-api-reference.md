# OpenCode API Reference

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
| GET | `/config/providers` | — | `{ providers: Provider[], default: { [key]: string } }` |

### Provider

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/provider` | — | `{ all: Provider[], default: {}, connected: string[] }` |
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

### Messages

| Method | Path | Body / Query | Response |
|--------|------|--------------|----------|
| GET | `/session/:id/message` | query: `?limit` | `{ info: Message, parts: Part[] }[]` — see [Message Fetching Notes](#message-fetching-notes) |
| POST | `/session/:id/message` | `{ messageID?, model?, agent?, noReply?, system?, tools?, parts }` | `{ info: Message, parts: Part[] }` |
| GET | `/session/:id/message/:messageID` | — | `{ info: Message, parts: Part[] }` |
| POST | `/session/:id/prompt_async` | same body as `/message`; `parts` required in practice | `204 No Content` |
| POST | `/session/:id/command` | `{ messageID?, agent?, model?, command, arguments }` | `{ info: Message, parts: Part[] }` |
| POST | `/session/:id/shell` | `{ agent, model?, command }` | `{ info: Message, parts: Part[] }` |

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
| GET | `/experimental/tool/ids` | — | `ToolIDs` |
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

### Session Events

- `EventSessionCreated`
- `EventSessionUpdated`
- `EventSessionDeleted`
- `EventSessionStatus`
- `EventSessionIdle`
- `EventSessionCompacted`
- `EventSessionDiff`
- `EventSessionError`

### Message Events

- `EventMessageUpdated`
- `EventMessageRemoved`
- `EventMessagePartUpdated`
- `EventMessagePartDelta`
- `EventMessagePartRemoved`

### Permission Events

- `EventPermissionAsked`
- `EventPermissionReplied`

### Question Events

- `EventQuestionAsked`
- `EventQuestionReplied`
- `EventQuestionRejected`

### File Events

- `EventFileEdited`
- `EventFileWatcherUpdated`

### Project Events

- `EventProjectUpdated`

### System Events

- `EventServerConnected`
- `EventServerInstanceDisposed`
- `EventInstallationUpdated`
- `EventInstallationUpdateAvailable`

### Other Events

- `EventTodoUpdated`
- `EventCommandExecuted`
- `EventTuiPromptAppend`
- `EventTuiToastShow`
- `EventLspClientDiagnostics`
- `EventVcsBranchUpdated`
- `EventPtyCreated`
- `EventPtyUpdated`
- `EventPtyExited`
- `EventPtyDeleted`

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
  permission?: PermissionRuleset
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
