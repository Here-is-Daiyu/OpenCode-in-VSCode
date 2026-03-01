import * as vscode from 'vscode';

// ---------------------------------------------------------------------------
//  TerminalService
// ---------------------------------------------------------------------------

/** The name shown in the terminal tab. */
const TERMINAL_NAME = 'OpenCode Terminal';

/**
 * Enhanced terminal integration for OpenCode.
 *
 * Creates and manages a dedicated terminal instance with the
 * `OPENCODE_BASE_URL` environment variable set so that any CLI invocations
 * inside the terminal can discover the running server.
 */
export class TerminalService implements vscode.Disposable {
  private terminal?: vscode.Terminal;
  private disposables: vscode.Disposable[] = [];

  constructor() {
    // Track terminal closure so we don't hold a stale reference
    this.disposables.push(
      vscode.window.onDidCloseTerminal(t => {
        if (t === this.terminal) {
          this.terminal = undefined;
        }
      }),
    );
  }

  // -------------------------------------------------------------------------
  //  Public API
  // -------------------------------------------------------------------------

  /**
   * Open (or re-use) a terminal configured for OpenCode.
   *
   * The terminal's working directory is set to the first workspace folder and
   * the `OPENCODE_BASE_URL` env var points at the running server.
   *
   * @param baseUrl - The base URL of the OpenCode server (e.g. `http://127.0.0.1:12345`).
   * @returns The terminal instance.
   */
  openTerminal(baseUrl: string): vscode.Terminal {
    if (this.terminal && this.isTerminalAlive()) {
      this.terminal.show();
      return this.terminal;
    }

    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri;

    this.terminal = vscode.window.createTerminal({
      name: TERMINAL_NAME,
      cwd,
      env: {
        OPENCODE_BASE_URL: baseUrl,
      },
    });

    this.terminal.show();
    return this.terminal;
  }

  /**
   * Send a shell command to the OpenCode terminal.
   *
   * If no terminal exists yet one will **not** be created — call
   * {@link openTerminal} first.
   */
  executeCommand(command: string): void {
    if (!this.terminal || !this.isTerminalAlive()) {
      vscode.window.showWarningMessage(
        'No OpenCode terminal is open. Use "OpenCode: Open Terminal" first.',
      );
      return;
    }

    this.terminal.sendText(command);
  }

  /**
   * Heuristic check for whether the terminal is still alive.
   *
   * VSCode does not expose a direct "alive" API on `Terminal` — we rely on
   * the `onDidCloseTerminal` listener to clear our reference.
   */
  isTerminalAlive(): boolean {
    return this.terminal !== undefined;
  }

  // -------------------------------------------------------------------------
  //  Disposable
  // -------------------------------------------------------------------------

  dispose(): void {
    if (this.terminal) {
      this.terminal.dispose();
      this.terminal = undefined;
    }
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}
