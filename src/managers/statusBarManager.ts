import * as vscode from 'vscode';
import type { TokenUsage } from '../types/opencode';

/**
 * Manages status bar items showing connection state, model info, and token usage.
 */
export class StatusBarManager implements vscode.Disposable {
  private connectionItem: vscode.StatusBarItem;
  private modelItem: vscode.StatusBarItem;
  private tokenItem: vscode.StatusBarItem;
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

    // Model info — next to connection
    this.modelItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      99
    );
    this.modelItem.command = 'opencode.selectModel';
    this.modelItem.name = 'OpenCode Model';

    // Token usage — next to model
    this.tokenItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      98
    );
    this.tokenItem.name = 'OpenCode Tokens';

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
    this.modelItem.hide();
    this.tokenItem.hide();
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
   * Update the model display.
   */
  setModel(providerID: string, modelID: string): void {
    this.modelItem.text = `$(symbol-enum) ${providerID}/${modelID}`;
    this.modelItem.tooltip = `Model: ${providerID}/${modelID}\nClick to change`;
    this.modelItem.show();
  }

  /**
   * Show that model selection is currently automatic.
   */
  setModelAuto(): void {
    this.modelItem.text = '$(symbol-enum) auto';
    this.modelItem.tooltip = 'Model: automatic (no explicit model configured)\nClick to change';
    this.modelItem.show();
  }

  /**
   * Update token usage display.
   */
  setTokenUsage(tokens: TokenUsage): void {
    const inputK = ((tokens.input ?? 0) / 1000).toFixed(1);
    const outputK = ((tokens.output ?? 0) / 1000).toFixed(1);
    this.tokenItem.text = `$(dashboard) ${inputK}k / ${outputK}k`;
    this.tokenItem.tooltip = [
      `Input tokens: ${(tokens.input ?? 0).toLocaleString()}`,
      `Output tokens: ${(tokens.output ?? 0).toLocaleString()}`,
      `Reasoning tokens: ${(tokens.reasoning ?? 0).toLocaleString()}`,
      `Cache read: ${(tokens.cache?.read ?? 0).toLocaleString()}`,
      `Cache write: ${(tokens.cache?.write ?? 0).toLocaleString()}`,
    ].join('\n');
    this.tokenItem.show();
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

  /**
   * Clear token display (e.g. when no active session).
   */
  clearTokenUsage(): void {
    this.tokenItem.hide();
  }

  dispose(): void {
    this.connectionItem.dispose();
    this.modelItem.dispose();
    this.tokenItem.dispose();
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
    this.modelItem.show();
  }
}
