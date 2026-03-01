# OpenCode for VSCode

A powerful VSCode extension that brings the full OpenCode AI coding assistant experience directly into Visual Studio Code, rivaling and extending the OpenCode Desktop application.

## ✨ Features

### 🤖 AI Chat Interface
- Full-featured chat panel in the auxiliary sidebar
- Streaming message display with real-time token usage tracking
- Rich markdown rendering with syntax highlighting (Shiki, matching VSCode themes)
- LaTeX/KaTeX math formula rendering
- Image attachment support (paste, drag-drop, file picker)
- Tool call visualization with expandable details
- Permission request cards (inline allow/deny/always allow)
- Question cards (multiple choice, text input)
- Slash commands (/compact, /new, /fork, /diff, etc.)
- File references (@filename) with intelligent autocomplete

### 📋 Session Management
- Session list with parent/child hierarchy (TreeView)
- Create, switch, delete, fork sessions
- Undo/redo message exchanges
- Session sharing
- Todo list tracking
- Context usage and compression indicators

### ⚙️ Built-in Settings
- Comprehensive settings editor (Webview-based)
- All OpenCode configuration editable in-place
- Model/Agent/Provider selection and management
- MCP server configuration
- Permission rules configuration
- Custom command definition
- Extension-specific settings

### 🔗 Deep VSCode Integration
- Native diff editor for file changes (superior to desktop)
- Native terminal for shell commands
- Native file explorer integration
- Editor decorations for AI suggestions
- CodeLens for quick AI actions
- Status bar with connection status, model info, token usage
- Command palette integration (24+ commands)
- Keyboard shortcuts for common operations

### 🔌 Extensibility
- Event-driven architecture with typed message bus
- Modular provider system
- Plugin-ready MCP server management
- Custom command system
- Themeable webview UI (follows VSCode theme)

## 📦 Requirements

- Visual Studio Code >= 1.94.0
- OpenCode CLI installed (`npm install -g opencode-ai` or download from https://opencode.ai)
- Node.js >= 20.0.0 (for OpenCode CLI)

## 🚀 Quick Start

1. Install the extension from VSCode Marketplace
2. Ensure `opencode` CLI is installed and accessible in PATH
3. Open a project folder in VSCode
4. The extension will auto-start the OpenCode server
5. Open the chat panel from the auxiliary sidebar (or press `Ctrl+Shift+O`)

## 🏗️ Architecture

```
Extension Host (Node.js)
├── ServerManager        → Manages opencode serve lifecycle
├── OpenCodeClient       → API client wrapping @opencode-ai/sdk
├── EventBus             → Typed event distribution (SSE → components)
├── SessionManager       → Session CRUD + state tracking
├── ConfigManager        → Configuration sync (VSCode ↔ OpenCode)
└── CommandRegistry      → Command handlers

Webview (Browser/Chromium)
├── ChatPanel            → Main chat interface (React)
├── SettingsPanel        → Settings editor (React)
└── Shared Components    → Message bubbles, tool cards, etc.

VSCode Integration
├── TreeViewProviders    → Session list, status display
├── StatusBarManager     → Connection, model, tokens
├── EditorIntegration    → Decorations, CodeLens, diff
└── TerminalIntegration  → Shell command execution
```

## 🛠️ Development

### Prerequisites
- Node.js >= 20
- pnpm (recommended) or npm

### Setup
```bash
git clone <repo-url>
cd opencode-vscode
pnpm install
pnpm run build
```

### Development
```bash
# Watch mode (extension + webview)
pnpm run dev

# Build for production
pnpm run build

# Package extension
pnpm run package
```

### Project Structure
```
opencode-vscode/
├── src/                          # Extension source (TypeScript)
│   ├── extension.ts              # Entry point
│   ├── commands/                 # Command handlers
│   ├── providers/                # WebviewView & TreeView providers
│   ├── services/                 # Core services (server, client, events)
│   ├── managers/                 # State managers (session, config)
│   └── types/                    # TypeScript type definitions
├── webview-ui/                   # Webview frontend (React + TypeScript)
│   ├── src/
│   │   ├── App.tsx               # Root component
│   │   ├── panels/               # Panel components (chat, settings)
│   │   ├── components/           # Shared UI components
│   │   ├── hooks/                # React hooks
│   │   ├── stores/               # State management (Zustand)
│   │   └── utils/                # Utilities
│   ├── index.html
│   └── vite.config.ts
├── media/                        # Static assets (icons, images)
├── docs/                         # Documentation
│   └── research/                 # Research documents
├── scripts/                      # Build & utility scripts
├── package.json                  # Extension manifest
├── tsconfig.json                 # TypeScript config (extension)
├── esbuild.mjs                   # Extension build script
└── .vscodeignore                 # Package exclusions
```

## 📝 Configuration

### Extension Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `opencode.server.hostname` | string | "127.0.0.1" | Server hostname |
| `opencode.server.port` | number | 0 (auto) | Server port (0 = auto-detect) |
| `opencode.server.autoStart` | boolean | true | Auto-start server on activation |
| `opencode.server.executablePath` | string | "opencode" | Path to opencode CLI |
| `opencode.chat.fontSize` | number | 14 | Chat font size |
| `opencode.chat.showTimestamps` | boolean | true | Show message timestamps |
| `opencode.chat.wordWrap` | boolean | true | Wrap long lines |
| `opencode.chat.maxImageSize` | number | 10 | Max image size in MB |

### OpenCode Configuration
The built-in settings page provides access to all OpenCode configuration options including:
- Model and provider selection
- Agent configuration
- Permission rules
- MCP server management
- Custom commands

## 🤝 Contributing

Contributions are welcome! Please read the AGENTS.md for development guidelines.

## 📄 License

MIT
