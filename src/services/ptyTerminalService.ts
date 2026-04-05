import * as vscode from 'vscode';
import type { Pty, PtyCreateOptions, PtyExitInfo } from '../types/opencode';
import { EventBus } from './eventBus';
import { Logger } from './logger';
import { OpenCodeClient } from './openCodeClient';

const WEBSOCKET_OPEN = 1;
const DEFAULT_PTY_TITLE = 'OpenCode PTY';
const PTY_RECONNECT_BASE_DELAY_MS = 1_000;
const PTY_RESIZE_RETRY_DELAY_MS = 250;
const MAX_PTY_RECONNECT_ATTEMPTS = 3;

type PtyAutoCloseReason =
  | 'socket-closed'
  | 'runtime-unavailable'
  | 'remote-exited'
  | 'remote-deleted'
  | 'service-disconnect';

type WebSocketLike = {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number): void;
  addEventListener(type: 'open', listener: () => void): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  addEventListener(type: 'close', listener: (event: { code: number; reason?: string }) => void): void;
  addEventListener(type: 'error', listener: (event: { error?: unknown }) => void): void;
};

type WebSocketConstructor = new (url: string) => WebSocketLike;

interface PtyTerminalEntry {
  info: Pty;
  backend: PtyBackedTerminal;
  terminal: vscode.Terminal;
}

class PtyBackedTerminal implements vscode.Pseudoterminal, vscode.Disposable {
  private readonly writeEmitter = new vscode.EventEmitter<string>();
  private readonly closeEmitter = new vscode.EventEmitter<number | void>();
  private readonly pendingInput: string[] = [];
  private ws: WebSocketLike | null = null;
  private lastDimensions?: vscode.TerminalDimensions;
  private resizeRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private closedByUser = false;
  private autoCloseReason?: PtyAutoCloseReason;
  private info: Pty;

  readonly onDidWrite = this.writeEmitter.event;
  readonly onDidClose = this.closeEmitter.event;

  constructor(
    info: Pty,
    private readonly connectUrl: string,
    private readonly client: OpenCodeClient,
    private readonly logger: Logger,
    private readonly onAutoClose: (reason: PtyAutoCloseReason) => void,
  ) {
    this.info = info;
  }

  open(initialDimensions?: vscode.TerminalDimensions): void {
    if (this.ws || this.closed) {
      return;
    }

    this.applyTitle(this.info.title);

    if (initialDimensions) {
      this.lastDimensions = initialDimensions;
    }

    const WebSocketImpl = globalThis.WebSocket as unknown as WebSocketConstructor | undefined;
    if (!WebSocketImpl) {
      this.writeEmitter.fire('OpenCode PTY terminal is unavailable: WebSocket is not supported in this runtime.\r\n');
      this.notifyAutoClose('runtime-unavailable');
      this.finish(1);
      return;
    }

    this.ws = new WebSocketImpl(this.connectUrl);
    this.ws.addEventListener('open', () => {
      this.logger.debug(`Connected PTY websocket: ${this.info.id}`);
      if (this.lastDimensions) {
        void this.resize(this.lastDimensions);
      }
      this.flushPendingInput();
    });
    this.ws.addEventListener('message', (event) => {
      void this.handleMessage(event.data).catch((error) => {
        this.logger.warn(`Failed to process PTY output: ${this.info.id}`, error);
      });
    });
    this.ws.addEventListener('close', (event) => {
      this.logger.debug(`PTY websocket closed: ${this.info.id} (code=${event.code})`);
      this.disposeSocket();
      if (!this.closedByUser) {
        this.notifyAutoClose('socket-closed');
      }
      this.finish(event.code === 1000 ? 0 : event.code);
    });
    this.ws.addEventListener('error', (event) => {
      this.logger.warn(`PTY websocket error: ${this.info.id}`, event.error);
    });
  }

  handleInput(data: string): void {
    if (this.ws?.readyState === WEBSOCKET_OPEN) {
      this.ws.send(data);
      return;
    }

    this.pendingInput.push(data);
  }

  setDimensions(dimensions: vscode.TerminalDimensions): void {
    this.lastDimensions = dimensions;
    void this.resize(dimensions);
  }

  close(): void {
    this.closedByUser = true;
    this.disposeSocket();
  }

  dispose(): void {
    this.disposeSocket();
    this.clearResizeRetry();
    this.writeEmitter.dispose();
    this.closeEmitter.dispose();
  }

  updateInfo(info: Pty): void {
    this.info = info;
    this.applyTitle(info.title);
  }

  handleRemoteExit(exitCode: number): void {
    this.notifyAutoClose('remote-exited');
    this.disposeSocket();
    this.finish(exitCode);
  }

  handleRemoteDeleted(): void {
    this.notifyAutoClose('remote-deleted');
    this.disposeSocket();
    this.finish(0);
  }

  private async resize(dimensions: vscode.TerminalDimensions): Promise<void> {
    try {
      await this.client.updatePty(this.info.id, {
        size: {
          rows: dimensions.rows,
          cols: dimensions.columns,
        },
      });
      this.clearResizeRetry();
    } catch (error) {
      this.logger.warn(`Failed to resize PTY ${this.info.id}`, error);
      this.scheduleResizeRetry(dimensions);
    }
  }

  private async handleMessage(data: unknown): Promise<void> {
    const text = await this.toText(data);
    if (text.length > 0) {
      this.writeEmitter.fire(text);
    }
  }

  private async toText(data: unknown): Promise<string> {
    if (typeof data === 'string') {
      return data;
    }

    if (data instanceof ArrayBuffer) {
      return Buffer.from(data).toString('utf8');
    }

    if (ArrayBuffer.isView(data)) {
      return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8');
    }

    if (typeof Blob !== 'undefined' && data instanceof Blob) {
      return await data.text();
    }

    return String(data ?? '');
  }

  private flushPendingInput(): void {
    if (this.ws?.readyState !== WEBSOCKET_OPEN || this.pendingInput.length === 0) {
      return;
    }

    for (const chunk of this.pendingInput.splice(0)) {
      this.ws.send(chunk);
    }
  }

  private applyTitle(title: string): void {
    const normalizedTitle = sanitizeTitle(title || DEFAULT_PTY_TITLE);
    this.writeEmitter.fire(`\u001b]2;${normalizedTitle}\u0007`);
  }

  private notifyAutoClose(reason: PtyAutoCloseReason): void {
    if (this.autoCloseReason) {
      return;
    }

    this.autoCloseReason = reason;
    this.onAutoClose(reason);
  }

  private finish(exitCode: number | void): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.closeEmitter.fire(exitCode);
  }

  private disposeSocket(): void {
    if (!this.ws) {
      return;
    }

    const socket = this.ws;
    this.ws = null;

    try {
      socket.close();
    } catch {
      // Ignore socket disposal failures.
    }
  }

  private scheduleResizeRetry(dimensions: vscode.TerminalDimensions): void {
    this.clearResizeRetry();
    this.resizeRetryTimer = setTimeout(() => {
      this.resizeRetryTimer = null;
      if (this.closed) {
        return;
      }
      void this.resize(dimensions);
    }, PTY_RESIZE_RETRY_DELAY_MS);
  }

  private clearResizeRetry(): void {
    if (!this.resizeRetryTimer) {
      return;
    }

    clearTimeout(this.resizeRetryTimer);
    this.resizeRetryTimer = null;
  }
}

export class PtyTerminalService implements vscode.Disposable {
  private readonly subscriptions: vscode.Disposable[] = [];
  private readonly terminalsByPtyId = new Map<string, PtyTerminalEntry>();
  private readonly ptyIdByTerminal = new Map<vscode.Terminal, string>();
  private readonly programmaticCloseIds = new Set<string>();
  private readonly autoCloseReasons = new Map<string, PtyAutoCloseReason>();
  private readonly reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly reconnectAttempts = new Map<string, number>();

  constructor(
    private readonly client: OpenCodeClient,
    private readonly eventBus: EventBus,
    private readonly logger: Logger,
  ) {
    this.subscriptions.push(
      vscode.window.onDidCloseTerminal((terminal) => {
        void this.handleTerminalClosed(terminal);
      }),
      { dispose: this.eventBus.on('pty:created', (pty) => { void this.handlePtyCreated(pty); }) },
      { dispose: this.eventBus.on('pty:updated', (pty) => { void this.handlePtyUpdated(pty); }) },
      { dispose: this.eventBus.on('pty:exited', (payload) => { this.handlePtyExited(payload); }) },
      { dispose: this.eventBus.on('pty:deleted', (payload) => { this.handlePtyDeleted(payload.id); }) },
    );
  }

  async createTerminal(title?: string): Promise<vscode.Terminal> {
    const createOptions: PtyCreateOptions = {
      title: title?.trim() || DEFAULT_PTY_TITLE,
    };

    const cwd = await this.resolveDefaultCwd();
    if (cwd) {
      createOptions.cwd = cwd;
    }

    const pty = await this.client.createPty(createOptions);
    const entry = this.attachPty(pty);
    entry.terminal.show();
    this.logger.info(`Opened shared PTY terminal: ${pty.id}`);
    return entry.terminal;
  }

  async listAndReconnect(): Promise<void> {
    const ptys = await this.client.listPtys();

    for (const pty of ptys) {
      if (pty.status !== 'running' || this.terminalsByPtyId.has(pty.id)) {
        continue;
      }

      await this.attemptReconnectPty(pty);
    }
  }

  disconnectAll(): void {
    for (const [ptyId, entry] of this.terminalsByPtyId) {
      this.cancelReconnect(ptyId);
      this.programmaticCloseIds.add(ptyId);
      this.autoCloseReasons.set(ptyId, 'service-disconnect');
      entry.backend.dispose();
      entry.terminal.dispose();
      this.terminalsByPtyId.delete(ptyId);
    }

    for (const timer of this.reconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.reconnectTimers.clear();
    this.reconnectAttempts.clear();
    this.autoCloseReasons.clear();
  }

  dispose(): void {
    this.disconnectAll();
    this.terminalsByPtyId.clear();
    this.ptyIdByTerminal.clear();
    this.programmaticCloseIds.clear();
    this.autoCloseReasons.clear();
    for (const timer of this.reconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.reconnectTimers.clear();
    this.reconnectAttempts.clear();

    for (const subscription of this.subscriptions) {
      subscription.dispose();
    }
    this.subscriptions.length = 0;
  }

  private attachPty(pty: Pty): PtyTerminalEntry {
    const existing = this.terminalsByPtyId.get(pty.id);
    if (existing) {
      existing.info = pty;
      existing.backend.updateInfo(pty);
      return existing;
    }

    this.cancelReconnect(pty.id);
    this.autoCloseReasons.delete(pty.id);
    this.reconnectAttempts.delete(pty.id);
    const backend = new PtyBackedTerminal(
      pty,
      this.client.getPtyConnectUrl(pty.id),
      this.client,
      this.logger,
      (reason) => {
        this.programmaticCloseIds.add(pty.id);
        this.autoCloseReasons.set(pty.id, reason);
      },
    );
    const terminal = vscode.window.createTerminal({
      name: getTerminalName(pty),
      pty: backend,
    });
    const entry: PtyTerminalEntry = { info: pty, backend, terminal };

    this.terminalsByPtyId.set(pty.id, entry);
    this.ptyIdByTerminal.set(terminal, pty.id);
    return entry;
  }

  private async handlePtyCreated(pty: Pty): Promise<void> {
    const entry = this.attachPty(pty);
    entry.terminal.show(true);
  }

  private async handlePtyUpdated(pty: Pty): Promise<void> {
    const existing = this.terminalsByPtyId.get(pty.id);
    if (existing) {
      existing.info = pty;
      existing.backend.updateInfo(pty);
      return;
    }

    if (pty.status === 'running') {
      this.attachPty(pty);
    }
  }

  private handlePtyExited(payload: PtyExitInfo): void {
    const entry = this.terminalsByPtyId.get(payload.id);
    if (!entry) {
      return;
    }

    this.programmaticCloseIds.add(payload.id);
    this.autoCloseReasons.set(payload.id, 'remote-exited');
    entry.backend.handleRemoteExit(payload.exitCode);
  }

  private handlePtyDeleted(ptyId: string): void {
    const entry = this.terminalsByPtyId.get(ptyId);
    if (!entry) {
      return;
    }

    this.programmaticCloseIds.add(ptyId);
    this.autoCloseReasons.set(ptyId, 'remote-deleted');
    entry.backend.handleRemoteDeleted();
  }

  private async handleTerminalClosed(terminal: vscode.Terminal): Promise<void> {
    const ptyId = this.ptyIdByTerminal.get(terminal);
    if (!ptyId) {
      return;
    }

    this.ptyIdByTerminal.delete(terminal);
    const entry = this.terminalsByPtyId.get(ptyId);
    if (entry) {
      entry.backend.dispose();
      this.terminalsByPtyId.delete(ptyId);
    }

    if (this.programmaticCloseIds.delete(ptyId)) {
      const reason = this.autoCloseReasons.get(ptyId);
      this.autoCloseReasons.delete(ptyId);

      if (reason === 'socket-closed' || reason === 'runtime-unavailable') {
        this.scheduleReconnect(ptyId);
      }
      return;
    }

    this.cancelReconnect(ptyId);
    this.autoCloseReasons.delete(ptyId);
    this.reconnectAttempts.delete(ptyId);

    try {
      await this.client.removePty(ptyId);
      this.logger.info(`Closed shared PTY terminal: ${ptyId}`);
    } catch (error) {
      this.logger.warn(`Failed to remove PTY ${ptyId} after terminal close`, error);
    }
  }

  private async resolveDefaultCwd(): Promise<string | undefined> {
    try {
      const pathInfo = await this.client.getPathInfo();
      return pathInfo.directory?.trim() || pathInfo.worktree?.trim() || undefined;
    } catch (error) {
      this.logger.debug('Failed to resolve PTY working directory from server path info', error);
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder?.uri.scheme === 'file') {
      return workspaceFolder.uri.fsPath;
    }

    return undefined;
  }

  private async attemptReconnectPty(pty: Pty): Promise<void> {
    try {
      this.attachPty(pty);
      this.logger.debug(`Reconnected PTY terminal: ${pty.id}`);
    } catch (error) {
      this.logger.warn(`Failed to reconnect PTY terminal ${pty.id}`, error);
      this.scheduleReconnect(pty.id);
    }
  }

  private scheduleReconnect(ptyId: string): void {
    if (this.reconnectTimers.has(ptyId)) {
      return;
    }

    const attempts = this.reconnectAttempts.get(ptyId) ?? 0;
    if (attempts >= MAX_PTY_RECONNECT_ATTEMPTS) {
      this.logger.warn(`Giving up on reconnecting PTY terminal ${ptyId} after ${attempts} attempt(s)`);
      return;
    }

    const nextAttempt = attempts + 1;
    const delay = PTY_RECONNECT_BASE_DELAY_MS * nextAttempt;
    this.reconnectAttempts.set(ptyId, nextAttempt);
    this.logger.warn(`Retrying PTY terminal ${ptyId} in ${delay}ms (attempt ${nextAttempt}/${MAX_PTY_RECONNECT_ATTEMPTS})`);

    const timer = setTimeout(() => {
      this.reconnectTimers.delete(ptyId);
      void this.reconnectById(ptyId);
    }, delay);
    this.reconnectTimers.set(ptyId, timer);
  }

  private async reconnectById(ptyId: string): Promise<void> {
    try {
      const pty = await this.client.getPty(ptyId);
      if (pty.status !== 'running') {
        this.autoCloseReasons.delete(ptyId);
        this.reconnectAttempts.delete(ptyId);
        return;
      }

      this.attachPty(pty);
      this.autoCloseReasons.delete(ptyId);
      this.reconnectAttempts.delete(ptyId);
      this.logger.info(`Restored shared PTY terminal: ${ptyId}`);
    } catch (error) {
      this.logger.warn(`Failed to restore PTY terminal ${ptyId}`, error);
      this.scheduleReconnect(ptyId);
    }
  }

  private cancelReconnect(ptyId: string): void {
    const timer = this.reconnectTimers.get(ptyId);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(ptyId);
    }
  }
}

function getTerminalName(pty: Pty): string {
  return pty.title?.trim() || pty.command?.trim() || DEFAULT_PTY_TITLE;
}

function sanitizeTitle(title: string): string {
  return title.replace(/[\u0007\u001b]/gu, '');
}
