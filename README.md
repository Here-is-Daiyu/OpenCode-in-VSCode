# opencode-vscode

`opencode-vscode` is a Visual Studio Code extension that brings OpenCode into VS Code as native chat, session, status, and settings experiences. It manages or connects to `opencode serve`, syncs against the global event stream, and keeps the extension host and webview UI aligned through typed messages.

## Project overview

This repository packages a VS Code extension for working with OpenCode without leaving the editor. The current implementation focuses on:

- an activity bar chat experience inside VS Code
- real-time session and message sync
- local server lifecycle management for `opencode serve`
- native VS Code integration for diffs, terminals, commands, and tree views

## Current feature summary

- Chat UI in the OpenCode activity bar, updated to more closely match the official OpenCode experience
- Real-time session/message updates driven by the global SSE event stream
- Image attachments via picker, drag and drop, and paste
- Session tree with create, switch, delete, fork, share, and refresh flows
- Faster session switching with recent-first loading and batched older-history hydration
- Settings webview for VS Code settings plus OpenCode configuration data
- Status tree and status bar for connection state, model info, providers, MCP, LSP, and token usage
- Native VS Code helpers for showing diffs, opening a terminal, and adding files or selections to prompts

## Requirements / prerequisites

- VS Code `^1.94.0`
- Node.js `20+`
- `npm`
- OpenCode CLI installed and available as `opencode`, or configured through `opencode.server.executablePath`

If your OpenCode server uses auth, launch VS Code with the appropriate environment variables available to the extension host.

## Installation

### Install from a local VSIX

```bash
npm ci
npm ci --prefix webview-ui
npm run build
npm run package
```

Then install the generated `.vsix` file with **Extensions: Install from VSIX...** in VS Code.

## Local development

```bash
npm ci
npm ci --prefix webview-ui
```

Useful commands:

```bash
npm run dev
npm run typecheck
```

To run the extension locally:

1. Open this repository in VS Code
2. Start the provided `Run Extension` launch configuration (or press `F5`)
3. Use the Extension Development Host to test the extension

## Build / package commands

| Command | Purpose |
| --- | --- |
| `npm run build` | Build the extension bundle and the webview UI |
| `npm run typecheck` | Type-check both the extension and webview code |
| `npm run dev` | Watch the extension and webview builds during development |
| `npm run package` | Package the extension into a `.vsix` file |

## Basic usage in VS Code

1. Open a folder or workspace in VS Code
2. Make sure the `opencode` CLI is available
3. Let the extension auto-start the server, or run `OpenCode: Start Server`
4. Open the **OpenCode** activity bar container and use the **Chat**, **Sessions**, and **Status** views
5. Run `OpenCode: Open Settings` to open the settings webview
6. Use editor/context commands to add the active file or selection to the prompt, and `OpenCode: Show Session Diff` to inspect session changes

## Release / tag packaging

The workflow in `.github/workflows/release-vsix-on-tag.yml` behaves as follows:

- Pushes to `main` run install, build, and typecheck steps only
- Pushes of tags matching `v*` or `V*` (for example `v1.0.0` or `V1.0.0`) also package the extension into a VSIX
- Tagged builds upload the VSIX as a GitHub Actions workflow artifact
- Regular non-tag pushes do **not** upload packaging artifacts
- The workflow does **not** create a GitHub Release or upload release assets

## Architecture summary

- `src/` — VS Code extension host code: activation, commands, providers, managers, services
- `src/services/serverManager.ts` — starts/stops and monitors `opencode serve`
- `src/services/openCodeClient.ts` — REST + SSE client for OpenCode
- `src/managers/sessionManager.ts` — coordinates session switching and batched history loading
- `webview-ui/` — React-based chat/settings UI built with Vite and Zustand
- `src/types/` plus webview message types — typed contracts between extension host and webview

## Docs / research notes

The `docs/research/` directory contains useful reference material:

- `docs/research/opencode-api-reference.md`
- `docs/research/desktop-features-comparison.md`
- `docs/research/vscode-extension-api.md`

Some research notes reference local machine paths used during investigation of the official OpenCode sources. Treat those as reference notes only, not as required build dependencies.

## License

MIT
