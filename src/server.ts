/**
 * OpenCode 服务器管理器
 * 负责启动、停止、健康检查 opencode serve 进程
 */

import * as vscode from "vscode";
import { ChildProcess, spawn, exec } from "child_process";
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
  private healthCheckFailCount: number = 0;
  private outputChannel: vscode.OutputChannel;

  /** 连续健康检查失败多少次后才标记为 error */
  private static readonly HEALTH_FAIL_THRESHOLD = 3;

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
        }, 60000);
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

        // 从 stdout/stderr 中检测就绪消息的公共逻辑
        const checkReadyMessage = (text: string): void => {
          if (resolved) return;

          // 匹配多种可能的就绪消息格式
          const urlMatch =
            text.match(/opencode server listening on (https?:\/\/[^\s]+)/i) ||
            text.match(/listening on (https?:\/\/[^\s]+)/i) ||
            text.match(/(https?:\/\/(?:127\.0\.0\.1|localhost|0\.0\.0\.0):\d+)/i);

          if (urlMatch) {
            this._url = urlMatch[1];
            this.outputChannel.appendLine(`[就绪] 服务器地址: ${this._url}`);
            resolved = true;
            this.onServerReady(resolve);
          }
        };

        this.process.stdout?.on("data", (data: Buffer) => {
          const text = data.toString();
          this.outputChannel.appendLine(`[stdout] ${text.trim()}`);
          checkReadyMessage(text);
        });

        this.process.stderr?.on("data", (data: Buffer) => {
          const text = data.toString().trim();
          if (text) {
            this.outputChannel.appendLine(`[stderr] ${text}`);
            // stderr 中也可能包含就绪消息（某些日志框架写到 stderr）
            checkReadyMessage(text);
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

        // 轮询回退：更早开始（3秒），等待更长（30秒）
        setTimeout(async () => {
          if (!resolved) {
            this._url = `http://${this._hostname}:${this._port}`;
            this.outputChannel.appendLine(
              `[轮询] 未检测到就绪消息，尝试轮询 ${this._url}`
            );
            try {
              await this.waitForHealth(30000);
              if (!resolved) {
                resolved = true;
                this.onServerReady(resolve);
              }
            } catch (e) {
              if (!resolved) {
                this.setState("error");
                resolved = true;
                reject(new Error("服务器启动超时"));
              }
            }
          }
        }, 3000);
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

    // 带重试的初始健康检查：服务器刚启动可能还没完全就绪
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        const health = await this._client.health();
        this._version = health.version || "unknown";
        this.outputChannel.appendLine(`[就绪] 版本: ${this._version}`);
        lastError = null;
        break;
      } catch (err: any) {
        lastError = err;
        this.outputChannel.appendLine(
          `[就绪] 健康检查第 ${attempt + 1} 次失败: ${err.message}, 重试中...`
        );
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    if (lastError) {
      this._version = "unknown";
      this.outputChannel.appendLine(
        `[警告] 初始健康检查全部失败，但服务器进程在运行，继续标记为就绪`
      );
    }

    this.setState("running");
    this.healthCheckFailCount = 0;
    this.startHealthCheck();
    this._onReady.fire(this._client);
    resolve(this._client);
  }

  private async waitForHealth(timeout: number): Promise<void> {
    const interval = 800;
    const maxAttempts = Math.floor(timeout / interval);
    const client = new OpenCodeClient(this._url);

    for (let i = 0; i < maxAttempts; i++) {
      try {
        await client.health();
        client.dispose();
        return;
      } catch {
        await new Promise((r) => setTimeout(r, interval));
      }
    }
    client.dispose();
    throw new Error("健康检查超时");
  }

  private startHealthCheck(): void {
    this.stopHealthCheck();
    this.healthCheckFailCount = 0;
    this.healthCheckTimer = setInterval(async () => {
      if (!this._client) return;
      try {
        await this._client.health();
        // 健康检查成功：重置失败计数，恢复状态
        this.healthCheckFailCount = 0;
        if (this._state !== "running") {
          this.outputChannel.appendLine("[恢复] 健康检查恢复正常");
          this.setState("running");
        }
      } catch {
        this.healthCheckFailCount++;
        this.outputChannel.appendLine(
          `[警告] 健康检查失败 (${this.healthCheckFailCount}/${ServerManager.HEALTH_FAIL_THRESHOLD})`
        );
        // 只有连续多次失败才标记为 error
        if (
          this.healthCheckFailCount >= ServerManager.HEALTH_FAIL_THRESHOLD &&
          this._state === "running"
        ) {
          this.outputChannel.appendLine("[错误] 连续健康检查失败，标记为错误状态");
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

  private _disposed = false;

  async stop(): Promise<void> {
    this.stopHealthCheck();
    this._client?.dispose();
    this._client = null;

    if (this.process) {
      this.setState("stopped");
      const pid = this.process.pid;

      // Windows 下 shell: true 会创建 cmd.exe → opencode 的进程树
      // process.kill() 只能杀 cmd.exe，需要 taskkill /T 杀整个树
      if (pid && process.platform === "win32") {
        try {
          await new Promise<void>((resolve, reject) => {
            exec(`taskkill /pid ${pid} /T /F`, (err) => {
              if (err) {
                this.outputChannel.appendLine(
                  `[警告] taskkill 失败: ${err.message}`
                );
              }
              resolve();
            });
          });
        } catch {
          // taskkill 失败时回退到普通 kill
          this.process.kill();
        }
      } else {
        // Unix: 发送 SIGTERM，等待优雅退出
        this.process.kill("SIGTERM");
      }

      // 等待进程退出
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          if (this.process) {
            try {
              this.process.kill("SIGKILL");
            } catch {
              // 进程可能已经退出
            }
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

  /**
   * 连接到已有的 opencode serve 实例（不启动子进程）
   */
  async connectToExisting(url: string): Promise<OpenCodeClient> {
    // 先停掉现有进程（如果有）
    await this.stop();

    this._url = url.replace(/\/+$/, ""); // 去掉尾部斜杠
    this.setState("starting");
    this.outputChannel.appendLine(`[连接] 尝试连接外部实例: ${this._url}`);

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    this._client = new OpenCodeClient(this._url, workspaceFolder);

    // 带重试的连接检查
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const health = await this._client.health();
        this._version = health.version || "unknown";
        this.outputChannel.appendLine(
          `[连接成功] 版本: ${this._version}, 地址: ${this._url}`
        );

        this.setState("running");
        this.healthCheckFailCount = 0;
        this.startHealthCheck();
        this._onReady.fire(this._client);
        return this._client;
      } catch (error: any) {
        lastError = error;
        this.outputChannel.appendLine(
          `[连接] 第 ${attempt + 1} 次尝试失败: ${error.message}`
        );
        if (attempt < 4) {
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    }

    this._client.dispose();
    this._client = null;
    this.setState("error");
    throw new Error(`无法连接到 ${this._url}: ${lastError?.message || "连接失败"}`);
  }

  async dispose(): Promise<void> {
    if (this._disposed) return;
    this._disposed = true;
    await this.stop();
    this._onStateChange.dispose();
    this._onReady.dispose();
  }
}
