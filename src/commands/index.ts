import * as vscode from 'vscode';
import * as path from 'path';
import type { ServerManager } from '../services/serverManager';
import type { DiffService } from '../services/diffService';
import type { OpenCodeClient } from '../services/openCodeClient';
import type { EventBus } from '../services/eventBus';
import type { Logger } from '../services/logger';
import type { ChatViewProvider } from '../providers/chatViewProvider';
import type { SessionTreeProvider } from '../providers/sessionTreeProvider';
import type { StatusTreeProvider } from '../providers/statusTreeProvider';
import type { SettingsViewProvider } from '../providers/settingsViewProvider';
import type { SessionEditorPanelProvider } from '../providers/sessionEditorPanelProvider';
import type { StatusBarManager } from '../managers/statusBarManager';
import type { SessionManager } from '../managers/sessionManager';
import type { MessageWithParts, OpenCodeConfig } from '../types/opencode';

type ServerMode = 'local' | 'external';

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
  editorPanelProvider: SessionEditorPanelProvider;
  statusBarManager: StatusBarManager;
  sessionManager: SessionManager;
  diffService: DiffService;
  isServerConnected: () => boolean;
  getServerMode: () => ServerMode;
  getExternalServerUrl: () => string;
  connectToServer: (baseUrl: string, mode: ServerMode) => Promise<void>;
  disconnectFromServer: (reason?: string) => Promise<void>;
  /** Track the currently active session ID. */
  activeSessionId: string | undefined;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Check that the server is connected; show an error and return false if not. */
function requireConnected(ctx: CommandContext): boolean {
  if (!ctx.isServerConnected()) {
    const mode = ctx.getServerMode();
    const actionLabel = mode === 'external' ? 'Connect' : 'Start Server';
    const message = mode === 'external'
      ? 'OpenCode is not connected. Connect to the external server first.'
      : 'OpenCode server is not running. Start the server first.';

    vscode.window.showWarningMessage(
      message,
      actionLabel,
    ).then(choice => {
      if (choice === actionLabel) {
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

function getUserMessages(messages: MessageWithParts[]): MessageWithParts[] {
  return messages.filter((message) => message.info.role === 'user');
}

function getUndoTargetMessage(
  messages: MessageWithParts[],
  session: { revert?: { messageID: string } },
): MessageWithParts | undefined {
  const userMessages = getUserMessages(messages);
  if (userMessages.length === 0) {
    return undefined;
  }

  const revertMessageID = session.revert?.messageID;
  if (!revertMessageID) {
    return userMessages[userMessages.length - 1];
  }

  const revertIndex = userMessages.findIndex((message) => message.info.id === revertMessageID);
  return revertIndex > 0 ? userMessages[revertIndex - 1] : undefined;
}

function getRedoTargetMessage(
  messages: MessageWithParts[],
  session: { revert?: { messageID: string } },
): MessageWithParts | undefined {
  const revertMessageID = session.revert?.messageID;
  if (!revertMessageID) {
    return undefined;
  }

  const userMessages = getUserMessages(messages);
  const revertIndex = userMessages.findIndex((message) => message.info.id === revertMessageID);
  return revertIndex >= 0 && revertIndex < userMessages.length - 1
    ? userMessages[revertIndex + 1]
    : undefined;
}

function getCodeRange(editor: vscode.TextEditor): vscode.Range {
  if (!editor.selection.isEmpty) {
    return new vscode.Range(editor.selection.start, editor.selection.end);
  }

  return editor.document.lineAt(editor.selection.active.line).range;
}

function getLineRange(range: vscode.Range): { startLine: number; endLine: number } {
  const startLine = range.start.line + 1;
  const endLine =
    range.end.line > range.start.line && range.end.character === 0
      ? range.end.line
      : range.end.line + 1;

  return {
    startLine,
    endLine: Math.max(startLine, endLine),
  };
}

function getFenceLanguage(filePath: string): string {
  return path.extname(filePath).replace(/^\./, '').toLowerCase();
}

function buildChatCodeInsertText(editor: vscode.TextEditor): string {
  const range = getCodeRange(editor);
  const code = editor.document.getText(range).replace(/\n+$/u, '');
  const { startLine, endLine } = getLineRange(range);
  const relativePath = vscode.workspace.asRelativePath(editor.document.uri, false);
  const lineRange = startLine === endLine ? `${startLine}` : `${startLine}-${endLine}`;
  const language = getFenceLanguage(editor.document.fileName);

  return `Source: \`${relativePath}:${lineRange}\`\n\`\`\`${language}\n${code}\n\`\`\``;
}

const DEFAULT_PROJECT_CONFIG_FILE = 'opencode.jsonc';
const DEFAULT_PROJECT_CONFIG_TEMPLATE = `{
  "$schema": "https://opencode.ai/config.json"
}
`;

function normalizePathForComparison(filePath: string): string {
  const resolved = path.resolve(filePath);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function getConfigSearchDirectories(directory: string, worktree: string): string[] {
  const folders: string[] = [];
  const stop = normalizePathForComparison(worktree);
  let current = path.resolve(directory);

  while (true) {
    folders.push(current);

    if (normalizePathForComparison(current) === stop) {
      return folders;
    }

    const parent = path.dirname(current);
    if (normalizePathForComparison(parent) === normalizePathForComparison(current)) {
      return folders;
    }

    current = parent;
  }
}

function getLocalConfigCandidates(directory: string, worktree: string): vscode.Uri[] {
  const folders = getConfigSearchDirectories(directory, worktree);
  const dotFolders = [...folders].reverse();
  const files = [
    // Official config loading merges plain project files first and `.opencode` files after,
    // so `.opencode` wins over `opencode.json{,c}` when both exist. Project `.opencode`
    // directories are walked from the current directory up to the worktree, which means the
    // farthest matching `.opencode` file is applied last and therefore has the highest priority.
    ...dotFolders.flatMap((folder) => [
      path.join(folder, '.opencode', 'opencode.json'),
      path.join(folder, '.opencode', 'opencode.jsonc'),
    ]),
    ...folders.map((folder) => path.join(folder, 'opencode.json')),
    ...folders.map((folder) => path.join(folder, 'opencode.jsonc')),
  ];

  return files.map((filePath) => vscode.Uri.file(filePath));
}

async function fileExists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

async function resolveLocalConfigFile(pathInfo: { directory: string; worktree: string }): Promise<vscode.Uri> {
  for (const candidate of getLocalConfigCandidates(pathInfo.directory, pathInfo.worktree)) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  const file = vscode.Uri.file(path.join(pathInfo.directory, DEFAULT_PROJECT_CONFIG_FILE));
  await vscode.workspace.fs.writeFile(
    file,
    new TextEncoder().encode(DEFAULT_PROJECT_CONFIG_TEMPLATE),
  );
  return file;
}

function getDirectDiffArgs(
  filePath: unknown,
  original: unknown,
  modified: unknown,
): { path: string; original: string; modified: string } | undefined {
  if (typeof filePath !== 'string' || filePath.trim() === '') {
    return undefined;
  }

  if (typeof original !== 'string' || typeof modified !== 'string') {
    return undefined;
  }

  return {
    path: filePath,
    original,
    modified,
  };
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

async function revertSession(
  ctx: CommandContext,
  messageId: unknown,
  partId?: unknown,
): Promise<void> {
  const sessionId = requireSession(ctx);
  if (!sessionId) { return; }

  if (typeof messageId !== 'string' || messageId.trim() === '') {
    vscode.window.showWarningMessage('No message selected to revert.');
    return;
  }

  const normalizedPartId = typeof partId === 'string' && partId.trim() !== ''
    ? partId.trim()
    : undefined;

  try {
    await ctx.client.revertSession(sessionId, messageId.trim(), normalizedPartId);
    ctx.logger.info(
      `Reverted session ${sessionId} to ${messageId}${normalizedPartId ? ` (part ${normalizedPartId})` : ''}`,
    );
  } catch (err) {
    ctx.logger.error('Failed to revert session', err);
    vscode.window.showErrorMessage(`Failed to revert session: ${errorMessage(err)}`);
  }
}

async function unrevertSession(ctx: CommandContext): Promise<void> {
  const sessionId = requireSession(ctx);
  if (!sessionId) { return; }

  try {
    await ctx.client.unrevertSession(sessionId);
    ctx.logger.info(`Restored reverted messages in session ${sessionId}`);
  } catch (err) {
    ctx.logger.error('Failed to restore reverted messages', err);
    vscode.window.showErrorMessage(`Failed to restore reverted messages: ${errorMessage(err)}`);
  }
}

async function undoMessage(ctx: CommandContext): Promise<void> {
  const sessionId = requireSession(ctx);
  if (!sessionId) { return; }

  try {
    const [session, messages] = await Promise.all([
      ctx.client.getSession(sessionId),
      ctx.client.listMessages(sessionId),
    ]);
    const targetMessage = getUndoTargetMessage(messages, session);

    if (!targetMessage) {
      vscode.window.showInformationMessage('No messages to undo.');
      return;
    }

    await ctx.client.revertSession(sessionId, targetMessage.info.id);
    ctx.logger.info(`Reverted session ${sessionId} to user message ${targetMessage.info.id}`);
  } catch (err) {
    ctx.logger.error('Failed to undo message', err);
    vscode.window.showErrorMessage(`Failed to undo message: ${errorMessage(err)}`);
  }
}

async function redoMessage(ctx: CommandContext): Promise<void> {
  const sessionId = requireSession(ctx);
  if (!sessionId) { return; }

  try {
    const [session, messages] = await Promise.all([
      ctx.client.getSession(sessionId),
      ctx.client.listMessages(sessionId),
    ]);

    if (!session.revert?.messageID) {
      vscode.window.showInformationMessage('No messages to redo.');
      return;
    }

    const targetMessage = getRedoTargetMessage(messages, session);
    if (targetMessage) {
      await ctx.client.revertSession(sessionId, targetMessage.info.id);
      ctx.logger.info(`Advanced revert point in session ${sessionId} to ${targetMessage.info.id}`);
      return;
    }

    await ctx.client.unrevertSession(sessionId);
    ctx.logger.info(`Fully restored reverted messages in session ${sessionId}`);
  } catch (err) {
    ctx.logger.error('Failed to redo message', err);
    vscode.window.showErrorMessage(`Failed to redo message: ${errorMessage(err)}`);
  }
}

async function startServer(ctx: CommandContext): Promise<void> {
  const mode = ctx.getServerMode();

  try {
    if (mode === 'external') {
      if (ctx.isServerConnected()) {
        vscode.window.showInformationMessage('OpenCode is already connected to the external server.');
        return;
      }

      ctx.statusBarManager.setConnecting('external');
      await ctx.connectToServer(ctx.getExternalServerUrl(), 'external');
      ctx.logger.info('Connected to external OpenCode server');
      return;
    }

    if (ctx.serverManager.isRunning() && ctx.isServerConnected()) {
      vscode.window.showInformationMessage('OpenCode server is already running.');
      return;
    }

    if (!ctx.serverManager.isRunning()) {
      ctx.statusBarManager.setConnecting('local');
      await ctx.serverManager.start();
      ctx.logger.info('Server started');
    } else {
      ctx.statusBarManager.setConnecting('local');
    }

    await ctx.connectToServer(ctx.serverManager.getBaseUrl(), 'local');
  } catch (err) {
    const action = mode === 'external' ? 'connect to external server' : 'start server';
    ctx.logger.error(`Failed to ${action}`, err);
    ctx.statusBarManager.setDisconnected();
    vscode.window.showErrorMessage(`Failed to ${action}: ${errorMessage(err)}`);
  }
}

async function stopServer(ctx: CommandContext): Promise<void> {
  const mode = ctx.getServerMode();

  if (mode === 'external') {
    if (!ctx.isServerConnected()) {
      vscode.window.showInformationMessage('OpenCode is not connected to an external server.');
      return;
    }

    const confirm = await vscode.window.showWarningMessage(
      'Disconnect from the external OpenCode server? Active sessions will continue running remotely.',
      { modal: true },
      'Disconnect',
    );
    if (confirm !== 'Disconnect') { return; }

    try {
      await ctx.disconnectFromServer('External server disconnected');
      ctx.logger.info('Disconnected from external OpenCode server');
    } catch (err) {
      ctx.logger.error('Failed to disconnect from external server', err);
      vscode.window.showErrorMessage(`Failed to disconnect from external server: ${errorMessage(err)}`);
    }
    return;
  }

  if (!ctx.serverManager.isRunning() && !ctx.isServerConnected()) {
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
    ctx.logger.info('Server stopped');
  } catch (err) {
    ctx.logger.error('Failed to stop server', err);
    vscode.window.showErrorMessage(`Failed to stop server: ${errorMessage(err)}`);
  }
}

async function restartServer(ctx: CommandContext): Promise<void> {
  const mode = ctx.getServerMode();

  try {
    if (mode === 'external') {
      await ctx.disconnectFromServer('Reconnecting to external server');
      ctx.statusBarManager.setConnecting('external');
      await ctx.connectToServer(ctx.getExternalServerUrl(), 'external');
      ctx.logger.info('Reconnected to external OpenCode server');
      return;
    }

    ctx.statusBarManager.setConnecting('local');
    if (ctx.serverManager.isRunning()) {
      await ctx.serverManager.restart();
    } else {
      await ctx.serverManager.start();
    }

    ctx.statusBarManager.setConnecting('local');
    await ctx.connectToServer(ctx.serverManager.getBaseUrl(), 'local');
    ctx.logger.info('Server restarted');
  } catch (err) {
    const action = mode === 'external' ? 'reconnect to external server' : 'restart server';
    ctx.logger.error(`Failed to ${action}`, err);
    ctx.statusBarManager.setDisconnected();
    vscode.window.showErrorMessage(`Failed to ${action}: ${errorMessage(err)}`);
  }
}

function syncConfig(ctx: CommandContext, config: OpenCodeConfig): void {
  ctx.eventBus.emit('config:updated', config);
  const message = { type: 'config:updated' as const, data: config };
  ctx.chatProvider.postMessageToWebview(message);
  ctx.editorPanelProvider.broadcastMessage(message);
}

async function updateSelectedModel(
  ctx: CommandContext,
  providerID: string,
  modelID: string,
): Promise<void> {
  const config = await ctx.client.updateConfig({ model: `${providerID}/${modelID}` });
  syncConfig(ctx, config);
  ctx.statusBarManager.setModel(providerID, modelID);
  ctx.logger.info(`Selected model: ${providerID}/${modelID}`);
}

async function updateSelectedAgent(ctx: CommandContext, agentId: string): Promise<void> {
  const config = await ctx.client.updateConfig({ agent: agentId });
  syncConfig(ctx, config);
  ctx.logger.info(`Selected agent: ${agentId}`);
}

async function selectModel(
  ctx: CommandContext,
  providerID?: unknown,
  modelID?: unknown,
): Promise<void> {
  if (!requireConnected(ctx)) { return; }

  if (typeof providerID === 'string' && typeof modelID === 'string') {
    const nextProviderID = providerID.trim();
    const nextModelID = modelID.trim();
    if (!nextProviderID || !nextModelID) {
      vscode.window.showWarningMessage('Invalid model selection.');
      return;
    }

    try {
      await updateSelectedModel(ctx, nextProviderID, nextModelID);
    } catch (err) {
      ctx.logger.error('Failed to select model', err);
      vscode.window.showErrorMessage(`Failed to load models: ${errorMessage(err)}`);
    }
    return;
  }

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
      await updateSelectedModel(ctx, pick._providerID, pick._modelID);
    }
  } catch (err) {
    ctx.logger.error('Failed to select model', err);
    vscode.window.showErrorMessage(`Failed to load models: ${errorMessage(err)}`);
  }
}

async function selectAgent(ctx: CommandContext, agentId?: unknown): Promise<void> {
  if (!requireConnected(ctx)) { return; }

  if (typeof agentId === 'string') {
    const nextAgentId = agentId.trim();
    if (!nextAgentId) {
      vscode.window.showWarningMessage('Invalid agent selection.');
      return;
    }

    try {
      await updateSelectedAgent(ctx, nextAgentId);
    } catch (err) {
      ctx.logger.error('Failed to select agent', err);
      vscode.window.showErrorMessage(`Failed to load agents: ${errorMessage(err)}`);
    }
    return;
  }

  try {
    const agents = await ctx.client.listAgents();

    if (agents.length === 0) {
      vscode.window.showInformationMessage('No agents available.');
      return;
    }

    const items: (vscode.QuickPickItem & { _agentId: string })[] = agents.map(agent => ({
      label: agent.name,
      description: agent.mode,
      detail: agent.description,
      _agentId: agent.name,
    }));

    const pick = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select an agent',
    });

    if (pick) {
      await updateSelectedAgent(ctx, pick._agentId);
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

async function insertEditorCodeToChat(ctx: CommandContext): Promise<void> {
  if (!requireConnected(ctx)) { return; }

  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('No active editor. Open a file first.');
    return;
  }

  const range = getCodeRange(editor);
  const { startLine, endLine } = getLineRange(range);

  await ctx.chatProvider.revealAndInsertText(buildChatCodeInsertText(editor));
  ctx.logger.debug(
    `Inserted editor code into chat: ${editor.document.uri.fsPath}:${startLine}-${endLine}`
  );
}

function openTerminal(ctx: CommandContext): void {
  const baseUrl = ctx.client.getBaseUrl() || ctx.serverManager.getBaseUrl();
  const terminal = vscode.window.createTerminal({
    name: 'OpenCode',
    env: {
      OPENCODE_BASE_URL: baseUrl,
    },
  });
  terminal.show();
  ctx.logger.debug('Opened OpenCode terminal');
}

async function showDiff(
  ctx: CommandContext,
  filePath?: unknown,
  original?: unknown,
  modified?: unknown,
): Promise<void> {
  try {
    const direct = getDirectDiffArgs(filePath, original, modified);
    if (direct) {
      await ctx.diffService.showTextDiff(direct.path, direct.original, direct.modified);
      return;
    }

    const sessionId = requireSession(ctx);
    if (!sessionId) { return; }

    const diffs = await ctx.client.getSessionDiff(sessionId);
    await ctx.diffService.showSessionDiffs(diffs ?? []);
  } catch (err) {
    ctx.logger.error('Failed to show diff', err);
    vscode.window.showErrorMessage(`Failed to show diff: ${errorMessage(err)}`);
  }
}

function focusChat(_ctx: CommandContext): void {
  vscode.commands.executeCommand('opencode.chatView.focus');
}

function explainCode(ctx: CommandContext): void {
  if (!requireConnected(ctx)) { return; }
  const editor = vscode.window.activeTextEditor;
  if (!editor) { return; }
  const selection = editor.selection;
  const selectedText = editor.document.getText(selection);
  if (!selectedText) { return; }

  const filePath = vscode.workspace.asRelativePath(editor.document.uri);
  const languageId = editor.document.languageId;
  const startLine = selection.start.line + 1;
  const endLine = selection.end.line + 1;
  const lineRange = startLine === endLine ? `${startLine}` : `${startLine}-${endLine}`;

  const prompt = `Explain the following code:\n\n${filePath}:${lineRange}\n\`\`\`${languageId}\n${selectedText}\n\`\`\``;
  ctx.chatProvider.createNewSessionWithPrompt(prompt);
}

function improveCode(ctx: CommandContext): void {
  if (!requireConnected(ctx)) { return; }
  const editor = vscode.window.activeTextEditor;
  if (!editor) { return; }
  const selection = editor.selection;
  const selectedText = editor.document.getText(selection);
  if (!selectedText) { return; }

  const filePath = vscode.workspace.asRelativePath(editor.document.uri);
  const languageId = editor.document.languageId;
  const startLine = selection.start.line + 1;
  const endLine = selection.end.line + 1;
  const lineRange = startLine === endLine ? `${startLine}` : `${startLine}-${endLine}`;

  const prompt = `Improve the following code:\n\n${filePath}:${lineRange}\n\`\`\`${languageId}\n${selectedText}\n\`\`\``;
  ctx.chatProvider.createNewSessionWithPrompt(prompt);
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

async function openConfigFile(ctx: CommandContext): Promise<void> {
  if (!requireConnected(ctx)) { return; }
  try {
    const pathInfo = await ctx.client.getPathInfo();
    const directory = pathInfo.directory?.trim();
    const worktree = pathInfo.worktree?.trim();
    if (!directory) {
      throw new Error('OpenCode server did not report a project directory.');
    }
    if (!worktree) {
      throw new Error('OpenCode server did not report a project worktree.');
    }

    const configPath = await resolveLocalConfigFile({ directory, worktree });
    const doc = await vscode.workspace.openTextDocument(configPath);
    await vscode.window.showTextDocument(doc);
  } catch (err) {
    ctx.logger.error('Failed to open config file', err);
    vscode.window.showErrorMessage(`Failed to open config file: ${errorMessage(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Editor panel commands
// ---------------------------------------------------------------------------

function resolveSessionId(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value.trim() || undefined;
  }

  if (value && typeof value === 'object' && 'session' in value) {
    const item = value as { session?: { id?: string } };
    return item.session?.id;
  }

  return undefined;
}

async function openEditorSession(ctx: CommandContext, sessionId: string): Promise<void> {
  ctx.editorPanelProvider.createOrShow(sessionId);

  try {
    const [session, messages] = await Promise.all([
      ctx.client.getSession(sessionId),
      ctx.client.listMessages(sessionId),
    ]);
    ctx.editorPanelProvider.postMessageToPanel(sessionId, {
      type: 'session:loaded',
      data: { session, messages },
    });
  } catch (err) {
    ctx.logger.error('Failed to load editor session', err);
    vscode.window.showErrorMessage(`Failed to open session in editor: ${errorMessage(err)}`);
  }
}

function openSessionInEditor(ctx: CommandContext, sessionId?: unknown): void {
  if (!requireConnected(ctx)) { return; }

  const id = resolveSessionId(sessionId);

  if (!id) {
    vscode.window.showWarningMessage('No session ID provided.');
    return;
  }

  void openEditorSession(ctx, id);
}

function openNewSessionInEditor(ctx: CommandContext): void {
  if (!requireConnected(ctx)) { return; }
  ctx.editorPanelProvider.createOrShowNewSession();
}

function openActiveSessionInEditor(ctx: CommandContext): void {
  if (!requireConnected(ctx)) { return; }

  const sessionId = ctx.activeSessionId;
  if (!sessionId) {
    vscode.window.showWarningMessage('No active session. Create or select a session first.');
    return;
  }

  void openEditorSession(ctx, sessionId);
}

function openCurrentOrNewSessionInEditor(ctx: CommandContext): void {
  if (!requireConnected(ctx)) { return; }

  const sessionId = ctx.activeSessionId;
  if (sessionId) {
    void openEditorSession(ctx, sessionId);
  } else {
    ctx.editorPanelProvider.createOrShowNewSession();
  }
}

function resolveStatusItemId(item: unknown): string | undefined {
  if (typeof item === 'string') {
    return item.trim() || undefined;
  }

  if (!item || typeof item !== 'object') {
    return undefined;
  }

  if ('itemId' in item && typeof (item as { itemId?: unknown }).itemId === 'string') {
    return ((item as { itemId: string }).itemId).trim() || undefined;
  }

  if ('label' in item && typeof (item as { label?: unknown }).label === 'string') {
    return ((item as { label: string }).label).trim() || undefined;
  }

  return undefined;
}

async function toggleMCPServer(
  ctx: CommandContext,
  item: unknown,
  enabled: boolean,
): Promise<void> {
  if (!requireConnected(ctx)) { return; }

  const name = resolveStatusItemId(item);
  if (!name) {
    vscode.window.showWarningMessage('No MCP server selected.');
    return;
  }

  try {
    const config = await ctx.client.getConfig();
    const next = { ...(config.mcp ?? {}) };
    const current = next[name];
    if (!current) {
      vscode.window.showWarningMessage(`MCP server not found in config: ${name}`);
      return;
    }

    next[name] = { ...current, enabled };
    const updated = await ctx.client.updateConfig({ mcp: next });
    syncConfig(ctx, updated);
    await ctx.statusProvider.refresh();
    vscode.window.showInformationMessage(`${enabled ? 'Enabled' : 'Disabled'} MCP server: ${name}`);
  } catch (err) {
    ctx.logger.error('Failed to toggle MCP server', err);
    vscode.window.showErrorMessage(`Failed to toggle MCP server: ${errorMessage(err)}`);
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
    ['opencode.revertSession', (messageId?: unknown, partId?: unknown) => revertSession(ctx, messageId, partId)],
    ['opencode.unrevertSession', () => unrevertSession(ctx)],
    ['opencode.undoMessage', () => undoMessage(ctx)],
    ['opencode.redoMessage', () => redoMessage(ctx)],
    ['opencode.startServer', () => startServer(ctx)],
    ['opencode.stopServer', () => stopServer(ctx)],
    ['opencode.restartServer', () => restartServer(ctx)],
    ['opencode.selectModel', (providerID?: unknown, modelID?: unknown) => selectModel(ctx, providerID, modelID)],
    ['opencode.selectAgent', (agentId?: unknown) => selectAgent(ctx, agentId)],
    ['opencode.openSettings', () => openSettings(ctx)],
    ['opencode.addFileToPrompt', () => addFileToPrompt(ctx)],
    ['opencode.addSelectionToPrompt', () => addSelectionToPrompt(ctx)],
    ['opencode.insertEditorCodeToChat', () => insertEditorCodeToChat(ctx)],
    ['opencode.explainCode', () => explainCode(ctx)],
    ['opencode.improveCode', () => improveCode(ctx)],
    ['opencode.openTerminal', () => openTerminal(ctx)],
    ['opencode.showDiff', (filePath?: unknown, original?: unknown, modified?: unknown) => showDiff(ctx, filePath, original, modified)],
    ['opencode.focusChat', () => focusChat(ctx)],
    ['opencode.compactSession', () => compactSession(ctx)],
    ['opencode.openConfigFile', () => openConfigFile(ctx)],
    ['opencode.openSessionInEditor', (sessionId?: unknown) => openSessionInEditor(ctx, sessionId)],
    ['opencode.openNewSessionInEditor', () => openNewSessionInEditor(ctx)],
    ['opencode.openActiveSessionInEditor', () => openActiveSessionInEditor(ctx)],
    ['opencode.openCurrentOrNewSessionInEditor', () => openCurrentOrNewSessionInEditor(ctx)],
    ['opencode.enableMCPServer', (item?: unknown) => toggleMCPServer(ctx, item, true)],
    ['opencode.disableMCPServer', (item?: unknown) => toggleMCPServer(ctx, item, false)],
  ];

  for (const [id, handler] of commands) {
    context.subscriptions.push(
      vscode.commands.registerCommand(id, handler)
    );
  }
}
