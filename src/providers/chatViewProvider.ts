import * as vscode from 'vscode';
import * as crypto from 'crypto';
import type {
  ExtensionToWebviewMessage,
  WebviewToExtensionMessage,
} from '../types/messages';
import type { MessageWithParts } from '../types/opencode';

/**
 * Provides the chat WebviewView for the sidebar panel.
 * Loads a Vite-built React app and handles bidirectional message passing.
 */
export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'opencode.chatView';

  private view?: vscode.WebviewView;
  private currentSessionID?: string;
  private disposables: vscode.Disposable[] = [];

  constructor(private readonly extensionUri: vscode.Uri) {}

  /**
   * Called by VS Code when the webview view is first made visible
   */
  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'out', 'webview'),
      ],
    };

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    // Set up message handling from webview
    this.disposables.push(
      webviewView.webview.onDidReceiveMessage(
        (message: WebviewToExtensionMessage) => {
          this.handleWebviewMessage(message);
        }
      )
    );

    // Track visibility changes
    this.disposables.push(
      webviewView.onDidChangeVisibility(() => {
        if (webviewView.visible) {
          // Webview became visible again - resend current state if needed
          this.onWebviewVisible();
        }
      })
    );

    // Cleanup on dispose
    webviewView.onDidDispose(() => {
      this.view = undefined;
      this.disposables.forEach((d) => d.dispose());
      this.disposables = [];
    });

    // Retain context so the React app state survives when the panel is hidden
    webviewView.title = 'OpenCode Chat';
  }

  /**
   * Send a typed message to the webview.
   * Returns true if the message was sent, false if the webview is not available.
   */
  postMessage(message: ExtensionToWebviewMessage): boolean {
    if (this.view) {
      this.view.webview.postMessage(message);
      return true;
    }
    return false;
  }

  /**
   * Alias for backward compatibility
   */
  postMessageToWebview(message: ExtensionToWebviewMessage): boolean {
    return this.postMessage(message);
  }

  /**
   * Load a session into the webview with its messages
   */
  setSession(sessionID: string, messages: MessageWithParts[]): void {
    this.currentSessionID = sessionID;
    // The actual session object will be sent via postMessage from the extension
    // This method tracks which session is active on the provider side
  }

  /**
   * Get the current session ID being displayed
   */
  getSessionID(): string | undefined {
    return this.currentSessionID;
  }

  /**
   * Check if the webview is currently visible
   */
  isVisible(): boolean {
    return this.view?.visible ?? false;
  }

  /**
   * Handle messages received from the webview
   */
  handleWebviewMessage(message: WebviewToExtensionMessage): void {
    switch (message.type) {
      case 'ready':
        // Webview is ready - send initial state
        this.onWebviewReady();
        break;

      case 'chat:send':
        // Forward to command handler / API client
        vscode.commands.executeCommand(
          'opencode.sendMessage',
          message.data.text,
          message.data.images
        );
        break;

      case 'chat:abort':
        vscode.commands.executeCommand('opencode.abortGeneration');
        break;

      case 'session:create':
        vscode.commands.executeCommand('opencode.newSession', message.data?.title);
        break;

      case 'session:switch':
        vscode.commands.executeCommand('opencode.switchSession', message.data.id);
        break;

      case 'session:delete':
        vscode.commands.executeCommand('opencode.deleteSession', message.data.id);
        break;

      case 'session:fork':
        vscode.commands.executeCommand('opencode.forkSession', message.data.messageID);
        break;

      case 'session:share':
        vscode.commands.executeCommand('opencode.shareSession');
        break;

      case 'session:revert':
        vscode.commands.executeCommand(
          'opencode.revertSession',
          message.data.messageID,
          message.data.partID
        );
        break;

      case 'session:unrevert':
        vscode.commands.executeCommand('opencode.unrevertSession');
        break;

      case 'permission:respond':
        vscode.commands.executeCommand(
          'opencode.respondPermission',
          message.data.id,
          message.data.response,
          message.data.remember
        );
        break;

      case 'question:respond':
        vscode.commands.executeCommand(
          'opencode.respondQuestion',
          message.data.id,
          message.data.answer
        );
        break;

      case 'config:get':
        vscode.commands.executeCommand('opencode.getConfig');
        break;

      case 'config:update':
        vscode.commands.executeCommand('opencode.updateConfig', message.data);
        break;

      case 'model:select':
        vscode.commands.executeCommand(
          'opencode.selectModel',
          message.data.providerID,
          message.data.modelID
        );
        break;

      case 'agent:select':
        vscode.commands.executeCommand('opencode.selectAgent', message.data.id);
        break;

      case 'file:open':
        this.openFile(message.data.path);
        break;

      case 'diff:show':
        vscode.commands.executeCommand(
          'opencode.showDiff',
          message.data.path,
          message.data.original,
          message.data.modified
        );
        break;

      case 'command:execute':
        vscode.commands.executeCommand(message.data.command, message.data.args);
        break;
    }
  }

  /**
   * Generate the HTML content for the webview
   */
  private getHtmlForWebview(webview: vscode.Webview): string {
    // Generate a nonce for CSP
    const nonce = crypto.randomBytes(16).toString('base64');

    // Get the URI for the built React app
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'out', 'webview', 'assets', 'chat.js')
    );

    // Detect the current color theme
    const themeKind = vscode.window.activeColorTheme.kind;
    const theme =
      themeKind === vscode.ColorThemeKind.Light
        ? 'light'
        : themeKind === vscode.ColorThemeKind.HighContrast ||
            themeKind === vscode.ColorThemeKind.HighContrastLight
          ? 'highContrast'
          : 'dark';

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
      font-src ${webview.cspSource};
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
</head>
<body>
  <div id="root">
    <div class="loading-placeholder">Loading OpenCode Chat...</div>
  </div>

  <script nonce="${nonce}">
    // Pass initial data to the React app before it loads
    window.__OPENCODE_INITIAL__ = {
      theme: "${theme}",
    };
  </script>
  <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`;
  }

  /**
   * Called when the webview sends the 'ready' message
   */
  private onWebviewReady(): void {
    // Send initial connection status
    // The actual server status will be forwarded by the extension
    // when the server manager establishes a connection
    this.postMessage({
      type: 'server:status',
      data: { connected: false },
    });
  }

  /**
   * Called when the webview becomes visible again
   */
  private onWebviewVisible(): void {
    // Could resend current session state here if needed
  }

  /**
   * Open a file in the VS Code editor
   */
  private async openFile(filePath: string): Promise<void> {
    try {
      const uri = vscode.Uri.file(filePath);
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc);
    } catch {
      vscode.window.showErrorMessage(
        `Failed to open file: ${filePath}`
      );
    }
  }
}
