import * as vscode from 'vscode';
import type { TokenUsage } from '../types/opencode';

/**
 * Manages status bar items showing connection state, model info, and token usage.
 */
export class StatusBarManager implements vscode.Disposable {
  private connectionItem: vscode.StatusBarItem;
  private modelItem: vscode.StatusBarItem;
  private tokenItem: vscode.StatusBarItem;

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
  setConnected(version: string): void {
    this.connectionItem.text = `$(plug) OpenCode`;
    this.connectionItem.tooltip = `OpenCode server connected (v${version})`;
    this.connectionItem.backgroundColor = undefined;
    this.connectionItem.show();
    this.modelItem.show();
  }

  /**
   * Show disconnected state.
   */
  setDisconnected(): void {
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
  setConnecting(): void {
    this.connectionItem.text = `$(loading~spin) OpenCode`;
    this.connectionItem.tooltip = 'Connecting to OpenCode server…';
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
   * Update token usage display.
   */
  setTokenUsage(tokens: TokenUsage): void {
    const inputK = (tokens.input / 1000).toFixed(1);
    const outputK = (tokens.output / 1000).toFixed(1);
    this.tokenItem.text = `$(dashboard) ${inputK}k / ${outputK}k`;
    this.tokenItem.tooltip = [
      `Input tokens: ${tokens.input.toLocaleString()}`,
      `Output tokens: ${tokens.output.toLocaleString()}`,
      `Reasoning tokens: ${tokens.reasoning.toLocaleString()}`,
      `Cache read: ${tokens.cache.read.toLocaleString()}`,
      `Cache write: ${tokens.cache.write.toLocaleString()}`,
    ].join('\n');
    this.tokenItem.show();
  }

  /**
   * Toggle busy indicator on the connection item.
   */
  setBusy(busy: boolean): void {
    if (busy) {
      this.connectionItem.text = `$(loading~spin) OpenCode`;
      this.connectionItem.tooltip = 'OpenCode is processing…';
    } else {
      // Restore normal connected state (caller should also call setConnected)
      this.connectionItem.text = `$(plug) OpenCode`;
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
}
