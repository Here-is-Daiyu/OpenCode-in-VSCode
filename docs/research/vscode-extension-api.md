# VSCode Extension API Reference

> Note: This document is compiled from corresponding official public documentation and publicly available project materials. Copyright in the original source materials belongs to the respective official owners.

Comprehensive notes on VS Code Extension APIs relevant to the OpenCode-in-VSCode project.

---

## WebviewView API

### Overview

`WebviewViewProvider` is the primary API for creating sidebar panels with custom HTML content.

### Key Points

- Use `WebviewViewProvider` for sidebar panels
- Cannot programmatically place in auxiliary sidebar (user must drag)
- Use `retainContextWhenHidden` to keep webview alive when the view is not visible
- Webviews run in an isolated context — communicate via message passing

### Message Passing

```typescript
// Extension → Webview
webview.postMessage({ type: 'update', data: payload })

// Webview → Extension
webview.onDidReceiveMessage((message) => {
  switch (message.type) {
    case 'ready':
      // Handle ready
      break
  }
})

// Inside Webview
const vscode = acquireVsCodeApi()
vscode.postMessage({ type: 'ready' })

window.addEventListener('message', (event) => {
  const message = event.data
  // Handle message from extension
})
```

### State Persistence

```typescript
// Inside Webview — survives view hide/show
const state = vscode.getState()  // Retrieve saved state
vscode.setState(newState)        // Save state
```

### Content Security Policy (CSP)

- Use nonce-based CSP for inline scripts
- Use `webview.cspSource` for whitelisting resource origins
- Avoid `unsafe-inline` and `unsafe-eval`

```html
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none';
    style-src ${webview.cspSource} 'nonce-${nonce}';
    script-src 'nonce-${nonce}';
    img-src ${webview.cspSource} https: data:;
    font-src ${webview.cspSource};">
```

### Resource Loading

```typescript
// Convert local file URI to webview-safe URI
const scriptUri = webview.asWebviewUri(
  vscode.Uri.joinPath(extensionUri, 'dist', 'webview.js')
)
```

---

## Views & View Containers

### ActivityBar Container

- Register a view container in the ActivityBar for primary visibility
- Define in `package.json` under `contributes.viewsContainers.activitybar`

```json
{
  "contributes": {
    "viewsContainers": {
      "activitybar": [{
        "id": "opencode",
        "title": "OpenCode",
        "icon": "resources/icon.svg"
      }]
    }
  }
}
```

### TreeView API

- Use `TreeDataProvider` for session lists and hierarchical data
- Supports refresh, expand/collapse, drag and drop
- Two view types available: `"webview"` and `"tree"`

```typescript
class SessionTreeProvider implements vscode.TreeDataProvider<SessionItem> {
  getTreeItem(element: SessionItem): vscode.TreeItem { ... }
  getChildren(element?: SessionItem): SessionItem[] { ... }

  private _onDidChangeTreeData = new vscode.EventEmitter<SessionItem | undefined>()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined)
  }
}
```

### View Registration

```json
{
  "contributes": {
    "views": {
      "opencode": [
        { "id": "opencode.chat", "type": "webview", "name": "Chat" },
        { "id": "opencode.sessions", "type": "tree", "name": "Sessions" }
      ]
    }
  }
}
```

---

## Configuration API

### Reading Configuration

```typescript
const config = vscode.workspace.getConfiguration('opencode')
const serverPort = config.get<number>('server.port', 4096)
```

### Configuration Scopes

| Scope | Description |
|-------|-------------|
| `application` | Machine-specific, not synced |
| `machine` | Machine-specific, synced |
| `window` | Window-specific |
| `resource` | Resource/folder-specific |

### Listening to Changes

```typescript
vscode.workspace.onDidChangeConfiguration((e) => {
  if (e.affectsConfiguration('opencode.server.port')) {
    // Reconnect to server with new port
  }
})
```

---

## Editor Integration

### TextEditorDecorationType — Inline Diffs

```typescript
const addedDecoration = vscode.window.createTextEditorDecorationType({
  backgroundColor: new vscode.ThemeColor('diffEditor.insertedTextBackground'),
  isWholeLine: true,
})

const removedDecoration = vscode.window.createTextEditorDecorationType({
  backgroundColor: new vscode.ThemeColor('diffEditor.removedTextBackground'),
  isWholeLine: true,
})
```

- Use `ThemeColor` references for proper theme integration
- Apply decorations via `editor.setDecorations(decorationType, ranges)`

### CodeLens for AI Suggestions

```typescript
class AISuggestionsCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    // Return code lenses for AI suggestions
  }
}
```

### Diff Views

```typescript
// Open a diff view between two URIs
vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, 'Diff Title')
```

### WorkspaceEdit — Multi-File Changes

```typescript
const edit = new vscode.WorkspaceEdit()
edit.replace(uri, range, newText)
edit.createFile(uri, { overwrite: true, contents: buffer })
edit.deleteFile(uri)
await vscode.workspace.applyEdit(edit)
```

### Terminal API

```typescript
const terminal = vscode.window.createTerminal({
  name: 'OpenCode',
  cwd: workspaceRoot,
})
terminal.sendText('opencode serve --port 4096')
terminal.show()
```

### FileSystemProvider — Virtual Files

- Implement `vscode.FileSystemProvider` to provide virtual file systems
- Useful for showing generated or remote content as files

### DiagnosticsCollection — Issues

```typescript
const diagnostics = vscode.languages.createDiagnosticCollection('opencode')
diagnostics.set(uri, [
  new vscode.Diagnostic(range, 'AI suggestion', vscode.DiagnosticSeverity.Information)
])
```

---

## Build Systems

### esbuild (Recommended for Extension)

- Fastest bundler for VS Code extensions
- Separate Node + Browser targets
- Use for the extension host code (Node.js / CJS)

```javascript
// esbuild.config.js
const { build } = require('esbuild')

// Extension build (Node target)
build({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  platform: 'node',
  format: 'cjs',
  external: ['vscode'],
})
```

### Vite (Recommended for Webview)

- Excellent dev experience with HMR (Hot Module Replacement)
- Use for the webview frontend (Browser / ESM)

```javascript
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist/webview',
    rollupOptions: {
      input: 'src/webview/index.html',
    },
  },
})
```

### Build Target Summary

| Component | Bundler | Platform | Format |
|-----------|---------|----------|--------|
| Extension (host) | esbuild | Node.js | CJS |
| Webview (frontend) | Vite | Browser | ESM |

---

## Framework Recommendations

### React / Preact for Webview UI

- React recommended for complex webview UIs (chat interface, settings pages)
- Preact as lighter alternative if bundle size is a concern
- Use hooks and context for state management

### @vscode/webview-ui-toolkit — DEPRECATED

> **Warning:** The `@vscode/webview-ui-toolkit` has been **archived as of January 2025** and is no longer maintained.

- Do NOT use for new projects
- Use custom components matching VS Code design language instead
- Reference VS Code's CSS custom properties for theming:
  - `--vscode-editor-background`
  - `--vscode-editor-foreground`
  - `--vscode-button-background`
  - `--vscode-input-background`
  - etc.

### Virtual Scrolling

- Essential for long conversation lists
- If needed, use a virtualization library such as `@tanstack/react-virtual`
- Prevents DOM bloat from large message histories

---

## Copilot Chat Architecture (Open Source Reference)

### Repository

- **Repo:** [microsoft/vscode-copilot-chat](https://github.com/microsoft/vscode-copilot-chat)
- **License:** MIT

### Architecture Highlights

- Uses **React + Vite** for webview rendering
- Registers sidebar via `registerWebviewViewProvider`
- Separate build pipelines for extension and webview
  - Good reference for:
    - Chat UI patterns in VS Code
    - Message streaming in webviews
    - Integration with VS Code's sidebar system
    - State management between extension and webview

---

## Webview postMessage Considerations

Practical findings and patterns for reliable extension ↔ webview communication, especially with large payloads and async state.

### postMessage Return Value

`webview.postMessage(message)` returns `Thenable<boolean>`:
- Resolves to `true` if the message was delivered
- Resolves to `false` if the webview is disposed or not ready
- **Should be awaited or `.then()` handled** — fire-and-forget can silently lose messages

```typescript
// ❌ Fire-and-forget — message may be lost silently
webviewView.webview.postMessage({ type: 'session:loaded', data })

// ✅ Await and handle failure
const delivered = await webviewView.webview.postMessage({ type: 'session:loaded', data })
if (!delivered) {
  // Webview not ready — queue for resend when ready
  this.pendingMessages.push({ type: 'session:loaded', data })
}
```

### Large Payload Performance

Sessions with long histories (300+ messages) can produce **4MB+ payloads** when sent via `postMessage`:

| Payload Size | Approximate Latency | Risk |
|-------------|---------------------|------|
| < 100KB | Negligible | None |
| 100KB–1MB | Low (~10-50ms) | None |
| 1MB–4MB | Moderate (~50-200ms) | UI may stutter |
| > 4MB | High (200ms+) | May fail on low-memory machines |

**Mitigation strategies:**
- Use `?limit=50` on initial message fetch, lazy-load history on scroll
- Send large payloads in chunks if needed
- Consider using `vscode.setState()` in webview for persistence (survives hide/show, avoids re-send)

### Session Switching Race Conditions

When users rapidly switch sessions, multiple async `session:loaded` responses can be in-flight simultaneously. Without protection, a stale response can overwrite the current session's data.

**Problem scenario:**
1. User selects Session A → extension starts fetching Session A messages
2. User quickly switches to Session B → extension starts fetching Session B messages
3. Session A response arrives → webview displays Session A data (WRONG!)
4. Session B response arrives → webview displays Session B data (correct, but user saw a flash)

**Solution — Nonce/Token pattern:**

```typescript
// Extension side
private requestNonce = 0

async switchSession(sessionId: string) {
  const nonce = ++this.requestNonce
  const messages = await this.fetchMessages(sessionId)

  // Only send if this is still the latest request
  if (nonce === this.requestNonce) {
    webview.postMessage({
      type: 'session:loaded',
      nonce,
      sessionId,
      data: messages
    })
  }
}
```

```typescript
// Webview side — additional safety check
window.addEventListener('message', (event) => {
  const msg = event.data
  if (msg.type === 'session:loaded') {
    // Only apply if sessionId matches what we're currently viewing
    if (msg.sessionId === currentSessionId) {
      setMessages(msg.data)
    }
  }
})
```

### Caching for Webview Ready/Visibility Resend

When the webview becomes visible (or is first created), it sends a `webview:ready` message. The extension should resend essential state. **Cache the last known values** to avoid re-fetching:

```typescript
class ChatViewProvider implements vscode.WebviewViewProvider {
  // Cached state for resend
  private lastServerStatus: ServerStatus | null = null
  private lastSessionData: SessionLoadedPayload | null = null

  handleServerStatus(status: ServerStatus) {
    this.lastServerStatus = status
    this.postMessage({ type: 'server:status', data: status })
  }

  handleSessionLoaded(data: SessionLoadedPayload) {
    this.lastSessionData = data
    this.postMessage({ type: 'session:loaded', data })
  }

  // Called when webview sends 'webview:ready'
  onWebviewReady() {
    if (this.lastServerStatus) {
      this.postMessage({ type: 'server:status', data: this.lastServerStatus })
    }
    if (this.lastSessionData) {
      this.postMessage({ type: 'session:loaded', data: this.lastSessionData })
    }
  }
}
```

This pattern ensures the webview always has up-to-date state, even after:
- Tab switching (webview hidden → shown)
- VS Code window losing/regaining focus
- Webview being disposed and re-created (without `retainContextWhenHidden`)
