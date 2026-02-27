/**
 * Webview 聊天面板 - OpenCode 的核心交互界面
 * 使用 WebviewViewProvider 实现，嵌入侧边栏
 */

import * as vscode from "vscode";
import { OpenCodeClient, Session, MessageWithParts, AnyPart, SSEEvent } from "./client";
import hljs from "highlight.js/lib/core";

// 注册常用语言（按需加载，控制 bundle 体积）
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import cpp from "highlight.js/lib/languages/cpp";
import c from "highlight.js/lib/languages/c";
import csharp from "highlight.js/lib/languages/csharp";
import ruby from "highlight.js/lib/languages/ruby";
import php from "highlight.js/lib/languages/php";
import swift from "highlight.js/lib/languages/swift";
import kotlin from "highlight.js/lib/languages/kotlin";
import scala from "highlight.js/lib/languages/scala";
import css from "highlight.js/lib/languages/css";
import scss from "highlight.js/lib/languages/scss";
import less from "highlight.js/lib/languages/less";
import xml from "highlight.js/lib/languages/xml";
import json from "highlight.js/lib/languages/json";
import yaml from "highlight.js/lib/languages/yaml";
import toml from "highlight.js/lib/languages/ini";
import markdown from "highlight.js/lib/languages/markdown";
import bash from "highlight.js/lib/languages/bash";
import shell from "highlight.js/lib/languages/shell";
import powershell from "highlight.js/lib/languages/powershell";
import sql from "highlight.js/lib/languages/sql";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import graphql from "highlight.js/lib/languages/graphql";
import diff from "highlight.js/lib/languages/diff";
import lua from "highlight.js/lib/languages/lua";
import r from "highlight.js/lib/languages/r";
import dart from "highlight.js/lib/languages/dart";
import elixir from "highlight.js/lib/languages/elixir";

hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("js", javascript);
hljs.registerLanguage("jsx", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("ts", typescript);
hljs.registerLanguage("tsx", typescript);
hljs.registerLanguage("python", python);
hljs.registerLanguage("py", python);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("rs", rust);
hljs.registerLanguage("go", go);
hljs.registerLanguage("golang", go);
hljs.registerLanguage("java", java);
hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("c", c);
hljs.registerLanguage("csharp", csharp);
hljs.registerLanguage("cs", csharp);
hljs.registerLanguage("ruby", ruby);
hljs.registerLanguage("rb", ruby);
hljs.registerLanguage("php", php);
hljs.registerLanguage("swift", swift);
hljs.registerLanguage("kotlin", kotlin);
hljs.registerLanguage("kt", kotlin);
hljs.registerLanguage("scala", scala);
hljs.registerLanguage("css", css);
hljs.registerLanguage("scss", scss);
hljs.registerLanguage("less", less);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("svg", xml);
hljs.registerLanguage("json", json);
hljs.registerLanguage("yaml", yaml);
hljs.registerLanguage("yml", yaml);
hljs.registerLanguage("toml", toml);
hljs.registerLanguage("ini", toml);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("md", markdown);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("sh", bash);
hljs.registerLanguage("zsh", bash);
hljs.registerLanguage("shell", shell);
hljs.registerLanguage("powershell", powershell);
hljs.registerLanguage("ps1", powershell);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("dockerfile", dockerfile);
hljs.registerLanguage("docker", dockerfile);
hljs.registerLanguage("graphql", graphql);
hljs.registerLanguage("gql", graphql);
hljs.registerLanguage("diff", diff);
hljs.registerLanguage("patch", diff);
hljs.registerLanguage("lua", lua);
hljs.registerLanguage("r", r);
hljs.registerLanguage("dart", dart);
hljs.registerLanguage("elixir", elixir);
hljs.registerLanguage("ex", elixir);

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "opencode.chatView";
  public static instance: ChatViewProvider | undefined;

  private view: vscode.WebviewView | undefined;
  private extensionUri: vscode.Uri;
  private client: OpenCodeClient | null = null;
  private currentSessionId: string | null = null;
  private messageLoadVersion = 0;
  private sseController: AbortController | null = null;
  private disposables: vscode.Disposable[] = [];

  constructor(extensionUri: vscode.Uri) {
    this.extensionUri = extensionUri;
    ChatViewProvider.instance = this;
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = this.getHtmlContent();

    // 监听来自 Webview 的消息
    webviewView.webview.onDidReceiveMessage(
      (msg) => this.handleWebviewMessage(msg),
      null,
      this.disposables
    );

    webviewView.onDidDispose(() => {
      this.view = undefined;
      this.sseController?.abort();
      this.sseController = null;
    }, null, this.disposables);

    // 如果已有 client，订阅 SSE 事件
    if (this.client) {
      this.subscribeToEvents();
    }
  }

  /**
   * 聚焦聊天视图
   */
  public focus(): void {
    if (this.view) {
      this.view.show?.(true);
    } else {
      // 视图尚未 resolve，通过命令聚焦容器
      vscode.commands.executeCommand("opencode.chatView.focus");
    }
  }

  public setClient(client: OpenCodeClient): void {
    this.client = client;
    // 重新订阅事件
    this.sseController?.abort();
    if (this.view) {
      this.subscribeToEvents();
    }
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
    if (!this.client) return;
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

    if (!result || !this.currentSessionId || !this.client) return;

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
    if (!this.client) return;
    const loadVersion = ++this.messageLoadVersion;

    try {
      const messages = await this.client.listMessages(sessionId, 1000);
      if (loadVersion !== this.messageLoadVersion) return;
      if (this.currentSessionId !== sessionId) return;

      this.postMessage({ type: "messages:load", sessionId, messages });
    } catch (error: any) {
      if (loadVersion !== this.messageLoadVersion) return;
      this.postMessage({
        type: "error",
        message: `加载消息失败: ${error.message}`,
      });
    }
  }

  private async refreshCurrentSession(): Promise<void> {
    if (!this.currentSessionId) {
      this.postMessage({
        type: "error",
        message: "当前没有可刷新的会话",
      });
      return;
    }

    await Promise.all([
      this.loadMessages(this.currentSessionId),
      this.sendSessionList(),
      this.sendTodoList(),
    ]);
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

      case "session:refresh":
        await this.refreshCurrentSession();
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

      case "highlight:request":
        this.handleHighlightRequest(msg.id, msg.code, msg.lang);
        break;
    }
  }

  private handleHighlightRequest(id: string, code: string, lang: string): void {
    try {
      let result: string;
      const normalizedLang = (lang || "").trim().toLowerCase();
      const langAliasMap: Record<string, string> = {
        "c++": "cpp",
        "c#": "csharp",
        "shellscript": "bash",
      };
      const targetLang = langAliasMap[normalizedLang] || normalizedLang;

      if (targetLang && hljs.getLanguage(targetLang)) {
        result = hljs.highlight(code, { language: targetLang }).value;
      } else {
        // 自动检测语言
        result = hljs.highlightAuto(code).value;
      }
      this.postMessage({ type: "highlight:result", id, html: result });
    } catch {
      // 高亮失败，返回原始代码（已转义的）
      this.postMessage({ type: "highlight:result", id, html: "" });
    }
  }

  private async onWebviewReady(): Promise<void> {
    // 发送初始数据
    await this.sendSessionList();
    await this.sendProviderList();
    await this.sendAgentList();
    await this.sendCommandList();
    await this.sendHealthStatus();

    // 如果已有会话，加载最近的
    if (this.currentSessionId) {
      await Promise.all([
        this.loadMessages(this.currentSessionId),
        this.sendTodoList(),
      ]);
    }
  }

  private async sendPrompt(
    text: string,
    model?: { providerID: string; modelID: string },
    agent?: string
  ): Promise<void> {
    if (!this.client) return;
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
    if (!this.client) return;
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
    if (!this.currentSessionId || !this.client) return;

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
    if (!this.client) return;
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
    if (!this.client) return;
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
    if (!this.client) return;
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
    if (!this.client) return;
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
    if (!this.client) return;
    try {
      const commands = await this.client.listCommands();
      this.postMessage({ type: "commands:list", commands });
    } catch (error: any) {
      console.error("获取命令列表失败:", error);
    }
  }

  private async sendTodoList(): Promise<void> {
    if (!this.currentSessionId || !this.client) return;
    try {
      const todos = await this.client.getSessionTodo(this.currentSessionId);
      this.postMessage({ type: "todo:list", todos });
    } catch (error: any) {
      console.error("获取待办列表失败:", error);
    }
  }

  private async setModel(providerID: string, modelID: string): Promise<void> {
    if (!this.client) return;
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
    if (!this.client) return;
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
    if (!this.currentSessionId || !this.client) return;
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
    if (!this.currentSessionId || !this.client) return;
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
    if (!this.currentSessionId || !this.client) return;
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
    if (!this.currentSessionId || !this.client) return;
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
    this.view?.webview.postMessage(msg);
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
    .message-content { white-space: normal; }
    .message-content code {
      background: rgba(128,128,128,0.15);
      padding: 1px 4px;
      border-radius: 3px;
      font-family: var(--font-family);
      font-size: 13px;
    }
    .message-content pre {
      background: var(--vscode-textCodeBlock-background, rgba(0,0,0,0.2));
      padding: 12px;
      border-radius: var(--radius);
      overflow-x: auto;
      margin: 8px 0;
      border: 1px solid var(--border);
      position: relative;
    }
    .message-content pre code {
      background: none;
      padding: 0;
      font-size: 12px;
      line-height: 1.5;
    }
    .message-content pre .code-lang {
      position: absolute;
      top: 4px;
      right: 8px;
      font-size: 10px;
      color: var(--fg-secondary);
      opacity: 0.7;
      text-transform: uppercase;
      user-select: none;
    }
    .message-content pre .copy-code-btn {
      position: absolute;
      top: 4px;
      right: 50px;
      background: rgba(128,128,128,0.2);
      border: none;
      color: var(--fg-secondary);
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 10px;
      cursor: pointer;
      opacity: 0;
      transition: opacity 0.15s;
    }
    .message-content pre:hover .copy-code-btn { opacity: 1; }
    .message-content pre .copy-code-btn:hover {
      background: var(--accent);
      color: var(--accent-fg);
    }

    /* highlight.js VSCode Dark+ 风格主题 */
    .hljs { color: #d4d4d4; }
    .hljs-comment, .hljs-quote { color: #6a9955; font-style: italic; }
    .hljs-keyword, .hljs-selector-tag { color: #569cd6; }
    .hljs-string, .hljs-addition { color: #ce9178; }
    .hljs-number { color: #b5cea8; }
    .hljs-literal { color: #569cd6; }
    .hljs-type, .hljs-built_in { color: #4ec9b0; }
    .hljs-class .hljs-title, .hljs-title.class_ { color: #4ec9b0; }
    .hljs-function .hljs-title, .hljs-title.function_ { color: #dcdcaa; }
    .hljs-params { color: #9cdcfe; }
    .hljs-variable, .hljs-attr { color: #9cdcfe; }
    .hljs-property { color: #9cdcfe; }
    .hljs-regexp { color: #d16969; }
    .hljs-symbol { color: #b5cea8; }
    .hljs-meta { color: #c586c0; }
    .hljs-meta .hljs-keyword { color: #c586c0; }
    .hljs-meta .hljs-string { color: #ce9178; }
    .hljs-tag { color: #569cd6; }
    .hljs-name { color: #569cd6; }
    .hljs-attribute { color: #9cdcfe; }
    .hljs-selector-id, .hljs-selector-class { color: #d7ba7d; }
    .hljs-selector-attr, .hljs-selector-pseudo { color: #d7ba7d; }
    .hljs-template-tag { color: #569cd6; }
    .hljs-template-variable { color: #9cdcfe; }
    .hljs-deletion { color: #ce9178; background: rgba(206,29,29,0.15); }
    .hljs-addition { background: rgba(0,180,0,0.15); }
    .hljs-section { color: #569cd6; }
    .hljs-emphasis { font-style: italic; }
    .hljs-strong { font-weight: bold; }
    .hljs-bullet { color: #6796e6; }
    .hljs-link { color: #569cd6; text-decoration: underline; }
    .hljs-subst { color: #d4d4d4; }
    .hljs-operator { color: #d4d4d4; }
    .hljs-punctuation { color: #d4d4d4; }

    /* Markdown 标题 */
    .message-content h1 { font-size: 1.4em; font-weight: 700; margin: 12px 0 6px; padding-bottom: 4px; border-bottom: 1px solid var(--border); }
    .message-content h2 { font-size: 1.25em; font-weight: 700; margin: 10px 0 5px; padding-bottom: 3px; border-bottom: 1px solid var(--border); }
    .message-content h3 { font-size: 1.1em; font-weight: 600; margin: 8px 0 4px; }
    .message-content h4 { font-size: 1.0em; font-weight: 600; margin: 6px 0 3px; }
    .message-content h5, .message-content h6 { font-size: 0.95em; font-weight: 600; margin: 4px 0 2px; color: var(--fg-secondary); }

    /* Markdown 列表 */
    .message-content ul, .message-content ol {
      margin: 4px 0;
      padding-left: 24px;
    }
    .message-content li {
      margin: 2px 0;
      line-height: 1.5;
    }
    .message-content li > ul, .message-content li > ol {
      margin: 0;
    }

    /* Markdown 引用 */
    .message-content blockquote {
      margin: 6px 0;
      padding: 4px 12px;
      border-left: 3px solid var(--accent);
      background: rgba(128,128,128,0.06);
      color: var(--fg-secondary);
    }
    .message-content blockquote p {
      margin: 2px 0;
    }

    /* Markdown 表格 */
    .message-content table {
      border-collapse: collapse;
      margin: 8px 0;
      width: 100%;
      font-size: 12px;
    }
    .message-content th, .message-content td {
      border: 1px solid var(--border);
      padding: 5px 10px;
      text-align: left;
    }
    .message-content th {
      background: rgba(128,128,128,0.1);
      font-weight: 600;
    }
    .message-content tr:nth-child(even) {
      background: rgba(128,128,128,0.04);
    }

    /* Markdown 水平线 */
    .message-content hr {
      border: none;
      border-top: 1px solid var(--border);
      margin: 10px 0;
    }

    /* Markdown 段落 */
    .message-content p {
      margin: 4px 0;
      line-height: 1.6;
    }

    /* Markdown 任务列表 */
    .message-content .task-item {
      list-style: none;
      margin-left: -20px;
    }
    .message-content .task-item input[type="checkbox"] {
      margin-right: 6px;
      pointer-events: none;
    }

    /* 链接 */
    .message-content a {
      color: var(--fg-link);
      text-decoration: none;
    }
    .message-content a:hover {
      text-decoration: underline;
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

    /* ---- Token 用量条 ---- */
    .token-bar-container {
      padding: 6px 12px 4px;
      background: var(--bg-secondary);
      border-top: 1px solid var(--border);
      flex-shrink: 0;
      display: none;  /* 默认隐藏，有数据时才显示 */
    }
    .token-bar-container.visible { display: block; }
    .token-bar-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 10px;
      color: var(--fg-secondary);
      margin-bottom: 4px;
      line-height: 1;
    }
    .token-bar-header .token-count {
      font-variant-numeric: tabular-nums;
    }
    .token-bar-header .token-percent {
      font-variant-numeric: tabular-nums;
    }
    .token-bar-track {
      height: 6px;
      width: 100%;
      border-radius: 3px;
      background: color-mix(in srgb, var(--fg-secondary) 15%, transparent);
      overflow: hidden;
      display: flex;
    }
    .token-bar-segment {
      height: 100%;
      transition: flex-basis 0.3s ease, height 0.15s ease;
      min-width: 0;
      position: relative;
    }
    .token-bar-track:hover .token-bar-segment {
      height: 8px;
      margin-top: -1px;
    }
    .token-bar-segment[data-cat="input"] { background: #0ea5e9; }
    .token-bar-segment[data-cat="output"] { background: #ec4899; }
    .token-bar-segment[data-cat="reasoning"] { background: #a855f7; }
    .token-bar-segment[data-cat="cache_read"] { background: var(--success); }
    .token-bar-segment[data-cat="cache_write"] { background: var(--warning); }
    .token-bar-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 4px;
      font-size: 10px;
      color: var(--fg-secondary);
      line-height: 1;
    }
    .token-bar-legend-item {
      display: flex;
      align-items: center;
      gap: 3px;
      cursor: default;
    }
    .token-bar-legend-dot {
      width: 6px;
      height: 6px;
      border-radius: 2px;
      flex-shrink: 0;
    }
    .token-bar-legend-dot[data-cat="input"] { background: #0ea5e9; }
    .token-bar-legend-dot[data-cat="output"] { background: #ec4899; }
    .token-bar-legend-dot[data-cat="reasoning"] { background: #a855f7; }
    .token-bar-legend-dot[data-cat="cache_read"] { background: var(--success); }
    .token-bar-legend-dot[data-cat="cache_write"] { background: var(--warning); }

    /* ---- 输入区域 ---- */
    .input-area {
      position: relative;
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

    /* ---- 斜杠命令面板 ---- */
    .slash-popover {
      display: none;
      position: absolute;
      bottom: calc(100% + 6px);
      left: 12px;
      right: 12px;
      max-height: 260px;
      overflow-y: auto;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.3);
      z-index: 1001;
      padding: 4px 0;
    }
    .slash-popover.visible { display: block; }
    .slash-popover::-webkit-scrollbar { width: 5px; }
    .slash-popover::-webkit-scrollbar-thumb { background: var(--scrollbar); border-radius: 3px; }
    .slash-popover-header {
      padding: 4px 10px 2px;
      font-size: 10px;
      font-weight: 600;
      color: var(--fg-secondary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .slash-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      cursor: pointer;
      font-size: 12px;
    }
    .slash-item:hover,
    .slash-item.active {
      background: var(--accent);
      color: var(--accent-fg);
    }
    .slash-item .slash-name {
      font-weight: 600;
      white-space: nowrap;
    }
    .slash-item .slash-desc {
      color: var(--fg-secondary);
      font-size: 11px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
    }
    .slash-item:hover .slash-desc,
    .slash-item.active .slash-desc {
      color: inherit;
      opacity: 0.8;
    }
    .slash-empty {
      padding: 10px;
      text-align: center;
      color: var(--fg-secondary);
      font-size: 12px;
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
      overflow-y: hidden;
      scrollbar-width: thin;
      scrollbar-color: color-mix(in srgb, var(--accent) 55%, transparent) transparent;
    }
    .input-wrapper textarea:focus { border-color: var(--accent); }
    .input-wrapper textarea.is-scrollable {
      overflow-y: auto;
    }
    .input-wrapper textarea::-webkit-scrollbar {
      width: 10px;
    }
    .input-wrapper textarea::-webkit-scrollbar-track {
      background: transparent;
      margin: 6px 0;
    }
    .input-wrapper textarea::-webkit-scrollbar-thumb {
      background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--accent) 72%, transparent),
        color-mix(in srgb, var(--accent) 42%, transparent)
      );
      border-radius: 999px;
      border: 2px solid transparent;
      background-clip: padding-box;
    }
    .input-wrapper textarea::-webkit-scrollbar-thumb:hover {
      background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--accent) 86%, transparent),
        color-mix(in srgb, var(--accent) 60%, transparent)
      );
      background-clip: padding-box;
    }
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
    <button class="header-btn" id="btnRefreshSession">刷新</button>
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
    <div class="slash-popover" id="slashPopover"></div>
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
        rows="1"
      ></textarea>
      <button class="send-btn" id="sendBtn">发送</button>
    </div>
  </div>

  <!-- Token 用量条 -->
  <div class="token-bar-container" id="tokenBarContainer">
    <div class="token-bar-header">
      <span class="token-count" id="tokenCount">0 tokens</span>
      <span class="token-percent" id="tokenPercent"></span>
    </div>
    <div class="token-bar-track" id="tokenBarTrack"></div>
    <div class="token-bar-legend" id="tokenBarLegend"></div>
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
      // Token 用量跟踪
      tokenUsage: null,  // { input, output, reasoning, cache: { read, write }, total }
      tokenCost: 0,
      contextLimit: 0,   // 当前模型的上下文窗口大小
      modelLimits: {},    // { 'provider/model': { context, output } }
      // 代码高亮状态
      _hlIdCounter: 0,
      _pendingHighlights: [],
      _deferredHighlights: {},
      _highlightDebounceTimers: {},
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

        // 搜索过滤（多关键词：空格分隔，引号内为整体短语）
        this.searchInput.addEventListener('input', () => {
          const raw = this.searchInput.value.trim().toLowerCase();
          // 解析关键词：提取引号短语，剩余按空格拆分
          const keywords = [];
          const regex = /"([^"]+)"|(\S+)/g;
          let m;
          while ((m = regex.exec(raw)) !== null) {
            keywords.push(m[1] || m[2]);
          }
          this.optionsContainer.querySelectorAll('.custom-select-option').forEach(opt => {
            const text = (opt.textContent || '').toLowerCase();
            const visible = keywords.length === 0 || keywords.every(kw => text.includes(kw));
            opt.classList.toggle('hidden', !visible);
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
        const bindClick = (id, handler) => {
          const button = document.getElementById(id);
          if (button) {
            button.addEventListener('click', handler);
          }
        };

        bindClick('btnNewSession', () => app.newSession());
        bindClick('btnRefreshSession', () => app.refreshSession());
        bindClick('sendBtn', () => app.handleSendClick());
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
          // 斜杠面板打开时处理导航
          if (this.slashVisible) {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              this.slashNavigate(1);
              return;
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              this.slashNavigate(-1);
              return;
            } else if (e.key === 'Enter') {
              e.preventDefault();
              this.slashSelect();
              return;
            } else if (e.key === 'Escape') {
              e.preventDefault();
              this.slashHide();
              return;
            } else if (e.key === 'Tab') {
              e.preventDefault();
              this.slashSelect();
              return;
            }
          }
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.send();
          }
        });

        // 监听输入变化，检测斜杠命令
        input.addEventListener('input', () => {
          this.syncInputHeight();
          this.slashDetect(input.value);
        });

        this.syncInputHeight();
      },

      syncInputHeight() {
        const input = document.getElementById('promptInput');
        if (!input) return;

        const maxHeight = 200;
        input.style.height = 'auto';
        const nextHeight = Math.min(input.scrollHeight, maxHeight);
        input.style.height = nextHeight + 'px';

        const isScrollable = input.scrollHeight > maxHeight;
        input.classList.toggle('is-scrollable', isScrollable);
      },

      // ---- 斜杠命令面板 ----
      slashVisible: false,
      slashActiveIndex: 0,
      slashFiltered: [],

      slashDetect(rawText) {
        const match = rawText.match(/^\\/([^\\s]*)$/);
        if (match) {
          const query = match[1].toLowerCase();
          // 合并内置命令和 API 命令
          const builtinSlash = [
            { name: 'compact', description: '压缩当前会话上下文' },
            { name: 'new', description: '新建会话' },
            { name: 'clear', description: '清除当前消息' },
            { name: 'fork', description: '分叉当前会话' },
            { name: 'share', description: '分享当前会话' },
            { name: 'unshare', description: '取消分享会话' },
            { name: 'diff', description: '查看当前变更' },
            { name: 'undo', description: '撤销最近的更改' },
            { name: 'redo', description: '重做撤销的更改' },
            { name: 'model', description: '切换模型' },
            { name: 'agent', description: '切换 Agent' },
          ];
          const apiCmds = (state.commands || []).map(c => ({
            name: c.name,
            description: c.description || '',
            source: 'api',
          }));
          // 合并去重
          const nameSet = new Set(apiCmds.map(c => c.name));
          const allCmds = [...apiCmds, ...builtinSlash.filter(b => !nameSet.has(b.name))];
          // 过滤
          this.slashFiltered = query
            ? allCmds.filter(c => c.name.toLowerCase().includes(query))
            : allCmds;
          this.slashActiveIndex = 0;
          this.slashRender();
          this.slashShow();
        } else {
          this.slashHide();
        }
      },

      slashShow() {
        this.slashVisible = true;
        document.getElementById('slashPopover').classList.add('visible');
      },

      slashHide() {
        this.slashVisible = false;
        this.slashActiveIndex = 0;
        document.getElementById('slashPopover').classList.remove('visible');
      },

      slashRender() {
        const container = document.getElementById('slashPopover');
        container.innerHTML = '';
        if (this.slashFiltered.length === 0) {
          const empty = document.createElement('div');
          empty.className = 'slash-empty';
          empty.textContent = '无匹配命令';
          container.appendChild(empty);
          return;
        }
        const header = document.createElement('div');
        header.className = 'slash-popover-header';
        header.textContent = '命令';
        container.appendChild(header);
        this.slashFiltered.forEach((cmd, idx) => {
          const item = document.createElement('div');
          item.className = 'slash-item' + (idx === this.slashActiveIndex ? ' active' : '');
          item.dataset.index = idx;
          const nameSpan = document.createElement('span');
          nameSpan.className = 'slash-name';
          nameSpan.textContent = '/' + cmd.name;
          item.appendChild(nameSpan);
          if (cmd.description) {
            const descSpan = document.createElement('span');
            descSpan.className = 'slash-desc';
            descSpan.textContent = cmd.description;
            item.appendChild(descSpan);
          }
          if (cmd.source) {
            const badge = document.createElement('span');
            badge.style.cssText = 'font-size:9px;padding:1px 4px;border-radius:3px;background:rgba(128,128,128,0.2);color:var(--fg-secondary);flex-shrink:0;';
            badge.textContent = cmd.source;
            item.appendChild(badge);
          }
          item.addEventListener('click', () => {
            this.slashActiveIndex = idx;
            this.slashSelect();
          });
          item.addEventListener('mouseenter', () => {
            container.querySelectorAll('.slash-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            this.slashActiveIndex = idx;
          });
          container.appendChild(item);
        });
      },

      slashNavigate(dir) {
        const len = this.slashFiltered.length;
        if (len === 0) return;
        this.slashActiveIndex = (this.slashActiveIndex + dir + len) % len;
        const container = document.getElementById('slashPopover');
        container.querySelectorAll('.slash-item').forEach((item, idx) => {
          item.classList.toggle('active', idx === this.slashActiveIndex);
        });
        // 滚动到可见
        const activeEl = container.querySelector('.slash-item.active');
        if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
      },

      slashSelect() {
        const cmd = this.slashFiltered[this.slashActiveIndex];
        if (!cmd) return;
        const input = document.getElementById('promptInput');
        input.value = '/' + cmd.name + ' ';
        input.focus();
        // 将光标移到末尾
        input.setSelectionRange(input.value.length, input.value.length);
        this.syncInputHeight();
        this.slashHide();
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
        this.syncInputHeight();
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

      refreshSession() {
        vscode.postMessage({ type: 'session:refresh' });
      },

      // ---- 消息渲染 ----

      clearMessages() {
        const container = document.getElementById('messages');
        container.innerHTML = '';
        state.messages = [];
        state.streamingParts = {};
        this.resetHighlightState();
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
        state._pendingHighlights = [];
        div.innerHTML = this.simpleMarkdown(part.text || '');
        this.flushPendingHighlights();
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

      // ---- 完整 Markdown 渲染 ----

      simpleMarkdown(text) {
        if (!text) return '';
        return this._parseMarkdownBlocks(text);
      },

      _escapeHtml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      },

      _parseInline(text) {
        if (!text) return '';
        let result = this._escapeHtml(text);
        // 行内代码 (先处理，避免被其他规则干扰)
        result = result.replace(/\`([^\`]+?)\`/g, '<code>$1</code>');
        // 图片
        result = result.replace(/!\\[([^\\]]*)\\]\\(([^)]+)\\)/g, '<img src="$2" alt="$1" style="max-width:100%;border-radius:4px;margin:4px 0;">');
        // 链接
        result = result.replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, '<a href="$2">$1</a>');
        // 加粗+斜体
        result = result.replace(/\\*\\*\\*(.+?)\\*\\*\\*/g, '<strong><em>$1</em></strong>');
        // 加粗
        result = result.replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>');
        // 斜体
        result = result.replace(/\\*(.+?)\\*/g, '<em>$1</em>');
        // 删除线
        result = result.replace(/~~(.+?)~~/g, '<del>$1</del>');
        return result;
      },

      _parseMarkdownBlocks(text) {
        const lines = text.split('\\n');
        let html = '';
        let i = 0;

        while (i < lines.length) {
          const line = lines[i];

          // 代码块
          if (line.match(/^\`\`\`/)) {
            const fenceInfo = line.slice(3).trim();
            const lang = fenceInfo ? fenceInfo.split(/\s+/)[0] : '';
            const codeLines = [];
            i++;
            while (i < lines.length && !lines[i].match(/^\`\`\`\\s*$/)) {
              codeLines.push(lines[i]);
              i++;
            }
            i++; // 跳过闭合 \`\`\`
            const rawCode = codeLines.join('\\n');
            const code = this._escapeHtml(rawCode);
            const langLabel = lang ? '<span class="code-lang">' + this._escapeHtml(lang) + '</span>' : '';
            const hlId = 'hl-' + (++state._hlIdCounter);
            const langClass = lang ? ' lang-' + this._escapeHtml(lang) : '';
            html += '<pre>' + langLabel + '<code class="hljs' + langClass + '" data-hl-id="' + hlId + '">' + code + '</code></pre>';
            // 记录待高亮请求
            state._pendingHighlights.push({ id: hlId, code: rawCode, lang: lang || '' });
            continue;
          }

          // 水平线
          if (line.match(/^(\\*{3,}|-{3,}|_{3,})\\s*$/)) {
            html += '<hr>';
            i++;
            continue;
          }

          // 标题
          const headingMatch = line.match(/^(#{1,6})\\s+(.+)$/);
          if (headingMatch) {
            const level = headingMatch[1].length;
            html += '<h' + level + '>' + this._parseInline(headingMatch[2]) + '</h' + level + '>';
            i++;
            continue;
          }

          // 表格
          if (line.includes('|') && i + 1 < lines.length && lines[i + 1].match(/^[\\s|:-]+$/)) {
            html += this._parseTable(lines, i);
            // 跳过表格行
            i++; // header
            i++; // separator
            while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
              i++;
            }
            continue;
          }

          // 引用
          if (line.match(/^>\\s?/)) {
            const quoteLines = [];
            while (i < lines.length && lines[i].match(/^>\\s?/)) {
              quoteLines.push(lines[i].replace(/^>\\s?/, ''));
              i++;
            }
            html += '<blockquote>' + this._parseMarkdownBlocks(quoteLines.join('\\n')) + '</blockquote>';
            continue;
          }

          // 无序列表
          if (line.match(/^\\s*[-*+]\\s+/)) {
            html += this._parseList(lines, i, 'ul');
            while (i < lines.length && (lines[i].match(/^\\s*[-*+]\\s+/) || lines[i].match(/^\\s{2,}/))) {
              i++;
            }
            continue;
          }

          // 有序列表
          if (line.match(/^\\s*\\d+\\.\\s+/)) {
            html += this._parseList(lines, i, 'ol');
            while (i < lines.length && (lines[i].match(/^\\s*\\d+\\.\\s+/) || lines[i].match(/^\\s{2,}/))) {
              i++;
            }
            continue;
          }

          // 空行
          if (line.trim() === '') {
            i++;
            continue;
          }

          // 普通段落
          const paraLines = [line];
          i++;
          while (i < lines.length && lines[i].trim() !== '' && !lines[i].match(/^(#{1,6}\\s|>\\s?|\`\`\`|\\*{3,}|-{3,}|_{3,}|\\s*[-*+]\\s|\\s*\\d+\\.\\s)/) && !lines[i].includes('|')) {
            paraLines.push(lines[i]);
            i++;
          }
          html += '<p>' + this._parseInline(paraLines.join('\\n')) + '</p>';
        }

        return html;
      },

      _parseTable(lines, startIdx) {
        const headerLine = lines[startIdx];
        const headerCells = headerLine.split('|').map(c => c.trim()).filter(c => c !== '');

        // 解析对齐
        const sepLine = lines[startIdx + 1];
        const aligns = sepLine.split('|').map(c => c.trim()).filter(c => c !== '').map(c => {
          if (c.startsWith(':') && c.endsWith(':')) return 'center';
          if (c.endsWith(':')) return 'right';
          return 'left';
        });

        let html = '<table><thead><tr>';
        headerCells.forEach((cell, idx) => {
          const align = aligns[idx] || 'left';
          html += '<th style="text-align:' + align + '">' + this._parseInline(cell) + '</th>';
        });
        html += '</tr></thead><tbody>';

        let row = startIdx + 2;
        while (row < lines.length && lines[row].includes('|') && lines[row].trim() !== '') {
          const cells = lines[row].split('|').map(c => c.trim()).filter(c => c !== '');
          html += '<tr>';
          cells.forEach((cell, idx) => {
            const align = aligns[idx] || 'left';
            html += '<td style="text-align:' + align + '">' + this._parseInline(cell) + '</td>';
          });
          html += '</tr>';
          row++;
        }

        html += '</tbody></table>';
        return html;
      },

      _parseList(lines, startIdx, tag) {
        const isOrdered = tag === 'ol';
        const itemPattern = isOrdered ? /^(\\s*)\\d+\\.\\s+(.*)/ : /^(\\s*)[-*+]\\s+(.*)/;
        let html = '<' + tag + '>';
        let i = startIdx;

        while (i < lines.length) {
          const match = lines[i].match(itemPattern);
          if (!match) break;

          let content = match[2];
          // 任务列表
          const taskMatch = content.match(/^\\[([ xX])\\]\\s+(.*)/);
          if (taskMatch) {
            const checked = taskMatch[1] !== ' ' ? ' checked' : '';
            html += '<li class="task-item"><input type="checkbox"' + checked + '>' + this._parseInline(taskMatch[2]) + '</li>';
          } else {
            html += '<li>' + this._parseInline(content) + '</li>';
          }
          i++;
        }

        html += '</' + tag + '>';
        return html;
      },

      resetHighlightState() {
        state._pendingHighlights = [];
        state._deferredHighlights = {};
        const timers = state._highlightDebounceTimers || {};
        for (const key of Object.keys(timers)) {
          clearTimeout(timers[key]);
        }
        state._highlightDebounceTimers = {};
      },

      flushPendingHighlights() {
        const pending = state._pendingHighlights || [];
        state._pendingHighlights = [];
        if (pending.length === 0) return;

        for (const req of pending) {
          vscode.postMessage({
            type: 'highlight:request',
            id: req.id,
            code: req.code,
            lang: req.lang,
          });
        }
      },

      deferPendingHighlights(partId) {
        const pending = state._pendingHighlights || [];
        state._pendingHighlights = [];

        if (!partId) return;

        const timers = state._highlightDebounceTimers || {};
        if (timers[partId]) {
          clearTimeout(timers[partId]);
          delete timers[partId];
        }

        if (pending.length === 0) {
          delete state._deferredHighlights[partId];
          state._highlightDebounceTimers = timers;
          return;
        }

        state._deferredHighlights[partId] = pending;
        timers[partId] = setTimeout(() => {
          this.flushDeferredHighlights(partId);
        }, 250);
        state._highlightDebounceTimers = timers;
      },

      flushDeferredHighlights(partId) {
        const timers = state._highlightDebounceTimers || {};
        const deferred = state._deferredHighlights || {};

        if (partId) {
          if (timers[partId]) {
            clearTimeout(timers[partId]);
            delete timers[partId];
          }
          const pending = deferred[partId] || [];
          delete deferred[partId];
          state._highlightDebounceTimers = timers;
          state._deferredHighlights = deferred;

          for (const req of pending) {
            vscode.postMessage({
              type: 'highlight:request',
              id: req.id,
              code: req.code,
              lang: req.lang,
            });
          }
          return;
        }

        for (const key of Object.keys(deferred)) {
          this.flushDeferredHighlights(key);
        }
      },

      applyHighlightResult(id, html) {
        if (!id || !html) return;
        const codeEl = document.querySelector('code[data-hl-id="' + id + '"]');
        if (!codeEl) return;
        codeEl.innerHTML = html;
      },

      scrollToBottom() {
        const container = document.getElementById('messages');
        requestAnimationFrame(() => {
          container.scrollTop = container.scrollHeight;
        });
      },

      // ---- Token 用量条 ----

      /**
       * 从消息列表中计算累积 token 用量
       * 查找最后一条包含 tokens 的 assistant 消息
       */
      computeTokenUsage() {
        let lastTokens = null;
        let totalCost = 0;

        for (let i = state.messages.length - 1; i >= 0; i--) {
          const msg = state.messages[i];
          if (!msg.info || msg.info.role !== 'assistant') continue;

          // 累加 cost
          if (msg.info.cost != null) totalCost += msg.info.cost;

          // 从 parts 中查找 step-finish 的 tokens
          if (!lastTokens && msg.parts) {
            for (let j = msg.parts.length - 1; j >= 0; j--) {
              const part = msg.parts[j];
              if (part.type === 'step-finish' && part.tokens) {
                lastTokens = part.tokens;
                if (part.cost != null) totalCost = Math.max(totalCost, part.cost);
                break;
              }
            }
          }

          // 也检查 info.tokens（某些 API 版本直接在 info 上）
          if (!lastTokens && msg.info.tokens) {
            lastTokens = msg.info.tokens;
          }

          // 只需要最后一条有 tokens 的消息
          if (lastTokens) break;
        }

        if (lastTokens) {
          state.tokenUsage = lastTokens;
          state.tokenCost = totalCost;
          this.renderTokenBar();
        }
      },

      /**
       * 从单条消息/事件中提取 token 数据并更新
       */
      extractAndUpdateTokens(data) {
        if (!data) return;

        let tokens = null;
        let cost = 0;

        // 从 info.tokens 提取
        if (data.info && data.info.tokens) {
          tokens = data.info.tokens;
          cost = data.info.cost || 0;
        }

        // 从 parts 中的 step-finish 提取
        if (data.parts) {
          for (const part of data.parts) {
            if (part.type === 'step-finish' && part.tokens) {
              tokens = part.tokens;
              cost = part.cost || cost;
            }
          }
        }

        // 如果是单个 part 更新（step-finish）
        if (data.type === 'step-finish' && data.tokens) {
          tokens = data.tokens;
          cost = data.cost || 0;
        }

        if (tokens) {
          state.tokenUsage = tokens;
          state.tokenCost = cost;

          // 尝试从消息的 model 信息更新 context limit
          if (data.info && data.info.model) {
            const modelKey = data.info.model.providerID + '/' + data.info.model.modelID;
            if (state.modelLimits[modelKey]) {
              state.contextLimit = state.modelLimits[modelKey].context;
            }
          }

          this.renderTokenBar();
        }
      },

      /**
       * 渲染 token 用量条
       */
      renderTokenBar() {
        const usage = state.tokenUsage;
        if (!usage) return;

        const container = document.getElementById('tokenBarContainer');
        const track = document.getElementById('tokenBarTrack');
        const legend = document.getElementById('tokenBarLegend');
        const countEl = document.getElementById('tokenCount');
        const percentEl = document.getElementById('tokenPercent');

        const input = usage.input || 0;
        const output = usage.output || 0;
        const reasoning = usage.reasoning || 0;
        const cacheRead = (usage.cache && usage.cache.read) || 0;
        const cacheWrite = (usage.cache && usage.cache.write) || 0;
        const total = (usage.total != null) ? usage.total : (input + output + reasoning + cacheRead + cacheWrite);

        // 更新 header
        countEl.textContent = this.formatNumber(total) + ' tokens';

        if (state.contextLimit > 0) {
          const pct = Math.min(100, Math.round((total / state.contextLimit) * 100));
          percentEl.textContent = pct + '%';
        } else {
          percentEl.textContent = '';
        }

        // 构建分段
        const segments = [
          { key: 'input', label: '输入', value: input },
          { key: 'output', label: '输出', value: output },
          { key: 'reasoning', label: '推理', value: reasoning },
          { key: 'cache_read', label: '缓存读取', value: cacheRead },
          { key: 'cache_write', label: '缓存写入', value: cacheWrite },
        ].filter(s => s.value > 0);

        const segmentTotal = segments.reduce((sum, s) => sum + s.value, 0);

        // 渲染 bar track
        track.innerHTML = '';
        for (const seg of segments) {
          const pct = segmentTotal > 0 ? (seg.value / segmentTotal * 100) : 0;
          const el = document.createElement('div');
          el.className = 'token-bar-segment';
          el.dataset.cat = seg.key;
          el.style.flexBasis = pct.toFixed(2) + '%';
          el.title = seg.label + ': ' + this.formatNumber(seg.value) + ' (' + Math.round(pct) + '%)';
          track.appendChild(el);
        }

        // 渲染图例
        legend.innerHTML = '';
        for (const seg of segments) {
          const pct = segmentTotal > 0 ? Math.round(seg.value / segmentTotal * 100) : 0;
          const item = document.createElement('span');
          item.className = 'token-bar-legend-item';
          item.innerHTML = '<span class="token-bar-legend-dot" data-cat="' + seg.key + '"></span>' +
            seg.label + ' ' + this.formatNumber(seg.value) + ' (' + pct + '%)';
          legend.appendChild(item);
        }

        // 显示容器
        container.classList.add('visible');
      },

      /**
       * 重置 token 用量（切换会话时）
       */
      resetTokenBar() {
        state.tokenUsage = null;
        state.tokenCost = 0;
        const container = document.getElementById('tokenBarContainer');
        container.classList.remove('visible');
      },

      /**
       * 格式化数字（带千位分隔符）
       */
      formatNumber(n) {
        if (n == null) return '0';
        return n.toLocaleString();
      },

      // ---- SSE 事件更新 ----

      updateFromSSE(eventType, data) {
        switch (eventType) {
          case 'message.updated': {
            const sessionId = data.info?.sessionID || data.sessionID;
            if (sessionId && state.sessionId && sessionId !== state.sessionId) {
              break;
            }

            let updatedInState = false;
            if (data.info?.id) {
              const idx = state.messages.findIndex(m => m.info?.id === data.info.id);
              if (idx >= 0) {
                state.messages[idx] = data;
                updatedInState = true;
              }
            }

            // 完整消息更新
            const msgEl = document.querySelector('[data-message-id="' + data.info?.id + '"]');
            if (msgEl && data.info && data.parts) {
              if (!updatedInState) {
                state.messages.push(data);
              }
              const parent = msgEl.parentNode;
              const newEl = this.renderMessage(data);
              parent.replaceChild(newEl, msgEl);
            } else if (data.info && data.parts) {
              this.addMessageToUI(data);
            }
            // 提取 token 用量
            this.extractAndUpdateTokens(data);
            break;
          }
          case 'message.part.updated': {
            const sessionId = data.sessionID || data.info?.sessionID;
            if (sessionId && state.sessionId && sessionId !== state.sessionId) {
              break;
            }

            // Part 更新
            const partEl = document.querySelector('[data-part-id="' + data.id + '"]');
            if (partEl) {
              const newPartEl = this.renderPart(data, {});
              newPartEl.dataset.partId = data.id;
              partEl.parentNode.replaceChild(newPartEl, partEl);
              this.extractAndUpdateTokens(data);
            } else if (sessionId && sessionId === state.sessionId) {
              this.extractAndUpdateTokens(data);
            }
            break;
          }
          case 'message.part.delta': {
            const sessionId = data.sessionID || data.info?.sessionID;
            if (sessionId && state.sessionId && sessionId !== state.sessionId) {
              break;
            }

            // 增量文本更新
            if (data.type === 'text' && data.id) {
              const partEl = document.querySelector('[data-part-id="' + data.id + '"]');
              if (partEl) {
                // 追加文本
                const current = state.streamingParts[data.id] || '';
                state.streamingParts[data.id] = current + (data.delta || '');
                state._pendingHighlights = [];
                partEl.innerHTML = this.simpleMarkdown(state.streamingParts[data.id]);
                this.deferPendingHighlights(data.id);
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
            const sessionId = data.sessionID || data.id;
            if (sessionId && sessionId !== state.sessionId) {
              break;
            }

            this.setBusy(false);
            document.getElementById('statusText').textContent = '就绪';
            this.flushDeferredHighlights();
            state.streamingParts = {};
            break;
          }
          case 'session.error': {
            const sessionId = data.sessionID || data.id;
            if (sessionId && sessionId !== state.sessionId) {
              break;
            }

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
            const sessionId = data.sessionID || data.id;
            if (sessionId && sessionId !== state.sessionId) {
              break;
            }

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
                // 收集模型的 context limit
                if (model.limit && model.limit.context) {
                  state.modelLimits[provider.id + '/' + model.id] = {
                    context: model.limit.context,
                    output: model.limit.output || 0,
                  };
                }
              }
            }
            groups.push({ label: '已连接', options: opts });
          }
        }

        // 更新当前模型的 context limit
        if (currentModel && state.modelLimits[currentModel]) {
          state.contextLimit = state.modelLimits[currentModel].context;
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
        this.updateSessionInfoText();
      },

      updateSessionInfoText() {
        const el = document.getElementById('sessionInfo');
        if (!state.sessionId) {
          el.textContent = '未选择会话';
          return;
        }

        const current = (state.sessions || []).find(s => s.id === state.sessionId);
        el.textContent = current?.title || state.sessionId.slice(0, 8);
      },
    };

    // ---- 监听来自扩展的消息 ----
    window.addEventListener('message', (event) => {
      const msg = event.data;
      switch (msg.type) {
        case 'messages:load':
          if (msg.sessionId && state.sessionId && msg.sessionId !== state.sessionId) {
            break;
          }
          if (msg.sessionId) {
            state.sessionId = msg.sessionId;
          }
          app.updateSessionInfoText();
          app.clearMessages();
          app.resetTokenBar();
          if (msg.messages) {
            for (const m of msg.messages) {
              app.addMessageToUI(m);
            }
            // 从已加载的消息中计算 token 用量
            app.computeTokenUsage();
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
          app.resetTokenBar();
          break;
        case 'session:switch':
          state.sessionId = msg.sessionId;
          app.updateSessionInfoText();
          app.clearMessages();
          app.resetHighlightState();
          app.resetTokenBar();
          break;
        case 'session:aborted':
          app.setBusy(false);
          break;
        case 'providers:list':
          app.updateProviders(msg.providers, msg.currentModel, msg.enabledProviders, msg.disabledProviders);
          break;
        case 'agents:list':
          app.updateAgents(msg.agents, msg.defaultAgent);
          break;
        case 'commands:list':
          if (msg.commands) {
            state.commands = msg.commands;
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
          app.syncInputHeight();
          input.focus();
          break;
        case 'sse:event':
          app.updateFromSSE(msg.eventType, msg.data);
          break;
        case 'highlight:result':
          app.applyHighlightResult(msg.id, msg.html);
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
    ChatViewProvider.instance = undefined;
    this.sseController?.abort();
    this.view = undefined;
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
