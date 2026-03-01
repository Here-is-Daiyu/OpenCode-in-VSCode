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
