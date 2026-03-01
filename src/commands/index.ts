import * as vscode from 'vscode';

/**
 * Register all extension commands
 */
export function registerCommands(context: vscode.ExtensionContext): void {
  // TODO: Register all commands
  context.subscriptions.push(
    vscode.commands.registerCommand('opencode.focusChat', () => {
      vscode.commands.executeCommand('opencode.chatView.focus');
    })
  );
}
