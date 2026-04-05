import * as vscode from 'vscode';

/**
 * Manages the OpenCode connection status bar item.
 */
export class StatusBarManager implements vscode.Disposable {
  private connectionItem: vscode.StatusBarItem;
  private connectionMode: 'local' | 'external' = 'local';
  private connectedVersion: string | undefined;
  private busy = false;

  constructor() {
    // Connection status — leftmost, highest priority
    this.connectionItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    this.connectionItem.command = 'opencode.focusChat';
    this.connectionItem.name = 'OpenCode Connection';

    // Start with disconnected state
    this.setDisconnected();
  }

  /**
   * Show connected state with server version.
   */
  setConnected(version: string, mode: 'local' | 'external' = 'local'): void {
    this.connectionMode = mode;
    this.connectedVersion = version;
    this.busy = false;
    this.renderConnectedState();
  }

  /**
   * Show disconnected state.
   */
  setDisconnected(): void {
    this.connectionMode = 'local';
    this.connectedVersion = undefined;
    this.busy = false;
    this.connectionItem.text = `$(debug-disconnect) OpenCode`;
    this.connectionItem.tooltip = 'OpenCode server disconnected — click to reconnect';
    this.connectionItem.backgroundColor = new vscode.ThemeColor(
      'statusBarItem.warningBackground'
    );
    this.connectionItem.show();
  }

  /**
   * Show connecting / loading state.
   */
  setConnecting(mode: 'local' | 'external' = 'local'): void {
    this.connectionMode = mode;
    this.connectedVersion = undefined;
    this.busy = false;
    const externalSuffix = mode === 'external' ? ' (external)' : '';
    this.connectionItem.text = `$(loading~spin) OpenCode${externalSuffix}`;
    this.connectionItem.tooltip = mode === 'external'
      ? 'Connecting to external OpenCode server…'
      : 'Connecting to OpenCode server…';
    this.connectionItem.backgroundColor = undefined;
    this.connectionItem.show();
  }

  /**
   * Toggle busy indicator on the connection item.
   */
  setBusy(busy: boolean): void {
    this.busy = busy;
    if (this.connectedVersion) {
      this.renderConnectedState();
    }
  }

  dispose(): void {
    this.connectionItem.dispose();
  }

  private renderConnectedState(): void {
    const external = this.connectionMode === 'external';
    const externalSuffix = external ? ' (external)' : '';

    this.connectionItem.text = this.busy
      ? `$(loading~spin) OpenCode${externalSuffix}`
      : `$(plug) OpenCode${externalSuffix}`;
    this.connectionItem.tooltip = this.busy
      ? external
        ? 'OpenCode is processing on the external server…'
        : 'OpenCode is processing…'
      : external
        ? `Connected to external OpenCode server (v${this.connectedVersion ?? 'unknown'})`
        : `OpenCode server connected (v${this.connectedVersion ?? 'unknown'})`;
    this.connectionItem.backgroundColor = undefined;
    this.connectionItem.show();
  }
}
