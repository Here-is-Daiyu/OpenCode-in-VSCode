import * as vscode from 'vscode';

export interface TerminalOutputEntry {
  terminal: string;
  command: string;
  output: string;
  exitCode: number | undefined;
  timestamp: number;
}

export class TerminalOutputService implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly recentOutputs: TerminalOutputEntry[] = [];
  private readonly activeReads = new WeakMap<vscode.TerminalShellExecution, Promise<string>>();
  private readonly maxEntries = 20;
  private readonly maxOutputChars = 10000;

  constructor() {
    this.disposables.push(
      vscode.window.onDidStartTerminalShellExecution((event) => {
        this.activeReads.set(event.execution, this.readExecutionOutput(event.execution));
      }),
      vscode.window.onDidEndTerminalShellExecution((event) => {
        void this.captureOutput(event);
      })
    );
  }

  private readExecutionOutput(execution: vscode.TerminalShellExecution): Promise<string> {
    return (async () => {
      let output = '';

      try {
        for await (const data of execution.read()) {
          output += data;
          if (output.length > this.maxOutputChars) {
            output = output.slice(-this.maxOutputChars);
          }
        }
      } catch {
        // Stream may not be available.
      }

      return output;
    })();
  }

  private async captureOutput(event: vscode.TerminalShellExecutionEndEvent): Promise<void> {
    const { execution, exitCode, terminal } = event;
    const outputPromise = this.activeReads.get(execution) ?? this.readExecutionOutput(execution);
    this.activeReads.delete(execution);

    this.recentOutputs.push({
      terminal: terminal.name,
      command: execution.commandLine.value,
      output: await outputPromise,
      exitCode,
      timestamp: Date.now(),
    });

    if (this.recentOutputs.length > this.maxEntries) {
      this.recentOutputs.shift();
    }
  }

  getLastOutput(): TerminalOutputEntry | undefined {
    return this.recentOutputs[this.recentOutputs.length - 1];
  }

  getLastErrorOutput(): TerminalOutputEntry | undefined {
    return [...this.recentOutputs].reverse().find(entry => typeof entry.exitCode === 'number' && entry.exitCode !== 0);
  }

  getRecentOutputs(count = 5): TerminalOutputEntry[] {
    return this.recentOutputs.slice(-count);
  }

  formatOutputForChat(entry: TerminalOutputEntry): string {
    const exitInfo = entry.exitCode !== undefined ? ` (exit code: ${entry.exitCode})` : '';
    const command = entry.command || '(unknown command)';
    const output = entry.output.trimEnd();

    return `Terminal output from "${entry.terminal}"${exitInfo}:\n\`\`\`\n$ ${command}\n${output}\n\`\`\``;
  }

  dispose(): void {
    this.disposables.forEach(disposable => disposable.dispose());
  }
}
