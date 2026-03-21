import * as vscode from 'vscode';
import { ServerManager, OpenCodeClient, EventBus, Logger } from './services';
import type { ServerEvent } from './services/openCodeClient';
import {
  ChatViewProvider,
  SessionTreeProvider,
  StatusTreeProvider,
  SettingsViewProvider,
  SessionEditorPanelProvider,
} from './providers';
import { StatusBarManager, SessionManager } from './managers';
import { registerCommands, type CommandContext } from './commands';
import type {
  Session,
  SessionStatus,
  MessageWithParts,
  Part,
  PermissionRequest,
  Question,
  OpenCodeConfig,
  Todo,
} from './types/opencode';

// ---------------------------------------------------------------------------
// Module-level references for deactivate()
// ---------------------------------------------------------------------------
let logger: Logger | undefined;
let eventBus: EventBus | undefined;
let serverManager: ServerManager | undefined;
let client: OpenCodeClient | undefined;
let statusBarManager: StatusBarManager | undefined;
let editorPanelProviderRef: SessionEditorPanelProvider | undefined;
let sseAbort: AbortController | undefined;
let sseStreamActive = false;
let eventUnsubscribers: Array<() => void> = [];

// ---------------------------------------------------------------------------
// activate
// ---------------------------------------------------------------------------

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // 1. Create Logger
  logger = new Logger('OpenCode');
  context.subscriptions.push(logger);
  logger.info('OpenCode for VSCode is activating…');

  // 2. Create EventBus
  eventBus = new EventBus();

  // 3. Create ServerManager
  serverManager = new ServerManager(context, eventBus, logger);
  context.subscriptions.push(serverManager);

  // 4. Create OpenCodeClient
  client = new OpenCodeClient();
  client.setLogger(logger);
  client.configureAuthFromEnv();

  // 5. Register providers
  const chatProvider = new ChatViewProvider(context.extensionUri);
  chatProvider.setClient(client);
  chatProvider.setLogger(logger);
  const sessionProvider = new SessionTreeProvider(eventBus);
  const statusProvider = new StatusTreeProvider(eventBus);
  const settingsProvider = new SettingsViewProvider(context.extensionUri);
  settingsProvider.setClient(client);
  settingsProvider.setLogger(logger);

  const editorPanelProvider = new SessionEditorPanelProvider(context.extensionUri);
  editorPanelProvider.setClient(client);
  editorPanelProvider.setLogger(logger);
  editorPanelProviderRef = editorPanelProvider;

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ChatViewProvider.viewType,
      chatProvider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  context.subscriptions.push(
    vscode.window.createTreeView('opencode.sessions', {
      treeDataProvider: sessionProvider,
      showCollapseAll: false,
    })
  );

  context.subscriptions.push(
    vscode.window.createTreeView('opencode.status', {
      treeDataProvider: statusProvider,
      showCollapseAll: true,
    })
  );

  // 6. Create status bar manager
  statusBarManager = new StatusBarManager();
  context.subscriptions.push(statusBarManager);

  // 7. Create session manager (coordinates session switching + sync)
  const sessionManager = new SessionManager(client, eventBus, sessionProvider, chatProvider, logger);
  context.subscriptions.push(sessionManager);

  // 8. Build command context and register commands
  const cmdCtx: CommandContext = {
    serverManager,
    client,
    eventBus,
    logger,
    chatProvider,
    sessionProvider,
    statusProvider,
    settingsProvider,
    editorPanelProvider,
    statusBarManager,
    sessionManager,
    activeSessionId: undefined,
  };
  registerCommands(context, cmdCtx);

  // 9. Set initial context values
  vscode.commands.executeCommand('setContext', 'opencode.serverConnected', false);
  vscode.commands.executeCommand('setContext', 'opencode.sessionBusy', false);

  // 10. Subscribe to EventBus events (extension-internal routing)
  subscribeToEvents(cmdCtx);

  // 11. Listen to VSCode configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      handleConfigChange(e, cmdCtx);
    })
  );

  // 11b. Listen to workspace folder changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(e => {
      handleWorkspaceFolderChange(e, cmdCtx);
    })
  );

  // 12. Listen to VSCode color theme changes and forward to webview
  context.subscriptions.push(
    vscode.window.onDidChangeActiveColorTheme(theme => {
      const kind: 'light' | 'dark' | 'highContrast' =
        theme.kind === vscode.ColorThemeKind.Light ||
        theme.kind === vscode.ColorThemeKind.HighContrastLight
          ? 'light'
          : theme.kind === vscode.ColorThemeKind.HighContrast
            ? 'highContrast'
            : 'dark';
      const themeMessage = {
        type: 'theme:changed' as const,
        data: { kind },
      };
      chatProvider.postMessage(themeMessage);
      editorPanelProvider.broadcastMessage(themeMessage);
      settingsProvider.postMessage({
        type: 'theme:changed',
        data: { kind },
      });
      logger?.debug(`Theme changed to ${kind} (kind=${theme.kind})`);
    })
  );

  // 13. Auto-start server if configured
  const autoStart = vscode.workspace
    .getConfiguration('opencode.server')
    .get<boolean>('autoStart', true);

  if (autoStart) {
    logger.info('Auto-starting OpenCode server…');
    statusBarManager.setConnecting();
    serverManager.start().then(
      () => onServerStarted(cmdCtx),
      (err) => {
        logger?.error('Auto-start failed', err);
        statusBarManager?.setDisconnected();
      }
    );
  }

  logger.info('OpenCode for VSCode activated.');
}

// ---------------------------------------------------------------------------
// deactivate
// ---------------------------------------------------------------------------

export async function deactivate(): Promise<void> {
  logger?.info('OpenCode for VSCode is deactivating…');

  // Cancel SSE stream
  if (sseAbort) {
    sseAbort.abort();
    sseAbort = undefined;
  }
  sseStreamActive = false;

  // Unsubscribe all EventBus listeners
  for (const unsub of eventUnsubscribers) {
    try { unsub(); } catch { /* ignore */ }
  }
  eventUnsubscribers = [];

  // Clean up EventBus
  eventBus?.removeAllListeners();

  // Dispose all editor panels
  editorPanelProviderRef?.disposeAll();
  editorPanelProviderRef = undefined;

  // ServerManager and Logger are disposed via context.subscriptions
  logger?.info('OpenCode for VSCode deactivated.');
}

// ---------------------------------------------------------------------------
// Server started callback
// ---------------------------------------------------------------------------

async function onServerStarted(ctx: CommandContext): Promise<void> {
  // Verify the server is still running before connecting
  if (!ctx.serverManager.isRunning()) {
    ctx.logger.warn('Server no longer running when onServerStarted fired — aborting');
    return;
  }

  try {
    // Point the client at the running server
    ctx.client.setBaseUrl(ctx.serverManager.getBaseUrl());

    // Verify connectivity via health check
    const health = await ctx.client.health();
    ctx.statusBarManager.setConnected(health.version);
    vscode.commands.executeCommand('setContext', 'opencode.serverConnected', true);

    ctx.eventBus.emit('server:connected', { version: health.version });
    ctx.statusProvider.setServerInfo({
      connected: true,
      version: health.version,
      url: ctx.serverManager.getBaseUrl(),
    });
    ctx.logger.info(`Connected to OpenCode server v${health.version}`);

    // Load initial data
    await loadInitialData(ctx);

    // Start SSE event stream
    startEventStream(ctx);
  } catch (err) {
    ctx.logger.error('Failed to connect after server start', err);
    ctx.statusBarManager.setDisconnected();
    vscode.commands.executeCommand('setContext', 'opencode.serverConnected', false);
  }
}

// ---------------------------------------------------------------------------
// Load initial data from the server
// ---------------------------------------------------------------------------

async function loadInitialData(ctx: CommandContext): Promise<void> {
  try {
    // Load sessions
    const sessions = await ctx.client.listSessions();
    ctx.sessionProvider.setSessions(sessions);

    // Load config (model info)
    const config = await ctx.client.getConfig();
    if (config.model) {
      const parts = config.model.split('/');
      if (parts.length === 2) {
        ctx.statusBarManager.setModel(parts[0], parts[1]);
      }
    }

    // Send config to chat webview so it knows the current model/agent on startup
    ctx.chatProvider.postMessageToWebview({ type: 'config:updated', data: config });

    ctx.statusProvider.refresh();
    ctx.logger.debug(`Loaded ${sessions.length} sessions`);
  } catch (err) {
    ctx.logger.error('Failed to load initial data', err);
  }

  // Load agents (separate try-catch so failure doesn't break session/config loading)
  try {
    const agents = await ctx.client.listAgents();
    ctx.chatProvider.postMessageToWebview({ type: 'agents:updated', data: agents });
    ctx.logger.debug(`Loaded ${agents.length} agents`);
  } catch (err) {
    ctx.logger.error('Failed to load agents', err);
  }
}

// ---------------------------------------------------------------------------
// SSE event stream
// ---------------------------------------------------------------------------

async function startEventStream(ctx: CommandContext): Promise<void> {
  try {
    // Abort previous stream if any
    if (sseAbort) {
      sseAbort.abort();
      sseAbort = undefined;
    }

    // Wait for previous stream to finish cleanup
    if (sseStreamActive) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    sseStreamActive = true;

    sseAbort = ctx.client.subscribeToEvents(
      (event: ServerEvent) => {
        routeSSEEvent(ctx, event);
      },
      {
        onReconnected: () => {
          ctx.logger.info('SSE reconnected — refreshing all data');
          void handleSSEReconnect(ctx);
        },
      },
    );

    ctx.logger.debug('SSE event stream started');
  } catch (err) {
    sseStreamActive = false;
    ctx.logger.error('Failed to start SSE event stream', err);
  }
}

/**
 * Called when the SSE stream reconnects after a disconnect.
 * Re-fetches all data to ensure the UI reflects the current server state.
 * Guarded against concurrent calls from rapid reconnections.
 */
let sseReconnectRefreshing = false;
async function handleSSEReconnect(ctx: CommandContext): Promise<void> {
  if (sseReconnectRefreshing) {
    ctx.logger.debug('SSE reconnect refresh already in progress — skipping');
    return;
  }
  sseReconnectRefreshing = true;
  try {
    await loadInitialData(ctx);
    ctx.logger.info('SSE reconnect data refresh completed');
  } catch (err) {
    ctx.logger.error('Failed to refresh data after SSE reconnect', err);
  } finally {
    sseReconnectRefreshing = false;
  }
}

function normalizeMessageUpdatedPayload(
  properties: Record<string, unknown>
): MessageWithParts | undefined {
  const payload = properties as Partial<MessageWithParts>;
  if (!payload.info) {
    return undefined;
  }

  return {
    info: payload.info,
    parts: Array.isArray(payload.parts) ? payload.parts : [],
  };
}

function normalizeMessagePartUpdatedPayload(
  properties: Record<string, unknown>
): { sessionID: string; messageID: string; part: Part } | undefined {
  const payload = properties as {
    sessionID?: string;
    messageID?: string;
    part?: Part;
  };

  if (!payload.part) {
    return undefined;
  }

  const partWithIDs = payload.part as Part & {
    sessionID?: string;
    messageID?: string;
  };

  const sessionID = partWithIDs.sessionID ?? payload.sessionID;
  const messageID = partWithIDs.messageID ?? payload.messageID;

  if (!sessionID || !messageID) {
    return undefined;
  }

  return {
    sessionID,
    messageID,
    part: payload.part,
  };
}

function normalizeSessionStatusPayload(
  properties: Record<string, unknown>
): { sessionID: string; status: SessionStatus } | undefined {
  const payload = properties as {
    sessionID?: string;
    status?: SessionStatus | Record<string, unknown>;
  };

  if (!payload.sessionID || !payload.status || typeof payload.status !== 'object') {
    return undefined;
  }

  const status = payload.status as Record<string, unknown>;
  if (typeof status.status === 'string') {
    return {
      sessionID: payload.sessionID,
      status: payload.status as SessionStatus,
    };
  }

  const message =
    typeof status.message === 'string'
      ? status.message
      : typeof status.error === 'string'
        ? status.error
        : undefined;
  const type = typeof status.type === 'string' ? status.type : undefined;

  switch (type) {
    case 'busy':
      return {
        sessionID: payload.sessionID,
        status: { status: 'active' },
      };

    case 'idle':
      return {
        sessionID: payload.sessionID,
        status: { status: 'idle' },
      };

    case 'retry':
      return {
        sessionID: payload.sessionID,
        status: { status: 'retry', error: message },
      };

    case 'active':
    case 'error':
    case 'compacting':
      return {
        sessionID: payload.sessionID,
        status: { status: type, error: message },
      };

    default:
      return undefined;
  }
}

/**
 * Route an incoming SSE event to the correct EventBus event and webview messages.
 */
function routeSSEEvent(ctx: CommandContext, event: ServerEvent): void {
  const { type, properties } = event;
  ctx.logger.debug(`SSE event: ${type}`);

  switch (type) {
    case 'session.created': {
      const session = properties as unknown as Session;
      if (!session?.id) { break; }
      ctx.activeSessionId = session.id;
      ctx.eventBus.emit('session:created', session);
      ctx.chatProvider.postMessageToWebview({ type: 'session:created', data: session });
      ctx.editorPanelProvider.routeSessionMessage(session.id, { type: 'session:created', data: session });
      refreshSessionsQuietly(ctx);
      break;
    }

    case 'session.updated': {
      const session = properties as unknown as Session;
      if (!session?.id) { break; }
      ctx.eventBus.emit('session:updated', session);
      ctx.chatProvider.postMessageToWebview({ type: 'session:updated', data: session });
      ctx.editorPanelProvider.routeSessionMessage(session.id, { type: 'session:updated', data: session });
      refreshSessionsQuietly(ctx);
      break;
    }

    case 'session.deleted': {
      const payload = properties as unknown as { id: string };
      if (!payload?.id) { break; }
      ctx.eventBus.emit('session:deleted', payload);
      ctx.chatProvider.postMessageToWebview({ type: 'session:deleted', data: payload });
      ctx.editorPanelProvider.routeSessionMessage(payload.id, { type: 'session:deleted', data: payload });
      if (ctx.activeSessionId === payload.id) {
        ctx.activeSessionId = undefined;
      }
      refreshSessionsQuietly(ctx);
      break;
    }

    case 'session.status': {
      const status = normalizeSessionStatusPayload(properties);
      if (!status?.sessionID || !status?.status) { break; }
      ctx.eventBus.emit('session:status', status);
      ctx.chatProvider.postMessageToWebview({ type: 'session:status', data: status });
      ctx.editorPanelProvider.routeSessionMessage(status.sessionID, { type: 'session:status', data: status });

      const busy = status.status.status === 'active';
      vscode.commands.executeCommand('setContext', 'opencode.sessionBusy', busy);
      ctx.statusBarManager.setBusy(busy);

      break;
    }

    case 'message.updated': {
      const msg = normalizeMessageUpdatedPayload(properties);
      if (!msg) { break; }
      ctx.eventBus.emit('message:updated', msg);
      ctx.chatProvider.postMessageToWebview({ type: 'message:updated', data: msg });
      ctx.editorPanelProvider.routeSessionMessage(msg.info.sessionID, { type: 'message:updated', data: msg });

      // Update token usage from assistant messages
      if (msg.info.role === 'assistant' && 'tokens' in msg.info && msg.info.tokens) {
        ctx.statusBarManager.setTokenUsage(msg.info.tokens);
      }
      break;
    }

    case 'message.part.updated': {
      const part = normalizeMessagePartUpdatedPayload(properties);
      if (!part) { break; }
      ctx.eventBus.emit('message:partUpdated', part);
      ctx.chatProvider.postMessageToWebview({ type: 'message:partUpdated', data: part });
      ctx.editorPanelProvider.routeSessionMessage(part.sessionID, { type: 'message:partUpdated', data: part });
      break;
    }

    case 'message.part.delta': {
      const delta = properties as unknown as {
        sessionID: string;
        messageID: string;
        partID: string;
        field?: string;
        delta: string;
      };
      if (!delta?.sessionID || !delta?.messageID || !delta?.partID || typeof delta.delta !== 'string') {
        break;
      }
      ctx.eventBus.emit('message:partDelta', delta);
      ctx.chatProvider.postMessageToWebview({ type: 'message:partDelta', data: delta });
      ctx.editorPanelProvider.routeSessionMessage(delta.sessionID, { type: 'message:partDelta', data: delta });
      break;
    }

    case 'message.removed': {
      const removed = properties as unknown as { sessionID: string; messageID: string };
      if (!removed?.sessionID || !removed?.messageID) { break; }
      ctx.eventBus.emit('message:removed', removed);
      ctx.chatProvider.postMessageToWebview({ type: 'message:removed', data: removed });
      ctx.editorPanelProvider.routeSessionMessage(removed.sessionID, { type: 'message:removed', data: removed });
      break;
    }

    case 'permission.asked': {
      const perm = properties as unknown as PermissionRequest;
      if (!perm?.id) { break; }
      ctx.eventBus.emit('permission:asked', perm);
      ctx.chatProvider.postMessageToWebview({ type: 'permission:asked', data: perm });
      // Permission requests may carry a sessionID in the raw payload
      const permSessionID = (properties as Record<string, unknown>).sessionID;
      if (typeof permSessionID === 'string') {
        ctx.editorPanelProvider.routeSessionMessage(permSessionID, { type: 'permission:asked', data: perm });
      }
      break;
    }

    case 'question.asked': {
      const question = properties as unknown as Question;
      if (!question?.id) { break; }
      ctx.eventBus.emit('question:asked', question);
      ctx.chatProvider.postMessageToWebview({ type: 'question:asked', data: question });
      // Question events may carry a sessionID in the raw payload
      const questionSessionID = (properties as Record<string, unknown>).sessionID;
      if (typeof questionSessionID === 'string') {
        ctx.editorPanelProvider.routeSessionMessage(questionSessionID, { type: 'question:asked', data: question });
      }
      break;
    }

    case 'config.updated': {
      const config = properties as unknown as OpenCodeConfig;
      if (!config) { break; }
      ctx.eventBus.emit('config:updated', config);
      ctx.chatProvider.postMessageToWebview({ type: 'config:updated', data: config });
      ctx.editorPanelProvider.broadcastMessage({ type: 'config:updated', data: config });
      break;
    }

    case 'todo.updated': {
      const todos = properties as unknown as { sessionID: string; todos: Todo[] };
      if (!todos?.sessionID) { break; }
      ctx.eventBus.emit('todo:updated', todos);
      ctx.chatProvider.postMessageToWebview({ type: 'todos:updated', data: todos.todos });
      ctx.editorPanelProvider.routeSessionMessage(todos.sessionID, { type: 'todos:updated', data: todos.todos });
      break;
    }

    case 'file.edited': {
      const file = properties as unknown as { path: string; content: string };
      if (!file?.path) { break; }
      ctx.eventBus.emit('file:edited', file);
      break;
    }

    case 'mcp.tools.changed': {
      ctx.logger.debug('MCP tools changed, refreshing MCP status');
      // Refresh status tree to show updated MCP info
      ctx.statusProvider.refresh();
      // Forward to settings webview if it's open
      ctx.settingsProvider.refreshMCPStatus();
      break;
    }

    default:
      ctx.logger.debug(`Unhandled SSE event type: ${type}`);
  }
}

/** Refresh session tree without showing errors (best-effort). */
async function refreshSessionsQuietly(ctx: CommandContext): Promise<void> {
  try {
    const [sessions, statuses] = await Promise.all([
      ctx.client.listSessions(),
      ctx.client.getSessionStatus(),
    ]);
    ctx.sessionProvider.setSessions(sessions, statuses);
  } catch {
    // Silently ignore — the tree will be stale but that's acceptable
  }
}

// ---------------------------------------------------------------------------
// EventBus subscriptions (extension-internal routing)
// ---------------------------------------------------------------------------

function subscribeToEvents(ctx: CommandContext): void {
  // When server connects, update status bar + context
  eventUnsubscribers.push(
    ctx.eventBus.on('server:connected', ({ version }) => {
      ctx.statusBarManager.setConnected(version);
      vscode.commands.executeCommand('setContext', 'opencode.serverConnected', true);
      const serverStatusMsg = {
        type: 'server:status' as const,
        data: { connected: true, version },
      };
      ctx.chatProvider.postMessageToWebview(serverStatusMsg);
      ctx.editorPanelProvider.broadcastMessage(serverStatusMsg);
    })
  );

  // When server disconnects, update status bar + context
  eventUnsubscribers.push(
    ctx.eventBus.on('server:disconnected', () => {
      ctx.statusBarManager.setDisconnected();
      vscode.commands.executeCommand('setContext', 'opencode.serverConnected', false);
      vscode.commands.executeCommand('setContext', 'opencode.sessionBusy', false);
      const serverStatusMsg = {
        type: 'server:status' as const,
        data: { connected: false },
      };
      ctx.chatProvider.postMessageToWebview(serverStatusMsg);
      ctx.editorPanelProvider.broadcastMessage(serverStatusMsg);
    })
  );

  // Config update — update model in status bar
  eventUnsubscribers.push(
    ctx.eventBus.on('config:updated', (config) => {
      if (config.model) {
        const parts = config.model.split('/');
        if (parts.length === 2) {
          ctx.statusBarManager.setModel(parts[0], parts[1]);
        }
      }
    })
  );
}

// ---------------------------------------------------------------------------
// Configuration change handler
// ---------------------------------------------------------------------------

function handleConfigChange(
  e: vscode.ConfigurationChangeEvent,
  ctx: CommandContext
): void {
  // Server settings changed
  if (e.affectsConfiguration('opencode.server')) {
    ctx.logger.info('Server configuration changed');
    if (
      e.affectsConfiguration('opencode.server.hostname') ||
      e.affectsConfiguration('opencode.server.port') ||
      e.affectsConfiguration('opencode.server.executablePath')
    ) {
      vscode.window
        .showInformationMessage(
          'OpenCode server settings changed. Restart the server to apply?',
          'Restart Server'
        )
        .then(choice => {
          if (choice === 'Restart Server') {
            vscode.commands.executeCommand('opencode.restartServer');
          }
        });
    }
  }

  // Debug mode changed
  if (e.affectsConfiguration('opencode.debug')) {
    const debug = vscode.workspace
      .getConfiguration('opencode')
      .get<boolean>('debug', false);
    ctx.logger.setDebug(debug);
    ctx.logger.info(`Debug mode ${debug ? 'enabled' : 'disabled'}`);
  }
}

// ---------------------------------------------------------------------------
// Workspace folder change handler
// ---------------------------------------------------------------------------

function handleWorkspaceFolderChange(
  _e: vscode.WorkspaceFoldersChangeEvent,
  ctx: CommandContext,
): void {
  const newFolder = vscode.workspace.workspaceFolders?.[0];
  if (!newFolder || newFolder.uri.scheme !== 'file') {
    return; // No local workspace folder — ignore
  }

  if (!ctx.serverManager.isRunning()) {
    ctx.logger.debug('Workspace folder changed but server is not running — will use new CWD on next start');
    return;
  }

  const currentCwd = ctx.serverManager.getRunningCwd();
  const newCwd = newFolder.uri.fsPath;

  if (!currentCwd || currentCwd === newCwd) {
    return; // Same folder or no recorded CWD — no change needed
  }

  ctx.logger.info(`Workspace folder changed: "${currentCwd}" → "${newCwd}"`);

  vscode.window
    .showInformationMessage(
      `Workspace changed to "${newFolder.name}". Restart OpenCode server in the new directory?`,
      'Restart Server',
    )
    .then(choice => {
      if (choice === 'Restart Server') {
        vscode.commands.executeCommand('opencode.restartServer');
      }
    });
}
