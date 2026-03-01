import * as vscode from 'vscode';

/**
 * Manages the lifecycle of the opencode serve process
 */
export class ServerManager implements vscode.Disposable {
  private process: import('child_process').ChildProcess | null = null;
  private port: number = 0;
  private hostname: string = '127.0.0.1';

  constructor(private context: vscode.ExtensionContext) {}

  async start(): Promise<void> {
    // TODO: Implement server start
  }

  async stop(): Promise<void> {
    // TODO: Implement server stop
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  getBaseUrl(): string {
    return `http://${this.hostname}:${this.port}`;
  }

  isRunning(): boolean {
    return this.process !== null;
  }

  dispose(): void {
    this.stop();
  }
}
