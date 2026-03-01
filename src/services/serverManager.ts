import * as vscode from 'vscode';
import * as os from 'os';
import { spawn, type ChildProcess, execFile } from 'child_process';
import { EventBus } from './eventBus';
import { Logger } from './logger';
import type { HealthResponse } from '../types/opencode';

/** Configuration for the managed opencode server process. */
interface ServerConfig {
  executablePath: string;
  hostname: string;
  port: number;
  autoStart: boolean;
}

/** Internal server connection state. */
type ServerState = 'stopped' | 'starting' | 'running' | 'stopping';

/** Default startup timeout in milliseconds (30 seconds). */
const STARTUP_TIMEOUT_MS = 30_000;

/** Health check polling interval in milliseconds. */
const HEALTH_CHECK_INTERVAL_MS = 15_000;

/** Number of consecutive health-check failures before declaring disconnected. */
const MAX_HEALTH_FAILURES = 3;

/** Single HTTP request timeout for health checks (5 seconds). */
const HEALTH_REQUEST_TIMEOUT_MS = 5_000;

/**
 * Manages the lifecycle of the `opencode serve` child process.
 *
 * Responsibilities:
 * - Spawning / stopping the process
 * - Auto-detecting the server port from stdout
 * - Periodic health-check polling
 * - Emitting events via {@link EventBus}
 * - Graceful cleanup on dispose
 */
export class ServerManager implements vscode.Disposable {
  private process: ChildProcess | null = null;
  private port = 0;
  private hostname = '127.0.0.1';
  private state: ServerState = 'stopped';
  private healthTimer: ReturnType<typeof setInterval> | null = null;
  private healthFailures = 0;
  private serverVersion = '';
  private startupAbort: AbortController | null = null;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly eventBus: EventBus,
    private readonly logger: Logger,
  ) {}

  // ---------------------------------------------------------------------------
  //  Public API
  // ---------------------------------------------------------------------------

  /**
   * Start the opencode server process.
   *
   * If the server is already running this is a no-op.
   * Reads configuration from `opencode.server.*` VSCode settings.
   *
   * @throws If the process fails to start or the startup times out.
   */
  async start(): Promise<void> {
    if (this.state === 'running' || this.state === 'starting') {
      this.logger.warn('Server is already running or starting — ignoring start request');
      return;
    }

    this.state = 'starting';
    const config = this.readConfig();
    this.hostname = config.hostname;
    const cwd = this.getServerCwd();

    this.logger.info(
      `Starting opencode server (exec="${config.executablePath}", host=${config.hostname}, port=${config.port}, cwd="${cwd}")`,
    );

    // Build command arguments
    const args = ['serve', '--print-logs', '--hostname', config.hostname];
    if (config.port > 0) {
      args.push('--port', String(config.port));
    }

    try {
      await this.spawnProcess(config.executablePath, args, config.port);
    } catch (err) {
      this.state = 'stopped';
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error('Failed to start server:', message);
      this.eventBus.emit('server:error', { error: message });
      throw err;
    }
  }

  /**
   * Stop the opencode server process gracefully.
   *
   * On Windows the entire process tree is killed via `taskkill /T /F`.
   * On other platforms `SIGTERM` is sent.
   */
  async stop(): Promise<void> {
    if (this.state === 'stopped' || this.state === 'stopping') {
      return;
    }

    this.state = 'stopping';
    this.logger.info('Stopping opencode server…');

    // Cancel any pending startup
    this.startupAbort?.abort();
    this.startupAbort = null;

    this.stopHealthCheck();

    if (this.process && this.process.pid && !this.process.killed) {
      await this.killProcess(this.process);
    }

    this.process = null;
    this.port = 0;
    this.state = 'stopped';
    this.healthFailures = 0;
    this.serverVersion = '';

    this.eventBus.emit('server:disconnected', { reason: 'Server stopped' });
    this.logger.info('Server stopped');
  }

  /**
   * Restart the server (stop then start).
   */
  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  /**
   * Returns the base URL for the running server (e.g. `http://127.0.0.1:3456`).
   */
  getBaseUrl(): string {
    return `http://${this.hostname}:${this.port}`;
  }

  /**
   * Returns the port the server is listening on, or `0` if not running.
   */
  getPort(): number {
    return this.port;
  }

  /**
   * Returns `true` if the server process is alive and health checks pass.
   */
  isRunning(): boolean {
    return this.state === 'running';
  }

  /**
   * Returns the current server state.
   */
  getState(): ServerState {
    return this.state;
  }

  /**
   * Returns the server version string from the last successful health check.
   */
  getVersion(): string {
    return this.serverVersion;
  }

  /**
   * Dispose of all resources (process, timers, etc.).
   */
  dispose(): void {
    this.stop().catch(err => {
      this.logger.error('Error during dispose:', err);
    });
  }

  // ---------------------------------------------------------------------------
  //  Configuration
  // ---------------------------------------------------------------------------

  private readConfig(): ServerConfig {
    const cfg = vscode.workspace.getConfiguration('opencode.server');
    return {
      executablePath: cfg.get<string>('executablePath', 'opencode'),
      hostname: cfg.get<string>('hostname', '127.0.0.1'),
      port: cfg.get<number>('port', 0),
      autoStart: cfg.get<boolean>('autoStart', true),
    };
  }

  // ---------------------------------------------------------------------------
  //  Process management
  // ---------------------------------------------------------------------------

  /**
   * Spawn the child process and wait until the port is detected
   * (either from stdout or from the pre-configured port becoming healthy).
   */
  private spawnProcess(executable: string, args: string[], configuredPort: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.startupAbort = new AbortController();
      const { signal } = this.startupAbort;

      // Startup timeout
      const timeout = setTimeout(() => {
        if (this.state !== 'running') {
          this.startupAbort?.abort();
          reject(new Error(`Server failed to start within ${STARTUP_TIMEOUT_MS / 1000}s`));
        }
      }, STARTUP_TIMEOUT_MS);

      signal.addEventListener('abort', () => {
        clearTimeout(timeout);
      });

      // Spawn
      const cwd = this.getServerCwd();
      const child = spawn(executable, args, {
        cwd,
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
        // On Windows hide the console window
        windowsHide: true,
      });

      this.process = child;

      // ---------- stdout ----------
      let stdoutBuffer = '';
      child.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        stdoutBuffer += text;
        this.logger.debug(`[server stdout] ${text.trimEnd()}`);

        // Try to detect the listening port from output
        // Typical patterns:
        //   "listening on http://127.0.0.1:12345"
        //   "Listening on :12345"
        //   "server started on port 12345"
        const portMatch = stdoutBuffer.match(
          /(?:listening on|server started on|started? (?:at|on))\s+(?:https?:\/\/[^:]+:|:)?(\d{2,5})/i,
        );

        if (portMatch && this.state === 'starting') {
          const detectedPort = parseInt(portMatch[1], 10);
          if (detectedPort > 0 && detectedPort <= 65535) {
            this.port = detectedPort;
            this.logger.info(`Detected server port: ${this.port}`);
            this.onServerReady(resolve, clearTimeout.bind(null, timeout));
          }
        }
      });

      // ---------- stderr ----------
      child.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        this.logger.warn(`[server stderr] ${text.trimEnd()}`);

        // Some servers print the listening message to stderr
        const portMatch = text.match(
          /(?:listening on|server started on|started? (?:at|on))\s+(?:https?:\/\/[^:]+:|:)?(\d{2,5})/i,
        );
        if (portMatch && this.state === 'starting') {
          const detectedPort = parseInt(portMatch[1], 10);
          if (detectedPort > 0 && detectedPort <= 65535) {
            this.port = detectedPort;
            this.logger.info(`Detected server port from stderr: ${this.port}`);
            this.onServerReady(resolve, clearTimeout.bind(null, timeout));
          }
        }
      });

      // ---------- error / exit ----------
      child.on('error', (err: Error) => {
        clearTimeout(timeout);
        this.logger.error('Server process error:', err.message);
        if (this.state === 'starting') {
          reject(new Error(`Failed to spawn "${executable}": ${err.message}`));
        } else {
          this.handleProcessCrash(err.message);
        }
      });

      child.on('exit', (code: number | null, sig: string | null) => {
        clearTimeout(timeout);
        const reason = sig ? `signal ${sig}` : `exit code ${code}`;
        this.logger.info(`Server process exited (${reason})`);

        if (this.state === 'starting') {
          reject(new Error(`Server exited unexpectedly during startup (${reason})`));
        } else if (this.state === 'running') {
          this.handleProcessCrash(reason);
        }
        // If stopping, do nothing — stop() handles cleanup
      });

      // If a port was pre-configured (port > 0) and we haven't detected it
      // from stdout yet, start polling health immediately.
      if (configuredPort > 0) {
        this.port = configuredPort;
        this.logger.info(`Using configured port: ${this.port}`);
        // Give the process a moment to start, then poll health
        setTimeout(() => {
          if (this.state === 'starting') {
            this.waitForHealth(resolve, clearTimeout.bind(null, timeout));
          }
        }, 1000);
      }
    });
  }

  /**
   * Determine a stable working directory for the server process.
   * - If a local (file://) workspace exists, use its first folder.
   * - Otherwise default to the user's home directory.
   */
  private getServerCwd(): string {
    const firstFolder = vscode.workspace.workspaceFolders?.[0];
    if (firstFolder?.uri.scheme === 'file') {
      return firstFolder.uri.fsPath;
    }
    return os.homedir();
  }

  /**
   * Called when we believe the server is ready (port detected).
   * Runs an initial health check to confirm, then starts periodic polling.
   */
  private async onServerReady(
    resolve: () => void,
    clearStartupTimeout: () => void,
  ): Promise<void> {
    try {
      const health = await this.performHealthCheck();
      if (health) {
        clearStartupTimeout();
        this.state = 'running';
        this.serverVersion = health.version;
        this.startHealthCheck();
        this.eventBus.emit('server:connected', { version: health.version });
        this.logger.info(`Server connected (version ${health.version})`);
        resolve();
      } else {
        // Server not healthy yet — keep waiting; the startup timeout will
        // eventually fire if it never becomes healthy.
        this.logger.debug('Server port detected but health check failed — retrying…');
        setTimeout(() => {
          if (this.state === 'starting') {
            this.onServerReady(resolve, clearStartupTimeout);
          }
        }, 1000);
      }
    } catch {
      // Retry
      setTimeout(() => {
        if (this.state === 'starting') {
          this.onServerReady(resolve, clearStartupTimeout);
        }
      }, 1000);
    }
  }

  /**
   * Poll health until it passes (used when port is pre-configured).
   */
  private async waitForHealth(
    resolve: () => void,
    clearStartupTimeout: () => void,
  ): Promise<void> {
    try {
      const health = await this.performHealthCheck();
      if (health) {
        clearStartupTimeout();
        this.state = 'running';
        this.serverVersion = health.version;
        this.startHealthCheck();
        this.eventBus.emit('server:connected', { version: health.version });
        this.logger.info(`Server connected (version ${health.version})`);
        resolve();
        return;
      }
    } catch {
      // expected during startup
    }

    // Retry in 1s
    setTimeout(() => {
      if (this.state === 'starting') {
        this.waitForHealth(resolve, clearStartupTimeout);
      }
    }, 1000);
  }

  /**
   * Handle an unexpected process crash while the server was running.
   */
  private handleProcessCrash(reason: string): void {
    this.stopHealthCheck();
    this.process = null;
    this.port = 0;
    this.state = 'stopped';
    this.healthFailures = 0;
    this.serverVersion = '';

    this.eventBus.emit('server:disconnected', { reason: `Process crashed: ${reason}` });
    this.eventBus.emit('server:error', { error: `Server process crashed (${reason})` });
    this.logger.error(`Server process crashed: ${reason}`);
  }

  /**
   * Kill a child process (and its entire tree on Windows).
   */
  private killProcess(child: ChildProcess): Promise<void> {
    return new Promise<void>((resolve) => {
      const pid = child.pid;
      if (!pid) {
        resolve();
        return;
      }

      const onExit = () => {
        child.removeListener('exit', onExit);
        resolve();
      };
      child.once('exit', onExit);

      // Safety timeout — force resolve after 5 s
      const safetyTimeout = setTimeout(() => {
        child.removeListener('exit', onExit);
        resolve();
      }, 5000);

      if (process.platform === 'win32') {
        // Windows: kill entire process tree
        execFile('taskkill', ['/pid', String(pid), '/T', '/F'], (err: Error | null) => {
          if (err) {
            this.logger.warn(`taskkill failed: ${err.message}`);
            try {
              child.kill('SIGKILL');
            } catch {
              // best effort
            }
          }
          clearTimeout(safetyTimeout);
          child.removeListener('exit', onExit);
          resolve();
        });
      } else {
        // Unix: send SIGTERM first, SIGKILL after 3 s
        try {
          child.kill('SIGTERM');
        } catch {
          clearTimeout(safetyTimeout);
          child.removeListener('exit', onExit);
          resolve();
          return;
        }

        setTimeout(() => {
          if (!child.killed) {
            try {
              child.kill('SIGKILL');
            } catch {
              // best effort
            }
          }
        }, 3000);
      }
    });
  }

  // ---------------------------------------------------------------------------
  //  Health checking
  // ---------------------------------------------------------------------------

  /**
   * Start periodic health-check polling.
   */
  private startHealthCheck(): void {
    this.stopHealthCheck();
    this.healthFailures = 0;

    this.healthTimer = setInterval(async () => {
      if (this.state !== 'running') { return; }

      try {
        const health = await this.performHealthCheck();
        if (health) {
          // Reset failures on success
          if (this.healthFailures > 0) {
            this.logger.info('Health check recovered');
            this.healthFailures = 0;
            this.serverVersion = health.version;
            this.eventBus.emit('server:connected', { version: health.version });
          }
        } else {
          this.onHealthFailure('Unhealthy response');
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.onHealthFailure(msg);
      }
    }, HEALTH_CHECK_INTERVAL_MS);
  }

  /**
   * Stop the health-check timer.
   */
  private stopHealthCheck(): void {
    if (this.healthTimer !== null) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
  }

  /**
   * Handle a single health-check failure. After {@link MAX_HEALTH_FAILURES}
   * consecutive failures the server is considered disconnected.
   */
  private onHealthFailure(reason: string): void {
    this.healthFailures++;
    this.logger.warn(`Health check failed (${this.healthFailures}/${MAX_HEALTH_FAILURES}): ${reason}`);

    if (this.healthFailures >= MAX_HEALTH_FAILURES) {
      this.logger.error('Server unreachable — marking as disconnected');
      this.stopHealthCheck();
      this.state = 'stopped';
      this.eventBus.emit('server:disconnected', {
        reason: `Health check failed ${MAX_HEALTH_FAILURES} times: ${reason}`,
      });
    }
  }

  /**
   * Perform a single HTTP health check against the server.
   *
   * @returns The {@link HealthResponse} on success, or `null` if the server
   *          is not healthy / unreachable.
   */
  private async performHealthCheck(): Promise<HealthResponse | null> {
    const url = `${this.getBaseUrl()}/global/health`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), HEALTH_REQUEST_TIMEOUT_MS);

      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return null;
      }

      const body = (await response.json()) as HealthResponse;
      return body.healthy ? body : null;
    } catch {
      return null;
    }
  }
}
