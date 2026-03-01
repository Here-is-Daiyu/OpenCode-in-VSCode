import * as vscode from 'vscode';

/**
 * Provides the settings WebviewPanel
 */
export class SettingsViewProvider {
  public static readonly viewType = 'opencode.settings';

  private panel: vscode.WebviewPanel | undefined;

  constructor(private readonly extensionUri: vscode.Uri) {}

  show(): void {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      SettingsViewProvider.viewType,
      'OpenCode Settings',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [this.extensionUri],
        retainContextWhenHidden: true,
      }
    );

    this.panel.webview.html = this.getHtmlForWebview(this.panel.webview);

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    // TODO: Set up message handling
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    // TODO: Load React app from built webview files
    return `<!DOCTYPE html>
<html>
<head><title>OpenCode Settings</title></head>
<body>
  <div id="root">Loading OpenCode Settings...</div>
</body>
</html>`;
  }
}
