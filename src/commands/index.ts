import * as vscode from 'vscode';
import type { ServerManager } from '../services/serverManager';
import type { OpenCodeClient } from '../services/openCodeClient';
import type { EventBus } from '../services/eventBus';
import type { Logger } from '../services/logger';
import type { ChatViewProvider } from '../providers/chatViewProvider';
import type { SessionTreeProvider } from '../providers/sessionTreeProvider';
import type { StatusTreeProvider } from '../providers/statusTreeProvider';
import type { SettingsViewProvider } from '../providers/settingsViewProvider';
import type { StatusBarManager } from '../managers/statusBarManager';
import type { SessionManager } from '../managers/sessionManager';

/**
 * Services and providers needed by command handlers.
 */
export interface CommandContext {
  serverManager: ServerManager;
  client: OpenCodeClient;
  eventBus: EventBus;
  logger: Logger;
  chatProvider: ChatViewProvider;
  sessionProvider: SessionTreeProvider;
  statusProvider: StatusTreeProvider;
  settingsProvider: SettingsViewProvider;
  statusBarManager: StatusBarManager;
  sessionManager: SessionManager;
  /** Track the currently active session ID. */
  activeSessionId: string | undefined;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Check that the server is connected; show an error and return false if not. */
function requireConnected(ctx: CommandContext): boolean {
  if (!ctx.serverManager.isRunning()) {
    vscode.window.showWarningMessage(
      'OpenCode server is not running. Start the server first.',
      'Start Server'
    ).then(choice => {
      if (choice === 'Start Server') {
        vscode.commands.executeCommand('opencode.startServer');
      }
    });
    return false;
  }
  return true;
}

/** Guard: server connected + active session required. */
function requireSession(ctx: CommandContext): string | undefined {
  if (!requireConnected(ctx)) {
    return undefined;
  }
  if (!ctx.activeSessionId) {
    vscode.window.showWarningMessage('No active session. Create or select a session first.');
    return undefined;
  }
  return ctx.activeSessionId;
}

// ---------------------------------------------------------------------------
// Command implementations
// ---------------------------------------------------------------------------

async function newSession(ctx: CommandContext): Promise<void> {
  if (!requireConnected(ctx)) { return; }
  try {
    const session = await ctx.client.createSession();
    ctx.activeSessionId = session.id;
    ctx.eventBus.emit('session:created', session);
    // Refresh tree with fresh data from server
    const sessions = await ctx.client.listSessions();
    ctx.sessionProvider.setSessions(sessions);
    ctx.logger.info(`Created new session: ${session.id}`);
  } catch (err) {
    ctx.logger.error('Failed to create session', err);
    vscode.window.showErrorMessage(`Failed to create session: ${errorMessage(err)}`);
  }
}

async function deleteSession(ctx: CommandContext, sessionId?: string): Promise<void> {
  if (!requireConnected(ctx)) { return; }

  const id = sessionId ?? ctx.activeSessionId;
  if (!id) {
    vscode.window.showWarningMessage('No session selected to delete.');
    return;
  }

  const confirm = await vscode.window.showWarningMessage(
    'Are you sure you want to delete this session? This cannot be undone.',
    { modal: true },
    'Delete'
  );
  if (confirm !== 'Delete') { return; }

  try {
    await ctx.client.deleteSession(id);
    if (ctx.activeSessionId === id) {
      ctx.activeSessionId = undefined;
    }
    ctx.eventBus.emit('session:deleted', { id });
    const sessions = await ctx.client.listSessions();
    ctx.sessionProvider.setSessions(sessions);
    ctx.logger.info(`Deleted session: ${id}`);
  } catch (err) {
    ctx.logger.error('Failed to delete session', err);
    vscode.window.showErrorMessage(`Failed to delete session: ${errorMessage(err)}`);
  }
}

async function refreshSessions(ctx: CommandContext): Promise<void> {
  if (!requireConnected(ctx)) { return; }
  try {
    const sessions = await ctx.client.listSessions();
    ctx.sessionProvider.setSessions(sessions);
    ctx.logger.debug(`Refreshed sessions: ${sessions.length} found`);
  } catch (err) {
    ctx.logger.error('Failed to refresh sessions', err);
    vscode.window.showErrorMessage(`Failed to refresh sessions: ${errorMessage(err)}`);
  }
}

async function switchSession(ctx: CommandContext, sessionId?: unknown): Promise<void> {
  if (!requireConnected(ctx)) { return; }

  if (typeof sessionId !== 'string' || sessionId.trim() === '') {
    vscode.window.showWarningMessage('No session selected to switch.');
    return;
  }

  const id = sessionId.trim();
  await ctx.sessionManager.setActiveSession(id);
  ctx.activeSessionId = id;
  focusChat(ctx);
}

async function forkSession(ctx: CommandContext): Promise<void> {
  const sessionId = requireSession(ctx);
  if (!sessionId) { return; }

  try {
    const forked = await ctx.client.forkSession(sessionId);
    ctx.activeSessionId = forked.id;
    ctx.eventBus.emit('session:created', forked);
    const sessions = await ctx.client.listSessions();
    ctx.sessionProvider.setSessions(sessions);
    ctx.logger.info(`Forked session ${sessionId} → ${forked.id}`);
    vscode.window.showInformationMessage('Session forked successfully.');
  } catch (err) {
    ctx.logger.error('Failed to fork session', err);
    vscode.window.showErrorMessage(`Failed to fork session: ${errorMessage(err)}`);
  }
}

async function shareSession(ctx: CommandContext): Promise<void> {
  const sessionId = requireSession(ctx);
  if (!sessionId) { return; }

  try {
    const result = await ctx.client.shareSession(sessionId);
    const url = result.share?.url;
    if (url) {
      await vscode.env.clipboard.writeText(url);
      vscode.window.showInformationMessage('Share URL copied to clipboard.');
      ctx.logger.info(`Shared session ${sessionId}: ${url}`);
    } else {
      vscode.window.showInformationMessage('Session shared, but no URL was returned.');
    }
  } catch (err) {
    ctx.logger.error('Failed to share session', err);
    vscode.window.showErrorMessage(`Failed to share session: ${errorMessage(err)}`);
  }
}

async function abortSession(ctx: CommandContext): Promise<void> {
  const sessionId = requireSession(ctx);
  if (!sessionId) { return; }

  try {
    await ctx.client.abortSession(sessionId);
    vscode.commands.executeCommand('setContext', 'opencode.sessionBusy', false);
    ctx.statusBarManager.setBusy(false);
    ctx.logger.info(`Aborted session ${sessionId}`);
  } catch (err) {
    ctx.logger.error('Failed to abort session', err);
    vscode.window.showErrorMessage(`Failed to abort session: ${errorMessage(err)}`);
  }
}

async function undoMessage(ctx: CommandContext): Promise<void> {
  const sessionId = requireSession(ctx);
  if (!sessionId) { return; }

  try {
    const messages = await ctx.client.listMessages(sessionId);
    if (messages.length === 0) {
      vscode.window.showInformationMessage('No messages to undo.');
      return;
    }
    // Revert to the last message
    const lastMsg = messages[messages.length - 1];
    await ctx.client.revertSession(sessionId, lastMsg.info.id);
    ctx.logger.info(`Reverted last message in session ${sessionId}`);
  } catch (err) {
    ctx.logger.error('Failed to undo message', err);
    vscode.window.showErrorMessage(`Failed to undo message: ${errorMessage(err)}`);
  }
}

async function redoMessage(ctx: CommandContext): Promise<void> {
  const sessionId = requireSession(ctx);
  if (!sessionId) { return; }

  try {
    await ctx.client.unrevertSession(sessionId);
    ctx.logger.info(`Unreverted session ${sessionId}`);
  } catch (err) {
    ctx.logger.error('Failed to redo message', err);
    vscode.window.showErrorMessage(`Failed to redo message: ${errorMessage(err)}`);
  }
}

async function startServer(ctx: CommandContext): Promise<void> {
  if (ctx.serverManager.isRunning()) {
    vscode.window.showInformationMessage('OpenCode server is already running.');
    return;
  }

  try {
    ctx.statusBarManager.setConnecting();
    await ctx.serverManager.start();
    ctx.logger.info('Server started');
  } catch (err) {
    ctx.logger.error('Failed to start server', err);
    ctx.statusBarManager.setDisconnected();
    vscode.window.showErrorMessage(`Failed to start server: ${errorMessage(err)}`);
  }
}

async function stopServer(ctx: CommandContext): Promise<void> {
  if (!ctx.serverManager.isRunning()) {
    vscode.window.showInformationMessage('OpenCode server is not running.');
    return;
  }

  const confirm = await vscode.window.showWarningMessage(
    'Stop the OpenCode server? Active sessions will be interrupted.',
    { modal: true },
    'Stop'
  );
  if (confirm !== 'Stop') { return; }

  try {
    await ctx.serverManager.stop();
    ctx.statusBarManager.setDisconnected();
    vscode.commands.executeCommand('setContext', 'opencode.serverConnected', false);
    vscode.commands.executeCommand('setContext', 'opencode.sessionBusy', false);
    ctx.logger.info('Server stopped');
  } catch (err) {
    ctx.logger.error('Failed to stop server', err);
    vscode.window.showErrorMessage(`Failed to stop server: ${errorMessage(err)}`);
  }
}

async function restartServer(ctx: CommandContext): Promise<void> {
  try {
    ctx.statusBarManager.setConnecting();
    await ctx.serverManager.restart();
    ctx.logger.info('Server restarted');
  } catch (err) {
    ctx.logger.error('Failed to restart server', err);
    ctx.statusBarManager.setDisconnected();
    vscode.window.showErrorMessage(`Failed to restart server: ${errorMessage(err)}`);
  }
}

async function selectModel(ctx: CommandContext): Promise<void> {
  if (!requireConnected(ctx)) { return; }

  try {
    const response = await ctx.client.getProviders();
    const items: (vscode.QuickPickItem & { _providerID: string; _modelID: string })[] = [];

    for (const provider of response.providers) {
      for (const model of Object.values(provider.models)) {
        items.push({
          label: `$(symbol-enum) ${model.name || model.id}`,
          description: provider.name || provider.id,
          detail: [
            model.capabilities?.reasoning ? '$(lightbulb) Reasoning' : '',
            model.capabilities?.attachment ? '$(file-media) Attachments' : '',
            model.limit ? `Context: ${(model.limit.context / 1000).toFixed(0)}k` : '',
          ].filter(Boolean).join('  ') || undefined,
          _providerID: provider.id,
          _modelID: model.id,
        });
      }
    }

    if (items.length === 0) {
      vscode.window.showInformationMessage('No models available.');
      return;
    }

    const pick = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a model',
      matchOnDescription: true,
      matchOnDetail: true,
    });

    if (pick) {
      await ctx.client.updateConfig({ model: `${pick._providerID}/${pick._modelID}` });
      ctx.statusBarManager.setModel(pick._providerID, pick._modelID);
      ctx.logger.info(`Selected model: ${pick._providerID}/${pick._modelID}`);
    }
  } catch (err) {
    ctx.logger.error('Failed to select model', err);
    vscode.window.showErrorMessage(`Failed to load models: ${errorMessage(err)}`);
  }
}

async function selectAgent(ctx: CommandContext): Promise<void> {
  if (!requireConnected(ctx)) { return; }

  try {
    const agents = await ctx.client.listAgents();

    if (agents.length === 0) {
      vscode.window.showInformationMessage('No agents available.');
      return;
    }

    const items: (vscode.QuickPickItem & { _agentId: string })[] = agents.map(agent => ({
      label: agent.name || agent.id,
      description: agent.id,
      detail: agent.description,
      _agentId: agent.id,
    }));

    const pick = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select an agent',
    });

    if (pick) {
      await ctx.client.updateConfig({ agent: pick._agentId });
      ctx.logger.info(`Selected agent: ${pick._agentId}`);
    }
  } catch (err) {
    ctx.logger.error('Failed to select agent', err);
    vscode.window.showErrorMessage(`Failed to load agents: ${errorMessage(err)}`);
  }
}

function openSettings(ctx: CommandContext): void {
  ctx.settingsProvider.show();
}

async function addFileToPrompt(ctx: CommandContext): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('No active editor. Open a file first.');
    return;
  }

  const filePath = editor.document.uri.fsPath;
  const content = editor.document.getText();
  const fileName = editor.document.fileName.split(/[\\/]/).pop() ?? filePath;

  // Send to the chat provider via postMessage
  ctx.chatProvider.postMessageToWebview({
    type: 'file:added',
    data: { path: filePath, name: fileName, content },
  });
  ctx.logger.debug(`Added file to prompt: ${filePath}`);
  vscode.window.showInformationMessage(`Added ${fileName} to prompt.`);
}

async function addSelectionToPrompt(ctx: CommandContext): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.selection.isEmpty) {
    vscode.window.showWarningMessage('No text selected.');
    return;
  }

  const selection = editor.document.getText(editor.selection);
  const filePath = editor.document.uri.fsPath;
  const fileName = editor.document.fileName.split(/[\\/]/).pop() ?? filePath;
  const startLine = editor.selection.start.line + 1;
  const endLine = editor.selection.end.line + 1;

  ctx.chatProvider.postMessageToWebview({
    type: 'selection:added',
    data: {
      path: filePath,
      name: fileName,
      content: selection,
      startLine,
      endLine,
    },
  });
  ctx.logger.debug(`Added selection to prompt: ${filePath}:${startLine}-${endLine}`);
  vscode.window.showInformationMessage(`Added selection from ${fileName} to prompt.`);
}

function openTerminal(ctx: CommandContext): void {
  const terminal = vscode.window.createTerminal({
    name: 'OpenCode',
    env: {
      OPENCODE_BASE_URL: ctx.serverManager.getBaseUrl(),
    },
  });
  terminal.show();
  ctx.logger.debug('Opened OpenCode terminal');
}

async function showDiff(ctx: CommandContext): Promise<void> {
  const sessionId = requireSession(ctx);
  if (!sessionId) { return; }

  try {
    const diffs = await ctx.client.getSessionDiff(sessionId);

    if (!diffs || diffs.length === 0) {
      vscode.window.showInformationMessage('No file changes in the current session.');
      return;
    }

    const items = diffs.map(d => ({
      label: `$(${d.status === 'added' ? 'diff-added' : d.status === 'deleted' ? 'diff-removed' : 'diff-modified'}) ${d.path}`,
      description: `+${d.additions} -${d.deletions}`,
      _diff: d,
    }));

    const pick = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a file to view diff',
    });

    if (pick && pick._diff.diff) {
      const doc = await vscode.workspace.openTextDocument({
        content: pick._diff.diff,
        language: 'diff',
      });
      await vscode.window.showTextDocument(doc);
    }
  } catch (err) {
    ctx.logger.error('Failed to show diff', err);
    vscode.window.showErrorMessage(`Failed to show diff: ${errorMessage(err)}`);
  }
}

function focusChat(_ctx: CommandContext): void {
  vscode.commands.executeCommand('opencode.chatView.focus');
}

async function compactSession(ctx: CommandContext): Promise<void> {
  const sessionId = requireSession(ctx);
  if (!sessionId) { return; }

  try {
    ctx.logger.info(`Compacting session ${sessionId}`);
    await ctx.client.sendMessageAsync(sessionId, {
      parts: [{ type: 'text', text: '/compact' }],
    });
    vscode.window.showInformationMessage('Session compaction started.');
  } catch (err) {
    ctx.logger.error('Failed to compact session', err);
    vscode.window.showErrorMessage(`Failed to compact session: ${errorMessage(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function errorMessage(err: unknown): string {
  if (err instanceof Error) { return err.message; }
  if (typeof err === 'string') { return err; }
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  try { return JSON.stringify(err); } catch { return String(err); }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Register all extension commands.
 */
export function registerCommands(
  context: vscode.ExtensionContext,
  ctx: CommandContext
): void {
  const commands: Array<[string, (...args: unknown[]) => unknown]> = [
    ['opencode.newSession', () => newSession(ctx)],
    ['opencode.deleteSession', (sessionId?: unknown) => deleteSession(ctx, sessionId as string | undefined)],
    ['opencode.refreshSessions', () => refreshSessions(ctx)],
    ['opencode.switchSession', (sessionId?: unknown) => switchSession(ctx, sessionId)],
    ['opencode.forkSession', () => forkSession(ctx)],
    ['opencode.shareSession', () => shareSession(ctx)],
    ['opencode.abortSession', () => abortSession(ctx)],
    ['opencode.undoMessage', () => undoMessage(ctx)],
    ['opencode.redoMessage', () => redoMessage(ctx)],
    ['opencode.startServer', () => startServer(ctx)],
    ['opencode.stopServer', () => stopServer(ctx)],
    ['opencode.restartServer', () => restartServer(ctx)],
    ['opencode.selectModel', () => selectModel(ctx)],
    ['opencode.selectAgent', () => selectAgent(ctx)],
    ['opencode.openSettings', () => openSettings(ctx)],
    ['opencode.addFileToPrompt', () => addFileToPrompt(ctx)],
    ['opencode.addSelectionToPrompt', () => addSelectionToPrompt(ctx)],
    ['opencode.openTerminal', () => openTerminal(ctx)],
    ['opencode.showDiff', () => showDiff(ctx)],
    ['opencode.focusChat', () => focusChat(ctx)],
    ['opencode.compactSession', () => compactSession(ctx)],
  ];

  for (const [id, handler] of commands) {
    context.subscriptions.push(
      vscode.commands.registerCommand(id, handler)
    );
  }
}
