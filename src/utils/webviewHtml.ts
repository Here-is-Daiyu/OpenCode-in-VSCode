import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as fs from 'fs';

export interface WebviewHtmlOptions {
  webview: vscode.Webview;
  extensionUri: vscode.Uri;
  viewMode: 'sidebar' | 'editor';
  initialSessionId?: string;
}

export interface WebviewHtmlShellOptions {
  webview: vscode.Webview;
  extensionUri: vscode.Uri;
  initialData: Record<string, string>;
  loadingText: string;
  scriptName: string;
  title: string;
}

export function getWebviewTheme(): 'light' | 'dark' | 'highContrast' {
  const themeKind = vscode.window.activeColorTheme.kind;
  return themeKind === vscode.ColorThemeKind.Light
    ? 'light'
    : themeKind === vscode.ColorThemeKind.HighContrast
        || themeKind === vscode.ColorThemeKind.HighContrastLight
      ? 'highContrast'
      : 'dark';
}

function getCssLinkTags(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
): string {
  const assetsDir = vscode.Uri.joinPath(extensionUri, 'out', 'webview', 'assets');
  try {
    return fs.readdirSync(assetsDir.fsPath)
      .filter(file => file.endsWith('.css'))
      .map(file => {
        const cssUri = webview.asWebviewUri(
          vscode.Uri.joinPath(extensionUri, 'out', 'webview', 'assets', file)
        );
        return `<link rel="stylesheet" href="${cssUri}" />`;
      })
      .join('\n  ');
  } catch (err) {
    console.warn('Failed to find CSS assets:', err);
    return '';
  }
}

export function buildWebviewHtmlShell(options: WebviewHtmlShellOptions): string {
  const {
    webview,
    extensionUri,
    initialData,
    loadingText,
    scriptName,
    title,
  } = options;

  // Generate a nonce for CSP
  const nonce = crypto.randomBytes(16).toString('base64');

  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'out', 'webview', 'assets', scriptName)
  );
  const cssLinkTags = getCssLinkTags(webview, extensionUri);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
      style-src ${webview.cspSource} 'unsafe-inline';
      script-src 'nonce-${nonce}' 'strict-dynamic';
      img-src ${webview.cspSource} data: https:;
      font-src ${webview.cspSource} data:;
      connect-src ${webview.cspSource};" />
  <title>${title}</title>
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
    <div class="loading-placeholder">${loadingText}</div>
  </div>

  <script nonce="${nonce}">
    // Pass initial data to the React app before it loads
    window.__OPENCODE_INITIAL__ = ${JSON.stringify(initialData)};
  </script>
  <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`;
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
  const initialData: Record<string, string> = {
    theme: getWebviewTheme(),
    viewMode,
  };

  if (initialSessionId) {
    initialData.initialSessionId = initialSessionId;
  }

  return buildWebviewHtmlShell({
    webview,
    extensionUri,
    initialData,
    loadingText: 'Loading OpenCode Chat...',
    scriptName: 'chat.js',
    title: 'OpenCode Chat',
  });
}
