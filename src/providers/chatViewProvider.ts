import * as vscode from 'vscode';

/**
 * Provides the chat WebviewView for the sidebar
 */
export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'opencode.chatView';

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    // TODO: Set up message handling
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    // TODO: Load React app from built webview files
    return `<!DOCTYPE html>
<html>
<head><title>OpenCode Chat</title></head>
<body>
  <div id="root">Loading OpenCode Chat...</div>
</body>
</html>`;
  }
}
