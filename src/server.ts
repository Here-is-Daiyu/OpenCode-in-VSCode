/**
 * OpenCode 服务器管理器
 * 负责启动、停止、健康检查 opencode serve 进程
 */

import * as vscode from "vscode";
import { ChildProcess, spawn } from "child_process";
import { OpenCodeClient } from "./client";

export type ServerState = "stopped" | "starting" | "running" | "error";

export class ServerManager {
  private process: ChildProcess | null = null;
  private _state: ServerState = "stopped";
  private _port: number = 0;
  private _hostname: string = "127.0.0.1";
  private _url: string = "";
  private _client: OpenCodeClient | null = null;
  private _version: string = "";
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private outputChannel: vscode.OutputChannel;

  private readonly _onStateChange = new vscode.EventEmitter<ServerState>();
  public readonly onStateChange = this._onStateChange.event;

  private readonly _onReady = new vscode.EventEmitter<OpenCodeClient>();
  public readonly onReady = this._onReady.event;

  constructor(private context: vscode.ExtensionContext) {
    this.outputChannel = vscode.window.createOutputChannel("OpenCode Server");
    context.subscriptions.push(this.outputChannel);
  }

  get state(): ServerState {
    return this._state;
  }

  get port(): number {
    return this._port;
  }

  get url(): string {
    return this._url;
  }

  get client(): OpenCodeClient | null {
    return this._client;
  }

  get version(): string {
    return this._version;
  }

  private setState(state: ServerState): void {
    this._state = state;
    this._onStateChange.fire(state);
  }

  async start(): Promise<OpenCodeClient> {
    if (this._state === "running" && this._client) {
      return this._client;
    }

    if (this._state === "starting") {
      return new Promise((resolve, reject) => {
        const disposable = this.onReady((client) => {
          disposable.dispose();
          resolve(client);
        });
        setTimeout(() => {
          disposable.dispose();
          reject(new Error("启动超时"));
        }, 30000);
      });
    }

    this.setState("starting");

    const config = vscode.workspace.getConfiguration("opencode");
    const executable = config.get<string>("server.executablePath", "opencode");
    this._hostname = config.get<string>("server.hostname", "127.0.0.1");
    const configuredPort = config.get<number>("server.port", 0);

    // 如果端口为 0，分配随机端口
    this._port = configuredPort || (Math.floor(Math.random() * 49152) + 16384);

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    const args = [
      "serve",
      `--hostname=${this._hostname}`,
      `--port=${this._port}`,
    ];

    this.outputChannel.appendLine(`[启动] ${executable} ${args.join(" ")}`);
    this.outputChannel.appendLine(`[工作目录] ${workspaceFolder || "未指定"}`);

    return new Promise<OpenCodeClient>((resolve, reject) => {
      try {
        this.process = spawn(executable, args, {
          cwd: workspaceFolder,
          env: {
            ...process.env,
            OPENCODE_CALLER: "vscode-extension",
          },
          stdio: ["pipe", "pipe", "pipe"],
          shell: true,
        });

        let resolved = false;

        this.process.stdout?.on("data", (data: Buffer) => {
          const text = data.toString();
          this.outputChannel.appendLine(`[stdout] ${text.trim()}`);

          // 检测服务器就绪消息
          const urlMatch = text.match(
            /opencode server listening on (https?:\/\/[^\s]+)/i
          );
          if (urlMatch && !resolved) {
            this._url = urlMatch[1];
            this.outputChannel.appendLine(`[就绪] 服务器地址: ${this._url}`);
            this.onServerReady(resolve);
            resolved = true;
          }
        });

        this.process.stderr?.on("data", (data: Buffer) => {
          const text = data.toString().trim();
          if (text) {
            this.outputChannel.appendLine(`[stderr] ${text}`);
          }
        });

        this.process.on("error", (error) => {
          this.outputChannel.appendLine(`[错误] 进程启动失败: ${error.message}`);
          this.setState("error");
          if (!resolved) {
            resolved = true;
            reject(new Error(`无法启动 opencode: ${error.message}`));
          }
        });

        this.process.on("exit", (code, signal) => {
          this.outputChannel.appendLine(
            `[退出] 进程退出, code=${code}, signal=${signal}`
          );
          this.stopHealthCheck();
          if (this._state !== "stopped") {
            this.setState("stopped");
          }
          this.process = null;
          if (!resolved) {
            resolved = true;
            reject(new Error(`opencode 进程意外退出 (code=${code})`));
          }
        });

        // 超时处理：如果 stdout 没有输出就绪消息，使用轮询
        setTimeout(async () => {
          if (!resolved) {
            this._url = `http://${this._hostname}:${this._port}`;
            this.outputChannel.appendLine(
              `[轮询] 未检测到就绪消息，尝试轮询 ${this._url}`
            );
            try {
              await this.waitForHealth(15000);
              this.onServerReady(resolve);
              resolved = true;
            } catch (e) {
              this.setState("error");
              resolved = true;
              reject(new Error("服务器启动超时"));
            }
          }
        }, 5000);
      } catch (error: any) {
        this.setState("error");
        reject(error);
      }
    });
  }

  private async onServerReady(
    resolve: (client: OpenCodeClient) => void
  ): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    this._client = new OpenCodeClient(this._url, workspaceFolder);

    try {
      const health = await this._client.health();
      this._version = health.version || "unknown";
      this.outputChannel.appendLine(`[就绪] 版本: ${this._version}`);
    } catch {
      this._version = "unknown";
    }

    this.setState("running");
    this.startHealthCheck();
    this._onReady.fire(this._client);
    resolve(this._client);
  }

  private async waitForHealth(timeout: number): Promise<void> {
    const interval = 500;
    const maxAttempts = Math.floor(timeout / interval);
    const client = new OpenCodeClient(this._url);

    for (let i = 0; i < maxAttempts; i++) {
      try {
        await client.health();
        return;
      } catch {
        await new Promise((r) => setTimeout(r, interval));
      }
    }
    throw new Error("健康检查超时");
  }

  private startHealthCheck(): void {
    this.stopHealthCheck();
    this.healthCheckTimer = setInterval(async () => {
      if (!this._client) return;
      try {
        await this._client.health();
        if (this._state !== "running") {
          this.setState("running");
        }
      } catch {
        if (this._state === "running") {
          this.outputChannel.appendLine("[警告] 健康检查失败");
          this.setState("error");
        }
      }
    }, 15000);
  }

  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  async stop(): Promise<void> {
    this.stopHealthCheck();
    this._client?.dispose();
    this._client = null;

    if (this.process) {
      this.setState("stopped");
      this.process.kill("SIGTERM");

      // 等待进程退出
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          if (this.process) {
            this.process.kill("SIGKILL");
          }
          resolve();
        }, 5000);

        if (this.process) {
          this.process.on("exit", () => {
            clearTimeout(timeout);
            resolve();
          });
        } else {
          clearTimeout(timeout);
          resolve();
        }
      });

      this.process = null;
    }

    this.outputChannel.appendLine("[停止] 服务器已停止");
  }

  async restart(): Promise<OpenCodeClient> {
    await this.stop();
    return this.start();
  }

  dispose(): void {
    this.stop();
    this._onStateChange.dispose();
    this._onReady.dispose();
  }
}
