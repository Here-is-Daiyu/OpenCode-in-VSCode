import * as vscode from 'vscode';

/**
 * Simple logger service wrapping VSCode's OutputChannel.
 * Provides structured logging with severity levels and timestamps.
 */
export class Logger implements vscode.Disposable {
  private channel: vscode.OutputChannel;
  private debugMode: boolean;

  constructor(name: string) {
    this.channel = vscode.window.createOutputChannel(name);
    this.debugMode = vscode.workspace.getConfiguration('opencode').get<boolean>('debug', false);
  }

  /**
   * Log an informational message.
   */
  info(message: string, ...args: unknown[]): void {
    this.write('INFO', message, ...args);
  }

  /**
   * Log a warning message.
   */
  warn(message: string, ...args: unknown[]): void {
    this.write('WARN', message, ...args);
  }

  /**
   * Log an error message.
   */
  error(message: string, ...args: unknown[]): void {
    this.write('ERROR', message, ...args);
  }

  /**
   * Log a debug message. Only written when debug mode is enabled.
   */
  debug(message: string, ...args: unknown[]): void {
    if (this.debugMode) {
      this.write('DEBUG', message, ...args);
    }
  }

  /**
   * Enable or disable debug mode at runtime.
   */
  setDebug(enabled: boolean): void {
    this.debugMode = enabled;
  }

  /**
   * Returns whether debug mode is currently enabled.
   */
  isDebug(): boolean {
    return this.debugMode;
  }

  /**
   * Show the output channel in the VSCode panel.
   */
  show(): void {
    this.channel.show();
  }

  /**
   * Dispose of the underlying output channel.
   */
  dispose(): void {
    this.channel.dispose();
  }

  private write(level: string, message: string, ...args: unknown[]): void {
    const timestamp = new Date().toISOString();
    const suffix = args.length > 0
      ? ' ' + args.map(a => {
        if (a instanceof Error) {
          return `${a.message}\n${a.stack ?? ''}`;
        }
        if (typeof a === 'object') {
          try {
            return JSON.stringify(a, null, 2);
          } catch {
            return String(a);
          }
        }
        return String(a);
      }).join(' ')
      : '';
    this.channel.appendLine(`[${timestamp}] [${level}] ${message}${suffix}`);
  }
}
