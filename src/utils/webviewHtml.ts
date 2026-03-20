import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as fs from 'fs';

export interface WebviewHtmlOptions {
  webview: vscode.Webview;
  extensionUri: vscode.Uri;
  viewMode: 'sidebar' | 'editor';
  initialSessionId?: string;
}

/**
 * Generate the HTML content for an OpenCode webview.
 *
 * This is a shared utility used by both the sidebar ChatViewProvider and
 * the SessionEditorPanelProvider so that the same React app, CSP policy,
 * and initial-data contract are reused consistently.
 */
export function getWebviewHtml(options: WebviewHtmlOptions): string {
  const { webview, extensionUri, viewMode, initialSessionId } = options;

  // Generate a nonce for CSP
  const nonce = crypto.randomBytes(16).toString('base64');

  // Get the URI for the built React app
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'out', 'webview', 'assets', 'chat.js')
  );

  // Find CSS files in the assets directory
  const assetsDir = vscode.Uri.joinPath(extensionUri, 'out', 'webview', 'assets');
  let cssLinkTags = '';
  try {
    const assetFiles = fs.readdirSync(assetsDir.fsPath);
    const cssFiles = assetFiles.filter(f => f.endsWith('.css'));
    cssLinkTags = cssFiles.map(cssFile => {
      const cssUri = webview.asWebviewUri(
        vscode.Uri.joinPath(extensionUri, 'out', 'webview', 'assets', cssFile)
      );
      return `<link rel="stylesheet" href="${cssUri}" />`;
    }).join('\n  ');
  } catch (err) {
    // CSS files not found — not critical, inline styles in JS will still work
    console.warn('Failed to find CSS assets:', err);
  }

  // Detect the current color theme
  const themeKind = vscode.window.activeColorTheme.kind;
  const theme =
    themeKind === vscode.ColorThemeKind.Light
      ? 'light'
      : themeKind === vscode.ColorThemeKind.HighContrast ||
          themeKind === vscode.ColorThemeKind.HighContrastLight
        ? 'highContrast'
        : 'dark';

  // Build the initial data object, omitting undefined fields
  const initialData: Record<string, string> = {
    theme,
    viewMode,
  };
  if (initialSessionId) {
    initialData.initialSessionId = initialSessionId;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
      style-src ${webview.cspSource} 'unsafe-inline';
      script-src 'nonce-${nonce}';
      img-src ${webview.cspSource} data: https:;
      font-src ${webview.cspSource} data:;
      connect-src ${webview.cspSource};" />
  <title>OpenCode Chat</title>
  <style>
    /* Base styles to prevent FOUC */
    html, body {
      margin: 0;
      padding: 0;
      height: 100%;
      overflow: hidden;
      background-color: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }
    #root {
      height: 100%;
      display: flex;
      flex-direction: column;
    }
    /* Loading placeholder */
    .loading-placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }
  </style>
  ${cssLinkTags}
</head>
<body>
  <div id="root">
    <div class="loading-placeholder">Loading OpenCode Chat...</div>
  </div>

  <script nonce="${nonce}">
    // Pass initial data to the React app before it loads
    window.__OPENCODE_INITIAL__ = ${JSON.stringify(initialData)};
  </script>
  <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`;
}
