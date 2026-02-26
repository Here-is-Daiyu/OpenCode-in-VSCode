/**
 * Webview 聊天面板 - OpenCode 的核心交互界面
 * 使用 VSCode Webview API 实现完整的聊天体验
 */

import * as vscode from "vscode";
import { OpenCodeClient, Session, MessageWithParts, AnyPart, SSEEvent } from "./client";

export class ChatPanel {
  public static currentPanel: ChatPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private client: OpenCodeClient;
  private currentSessionId: string | null = null;
  private sseController: AbortController | null = null;
  private disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    client: OpenCodeClient
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.client = client;

    this.panel.webview.html = this.getHtmlContent();

    // 监听来自 Webview 的消息
    this.panel.webview.onDidReceiveMessage(
      (msg) => this.handleWebviewMessage(msg),
      null,
      this.disposables
    );

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    // 订阅 SSE 事件
    this.subscribeToEvents();
  }

  public static createOrShow(
    extensionUri: vscode.Uri,
    client: OpenCodeClient
  ): ChatPanel {
    const column = vscode.ViewColumn.Beside;

    if (ChatPanel.currentPanel) {
      ChatPanel.currentPanel.client = client;
      ChatPanel.currentPanel.panel.reveal(column);
      return ChatPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      "opencode.chat",
      "OpenCode Chat",
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      }
    );

    ChatPanel.currentPanel = new ChatPanel(panel, extensionUri, client);
    return ChatPanel.currentPanel;
  }

  public updateClient(client: OpenCodeClient): void {
    this.client = client;
    // 重新订阅事件
    this.sseController?.abort();
    this.subscribeToEvents();
  }

  /**
   * 切换到指定会话
   */
  public async switchSession(sessionId: string): Promise<void> {
    this.currentSessionId = sessionId;
    this.postMessage({ type: "session:switch", sessionId });
    await this.loadMessages(sessionId);
  }

  /**
   * 向 prompt 追加文件引用
   */
  public appendToPrompt(text: string): void {
    this.postMessage({ type: "prompt:append", text });
  }

  private subscribeToEvents(): void {
    this.sseController = this.client.subscribeEvents(
      (event) => this.handleSSEEvent(event),
      (error) => {
        console.error("SSE 连接错误:", error);
      }
    );
  }

  private handleSSEEvent(event: SSEEvent): void {
    const { type, properties } = event;

    // 转发所有事件到 Webview
    this.postMessage({
      type: "sse:event",
      eventType: type,
      data: properties,
    });

    // 处理特定事件
    switch (type) {
      case "message.updated":
      case "message.part.updated":
      case "message.part.delta":
        // 消息更新 - Webview 会处理
        break;
      case "session.status":
        // 会话状态变化
        break;
      case "permission.asked":
        // 权限请求 - 在 VSCode 原生 UI 中弹出
        this.handlePermissionRequest(properties);
        break;
      case "session.error":
        vscode.window.showErrorMessage(
          `OpenCode 错误: ${properties.error?.message || "未知错误"}`
        );
        break;
    }
  }

  private async handlePermissionRequest(data: any): Promise<void> {
    const description = data.description || data.action || "未知操作";
    const result = await vscode.window.showWarningMessage(
      `OpenCode 请求权限: ${description}`,
      { modal: true },
      "允许",
      "拒绝",
      "始终允许"
    );

    if (!result || !this.currentSessionId) return;

    const response = result === "拒绝" ? "deny" : "allow";
    const remember = result === "始终允许";

    try {
      await this.client.respondToPermission(
        this.currentSessionId,
        data.id || data.permissionID,
        response,
        remember
      );
    } catch (error: any) {
      vscode.window.showErrorMessage(`权限响应失败: ${error.message}`);
    }
  }

  private async loadMessages(sessionId: string): Promise<void> {
    try {
      const messages = await this.client.listMessages(sessionId);
      this.postMessage({ type: "messages:load", messages });
    } catch (error: any) {
      this.postMessage({
        type: "error",
        message: `加载消息失败: ${error.message}`,
      });
    }
  }

  private async handleWebviewMessage(msg: any): Promise<void> {
    switch (msg.type) {
      case "ready":
        await this.onWebviewReady();
        break;

      case "prompt:send":
        await this.sendPrompt(msg.text, msg.model, msg.agent);
        break;

      case "prompt:sendAsync":
        await this.sendPromptAsync(msg.text, msg.model, msg.agent);
        break;

      case "command:send":
        await this.sendCommand(msg.command, msg.args);
        break;

      case "session:create":
        await this.createSession(msg.title);
        break;

      case "session:list":
        await this.sendSessionList();
        break;

      case "session:switch":
        await this.switchSession(msg.sessionId);
        break;

      case "session:abort":
        await this.abortCurrentSession();
        break;

      case "session:fork":
        await this.forkCurrentSession(msg.messageId);
        break;

      case "session:revert":
        await this.revertMessage(msg.messageId, msg.partId);
        break;

      case "session:unrevert":
        await this.unrevertMessages();
        break;

      case "session:diff":
        await this.viewDiff();
        break;

      case "providers:list":
        await this.sendProviderList();
        break;

      case "agents:list":
        await this.sendAgentList();
        break;

      case "commands:list":
        await this.sendCommandList();
        break;

      case "file:open":
        await this.openFile(msg.path, msg.line);
        break;

      case "todo:get":
        await this.sendTodoList();
        break;

      case "health:check":
        await this.sendHealthStatus();
        break;

      case "config:setModel":
        await this.setModel(msg.providerID, msg.modelID);
        break;

      case "copy":
        await vscode.env.clipboard.writeText(msg.text);
        break;
    }
  }

  private async onWebviewReady(): Promise<void> {
    // 发送初始数据
    await this.sendSessionList();
    await this.sendProviderList();
    await this.sendAgentList();
    await this.sendHealthStatus();

    // 如果已有会话，加载最近的
    if (this.currentSessionId) {
      await this.loadMessages(this.currentSessionId);
    }
  }

  private async sendPrompt(
    text: string,
    model?: { providerID: string; modelID: string },
    agent?: string
  ): Promise<void> {
    if (!this.currentSessionId) {
      // 自动创建会话
      await this.createSession();
    }
    if (!this.currentSessionId) return;

    try {
      // 使用异步 prompt，通过 SSE 接收结果
      await this.client.sendPromptAsync(this.currentSessionId, {
        parts: [{ type: "text", text }],
        model,
        agent,
      });
    } catch (error: any) {
      this.postMessage({
        type: "error",
        message: `发送消息失败: ${error.message}`,
      });
    }
  }

  private async sendPromptAsync(
    text: string,
    model?: { providerID: string; modelID: string },
    agent?: string
  ): Promise<void> {
    if (!this.currentSessionId) {
      await this.createSession();
    }
    if (!this.currentSessionId) return;

    try {
      await this.client.sendPromptAsync(this.currentSessionId, {
        parts: [{ type: "text", text }],
        model,
        agent,
      });
    } catch (error: any) {
      this.postMessage({
        type: "error",
        message: `发送消息失败: ${error.message}`,
      });
    }
  }

  private async sendCommand(command: string, args?: string): Promise<void> {
    if (!this.currentSessionId) return;

    try {
      const result = await this.client.sendCommand(this.currentSessionId, {
        command,
        arguments: args,
      });
      this.postMessage({ type: "command:result", result });
    } catch (error: any) {
      this.postMessage({
        type: "error",
        message: `命令执行失败: ${error.message}`,
      });
    }
  }

  private async createSession(title?: string): Promise<void> {
    try {
      const session = await this.client.createSession(title);
      this.currentSessionId = session.id;
      this.postMessage({ type: "session:created", session });
      await this.sendSessionList();
    } catch (error: any) {
      this.postMessage({
        type: "error",
        message: `创建会话失败: ${error.message}`,
      });
    }
  }

  private async sendSessionList(): Promise<void> {
    try {
      const [sessions, statusMap] = await Promise.all([
        this.client.listSessions(),
        this.client.getSessionStatus().catch(() => ({})),
      ]);
      this.postMessage({ type: "sessions:list", sessions, statusMap });
    } catch (error: any) {
      this.postMessage({
        type: "error",
        message: `获取会话列表失败: ${error.message}`,
      });
    }
  }

  private async sendProviderList(): Promise<void> {
    try {
      const [providers, config] = await Promise.all([
        this.client.getProviders(),
        this.client.getConfig().catch(() => ({})),
      ]);
      const currentModel = (config as any)?.model || "";
      const enabledProviders = (config as any)?.enabled_providers || [];
      const disabledProviders = (config as any)?.disabled_providers || [];
      this.postMessage({
        type: "providers:list",
        providers,
        currentModel,
        enabledProviders,
        disabledProviders,
      });
    } catch (error: any) {
      console.error("获取 Provider 失败:", error);
    }
  }

  private async sendAgentList(): Promise<void> {
    try {
      const [agents, config] = await Promise.all([
        this.client.listAgents(),
        this.client.getConfig().catch(() => ({})),
      ]);
      // 从 config 中获取 agent 定义以补充 mode/hidden 等信息
      const agentConfig = (config as any)?.agent || {};
      const defaultAgent = (config as any)?.default_agent || "build";

      // 将 config 中的 agent 定义合并到 agent 列表
      const enrichedAgents = agents.map((a: any) => {
        const cfg = agentConfig[a.id] || {};
        return {
          ...a,
          mode: a.mode || cfg.mode || "primary",
          hidden: a.hidden ?? cfg.hidden ?? false,
          description: a.description || cfg.description || "",
          model: a.model || cfg.model || "",
        };
      });

      this.postMessage({ type: "agents:list", agents: enrichedAgents, defaultAgent });
    } catch (error: any) {
      console.error("获取 Agent 失败:", error);
    }
  }

  private async sendCommandList(): Promise<void> {
    try {
      const commands = await this.client.listCommands();
      this.postMessage({ type: "commands:list", commands });
    } catch (error: any) {
      console.error("获取命令列表失败:", error);
    }
  }

  private async sendTodoList(): Promise<void> {
    if (!this.currentSessionId) return;
    try {
      const todos = await this.client.getSessionTodo(this.currentSessionId);
      this.postMessage({ type: "todo:list", todos });
    } catch (error: any) {
      console.error("获取待办列表失败:", error);
    }
  }

  private async setModel(providerID: string, modelID: string): Promise<void> {
    try {
      await this.client.updateConfig({ model: `${providerID}/${modelID}` });
      this.postMessage({
        type: "model:updated",
        model: `${providerID}/${modelID}`,
      });
    } catch (error: any) {
      this.postMessage({
        type: "error",
        message: `切换模型失败: ${error.message}`,
      });
    }
  }

  private async sendHealthStatus(): Promise<void> {
    try {
      const health = await this.client.health();
      this.postMessage({ type: "health:status", health });
    } catch {
      this.postMessage({
        type: "health:status",
        health: { healthy: false, version: "N/A" },
      });
    }
  }

  private async abortCurrentSession(): Promise<void> {
    if (!this.currentSessionId) return;
    try {
      await this.client.abortSession(this.currentSessionId);
      this.postMessage({ type: "session:aborted" });
    } catch (error: any) {
      this.postMessage({
        type: "error",
        message: `中止失败: ${error.message}`,
      });
    }
  }

  private async forkCurrentSession(messageId?: string): Promise<void> {
    if (!this.currentSessionId) return;
    try {
      const session = await this.client.forkSession(
        this.currentSessionId,
        messageId
      );
      this.currentSessionId = session.id;
      this.postMessage({ type: "session:forked", session });
      await this.loadMessages(session.id);
      await this.sendSessionList();
    } catch (error: any) {
      this.postMessage({
        type: "error",
        message: `分叉失败: ${error.message}`,
      });
    }
  }

  private async revertMessage(
    messageId: string,
    partId?: string
  ): Promise<void> {
    if (!this.currentSessionId) return;
    try {
      await this.client.revertMessage(this.currentSessionId, messageId, partId);
      await this.loadMessages(this.currentSessionId);
      vscode.window.showInformationMessage("已撤销更改");
    } catch (error: any) {
      this.postMessage({
        type: "error",
        message: `撤销失败: ${error.message}`,
      });
    }
  }

  private async unrevertMessages(): Promise<void> {
    if (!this.currentSessionId) return;
    try {
      await this.client.unrevertMessages(this.currentSessionId);
      await this.loadMessages(this.currentSessionId);
      vscode.window.showInformationMessage("已恢复更改");
    } catch (error: any) {
      this.postMessage({
        type: "error",
        message: `恢复失败: ${error.message}`,
      });
    }
  }

  private async viewDiff(): Promise<void> {
    if (!this.currentSessionId) return;
    try {
      const diffs = await this.client.getSessionDiff(this.currentSessionId);
      this.postMessage({ type: "session:diff", diffs });
    } catch (error: any) {
      this.postMessage({
        type: "error",
        message: `获取 diff 失败: ${error.message}`,
      });
    }
  }

  private async openFile(filePath: string, line?: number): Promise<void> {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
      if (!workspaceFolder) return;

      const fileUri = vscode.Uri.joinPath(workspaceFolder, filePath);
      const doc = await vscode.workspace.openTextDocument(fileUri);
      const editor = await vscode.window.showTextDocument(doc, {
        viewColumn: vscode.ViewColumn.One,
        preserveFocus: false,
      });

      if (line && line > 0) {
        const pos = new vscode.Position(line - 1, 0);
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(new vscode.Range(pos, pos));
      }
    } catch (error: any) {
      vscode.window.showErrorMessage(`无法打开文件: ${error.message}`);
    }
  }

  private postMessage(msg: any): void {
    this.panel.webview.postMessage(msg);
  }

  private getHtmlContent(): string {
    const nonce = getNonce();

    return /*html*/ `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src data: https:;">
  <title>OpenCode Chat</title>
  <style>
    :root {
      --bg-primary: var(--vscode-editor-background);
      --bg-secondary: var(--vscode-sideBar-background);
      --bg-input: var(--vscode-input-background);
      --fg-primary: var(--vscode-editor-foreground);
      --fg-secondary: var(--vscode-descriptionForeground);
      --fg-link: var(--vscode-textLink-foreground);
      --border: var(--vscode-panel-border);
      --accent: var(--vscode-button-background);
      --accent-hover: var(--vscode-button-hoverBackground);
      --accent-fg: var(--vscode-button-foreground);
      --error: var(--vscode-errorForeground);
      --warning: var(--vscode-editorWarning-foreground);
      --success: #4ec9b0;
      --scrollbar: var(--vscode-scrollbarSlider-background);
      --font-size: 14px;
      --font-family: var(--vscode-editor-font-family, 'Cascadia Code', 'Fira Code', monospace);
      --radius: 6px;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--font-size);
      color: var(--fg-primary);
      background: var(--bg-primary);
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    /* ---- 顶栏 ---- */
    .header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }
    .header-title { font-weight: 600; font-size: 13px; }
    .header-session {
      flex: 1;
      font-size: 12px;
      color: var(--fg-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .header-btn {
      background: none;
      border: 1px solid var(--border);
      color: var(--fg-primary);
      padding: 3px 8px;
      border-radius: var(--radius);
      cursor: pointer;
      font-size: 11px;
    }
    .header-btn:hover { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }

    /* ---- 消息区域 ---- */
    .messages {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .messages::-webkit-scrollbar { width: 6px; }
    .messages::-webkit-scrollbar-thumb { background: var(--scrollbar); border-radius: 3px; }

    .message {
      max-width: 95%;
      padding: 10px 14px;
      border-radius: var(--radius);
      line-height: 1.5;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    .message.user {
      align-self: flex-end;
      background: var(--accent);
      color: var(--accent-fg);
    }
    .message.assistant {
      align-self: flex-start;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
    }
    .message.system {
      align-self: center;
      background: none;
      color: var(--fg-secondary);
      font-size: 12px;
      font-style: italic;
    }
    .message-meta {
      font-size: 11px;
      color: var(--fg-secondary);
      margin-bottom: 4px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .message-role {
      font-weight: 600;
      text-transform: uppercase;
      font-size: 10px;
      letter-spacing: 0.5px;
    }
    .message-content { white-space: pre-wrap; }
    .message-content code {
      background: rgba(128,128,128,0.15);
      padding: 1px 4px;
      border-radius: 3px;
      font-family: var(--font-family);
      font-size: 13px;
    }
    .message-content pre {
      background: rgba(0,0,0,0.2);
      padding: 10px;
      border-radius: var(--radius);
      overflow-x: auto;
      margin: 8px 0;
    }
    .message-content pre code {
      background: none;
      padding: 0;
    }
    .message-actions {
      display: flex;
      gap: 6px;
      margin-top: 6px;
    }
    .msg-action-btn {
      background: none;
      border: none;
      color: var(--fg-secondary);
      cursor: pointer;
      font-size: 11px;
      padding: 2px 6px;
      border-radius: 3px;
    }
    .msg-action-btn:hover { background: rgba(128,128,128,0.2); color: var(--fg-primary); }

    /* ---- 工具调用 ---- */
    .tool-call {
      margin: 6px 0;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      overflow: hidden;
    }
    .tool-header {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      background: rgba(128,128,128,0.08);
      cursor: pointer;
      font-size: 12px;
    }
    .tool-status { font-size: 12px; }
    .tool-status.running { color: var(--warning); }
    .tool-status.success { color: var(--success); }
    .tool-status.error { color: var(--error); }
    .tool-name { font-weight: 600; }
    .tool-body {
      padding: 8px 10px;
      font-size: 12px;
      font-family: var(--font-family);
      white-space: pre-wrap;
      max-height: 200px;
      overflow-y: auto;
      display: none;
    }
    .tool-call.expanded .tool-body { display: block; }

    /* ---- Diff 显示 ---- */
    .diff-block {
      margin: 6px 0;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      overflow: hidden;
    }
    .diff-header {
      padding: 6px 10px;
      background: rgba(128,128,128,0.08);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }
    .diff-content {
      font-family: var(--font-family);
      font-size: 12px;
      padding: 4px 0;
      max-height: 300px;
      overflow-y: auto;
    }
    .diff-line { padding: 0 10px; white-space: pre; }
    .diff-line.add { background: rgba(0,180,0,0.1); color: var(--success); }
    .diff-line.del { background: rgba(255,0,0,0.1); color: var(--error); }
    .diff-line.hunk { color: var(--fg-secondary); font-style: italic; }

    /* ---- 待办列表 ---- */
    .todo-list { margin: 6px 0; }
    .todo-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 3px 0;
      font-size: 12px;
    }
    .todo-status { width: 12px; text-align: center; }
    .todo-status.completed { color: var(--success); }
    .todo-status.in_progress { color: var(--warning); }
    .todo-status.pending { color: var(--fg-secondary); }

    /* ---- 状态指示 ---- */
    .status-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 12px;
      font-size: 11px;
      color: var(--fg-secondary);
      border-top: 1px solid var(--border);
      background: var(--bg-secondary);
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
    }
    .status-dot.running { background: var(--success); }
    .status-dot.busy { background: var(--warning); animation: pulse 1s infinite; }
    .status-dot.error { background: var(--error); }
    .status-dot.stopped { background: var(--fg-secondary); }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    /* ---- 输入区域 ---- */
    .input-area {
      padding: 10px 12px;
      background: var(--bg-secondary);
      border-top: 1px solid var(--border);
      flex-shrink: 0;
    }
    .input-toolbar {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 6px;
    }

    /* ---- 自定义下拉框 ---- */
    .custom-select {
      position: relative;
      display: inline-block;
      min-width: 100px;
      max-width: 220px;
      font-size: 11px;
    }
    .custom-select-trigger {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 4px;
      background: var(--bg-input);
      color: var(--fg-primary);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 3px 6px;
      cursor: pointer;
      user-select: none;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .custom-select-trigger:hover {
      border-color: var(--accent);
    }
    .custom-select-trigger .arrow {
      flex-shrink: 0;
      font-size: 8px;
      opacity: 0.6;
      transition: transform 0.15s;
    }
    .custom-select.open .custom-select-trigger .arrow {
      transform: rotate(180deg);
    }
    .custom-select-trigger .trigger-text {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .custom-select-dropdown {
      display: none;
      position: absolute;
      bottom: calc(100% + 4px);
      left: 0;
      min-width: 100%;
      max-width: 360px;
      max-height: 320px;
      overflow-y: auto;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.3);
      z-index: 1000;
    }
    .custom-select.open .custom-select-dropdown {
      display: block;
    }
    .custom-select-dropdown::-webkit-scrollbar { width: 5px; }
    .custom-select-dropdown::-webkit-scrollbar-thumb { background: var(--scrollbar); border-radius: 3px; }
    .custom-select-search {
      display: block;
      width: 100%;
      padding: 6px 8px;
      background: var(--bg-input);
      color: var(--fg-primary);
      border: none;
      border-bottom: 1px solid var(--border);
      font-size: 11px;
      outline: none;
      box-sizing: border-box;
    }
    .custom-select-group-label {
      padding: 4px 8px 2px;
      font-size: 10px;
      font-weight: 600;
      color: var(--fg-secondary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      user-select: none;
    }
    .custom-select-option {
      padding: 5px 8px;
      cursor: pointer;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: var(--fg-primary);
    }
    .custom-select-option:hover {
      background: var(--accent);
      color: var(--accent-fg);
    }
    .custom-select-option.selected {
      background: color-mix(in srgb, var(--accent) 30%, transparent);
    }
    .custom-select-option.disabled {
      opacity: 0.5;
      cursor: default;
    }
    .custom-select-option.disabled:hover {
      background: none;
      color: var(--fg-primary);
    }
    .custom-select-option.hidden {
      display: none;
    }
    .custom-select-empty {
      padding: 8px;
      text-align: center;
      color: var(--fg-secondary);
      font-size: 11px;
    }
    .input-wrapper {
      display: flex;
      gap: 6px;
      align-items: flex-end;
    }
    .input-wrapper textarea {
      flex: 1;
      background: var(--bg-input);
      color: var(--fg-primary);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 8px 10px;
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--font-size);
      resize: none;
      min-height: 40px;
      max-height: 200px;
      outline: none;
      line-height: 1.4;
    }
    .input-wrapper textarea:focus { border-color: var(--accent); }
    .send-btn {
      background: var(--accent);
      color: var(--accent-fg);
      border: none;
      border-radius: var(--radius);
      padding: 8px 16px;
      cursor: pointer;
      font-size: 13px;
      white-space: nowrap;
    }
    .send-btn:hover { background: var(--accent-hover); }
    .send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .stop-btn {
      background: var(--error);
      color: #fff;
    }

    /* ---- 空状态 ---- */
    .empty-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: var(--fg-secondary);
      gap: 12px;
    }
    .empty-state h2 { font-size: 18px; color: var(--fg-primary); }
    .empty-state p { font-size: 13px; text-align: center; max-width: 400px; }
    .empty-state .shortcuts { font-size: 12px; text-align: left; }
    .empty-state kbd {
      background: var(--bg-input);
      border: 1px solid var(--border);
      padding: 1px 6px;
      border-radius: 3px;
      font-size: 11px;
      font-family: var(--font-family);
    }

    /* ---- 加载动画 ---- */
    .loading {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px;
      color: var(--fg-secondary);
      font-size: 12px;
    }
    .loading-dots span {
      display: inline-block;
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: var(--fg-secondary);
      animation: dot-bounce 1.4s infinite ease-in-out both;
    }
    .loading-dots span:nth-child(1) { animation-delay: -0.32s; }
    .loading-dots span:nth-child(2) { animation-delay: -0.16s; }
    @keyframes dot-bounce {
      0%, 80%, 100% { transform: scale(0); }
      40% { transform: scale(1); }
    }

    .hidden { display: none !important; }
  </style>
</head>
<body>
  <!-- 顶栏 -->
  <div class="header">
    <span class="header-title">OpenCode</span>
    <span class="header-session" id="sessionInfo">未连接</span>
    <button class="header-btn" id="btnNewSession">+ 新建会话</button>
    <button class="header-btn" id="btnViewDiff">Diff</button>
    <button class="header-btn" id="btnShowCommands">命令</button>
  </div>

  <!-- 消息区域 -->
  <div class="messages" id="messages">
    <div class="empty-state" id="emptyState">
      <h2>OpenCode</h2>
      <p>AI 编程助手已就绪。输入消息开始对话，或使用快捷键操作。</p>
      <div class="shortcuts">
        <p><kbd>Ctrl+Esc</kbd> 打开/聚焦聊天面板</p>
        <p><kbd>Ctrl+Shift+Esc</kbd> 新建会话</p>
        <p><kbd>Ctrl+Alt+K</kbd> 插入文件引用</p>
        <p><kbd>Ctrl+Alt+L</kbd> 插入选中代码</p>
        <p><kbd>Ctrl+Alt+C</kbd> 中止当前会话</p>
        <p>输入 <kbd>/</kbd> 查看可用命令</p>
      </div>
    </div>
  </div>

  <!-- 状态栏 -->
  <div class="status-bar">
    <span class="status-dot stopped" id="statusDot"></span>
    <span id="statusText">未连接</span>
    <span style="flex:1"></span>
    <span id="modelInfo">-</span>
  </div>

  <!-- 输入区域 -->
  <div class="input-area">
    <div class="input-toolbar">
      <div class="custom-select" id="agentSelect" title="选择 Agent">
        <div class="custom-select-trigger">
          <span class="trigger-text">默认 Agent</span>
          <span class="arrow">▼</span>
        </div>
        <div class="custom-select-dropdown">
          <input class="custom-select-search" placeholder="搜索 Agent..." />
          <div class="custom-select-options"></div>
        </div>
      </div>
      <div class="custom-select" id="modelSelect" title="选择模型">
        <div class="custom-select-trigger">
          <span class="trigger-text">默认模型</span>
          <span class="arrow">▼</span>
        </div>
        <div class="custom-select-dropdown">
          <input class="custom-select-search" placeholder="搜索模型..." />
          <div class="custom-select-options"></div>
        </div>
      </div>
    </div>
    <div class="input-wrapper">
      <textarea
        id="promptInput"
        placeholder="输入消息... (Enter 发送, Shift+Enter 换行, / 查看命令)"
        rows="1"
      ></textarea>
      <button class="send-btn" id="sendBtn">发送</button>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    // 应用状态
    const state = {
      sessionId: null,
      sessions: [],
      statusMap: {},
      providers: null,
      agents: [],
      commands: [],
      isBusy: false,
      messages: [],
      streamingParts: {},  // 正在流式更新的 Part
    };

    // ---- 自定义下拉框组件 ----
    class CustomSelect {
      constructor(el, opts = {}) {
        this.el = el;
        this.value = '';
        this.onChange = opts.onChange || null;
        this.trigger = el.querySelector('.custom-select-trigger');
        this.triggerText = el.querySelector('.trigger-text');
        this.dropdown = el.querySelector('.custom-select-dropdown');
        this.optionsContainer = el.querySelector('.custom-select-options');
        this.searchInput = el.querySelector('.custom-select-search');
        this._options = [];  // { value, label, group, disabled }
        this._setup();
      }

      _setup() {
        // 点击触发器切换下拉
        this.trigger.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this.el.classList.contains('open')) {
            this.close();
          } else {
            // 先关闭其他已打开的下拉框
            document.querySelectorAll('.custom-select.open').forEach(s => {
              if (s !== this.el) s.classList.remove('open');
            });
            this.open();
          }
        });

        // 搜索过滤
        this.searchInput.addEventListener('input', () => {
          const query = this.searchInput.value.toLowerCase();
          this.optionsContainer.querySelectorAll('.custom-select-option').forEach(opt => {
            const text = (opt.textContent || '').toLowerCase();
            opt.classList.toggle('hidden', query && !text.includes(query));
          });
          // 隐藏空分组标签
          this.optionsContainer.querySelectorAll('.custom-select-group-label').forEach(lbl => {
            const next = [];
            let sib = lbl.nextElementSibling;
            while (sib && !sib.classList.contains('custom-select-group-label')) {
              if (sib.classList.contains('custom-select-option')) next.push(sib);
              sib = sib.nextElementSibling;
            }
            const allHidden = next.every(n => n.classList.contains('hidden'));
            lbl.style.display = allHidden ? 'none' : '';
          });
          // 显示空状态
          let emptyEl = this.optionsContainer.querySelector('.custom-select-empty');
          const allHidden = Array.from(this.optionsContainer.querySelectorAll('.custom-select-option')).every(o => o.classList.contains('hidden'));
          if (allHidden) {
            if (!emptyEl) {
              emptyEl = document.createElement('div');
              emptyEl.className = 'custom-select-empty';
              emptyEl.textContent = '无匹配项';
              this.optionsContainer.appendChild(emptyEl);
            }
            emptyEl.style.display = '';
          } else if (emptyEl) {
            emptyEl.style.display = 'none';
          }
        });

        // 阻止搜索框事件冒泡
        this.searchInput.addEventListener('click', (e) => e.stopPropagation());
        this.searchInput.addEventListener('keydown', (e) => e.stopPropagation());

        // 点击外部关闭
        document.addEventListener('click', (e) => {
          if (!this.el.contains(e.target)) this.close();
        });
      }

      open() {
        this.el.classList.add('open');
        this.searchInput.value = '';
        this.searchInput.dispatchEvent(new Event('input'));
        setTimeout(() => this.searchInput.focus(), 0);
      }

      close() {
        this.el.classList.remove('open');
      }

      setValue(val) {
        this.value = val;
        // 更新选中高亮
        this.optionsContainer.querySelectorAll('.custom-select-option').forEach(opt => {
          opt.classList.toggle('selected', opt.dataset.value === val);
        });
      }

      setLabel(text) {
        this.triggerText.textContent = text;
      }

      setOptions(groups) {
        // groups: [{ label?, options: [{ value, label, disabled?, selected? }] }]
        this.optionsContainer.innerHTML = '';
        this._options = [];
        let firstSelected = null;

        for (const group of groups) {
          if (group.label) {
            const lbl = document.createElement('div');
            lbl.className = 'custom-select-group-label';
            lbl.textContent = group.label;
            this.optionsContainer.appendChild(lbl);
          }
          for (const opt of (group.options || [])) {
            const el = document.createElement('div');
            el.className = 'custom-select-option' + (opt.disabled ? ' disabled' : '');
            el.textContent = opt.label;
            el.dataset.value = opt.value;
            if (opt.selected) {
              el.classList.add('selected');
              firstSelected = opt;
            }
            if (!opt.disabled) {
              el.addEventListener('click', (e) => {
                e.stopPropagation();
                this.value = opt.value;
                this.triggerText.textContent = opt.label;
                // 更新选中高亮
                this.optionsContainer.querySelectorAll('.custom-select-option').forEach(o => o.classList.remove('selected'));
                el.classList.add('selected');
                this.close();
                if (this.onChange) this.onChange(opt.value, opt);
              });
            }
            this.optionsContainer.appendChild(el);
            this._options.push(opt);
          }
        }

        if (firstSelected) {
          this.value = firstSelected.value;
          this.triggerText.textContent = firstSelected.label;
        }
      }
    }

    // 初始化自定义下拉框实例
    const modelSelectEl = new CustomSelect(document.getElementById('modelSelect'), {
      onChange(val) {
        if (val) {
          const [providerID, modelID] = val.split('::');
          vscode.postMessage({ type: 'config:setModel', providerID, modelID });
        }
      }
    });

    const agentSelectEl = new CustomSelect(document.getElementById('agentSelect'));

    const app = {
      init() {
        this.setupInput();
        this.setupButtons();
        vscode.postMessage({ type: 'ready' });
      },

      setupButtons() {
        document.getElementById('btnNewSession').addEventListener('click', () => app.newSession());
        document.getElementById('btnViewDiff').addEventListener('click', () => app.viewDiff());
        document.getElementById('btnShowCommands').addEventListener('click', () => app.showCommands());
        document.getElementById('sendBtn').addEventListener('click', () => app.handleSendClick());
      },

      handleSendClick() {
        if (state.isBusy) {
          vscode.postMessage({ type: 'session:abort' });
        } else {
          app.send();
        }
      },

      setupInput() {
        const input = document.getElementById('promptInput');
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.send();
          }
        });
        // 自动调整高度
        input.addEventListener('input', () => {
          input.style.height = 'auto';
          input.style.height = Math.min(input.scrollHeight, 200) + 'px';
        });
      },

      send() {
        const input = document.getElementById('promptInput');
        const text = input.value.trim();
        if (!text) return;

        // 检查是否是命令
        if (text.startsWith('/')) {
          const parts = text.slice(1).split(' ');
          const cmd = parts[0];
          const args = parts.slice(1).join(' ');
          vscode.postMessage({ type: 'command:send', command: cmd, args });
        } else {
          const model = this.getSelectedModel();
          const agent = this.getSelectedAgent();
          vscode.postMessage({ type: 'prompt:sendAsync', text, model, agent });

          // 立即显示用户消息
          this.addMessageToUI({
            info: {
              id: 'temp-' + Date.now(),
              sessionID: state.sessionId,
              role: 'user',
              createdAt: new Date().toISOString(),
            },
            parts: [{ id: 'p1', type: 'text', text }],
          });
        }

        input.value = '';
        input.style.height = 'auto';
        this.setBusy(true);
      },

      getSelectedModel() {
        const val = modelSelectEl.value;
        if (!val) return undefined;
        const [providerID, modelID] = val.split('::');
        return { providerID, modelID };
      },

      getSelectedAgent() {
        return agentSelectEl.value || undefined;
      },

      setBusy(busy) {
        state.isBusy = busy;
        const btn = document.getElementById('sendBtn');
        if (busy) {
          btn.textContent = '停止';
          btn.className = 'send-btn stop-btn';
        } else {
          btn.textContent = '发送';
          btn.className = 'send-btn';
        }
        const dot = document.getElementById('statusDot');
        dot.className = 'status-dot ' + (busy ? 'busy' : 'running');
      },

      newSession() {
        vscode.postMessage({ type: 'session:create' });
      },

      viewDiff() {
        vscode.postMessage({ type: 'session:diff' });
      },

      showCommands() {
        vscode.postMessage({ type: 'commands:list' });
      },

      // ---- 消息渲染 ----

      clearMessages() {
        const container = document.getElementById('messages');
        container.innerHTML = '';
        state.messages = [];
      },

      addMessageToUI(msg) {
        const container = document.getElementById('messages');
        document.getElementById('emptyState')?.remove();

        state.messages.push(msg);
        const el = this.renderMessage(msg);
        container.appendChild(el);
        this.scrollToBottom();
      },

      renderMessage(msg) {
        const { info, parts } = msg;
        const div = document.createElement('div');
        div.className = 'message ' + info.role;
        div.dataset.messageId = info.id;

        // 元信息
        const meta = document.createElement('div');
        meta.className = 'message-meta';
        const roleSpan = document.createElement('span');
        roleSpan.className = 'message-role';
        roleSpan.textContent = info.role === 'user' ? '你' : 'AI';
        meta.appendChild(roleSpan);

        if (info.model) {
          const modelSpan = document.createElement('span');
          modelSpan.textContent = info.model.modelID || '';
          modelSpan.style.fontSize = '10px';
          meta.appendChild(modelSpan);
        }

        const timeSpan = document.createElement('span');
        timeSpan.textContent = new Date(info.createdAt).toLocaleTimeString();
        meta.appendChild(timeSpan);
        div.appendChild(meta);

        // 渲染 Parts
        for (const part of parts) {
          div.appendChild(this.renderPart(part, info));
        }

        // 错误信息
        if (info.error) {
          const errDiv = document.createElement('div');
          errDiv.style.color = 'var(--error)';
          errDiv.style.marginTop = '6px';
          errDiv.textContent = '错误: ' + (info.error.message || info.error.name);
          div.appendChild(errDiv);
        }

        // 操作按钮
        if (info.role === 'assistant') {
          const actions = document.createElement('div');
          actions.className = 'message-actions';

          const copyBtn = this.createActionBtn('复制', () => {
            const text = parts.filter(p => p.type === 'text').map(p => p.text).join('\\n');
            vscode.postMessage({ type: 'copy', text });
          });
          actions.appendChild(copyBtn);

          const revertBtn = this.createActionBtn('撤销', () => {
            vscode.postMessage({ type: 'session:revert', messageId: info.id });
          });
          actions.appendChild(revertBtn);

          const forkBtn = this.createActionBtn('分叉', () => {
            vscode.postMessage({ type: 'session:fork', messageId: info.id });
          });
          actions.appendChild(forkBtn);

          div.appendChild(actions);
        }

        return div;
      },

      renderPart(part, messageInfo) {
        switch (part.type) {
          case 'text':
            return this.renderTextPart(part);
          case 'tool':
            return this.renderToolPart(part);
          case 'snapshot':
          case 'patch':
            return this.renderDiffPart(part);
          case 'file':
            return this.renderFilePart(part);
          default:
            return this.renderGenericPart(part);
        }
      },

      renderTextPart(part) {
        const div = document.createElement('div');
        div.className = 'message-content';
        div.dataset.partId = part.id;
        // 简单的 Markdown 渲染
        div.innerHTML = this.simpleMarkdown(part.text || '');
        return div;
      },

      renderToolPart(part) {
        const div = document.createElement('div');
        div.className = 'tool-call';

        const header = document.createElement('div');
        header.className = 'tool-header';
        header.onclick = () => div.classList.toggle('expanded');

        const statusIcon = document.createElement('span');
        statusIcon.className = 'tool-status ' + (part.state?.status || 'running');
        statusIcon.textContent = part.state?.status === 'completed' ? '✓' :
                                  part.state?.status === 'error' ? '✗' : '◌';
        header.appendChild(statusIcon);

        const name = document.createElement('span');
        name.className = 'tool-name';
        name.textContent = part.tool || 'Tool';
        header.appendChild(name);

        div.appendChild(header);

        const body = document.createElement('div');
        body.className = 'tool-body';
        if (part.state?.input) {
          body.textContent += '输入: ' + (typeof part.state.input === 'string'
            ? part.state.input
            : JSON.stringify(part.state.input, null, 2)) + '\\n\\n';
        }
        if (part.state?.output) {
          body.textContent += '输出: ' + part.state.output;
        }
        if (part.state?.error) {
          body.textContent += '错误: ' + part.state.error;
          body.style.color = 'var(--error)';
        }
        div.appendChild(body);

        return div;
      },

      renderDiffPart(part) {
        const div = document.createElement('div');
        div.className = 'diff-block';

        const header = document.createElement('div');
        header.className = 'diff-header';
        header.textContent = part.file || (part.type === 'snapshot' ? '快照' : '补丁');
        if (part.file) {
          header.style.cursor = 'pointer';
          header.onclick = () => {
            vscode.postMessage({ type: 'file:open', path: part.file });
          };
        }
        div.appendChild(header);

        const content = document.createElement('div');
        content.className = 'diff-content';
        const lines = (part.content || '').split('\\n');
        for (const line of lines) {
          const lineDiv = document.createElement('div');
          lineDiv.className = 'diff-line';
          if (line.startsWith('+')) lineDiv.classList.add('add');
          else if (line.startsWith('-')) lineDiv.classList.add('del');
          else if (line.startsWith('@@')) lineDiv.classList.add('hunk');
          lineDiv.textContent = line;
          content.appendChild(lineDiv);
        }
        div.appendChild(content);
        return div;
      },

      renderFilePart(part) {
        const div = document.createElement('div');
        div.style.fontSize = '12px';
        div.style.color = 'var(--fg-link)';
        div.style.cursor = 'pointer';
        div.textContent = '📎 ' + (part.filename || 'file');
        div.onclick = () => {
          if (part.filename) {
            vscode.postMessage({ type: 'file:open', path: part.filename });
          }
        };
        return div;
      },

      renderGenericPart(part) {
        const div = document.createElement('div');
        div.style.fontSize = '12px';
        div.style.color = 'var(--fg-secondary)';
        div.textContent = '[' + part.type + ']';
        return div;
      },

      createActionBtn(label, onclick) {
        const btn = document.createElement('button');
        btn.className = 'msg-action-btn';
        btn.textContent = label;
        btn.onclick = onclick;
        return btn;
      },

      // ---- 简单 Markdown ----

      simpleMarkdown(text) {
        if (!text) return '';
        return text
          // 代码块
          .replace(/\`\`\`(\\w*)\\n([\\s\\S]*?)\`\`\`/g, '<pre><code class="lang-$1">$2</code></pre>')
          // 行内代码
          .replace(/\`([^\`]+)\`/g, '<code>$1</code>')
          // 加粗
          .replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')
          // 斜体
          .replace(/\\*(.+?)\\*/g, '<em>$1</em>')
          // 链接
          .replace(/\\[(.+?)\\]\\((.+?)\\)/g, '<a href="$2" style="color:var(--fg-link)">$1</a>')
          // 换行
          .replace(/\\n/g, '<br>');
      },

      scrollToBottom() {
        const container = document.getElementById('messages');
        requestAnimationFrame(() => {
          container.scrollTop = container.scrollHeight;
        });
      },

      // ---- SSE 事件更新 ----

      updateFromSSE(eventType, data) {
        switch (eventType) {
          case 'message.updated': {
            // 完整消息更新
            const msgEl = document.querySelector('[data-message-id="' + data.info?.id + '"]');
            if (msgEl && data.info && data.parts) {
              const parent = msgEl.parentNode;
              const newEl = this.renderMessage(data);
              parent.replaceChild(newEl, msgEl);
            } else if (data.info && data.parts) {
              this.addMessageToUI(data);
            }
            break;
          }
          case 'message.part.updated': {
            // Part 更新
            const partEl = document.querySelector('[data-part-id="' + data.id + '"]');
            if (partEl) {
              const newPartEl = this.renderPart(data, {});
              newPartEl.dataset.partId = data.id;
              partEl.parentNode.replaceChild(newPartEl, partEl);
            }
            break;
          }
          case 'message.part.delta': {
            // 增量文本更新
            if (data.type === 'text' && data.id) {
              const partEl = document.querySelector('[data-part-id="' + data.id + '"]');
              if (partEl) {
                // 追加文本
                const current = state.streamingParts[data.id] || '';
                state.streamingParts[data.id] = current + (data.delta || '');
                partEl.innerHTML = this.simpleMarkdown(state.streamingParts[data.id]);
              }
            }
            break;
          }
          case 'session.status': {
            const sessionId = data.sessionID || data.id;
            const status = data.status;
            if (sessionId) {
              state.statusMap[sessionId] = status;
            }
            if (sessionId === state.sessionId) {
              this.setBusy(status === 'busy');
              document.getElementById('statusText').textContent =
                status === 'busy' ? '思考中...' : '就绪';
            }
            break;
          }
          case 'session.idle': {
            this.setBusy(false);
            document.getElementById('statusText').textContent = '就绪';
            state.streamingParts = {};
            break;
          }
          case 'session.error': {
            this.setBusy(false);
            const errMsg = data.error?.message || '未知错误';
            this.addMessageToUI({
              info: { id: 'err-' + Date.now(), role: 'assistant', createdAt: new Date().toISOString(), error: { name: 'Error', message: errMsg } },
              parts: [{ id: 'ep1', type: 'text', text: '发生错误: ' + errMsg }],
            });
            break;
          }
          case 'session.created':
          case 'session.updated':
          case 'session.deleted': {
            vscode.postMessage({ type: 'session:list' });
            break;
          }
          case 'todo.updated': {
            if (data.todos) this.renderTodos(data.todos);
            break;
          }
          case 'permission.asked': {
            // 权限请求在扩展端处理（原生对话框）
            break;
          }
        }
        this.scrollToBottom();
      },

      renderTodos(todos) {
        // 查找或创建 todo container
        let container = document.getElementById('todoContainer');
        if (!container) {
          container = document.createElement('div');
          container.id = 'todoContainer';
          container.className = 'todo-list';
          document.getElementById('messages').appendChild(container);
        }
        container.innerHTML = '<div style="font-size:12px;font-weight:600;margin-bottom:4px;">待办列表:</div>';
        for (const todo of todos) {
          const item = document.createElement('div');
          item.className = 'todo-item';
          const statusEl = document.createElement('span');
          statusEl.className = 'todo-status ' + (todo.status || 'pending');
          statusEl.textContent = todo.status === 'completed' ? '✓' :
                                  todo.status === 'in_progress' ? '◌' : '○';
          item.appendChild(statusEl);
          const text = document.createElement('span');
          text.textContent = todo.content;
          if (todo.status === 'completed') text.style.textDecoration = 'line-through';
          item.appendChild(text);
          container.appendChild(item);
        }
      },

      // ---- 更新 UI 组件 ----

      updateProviders(data, currentModel, enabledProviders, disabledProviders) {
        state.providers = data;
        state.currentModel = currentModel || '';

        const connected = data.connected || [];
        const groups = [];
        let selectedValue = '';

        // 默认选项分组
        const defaultLabel = '默认模型' + (currentModel ? ' (' + currentModel + ')' : '');
        groups.push({ options: [{ value: '', label: defaultLabel, selected: !currentModel }] });

        if (data.all) {
          const connectedProviders = data.all.filter(p => connected.includes(p.id));
          const disconnectedProviders = data.all.filter(p => !connected.includes(p.id));

          if (connectedProviders.length > 0) {
            const opts = [];
            for (const provider of connectedProviders) {
              const models = provider.models ? Object.values(provider.models) : [];
              for (const model of models) {
                const val = provider.id + '::' + model.id;
                const label = provider.id + '/' + (model.name || model.id);
                const isCurrent = currentModel === provider.id + '/' + model.id;
                if (isCurrent) selectedValue = val;
                opts.push({ value: val, label, selected: isCurrent });
              }
            }
            groups.push({ label: '已连接', options: opts });
          }

          if (disconnectedProviders.length > 0) {
            const opts = [];
            for (const provider of disconnectedProviders) {
              const models = provider.models ? Object.values(provider.models) : [];
              for (const model of models) {
                opts.push({
                  value: provider.id + '::' + model.id,
                  label: provider.id + '/' + (model.name || model.id) + ' (未连接)',
                  disabled: true,
                });
              }
            }
            groups.push({ label: '未连接', options: opts });
          }
        }

        modelSelectEl.setOptions(groups);
        if (selectedValue) {
          modelSelectEl.setValue(selectedValue);
        } else {
          modelSelectEl.setValue('');
          modelSelectEl.setLabel(defaultLabel);
        }

        // 更新状态栏模型信息
        document.getElementById('modelInfo').textContent = currentModel || '-';
      },

      updateAgents(agents, defaultAgent) {
        state.agents = agents;

        const visibleAgents = agents.filter(a => !a.hidden);
        const primaryAgents = visibleAgents.filter(a => a.mode !== 'subagent');
        const subAgents = visibleAgents.filter(a => a.mode === 'subagent');

        const groups = [];
        const defaultLabel = '默认 Agent' + (defaultAgent ? ' (' + defaultAgent + ')' : '');
        groups.push({ options: [{ value: '', label: defaultLabel, selected: !defaultAgent }] });

        if (primaryAgents.length > 0) {
          const opts = [];
          for (const agent of primaryAgents) {
            const label = (agent.name || agent.id) + (agent.description ? ' - ' + agent.description : '');
            opts.push({ value: agent.id, label, selected: agent.id === defaultAgent });
          }
          groups.push({ label: '主要 Agent', options: opts });
        }

        if (subAgents.length > 0) {
          const opts = [];
          for (const agent of subAgents) {
            const label = (agent.name || agent.id) + (agent.description ? ' - ' + agent.description : '');
            opts.push({ value: agent.id, label });
          }
          groups.push({ label: '子 Agent (@mention)', options: opts });
        }

        agentSelectEl.setOptions(groups);
        if (defaultAgent) {
          const found = visibleAgents.find(a => a.id === defaultAgent);
          if (found) {
            agentSelectEl.setValue(defaultAgent);
            agentSelectEl.setLabel((found.name || found.id) + (found.description ? ' - ' + found.description : ''));
          }
        } else {
          agentSelectEl.setValue('');
          agentSelectEl.setLabel(defaultLabel);
        }
      },

      updateSessions(sessions, statusMap) {
        state.sessions = sessions;
        state.statusMap = statusMap || {};
      },

      showDiffs(diffs) {
        if (!diffs || diffs.length === 0) {
          this.addMessageToUI({
            info: { id: 'sys-' + Date.now(), role: 'user', createdAt: new Date().toISOString() },
            parts: [{ id: 'dp1', type: 'text', text: '当前会话没有文件变更' }],
          });
          return;
        }
        for (const diff of diffs) {
          const content = (diff.hunks || []).map(h =>
            h.header + '\\n' + (h.lines || []).join('\\n')
          ).join('\\n');
          this.addMessageToUI({
            info: { id: 'diff-' + Date.now() + '-' + diff.path, role: 'assistant', createdAt: new Date().toISOString() },
            parts: [{ id: 'dp-' + diff.path, type: 'patch', file: diff.path, content }],
          });
        }
      },
    };

    // ---- 监听来自扩展的消息 ----
    window.addEventListener('message', (event) => {
      const msg = event.data;
      switch (msg.type) {
        case 'messages:load':
          app.clearMessages();
          if (msg.messages) {
            for (const m of msg.messages) {
              app.addMessageToUI(m);
            }
          }
          break;
        case 'sessions:list':
          app.updateSessions(msg.sessions, msg.statusMap);
          break;
        case 'session:created':
        case 'session:forked':
          state.sessionId = msg.session.id;
          document.getElementById('sessionInfo').textContent =
            msg.session.title || msg.session.id.slice(0, 8);
          app.clearMessages();
          break;
        case 'session:switch':
          state.sessionId = msg.sessionId;
          break;
        case 'session:aborted':
          app.setBusy(false);
          break;
        case 'session:diff':
          app.showDiffs(msg.diffs);
          break;
        case 'providers:list':
          app.updateProviders(msg.providers, msg.currentModel, msg.enabledProviders, msg.disabledProviders);
          break;
        case 'agents:list':
          app.updateAgents(msg.agents, msg.defaultAgent);
          break;
        case 'commands:list':
          if (msg.commands) {
            const cmdText = msg.commands.map(c => '/' + c.name + ' - ' + (c.description || '')).join('\\n');
            app.addMessageToUI({
              info: { id: 'sys-' + Date.now(), role: 'assistant', createdAt: new Date().toISOString() },
              parts: [{ id: 'cp1', type: 'text', text: '可用命令:\\n' + cmdText }],
            });
          }
          break;
        case 'command:result':
          if (msg.result) {
            app.addMessageToUI(msg.result);
          }
          app.setBusy(false);
          break;
        case 'health:status':
          const dot = document.getElementById('statusDot');
          const txt = document.getElementById('statusText');
          if (msg.health?.healthy) {
            dot.className = 'status-dot running';
            txt.textContent = '已连接 v' + (msg.health.version || '');
          } else {
            dot.className = 'status-dot error';
            txt.textContent = '未连接';
          }
          break;
        case 'prompt:append':
          const input = document.getElementById('promptInput');
          input.value += (input.value ? ' ' : '') + msg.text;
          input.focus();
          break;
        case 'sse:event':
          app.updateFromSSE(msg.eventType, msg.data);
          break;
        case 'todo:list':
          if (msg.todos) app.renderTodos(msg.todos);
          break;
        case 'error':
          app.addMessageToUI({
            info: { id: 'err-' + Date.now(), role: 'assistant', createdAt: new Date().toISOString() },
            parts: [{ id: 'ep-' + Date.now(), type: 'text', text: '⚠️ ' + msg.message }],
          });
          app.setBusy(false);
          break;
      }
    });

    // 启动
    app.init();
  </script>
</body>
</html>`;
  }

  dispose(): void {
    ChatPanel.currentPanel = undefined;
    this.sseController?.abort();
    this.panel.dispose();
    while (this.disposables.length) {
      const d = this.disposables.pop();
      if (d) d.dispose();
    }
  }
}

function getNonce(): string {
  let text = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
