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
  private _webviewReady = false;
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

    // 在注入 HTML 前先绑定消息监听，避免丢失 webview 启动早期消息（如 ready）
    webviewView.webview.html = this.getHtmlContent();

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
    // 如果 webview 已经就绪，触发初始化
    if (this._webviewReady) {
      this.onWebviewReady().catch((err) => {
        console.error("[OpenCode ChatPanel] onWebviewReady 异常:", err);
      });
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
    const { type } = event;
    const properties = this.normalizeEventProperties(type, event.properties || {});

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
          `OpenCode 错误: ${properties.error?.message || properties.error?.data?.message || "未知错误"}`
        );
        break;
    }
  }

  private normalizeEventProperties(
    type: string,
    properties: Record<string, any>
  ): Record<string, any> {
    if (!properties || typeof properties !== "object") {
      return {};
    }

    if (type === "session.status") {
      const status = properties.status;
      if (status && typeof status === "object" && typeof status.type === "string") {
        return { ...properties, status: status.type };
      }
    }

    if (type === "message.updated" && properties.info) {
      return {
        ...properties,
        info: this.normalizeMessageInfo(properties.info),
      };
    }

    if (type === "message.part.updated") {
      if (properties.part && typeof properties.part === "object") {
        const normalizedPart = this.normalizePart(properties.part as AnyPart) as Record<string, any>;
        if (typeof properties.delta === "string") {
          return { ...normalizedPart, delta: properties.delta };
        }
        return normalizedPart;
      }
      return this.normalizePart(properties as AnyPart) as Record<string, any>;
    }

    if (type === "message.part.delta") {
      const normalizedDelta: Record<string, any> = { ...properties };
      if (typeof properties.partID === "string" && !normalizedDelta.id) {
        normalizedDelta.id = properties.partID;
      }
      if (!normalizedDelta.type && normalizedDelta.field === "text") {
        normalizedDelta.type = "text";
      }
      return normalizedDelta;
    }

    return properties;
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

      const normalizedMessages = messages
        .map((message) => this.normalizeMessage(message))
        .sort(
          (a, b) =>
            this.getMessageTimestamp(a) - this.getMessageTimestamp(b)
        );

      this.postMessage({
        type: "messages:load",
        sessionId,
        messages: normalizedMessages,
      });
    } catch (error: any) {
      if (loadVersion !== this.messageLoadVersion) return;
      this.postMessage({
        type: "error",
        message: `加载消息失败: ${error.message}`,
      });
    }
  }

  private normalizeMessage(message: MessageWithParts): MessageWithParts {
    const raw = message as any;
    const info = this.normalizeMessageInfo(raw.info || {});

    const parts = Array.isArray(raw.parts)
      ? raw.parts.map((part: AnyPart) => this.normalizePart(part))
      : [];

    return {
      ...raw,
      info,
      parts,
    };
  }

  private normalizeMessageInfo(infoInput: any): any {
    const info = { ...(infoInput || {}) } as any;

    if (!info.createdAt && info.time?.created !== undefined) {
      const created =
        typeof info.time.created === "number"
          ? info.time.created
          : Date.parse(String(info.time.created));
      if (Number.isFinite(created)) {
        info.createdAt = new Date(created).toISOString();
      }
    }

    if (!info.model && info.providerID && info.modelID) {
      info.model = {
        providerID: info.providerID,
        modelID: info.modelID,
      };
    }

    if (info.error && !info.error.message && info.error.data?.message) {
      info.error = {
        ...info.error,
        message: info.error.data.message,
      };
    }

    return info;
  }

  private normalizePart(part: AnyPart): AnyPart {
    const raw = part as any;
    if (!raw || typeof raw !== "object") {
      return part;
    }

    if (raw.type === "snapshot" && raw.snapshot && !raw.content) {
      return {
        ...raw,
        content: raw.snapshot,
      } as AnyPart;
    }

    if (raw.type === "patch" && !raw.content) {
      const files = Array.isArray(raw.files) ? raw.files : [];
      return {
        ...raw,
        file: raw.file || files[0],
        content: files.length > 0 ? files.map((f: string) => `- ${f}`).join("\n") : "",
      } as AnyPart;
    }

    return part;
  }

  private getMessageTimestamp(message: MessageWithParts): number {
    const info = (message as any)?.info || {};
    const candidate = info.createdAt ?? info.time?.created;
    if (typeof candidate === "number") {
      return candidate;
    }
    if (typeof candidate === "string") {
      const parsed = Date.parse(candidate);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return 0;
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
        await this.sendPromptAsync(msg.text, msg.model, msg.agent, msg.images);
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

      case "file:diff":
        await this.showFileDiff(msg.path, msg.oldContent, msg.newContent);
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

      case "config:setReasoningEffort":
        await this.setReasoningEffort(msg.reasoningEffort);
        break;

      case "config:setAgent":
        await this.setDefaultAgent(msg.agentID);
        break;

      case "copy":
        await vscode.env.clipboard.writeText(msg.text);
        break;

      case "highlight:request":
        this.handleHighlightRequest(msg.id, msg.code, msg.lang);
        break;

      case "findFiles":
        await this.handleFindFiles(msg.query, msg.requestId);
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

  private async handleFindFiles(query: string, requestId: string): Promise<void> {
    if (!this.client) {
      this.postMessage({ type: "findFiles:results", requestId, files: [] });
      return;
    }
    try {
      const files = await this.client.findFiles(query || "", "file", 10);
      this.postMessage({ type: "findFiles:results", requestId, files: files || [] });
    } catch (error: any) {
      console.error("文件搜索失败:", error);
      this.postMessage({ type: "findFiles:results", requestId, files: [] });
    }
  }

  private async onWebviewReady(): Promise<void> {
    // 标记 webview 已就绪
    this._webviewReady = true;
    
    // 如果 client 未设置，推迟初始化
    if (!this.client) {
      return;
    }

    // 发送扩展设置到 webview
    this.sendSettings();
    
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

  private sendSettings(): void {
    const config = vscode.workspace.getConfiguration("opencode");
    this.postMessage({
      type: "settings:update",
      settings: {
        toolCallsCollapsed: config.get<boolean>("chat.toolCallsCollapsed", false),
        showDiffOnWrite: config.get<boolean>("chat.showDiffOnWrite", true),
      },
    });
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
    agent?: string,
    images?: Array<{ dataUrl: string; filename: string; mediaType: string }>
  ): Promise<void> {
    if (!this.client) return;
    if (!this.currentSessionId) {
      await this.createSession();
    }
    if (!this.currentSessionId) return;

    try {
      const parts: Array<
        | { type: "text"; text: string }
        | { type: "file"; mediaType: string; filename: string; url: string }
      > = [];
      if (text) {
        parts.push({ type: "text", text });
      }
      if (images && images.length > 0) {
        for (const img of images) {
          parts.push({
            type: "file",
            mediaType: img.mediaType,
            filename: img.filename,
            url: img.dataUrl,
          });
        }
      }
      if (parts.length === 0) {
        parts.push({ type: "text", text: "" });
      }
      await this.client.sendPromptAsync(this.currentSessionId, {
        parts,
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
    if (!this.client) return;

    // 本地处理的命令：无需发给后端
    switch (command) {
      case "model":
        // 触发模型选择器 UI
        this.postMessage({ type: "selector:show", selector: "model" });
        this.postMessage({ type: "command:done" });
        return;
      case "agent":
        // 触发 Agent 选择器 UI
        this.postMessage({ type: "selector:show", selector: "agent" });
        this.postMessage({ type: "command:done" });
        return;
      case "new":
        await this.createSession();
        this.postMessage({ type: "command:done" });
        return;
      case "clear":
        // 清除 UI 消息（不影响后端）
        this.postMessage({ type: "messages:clear" });
        this.postMessage({ type: "command:done" });
        return;
      case "fork":
        await this.forkCurrentSession();
        this.postMessage({ type: "command:done" });
        return;
      case "compact":
        if (!this.currentSessionId) return;
        try {
          // compact 使用 summarize 端点
          await this.client.summarizeSession(
            this.currentSessionId,
            args || "", // providerID（可选，空串让后端自动选择）
            ""          // modelID（可选）
          );
          this.postMessage({ type: "info", message: "上下文已压缩" });
          // 刷新消息
          await this.refreshCurrentSession();
        } catch (error: any) {
          this.postMessage({
            type: "error",
            message: `压缩上下文失败: ${error?.message || String(error)}`,
          });
        }
        this.postMessage({ type: "command:done" });
        return;
      case "share":
        if (!this.currentSessionId) return;
        try {
          await this.client.shareSession(this.currentSessionId);
          this.postMessage({ type: "info", message: "会话已分享" });
        } catch (error: any) {
          this.postMessage({
            type: "error",
            message: `分享失败: ${error?.message || String(error)}`,
          });
        }
        this.postMessage({ type: "command:done" });
        return;
      case "unshare":
        if (!this.currentSessionId) return;
        try {
          await this.client.unshareSession(this.currentSessionId);
          this.postMessage({ type: "info", message: "已取消分享" });
        } catch (error: any) {
          this.postMessage({
            type: "error",
            message: `取消分享失败: ${error?.message || String(error)}`,
          });
        }
        this.postMessage({ type: "command:done" });
        return;
      case "diff":
        try {
          await vscode.commands.executeCommand("opencode.viewDiff");
        } catch (error: any) {
          this.postMessage({
            type: "error",
            message: `查看 Diff 失败: ${error?.message || String(error)}`,
          });
        }
        this.postMessage({ type: "command:done" });
        return;
      case "undo":
        if (!this.currentSessionId) return;
        try {
          const messages = await this.client.listMessages(this.currentSessionId);
          const lastAssistant = [...messages].reverse().find(
            (m) => m.info.role === "assistant"
          );
          if (lastAssistant) {
            await this.client.revertMessage(this.currentSessionId, lastAssistant.info.id);
            this.postMessage({ type: "info", message: "已撤销最近的更改" });
            await this.refreshCurrentSession();
          } else {
            this.postMessage({ type: "info", message: "没有可撤销的更改" });
          }
        } catch (error: any) {
          this.postMessage({
            type: "error",
            message: `撤销失败: ${error?.message || String(error)}`,
          });
        }
        this.postMessage({ type: "command:done" });
        return;
      case "redo":
        if (!this.currentSessionId) return;
        try {
          await this.unrevertMessages();
          this.postMessage({ type: "info", message: "已重做" });
        } catch (error: any) {
          this.postMessage({
            type: "error",
            message: `重做失败: ${error?.message || String(error)}`,
          });
        }
        this.postMessage({ type: "command:done" });
        return;
    }

    // 非本地命令：发给后端 API
    if (!this.currentSessionId) return;
    try {
      const result = await this.client.sendCommand(this.currentSessionId, {
        command,
        arguments: args,
      });
      this.postMessage({ type: "command:result", result });
    } catch (error: any) {
      const errMsg = error?.message || String(error) || "未知错误";
      this.postMessage({
        type: "error",
        message: `命令执行失败: ${errMsg}`,
      });
    }
    this.postMessage({ type: "command:done" });
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
      const [sessions, rawStatusMap] = await Promise.all([
        this.client.listSessions(),
        this.client.getSessionStatus().catch(() => ({})),
      ]);
      const sessionsWithoutSubagent = sessions.filter(
        (session) => !(session as any).parentID && !(session as any).parentId
      );
      const statusMap = this.normalizeStatusMap(rawStatusMap as Record<string, any>);
      this.postMessage({
        type: "sessions:list",
        sessions: sessionsWithoutSubagent,
        statusMap,
      });
    } catch (error: any) {
      this.postMessage({
        type: "error",
        message: `获取会话列表失败: ${error.message}`,
      });
    }
  }

  private normalizeStatusMap(statusMap: Record<string, any>): Record<string, string> {
    const normalized: Record<string, string> = {};
    for (const [sessionID, status] of Object.entries(statusMap || {})) {
      if (typeof status === "string") {
        normalized[sessionID] = status;
        continue;
      }
      if (status && typeof status === "object" && typeof status.type === "string") {
        normalized[sessionID] = status.type;
      }
    }
    return normalized;
  }

  private async sendProviderList(): Promise<void> {
    if (!this.client) return;
    try {
      const [providers, config] = await Promise.all([
        this.client.getProviders(),
        this.client.getConfig().catch(() => ({})),
      ]);
      const currentModel = (config as any)?.model || "";
      const currentReasoningEffort =
        (config as any)?.reasoning_effort ||
        (config as any)?.reasoningEffort ||
        "";
      const enabledProviders = (config as any)?.enabled_providers || [];
      const disabledProviders = (config as any)?.disabled_providers || [];
      const connected = providers.connected || [];
      
      // 过滤 provider：只显示已连接的（且未被禁用，如果在 enabled_providers 中则必须包含）
      const filteredProviders = {
        ...providers,
        all: (providers.all || []).filter((p) => {
          if (disabledProviders.includes(p.id)) return false;
          if (enabledProviders.length > 0 && !enabledProviders.includes(p.id)) return false;
          return connected.includes(p.id);
        }),
      };
      
      this.postMessage({
        type: "providers:list",
        providers: filteredProviders,
        currentModel,
        currentReasoningEffort,
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

  private async setReasoningEffort(reasoningEffort?: string): Promise<void> {
    if (!this.client) return;
    try {
      const raw = (reasoningEffort || "").trim().toLowerCase();
      const normalized = raw === "auto" ? "" : raw;
      await this.client.updateConfig({
        reasoning_effort: normalized || null,
      });
      this.postMessage({
        type: "reasoningEffort:updated",
        reasoningEffort: normalized,
      });
    } catch (error: any) {
      this.postMessage({
        type: "error",
        message: `设置推理强度失败: ${error.message}`,
      });
    }
  }

  private async setDefaultAgent(agentID: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.updateConfig({ default_agent: agentID });
    } catch (error: any) {
      this.postMessage({
        type: "error",
        message: `设置 Agent 失败: ${error.message}`,
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
      // 静默成功 — 不弹出通知
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
      // 静默成功 — 不弹出通知
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

  private async showFileDiff(
    filePath: string,
    oldContent?: string,
    newContent?: string
  ): Promise<void> {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
      if (!workspaceFolder) return;

      // 如果有 oldContent 和 newContent，展示内容 diff
      if (oldContent != null && newContent != null) {
        const oldUri = vscode.Uri.parse(
          `untitled:${filePath}.原始`
        );
        const newUri = vscode.Uri.parse(
          `untitled:${filePath}.修改后`
        );
        await vscode.commands.executeCommand(
          "vscode.diff",
          oldUri,
          newUri,
          `${filePath} (变更对比)`
        );
        return;
      }

      // 否则打开 git diff（如果有 git）
      const fileUri = vscode.Uri.joinPath(workspaceFolder, filePath);
      const gitUri = fileUri.with({ scheme: "git", query: "HEAD" });
      await vscode.commands.executeCommand(
        "vscode.diff",
        gitUri,
        fileUri,
        `${filePath} (Git 变更)`
      );
    } catch (error: any) {
      // 回退到直接打开文件
      await this.openFile(filePath);
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
      --bg-tertiary: color-mix(in srgb, var(--bg-secondary) 84%, var(--bg-primary));
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
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      scrollbar-width: thin;
      scrollbar-color: var(--scrollbar) transparent;
    }
    *::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }
    *::-webkit-scrollbar-track {
      background: transparent;
    }
    *::-webkit-scrollbar-thumb {
      background: color-mix(in srgb, var(--scrollbar) 82%, transparent);
      border-radius: 999px;
    }
    *::-webkit-scrollbar-button {
      width: 0;
      height: 0;
      display: none;
    }
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
      padding: 12px 12px 18px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .message {
      width: 100%;
      max-width: 100%;
      padding: 10px 12px;
      border-radius: 10px;
      border: 1px solid var(--border);
      background: var(--bg-secondary);
      line-height: 1.55;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    .message.user {
      border-left: 3px solid var(--accent);
      background: color-mix(in srgb, var(--accent) 10%, var(--bg-secondary));
    }
    .message.assistant {
      border-left: 3px solid color-mix(in srgb, var(--success) 75%, var(--border));
      background: var(--bg-tertiary);
    }
    .message.system {
      border-style: dashed;
      background: transparent;
      color: var(--fg-secondary);
      font-size: 12px;
      text-align: center;
    }
    .message-meta {
      font-size: 11px;
      color: var(--fg-secondary);
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    /* 角色标签已移除，通过消息容器 CSS 类名区分 user/assistant */
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
    /* 内联操作按钮已移除，改为右键上下文菜单 */
    .ctx-menu {
      position: fixed;
      z-index: 9999;
      min-width: 120px;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 4px 0;
      box-shadow: 0 4px 12px rgba(0,0,0,0.25);
    }
    .ctx-menu-item {
      padding: 6px 14px;
      font-size: 12px;
      cursor: pointer;
      color: var(--fg-primary);
    }
    .ctx-menu-item:hover {
      background: color-mix(in srgb, var(--accent) 18%, transparent);
    }

    /* ---- 工具调用 ---- */
    .tool-call {
      margin: 8px 0;
      border: 1px solid color-mix(in srgb, var(--border) 76%, var(--accent));
      border-radius: 8px;
      overflow: hidden;
      background: color-mix(in srgb, var(--bg-tertiary) 86%, var(--bg-primary));
    }
    .tool-call.tool-running {
      border-color: color-mix(in srgb, var(--warning) 52%, var(--border));
    }
    .tool-call.tool-error {
      border-color: color-mix(in srgb, var(--error) 58%, var(--border));
    }
    .tool-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      cursor: pointer;
      font-size: 12px;
      background: color-mix(in srgb, var(--fg-secondary) 10%, transparent);
      user-select: none;
    }
    .tool-badge {
      flex-shrink: 0;
      padding: 1px 6px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 600;
      border: 1px solid var(--border);
      color: var(--fg-secondary);
      background: color-mix(in srgb, var(--fg-secondary) 10%, transparent);
    }
    .tool-badge.running {
      color: color-mix(in srgb, var(--warning) 90%, var(--fg-primary));
      border-color: color-mix(in srgb, var(--warning) 52%, var(--border));
      background: color-mix(in srgb, var(--warning) 18%, transparent);
    }
    .tool-badge.completed {
      color: color-mix(in srgb, var(--success) 88%, var(--fg-primary));
      border-color: color-mix(in srgb, var(--success) 52%, var(--border));
      background: color-mix(in srgb, var(--success) 18%, transparent);
    }
    .tool-badge.error {
      color: color-mix(in srgb, var(--error) 88%, var(--fg-primary));
      border-color: color-mix(in srgb, var(--error) 52%, var(--border));
      background: color-mix(in srgb, var(--error) 18%, transparent);
    }
    .tool-name {
      font-family: var(--font-family);
      font-size: 11px;
      font-weight: 600;
      color: var(--fg-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 40%;
    }
    .tool-summary {
      flex: 1;
      color: var(--fg-secondary);
      font-size: 11px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .tool-toggle {
      flex-shrink: 0;
      font-size: 11px;
      color: var(--fg-secondary);
    }
    .tool-actions {
      display: flex;
      gap: 4px;
      flex-shrink: 0;
    }
    .tool-action-btn {
      font-size: 11px;
      padding: 1px 6px;
      border-radius: 3px;
      background: var(--accent);
      color: var(--fg-primary);
      cursor: pointer;
      white-space: nowrap;
      opacity: 0.85;
      transition: opacity 0.15s;
    }
    .tool-action-btn:hover {
      opacity: 1;
    }
    .tool-body {
      border-top: 1px solid color-mix(in srgb, var(--border) 78%, transparent);
      padding: 8px 10px;
      display: none;
      background: color-mix(in srgb, var(--bg-primary) 82%, transparent);
    }
    .tool-call.expanded .tool-body {
      display: block;
    }
    .tool-section + .tool-section {
      margin-top: 8px;
    }
    .tool-section-title {
      font-size: 10px;
      color: var(--fg-secondary);
      margin-bottom: 4px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .tool-section-content {
      font-family: var(--font-family);
      font-size: 12px;
      line-height: 1.45;
      white-space: pre-wrap;
      border: 1px solid color-mix(in srgb, var(--border) 84%, transparent);
      border-radius: 6px;
      padding: 6px 8px;
      max-height: 240px;
      overflow: auto;
      background: color-mix(in srgb, var(--bg-secondary) 88%, transparent);
    }
    .tool-section-content.error {
      border-color: color-mix(in srgb, var(--error) 58%, var(--border));
      color: var(--error);
      background: color-mix(in srgb, var(--error) 8%, transparent);
    }

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

    /* ---- 底部待办面板 ---- */
    .todo-panel {
      display: none;
      border-top: 1px solid var(--border);
      background: var(--bg-secondary);
      flex-shrink: 0;
      max-height: 200px;
      overflow: hidden;
    }
    .todo-panel.visible { display: block; }
    .todo-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 4px 12px;
      cursor: pointer;
      font-size: 11px;
      font-weight: 600;
      color: var(--fg-secondary);
      user-select: none;
    }
    .todo-panel-header:hover { color: var(--fg-primary); }
    .todo-panel-toggle {
      font-size: 10px;
      transition: transform 0.15s ease;
    }
    .todo-panel.collapsed .todo-panel-toggle { transform: rotate(180deg); }
    .todo-panel-body {
      padding: 0 12px 6px;
      overflow-y: auto;
      max-height: 170px;
    }
    .todo-panel.collapsed .todo-panel-body { display: none; }
    .todo-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 2px 0;
      font-size: 12px;
    }
    .todo-status { width: 12px; text-align: center; flex-shrink: 0; }
    .todo-status.completed { color: var(--success); }
    .todo-status.in_progress { color: var(--warning); }
    .todo-status.pending { color: var(--fg-secondary); }
    .todo-status.cancelled { color: var(--error); }

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
      padding: 6px 12px;
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
      overflow: visible;
      display: flex;
      position: relative;
    }
    .token-bar-segment {
      height: 100%;
      transition: flex-basis 0.3s ease, height 0.15s ease;
      min-width: 0;
      position: relative;
    }
    .token-bar-segment:first-child {
      border-top-left-radius: 3px;
      border-bottom-left-radius: 3px;
    }
    .token-bar-segment:last-child {
      border-top-right-radius: 3px;
      border-bottom-right-radius: 3px;
    }
    .token-bar-track:hover .token-bar-segment {
      height: 8px;
      margin-top: -1px;
    }
    .token-bar-segment[data-cat="input"] { background: #0ea5e9; }
    .token-bar-segment[data-cat="output"] { background: #ec4899; }
    .token-bar-segment[data-cat="reasoning"] { background: #a855f7; }
    .token-bar-segment[data-cat="cache"] { background: #f59e0b; }
    .token-bar-segment[data-cat="remaining"] { background: color-mix(in srgb, var(--fg-secondary) 18%, transparent); }
    .token-bar-segment::after {
      content: attr(data-tooltip);
      position: absolute;
      left: 50%;
      bottom: calc(100% + 8px);
      transform: translate(-50%, 4px);
      background: color-mix(in srgb, var(--bg-secondary) 90%, #000);
      color: var(--fg-primary);
      border: 1px solid var(--border);
      border-radius: 5px;
      padding: 4px 6px;
      font-size: 10px;
      line-height: 1.2;
      white-space: nowrap;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.14s ease, transform 0.14s ease;
      z-index: 2;
    }
    .token-bar-segment:hover::after {
      opacity: 1;
      transform: translate(-50%, 0);
    }

    /* ---- 输入区域 ---- */
    .input-area {
      position: relative;
      padding: 10px 12px;
      background: var(--bg-secondary);
      border-top: 1px solid var(--border);
      flex-shrink: 0;
    }
    #attachedImages {
      display: none;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 6px;
    }
    .attached-image-thumb {
      position: relative;
      width: 48px;
      height: 48px;
      border-radius: 6px;
      overflow: hidden;
      border: 1px solid var(--border);
    }
    .attached-image-thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .attached-image-remove {
      position: absolute;
      top: -2px;
      right: -2px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: var(--error);
      color: #fff;
      border: none;
      font-size: 10px;
      line-height: 16px;
      text-align: center;
      cursor: pointer;
      padding: 0;
    }
    .webview-toast {
      position: fixed;
      bottom: 60px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--bg-secondary);
      color: var(--fg-primary);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 6px 14px;
      font-size: 12px;
      z-index: 9999;
      box-shadow: 0 4px 12px rgba(0,0,0,0.25);
      animation: toast-fade-in 0.2s ease;
    }
    @keyframes toast-fade-in {
      from { opacity: 0; transform: translateX(-50%) translateY(8px); }
      to { opacity: 1; transform: translateX(-50%) translateY(0); }
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
    .custom-select-trigger-input {
      width: 100%;
      min-width: 0;
      border: none;
      outline: none;
      background: transparent;
      color: var(--fg-primary);
      font-size: 11px;
      line-height: 1.2;
    }
    .custom-select-trigger-input::placeholder {
      color: color-mix(in srgb, var(--fg-secondary) 90%, transparent);
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
    .custom-select.without-search .custom-select-search {
      display: none;
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
    .custom-select-option.kb-highlight {
      background: color-mix(in srgb, var(--accent) 18%, transparent);
      outline: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
      outline-offset: -1px;
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
    #modelSelect {
      flex: 1;
      max-width: none;
      min-width: 140px;
    }
    #modelSelect .custom-select-trigger {
      padding-right: 6px;
    }
    #agentSelect {
      min-width: 100px;
      max-width: 180px;
    }
    #agentSelect .custom-select-trigger {
      padding-right: 6px;
    }
    #reasoningEffortSelect {
      min-width: 92px;
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

    /* ---- @ 文件引用面板 ---- */
    .at-mention-popup {
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
      z-index: 1002;
      padding: 4px 0;
    }
    .at-mention-popup.visible { display: block; }
    .at-mention-popup::-webkit-scrollbar { width: 5px; }
    .at-mention-popup::-webkit-scrollbar-thumb { background: var(--scrollbar); border-radius: 3px; }
    .at-mention-popup-header {
      padding: 4px 10px 2px;
      font-size: 10px;
      font-weight: 600;
      color: var(--fg-secondary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .at-mention-item {
      display: flex;
      flex-direction: column;
      gap: 1px;
      padding: 6px 10px;
      cursor: pointer;
      font-size: 12px;
    }
    .at-mention-item:hover,
    .at-mention-item.active {
      background: var(--accent);
      color: var(--accent-fg);
    }
    .at-mention-item .at-mention-filename {
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .at-mention-item .at-mention-filepath {
      color: var(--fg-secondary);
      font-size: 11px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .at-mention-item:hover .at-mention-filepath,
    .at-mention-item.active .at-mention-filepath {
      color: inherit;
      opacity: 0.8;
    }
    .at-mention-empty {
      padding: 10px;
      text-align: center;
      color: var(--fg-secondary);
      font-size: 12px;
    }
    .at-mention-loading {
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
      scrollbar-color: var(--scrollbar) transparent;
    }
    .input-wrapper textarea:focus { border-color: var(--accent); }
    .input-wrapper textarea.is-scrollable {
      overflow-y: auto;
    }
    .input-wrapper textarea::-webkit-scrollbar {
      width: 8px;
    }
    .input-wrapper textarea::-webkit-scrollbar-track {
      background: transparent;
    }
    .input-wrapper textarea::-webkit-scrollbar-thumb {
      background: color-mix(in srgb, var(--scrollbar) 82%, transparent);
      border-radius: 999px;
      border: none;
    }
    .input-wrapper textarea::-webkit-scrollbar-thumb:hover {
      background: color-mix(in srgb, var(--scrollbar) 95%, transparent);
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

  <!-- 底部 Todo 面板 -->
  <div class="todo-panel" id="todoPanel">
    <div class="todo-panel-header" id="todoPanelHeader">
      <span class="todo-panel-title" id="todoPanelTitle">待办列表</span>
      <span class="todo-panel-toggle" id="todoPanelToggle">▲</span>
    </div>
    <div class="todo-panel-body" id="todoPanelBody"></div>
  </div>

  <!-- 输入区域 -->
  <div class="input-area">
    <div class="slash-popover" id="slashPopover"></div>
    <div class="at-mention-popup" id="atMentionPopup"></div>
    <div class="input-toolbar">
      <div class="custom-select" id="agentSelect" title="选择 Agent">
        <div class="custom-select-trigger">
          <input class="custom-select-trigger-input" placeholder="搜索 Agent..." />
          <span class="arrow">▼</span>
        </div>
        <div class="custom-select-dropdown">
          <div class="custom-select-options"></div>
        </div>
      </div>
      <div class="custom-select" id="modelSelect" title="选择模型">
        <div class="custom-select-trigger">
          <input class="custom-select-trigger-input" placeholder="搜索模型..." />
          <span class="arrow">▼</span>
        </div>
        <div class="custom-select-dropdown">
          <div class="custom-select-options"></div>
        </div>
      </div>
      <div class="custom-select" id="reasoningEffortSelect" title="推理强度">
        <div class="custom-select-trigger">
          <span class="trigger-text">推理: 自动</span>
          <span class="arrow">▼</span>
        </div>
        <div class="custom-select-dropdown">
          <input class="custom-select-search" placeholder="搜索推理强度..." />
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
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    // 立即通知后端 webview 已就绪（在任何其他初始化之前）
    vscode.postMessage({ type: 'ready' });

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
      modelCapabilities: {},  // { 'provider/model': { imageInput } }
      attachedImages: [],     // [ { dataUrl, filename } ]
      currentReasoningEffort: '',
      // 设置
      settings: { toolCallsCollapsed: false, showDiffOnWrite: true },
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
        this.onSearchTermChange = opts.onSearchTermChange || null;
        this.searchInTrigger = !!opts.searchInTrigger;
        this.showSearch = opts.showSearch !== false;
        this.trigger = el.querySelector('.custom-select-trigger');
        this.triggerText = el.querySelector('.trigger-text');
        this.triggerInput = el.querySelector('.custom-select-trigger-input');
        this.dropdown = el.querySelector('.custom-select-dropdown');
        this.optionsContainer = el.querySelector('.custom-select-options');
        this.searchInput = this.searchInTrigger
          ? this.triggerInput
          : el.querySelector('.custom-select-search');
        this._options = [];  // { value, label, group, disabled }
        this._selectedLabel = '';
        this._highlightIdx = -1;  // 方向键导航索引
        this.el.__customSelectInstance = this;
        if (!this.searchInTrigger && !this.showSearch) {
          this.el.classList.add('without-search');
        }
        this._setup();
      }

      _setup() {
        // 点击触发器切换下拉
        this.trigger.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this.searchInTrigger) {
            if (
              this.el.classList.contains('open') &&
              e.target &&
              e.target.classList &&
              e.target.classList.contains('arrow')
            ) {
              this.close();
              return;
            }
            if (!this.el.classList.contains('open')) {
              this.open();
            }
            if (this.triggerInput) {
              this.triggerInput.focus();
            }
            return;
          }
          if (this.el.classList.contains('open')) {
            this.close();
          } else {
            this.open();
          }
        });

        if (this.searchInput) {
          this.searchInput.addEventListener('input', () => {
            this.applyFilter(this.searchInput.value || '');
          });

          // 阻止搜索框事件冒泡
          this.searchInput.addEventListener('click', (e) => e.stopPropagation());
          this.searchInput.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Escape') {
              e.preventDefault();
              this.close();
              return;
            }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              const visibleOpts = Array.from(
                this.optionsContainer.querySelectorAll('.custom-select-option:not(.hidden):not(.disabled)')
              );
              if (visibleOpts.length === 0) return;
              // 移除旧高亮
              visibleOpts.forEach(o => o.classList.remove('kb-highlight'));
              if (e.key === 'ArrowDown') {
                this._highlightIdx = (this._highlightIdx + 1) % visibleOpts.length;
              } else {
                this._highlightIdx = (this._highlightIdx - 1 + visibleOpts.length) % visibleOpts.length;
              }
              const target = visibleOpts[this._highlightIdx];
              if (target) {
                target.classList.add('kb-highlight');
                target.scrollIntoView({ block: 'nearest' });
              }
              return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
              // 优先选中键盘高亮项
              const highlighted = this.optionsContainer.querySelector('.custom-select-option.kb-highlight');
              if (highlighted) {
                e.preventDefault();
                highlighted.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                return;
              }
              // 兜底：选中第一个可见项
              if (e.key === 'Enter') {
                const selected = this.selectFirstVisibleOption();
                if (selected) {
                  e.preventDefault();
                  return;
                }
              }
            }
          });

          if (this.searchInTrigger) {
            this.searchInput.addEventListener('focus', () => {
              if (!this.el.classList.contains('open')) {
                this.open();
              }
            });
          }
        }

        // 点击外部关闭
        document.addEventListener('click', (e) => {
          if (!this.el.contains(e.target)) this.close();
        });
      }

      open() {
        document.querySelectorAll('.custom-select.open').forEach(s => {
          if (s === this.el) return;
          const instance = s.__customSelectInstance;
          if (instance && typeof instance.close === 'function') {
            instance.close();
          } else {
            s.classList.remove('open');
          }
        });
        this.el.classList.add('open');
        if (this.searchInput && this.searchInTrigger) {
          this.searchInput.value = '';
          this.applyFilter('');
          setTimeout(() => this.searchInput.focus(), 0);
          return;
        }
        if (this.searchInput && this.showSearch) {
          this.searchInput.value = '';
          this.applyFilter('');
          setTimeout(() => this.searchInput.focus(), 0);
          return;
        }
        this.applyFilter('');
      }

      close() {
        this.el.classList.remove('open');
        if (this.searchInTrigger && this.searchInput) {
          this.searchInput.value = this._selectedLabel || '';
        }
        this.applyFilter('');
      }

      setValue(val) {
        this.value = val || '';
        let selectedEl = null;
        // 更新选中高亮
        this.optionsContainer.querySelectorAll('.custom-select-option').forEach(opt => {
          const isSelected = opt.dataset.value === this.value;
          opt.classList.toggle('selected', isSelected);
          if (isSelected) {
            selectedEl = opt;
          }
        });
        if (selectedEl) {
          this._selectedLabel = selectedEl.dataset.label || selectedEl.textContent || '';
        }
        if (this.searchInTrigger && this.triggerInput && !this.el.classList.contains('open')) {
          this.triggerInput.value = this._selectedLabel || '';
        }
      }

      setLabel(text) {
        this._selectedLabel = text || '';
        if (this.searchInTrigger && this.triggerInput) {
          if (!this.el.classList.contains('open')) {
            this.triggerInput.value = this._selectedLabel;
          }
          return;
        }
        if (this.triggerText) {
          this.triggerText.textContent = this._selectedLabel;
        }
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
            el.dataset.label = opt.label;
            el.dataset.searchOnly = opt.searchOnly ? 'true' : 'false';
            if (opt.selected) {
              el.classList.add('selected');
              firstSelected = opt;
            }
            if (!opt.disabled) {
              el.addEventListener('click', (e) => {
                e.stopPropagation();
                this.value = opt.value;
                this._selectedLabel = opt.label;
                if (this.searchInTrigger && this.triggerInput) {
                  this.triggerInput.value = opt.label;
                } else if (this.triggerText) {
                  this.triggerText.textContent = opt.label;
                }
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
          this._selectedLabel = firstSelected.label;
          if (this.searchInTrigger && this.triggerInput) {
            if (!this.el.classList.contains('open')) {
              this.triggerInput.value = firstSelected.label;
            }
          } else if (this.triggerText) {
            this.triggerText.textContent = firstSelected.label;
          }
        } else if (this.searchInTrigger && this.triggerInput && !this.el.classList.contains('open')) {
          this.triggerInput.value = this._selectedLabel || '';
        }

        this.applyFilter('');
      }

      parseKeywords(rawText) {
        const raw = (rawText || '').trim().toLowerCase();
        const keywords = [];
        const regex = /"([^"]+)"|(\S+)/g;
        let m;
        while ((m = regex.exec(raw)) !== null) {
          keywords.push(m[1] || m[2]);
        }
        return keywords;
      }

      applyFilter(rawText) {
        this._highlightIdx = -1;  // 重置键盘导航索引
        const keywords = this.parseKeywords(rawText);
        if (this.onSearchTermChange) {
          this.onSearchTermChange(keywords.join(' '), keywords);
        }

        this.optionsContainer.querySelectorAll('.custom-select-option').forEach(opt => {
          const text = ((opt.dataset.label || opt.textContent) || '').toLowerCase();
          const isSelected = opt.classList.contains('selected');
          const searchOnly = opt.dataset.searchOnly === 'true';
          const allowScope = !searchOnly || keywords.length > 0 || isSelected;
          const matches = keywords.length === 0 || keywords.every(kw => text.includes(kw));
          const visible = allowScope && matches;
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
          const allHidden = next.length > 0 && next.every(n => n.classList.contains('hidden'));
          lbl.style.display = allHidden ? 'none' : '';
        });

        // 显示空状态
        let emptyEl = this.optionsContainer.querySelector('.custom-select-empty');
        const optionEls = Array.from(this.optionsContainer.querySelectorAll('.custom-select-option'));
        const allHidden = optionEls.length > 0 && optionEls.every(o => o.classList.contains('hidden'));
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
      }

      selectFirstVisibleOption() {
        const first = this.optionsContainer.querySelector(
          '.custom-select-option:not(.hidden):not(.disabled)'
        );
        if (!first) return false;
        first.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return true;
      }
    }

    // 初始化自定义下拉框实例
    const modelSelectEl = new CustomSelect(document.getElementById('modelSelect'), {
      searchInTrigger: true,
      onChange(val) {
        const modelInfoEl = document.getElementById('modelInfo');
        if (val) {
          const [providerID, modelID] = val.split('::');
          const modelKey = providerID + '/' + modelID;
          state.contextLimit = state.modelLimits[modelKey]?.context || 0;
          modelInfoEl.textContent = modelKey;
          vscode.postMessage({ type: 'config:setModel', providerID, modelID });
        } else {
          state.contextLimit = 0;
          modelInfoEl.textContent = '-';
        }
        app.renderTokenBar();
      }
    });

    const agentSelectEl = new CustomSelect(document.getElementById('agentSelect'), {
      searchInTrigger: true,
      onChange(val, opt) {
        // 选中后 trigger 只显示名称，不含描述
        const agent = (state.agents || []).find(a => a.id === val);
        if (agent) {
          agentSelectEl.setLabel(agent.name || agent.id);
        }
        // 通知后端设置默认 Agent
        if (val) {
          vscode.postMessage({ type: 'config:setAgent', agentID: val });
        }
      },
    });

    const reasoningEffortSelectEl = new CustomSelect(
      document.getElementById('reasoningEffortSelect'),
      {
        showSearch: false,
        onChange(val) {
          vscode.postMessage({
            type: 'config:setReasoningEffort',
            reasoningEffort: val || '',
          });
        },
      }
    );

    const app = {
      init() {
        this.setupInput();
        this.setupButtons();
        // ready 消息已在脚本顶部提前发送
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
          // @ 文件引用面板打开时处理导航
          if (this.atMentionVisible) {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              this.atMentionNavigate(1);
              return;
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              this.atMentionNavigate(-1);
              return;
            } else if (e.key === 'Enter') {
              e.preventDefault();
              this.atMentionSelect();
              return;
            } else if (e.key === 'Escape') {
              e.preventDefault();
              this.atMentionHide();
              return;
            } else if (e.key === 'Tab') {
              e.preventDefault();
              this.atMentionSelect();
              return;
            }
          }
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.send();
          }
        });

        // 监听输入变化，检测斜杠命令和 @ 文件引用
        input.addEventListener('input', () => {
          this.syncInputHeight();
          this.slashDetect(input.value);
          this.atMentionDetect();
        });

        // 粘贴事件：优先文本，图片作为附件
        input.addEventListener('paste', (e) => {
          const clipboardData = e.clipboardData;
          if (!clipboardData) return;

          // 如果剪贴板有纯文本，让浏览器默认处理
          const text = clipboardData.getData('text/plain');
          if (text) return;

          // 检查图片文件
          const items = Array.from(clipboardData.items || []);
          for (const item of items) {
            if (item.type.startsWith('image/')) {
              e.preventDefault();

              // 检查当前模型是否支持图片
              if (!this.currentModelSupportsImage()) {
                this.showToast('当前模型不支持图片输入');
                return;
              }

              const file = item.getAsFile();
              if (!file) return;

              const reader = new FileReader();
              reader.onload = () => {
                const dataUrl = reader.result;
                if (typeof dataUrl === 'string') {
                  state.attachedImages.push({
                    dataUrl,
                    filename: 'clipboard-' + Date.now() + '.' + (item.type.split('/')[1] || 'png'),
                    mediaType: item.type,
                  });
                  this.renderAttachedImages();
                }
              };
              reader.readAsDataURL(file);
              return;
            }
          }
        });

        this.syncInputHeight();
      },

      currentModelSupportsImage() {
        const val = modelSelectEl.value;
        if (!val) return false;
        const [providerID, modelID] = val.split('::');
        const key = providerID + '/' + modelID;
        const cap = state.modelCapabilities[key];
        return cap && cap.imageInput;
      },

      showToast(message) {
        // 简易 toast 提示
        let toast = document.querySelector('.webview-toast');
        if (toast) toast.remove();
        toast = document.createElement('div');
        toast.className = 'webview-toast';
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
      },

      renderAttachedImages() {
        let container = document.getElementById('attachedImages');
        if (!container) {
          container = document.createElement('div');
          container.id = 'attachedImages';
          const inputArea = document.querySelector('.input-area');
          if (inputArea) {
            inputArea.insertBefore(container, inputArea.firstChild);
          }
        }
        container.innerHTML = '';
        if (state.attachedImages.length === 0) {
          container.style.display = 'none';
          return;
        }
        container.style.display = 'flex';
        for (let i = 0; i < state.attachedImages.length; i++) {
          const img = state.attachedImages[i];
          const wrapper = document.createElement('div');
          wrapper.className = 'attached-image-thumb';

          const imgEl = document.createElement('img');
          imgEl.src = img.dataUrl;
          wrapper.appendChild(imgEl);

          const removeBtn = document.createElement('button');
          removeBtn.className = 'attached-image-remove';
          removeBtn.textContent = '×';
          removeBtn.addEventListener('click', () => {
            state.attachedImages.splice(i, 1);
            this.renderAttachedImages();
          });
          wrapper.appendChild(removeBtn);

          container.appendChild(wrapper);
        }
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

      // ---- @ 文件引用面板 ----
      atMentionVisible: false,
      atMentionActiveIndex: 0,
      atMentionResults: [],
      atMentionTriggerPos: -1,  // '@' 在 textarea 中的位置
      atMentionLoading: false,
      _atDebounceTimer: null,
      _atRequestId: 0,

      atMentionDetect() {
        const input = document.getElementById('promptInput');
        const cursorPos = input.selectionStart;
        const text = input.value;

        // 从光标位置往前找最近的 '@'
        let atPos = -1;
        for (let i = cursorPos - 1; i >= 0; i--) {
          const ch = text[i];
          if (ch === '@') {
            // '@' 要么在行首，要么前面是空白
            if (i === 0 || /\\s/.test(text[i - 1])) {
              atPos = i;
            }
            break;
          }
          // 遇到空白或换行，停止
          if (ch === '\\n' || ch === '\\r') break;
        }

        if (atPos < 0) {
          this.atMentionHide();
          return;
        }

        // 光标在 '@' 之前，关闭
        if (cursorPos <= atPos) {
          this.atMentionHide();
          return;
        }

        // 提取 '@' 后的查询文本
        const query = text.substring(atPos + 1, cursorPos);

        // 如果查询包含换行，关闭
        if (query.includes('\\n') || query.includes('\\r')) {
          this.atMentionHide();
          return;
        }

        this.atMentionTriggerPos = atPos;

        // 显示弹出框（先显示加载状态）
        if (!this.atMentionVisible) {
          this.atMentionShow();
        }

        // 防抖搜索
        if (this._atDebounceTimer) {
          clearTimeout(this._atDebounceTimer);
        }
        this._atDebounceTimer = setTimeout(() => {
          this._atDebounceTimer = null;
          this.atMentionSearch(query);
        }, 300);
      },

      atMentionSearch(query) {
        this.atMentionLoading = true;
        this._atRequestId++;
        const requestId = 'at-' + this._atRequestId;
        this.atMentionRenderLoading();
        vscode.postMessage({ type: 'findFiles', query: query || '', requestId });
      },

      atMentionHandleResults(requestId, files) {
        // 忽略旧的请求结果
        if (requestId !== 'at-' + this._atRequestId) return;
        this.atMentionLoading = false;
        this.atMentionResults = (files || []).slice(0, 10);
        this.atMentionActiveIndex = 0;
        this.atMentionRender();
      },

      atMentionShow() {
        this.atMentionVisible = true;
        document.getElementById('atMentionPopup').classList.add('visible');
      },

      atMentionHide() {
        this.atMentionVisible = false;
        this.atMentionActiveIndex = 0;
        this.atMentionResults = [];
        this.atMentionTriggerPos = -1;
        this.atMentionLoading = false;
        if (this._atDebounceTimer) {
          clearTimeout(this._atDebounceTimer);
          this._atDebounceTimer = null;
        }
        document.getElementById('atMentionPopup').classList.remove('visible');
      },

      atMentionRenderLoading() {
        const container = document.getElementById('atMentionPopup');
        container.innerHTML = '';
        const header = document.createElement('div');
        header.className = 'at-mention-popup-header';
        header.textContent = '文件引用';
        container.appendChild(header);
        const loading = document.createElement('div');
        loading.className = 'at-mention-loading';
        loading.textContent = '搜索文件...';
        container.appendChild(loading);
      },

      atMentionRender() {
        const container = document.getElementById('atMentionPopup');
        container.innerHTML = '';

        const header = document.createElement('div');
        header.className = 'at-mention-popup-header';
        header.textContent = '文件引用';
        container.appendChild(header);

        if (this.atMentionResults.length === 0) {
          const empty = document.createElement('div');
          empty.className = 'at-mention-empty';
          empty.textContent = '未找到匹配文件';
          container.appendChild(empty);
          return;
        }

        this.atMentionResults.forEach((filePath, idx) => {
          const item = document.createElement('div');
          item.className = 'at-mention-item' + (idx === this.atMentionActiveIndex ? ' active' : '');
          item.dataset.index = idx;

          // 文件名（最后一段路径）
          const parts = filePath.replace(/\\\\/g, '/').split('/');
          const filename = parts[parts.length - 1] || filePath;

          const nameSpan = document.createElement('span');
          nameSpan.className = 'at-mention-filename';
          nameSpan.textContent = filename;
          item.appendChild(nameSpan);

          const pathSpan = document.createElement('span');
          pathSpan.className = 'at-mention-filepath';
          pathSpan.textContent = filePath;
          item.appendChild(pathSpan);

          item.addEventListener('click', () => {
            this.atMentionActiveIndex = idx;
            this.atMentionSelect();
          });
          item.addEventListener('mouseenter', () => {
            container.querySelectorAll('.at-mention-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            this.atMentionActiveIndex = idx;
          });
          container.appendChild(item);
        });
      },

      atMentionNavigate(dir) {
        const len = this.atMentionResults.length;
        if (len === 0) return;
        this.atMentionActiveIndex = (this.atMentionActiveIndex + dir + len) % len;
        const container = document.getElementById('atMentionPopup');
        container.querySelectorAll('.at-mention-item').forEach((item, idx) => {
          item.classList.toggle('active', idx === this.atMentionActiveIndex);
        });
        const activeEl = container.querySelector('.at-mention-item.active');
        if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
      },

      atMentionSelect() {
        const filePath = this.atMentionResults[this.atMentionActiveIndex];
        if (!filePath) return;

        const input = document.getElementById('promptInput');
        const text = input.value;
        const atPos = this.atMentionTriggerPos;
        const cursorPos = input.selectionStart;

        if (atPos < 0 || atPos >= text.length) {
          this.atMentionHide();
          return;
        }

        // 替换 @query 为 @filepath
        const before = text.substring(0, atPos);
        const after = text.substring(cursorPos);
        const replacement = '@' + filePath + ' ';
        input.value = before + replacement + after;

        // 将光标移到插入的文件路径之后
        const newPos = before.length + replacement.length;
        input.setSelectionRange(newPos, newPos);
        input.focus();
        this.syncInputHeight();
        this.atMentionHide();
      },

      send() {
        const input = document.getElementById('promptInput');
        const text = input.value.trim();
        if (!text && state.attachedImages.length === 0) return;

        // 检查是否是命令
        if (text.startsWith('/')) {
          const parts = text.slice(1).split(' ');
          const cmd = parts[0];
          const args = parts.slice(1).join(' ');
          vscode.postMessage({ type: 'command:send', command: cmd, args });
        } else {
          const model = this.getSelectedModel();
          const agent = this.getSelectedAgent();
          // 收集图片附件
          const images = state.attachedImages.map(img => ({
            dataUrl: img.dataUrl,
            filename: img.filename,
            mediaType: img.mediaType,
          }));
          vscode.postMessage({ type: 'prompt:sendAsync', text: text || '', model, agent, images });

          // 立即显示用户消息
          const uiParts = [];
          if (text) uiParts.push({ id: 'p1', type: 'text', text });
          for (let i = 0; i < images.length; i++) {
            uiParts.push({ id: 'pimg' + i, type: 'file', mediaType: images[i].mediaType, filename: images[i].filename, url: images[i].dataUrl });
          }
          this.addMessageToUI({
            info: {
              id: 'temp-' + Date.now(),
              sessionID: state.sessionId,
              role: 'user',
              createdAt: new Date().toISOString(),
            },
            parts: uiParts.length > 0 ? uiParts : [{ id: 'p1', type: 'text', text: '' }],
          });
          // 清空附件
          state.attachedImages = [];
          this.renderAttachedImages();
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
        if (info.model || (info.providerID && info.modelID)) {
          const model = info.model || { providerID: info.providerID, modelID: info.modelID };
          const modelSpan = document.createElement('span');
          modelSpan.textContent = model.modelID || '';
          modelSpan.style.fontSize = '10px';
          meta.appendChild(modelSpan);
        }

        const timeSpan = document.createElement('span');
        const createdAt = info.createdAt || (info.time && info.time.created ? new Date(info.time.created).toISOString() : null);
        timeSpan.textContent = createdAt ? new Date(createdAt).toLocaleTimeString() : '--:--:--';
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
          const errMsg = info.error.message || (info.error.data && info.error.data.message) || info.error.name;
          errDiv.textContent = '错误: ' + errMsg;
          div.appendChild(errDiv);
        }

        // 右键上下文菜单（替代内联操作按钮）
        if (info.role === 'assistant') {
          div.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // 移除已存在的上下文菜单
            document.querySelectorAll('.ctx-menu').forEach(m => m.remove());

            const menu = document.createElement('div');
            menu.className = 'ctx-menu';
            menu.style.left = e.clientX + 'px';
            menu.style.top = e.clientY + 'px';

            const items = [
              { label: '复制', action: () => {
                const text = parts.filter(p => p.type === 'text').map(p => p.text).join('\\n');
                vscode.postMessage({ type: 'copy', text });
              }},
              { label: '撤销', action: () => {
                vscode.postMessage({ type: 'session:revert', messageId: info.id });
              }},
              { label: '分叉', action: () => {
                vscode.postMessage({ type: 'session:fork', messageId: info.id });
              }},
            ];

            for (const item of items) {
              const menuItem = document.createElement('div');
              menuItem.className = 'ctx-menu-item';
              menuItem.textContent = item.label;
              menuItem.addEventListener('click', () => {
                menu.remove();
                item.action();
              });
              menu.appendChild(menuItem);
            }

            document.body.appendChild(menu);

            // 点击其他地方关闭菜单
            const closeMenu = (ev) => {
              if (!menu.contains(ev.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu, true);
              }
            };
            setTimeout(() => document.addEventListener('click', closeMenu, true), 0);
          });
        }

        return div;
      },

      renderPart(part, messageInfo) {
        let el;
        switch (part.type) {
          case 'text':
            el = this.renderTextPart(part);
            break;
          case 'tool':
            el = this.renderToolPart(part);
            break;
          case 'snapshot':
          case 'patch':
            el = this.renderDiffPart(part);
            break;
          case 'file':
            el = this.renderFilePart(part);
            break;
          default:
            el = this.renderGenericPart(part);
            break;
        }
        if (part.id && el && !el.dataset.partId) {
          el.dataset.partId = part.id;
        }
        return el;
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
        const formatValue = (value) => {
          if (value == null) return '';
          if (typeof value === 'string') return value;
          try {
            return JSON.stringify(value, null, 2);
          } catch {
            return String(value);
          }
        };

        const summarizeValue = (value, maxLen = 96) => {
          const text = formatValue(value).replace(/\s+/g, ' ').trim();
          if (!text) return '';
          return text.length > maxLen ? text.slice(0, maxLen) + '...' : text;
        };

        // 解析输入为对象
        const parseInput = (input) => {
          if (input == null) return {};
          if (typeof input === 'object') return input;
          if (typeof input === 'string') {
            try { return JSON.parse(input); } catch { return { raw: input }; }
          }
          return { raw: String(input) };
        };

        const toolName = (part.tool || part.name || 'tool').toLowerCase();

        // ---- 工具分类 ----
        const READONLY_TOOLS = ['read', 'read_file', 'glob', 'grep', 'search', 'list_directory', 'list_files', 'find_files'];
        const WRITE_TOOLS = ['write', 'write_file', 'create_file', 'edit', 'edit_file', 'patch', 'replace', 'insert'];
        const EXEC_TOOLS = ['bash', 'execute', 'shell', 'run_command'];

        let toolCategory = 'generic';
        if (READONLY_TOOLS.includes(toolName)) toolCategory = 'readonly';
        else if (WRITE_TOOLS.includes(toolName)) toolCategory = 'write';
        else if (EXEC_TOOLS.includes(toolName)) toolCategory = 'exec';

        const status = String(part.state?.status || 'running').toLowerCase();
        const normalizedStatus =
          status === 'completed' || status === 'error' ? status : 'running';
        const statusLabel =
          normalizedStatus === 'completed'
            ? '已完成'
            : normalizedStatus === 'error'
              ? '失败'
              : '执行中';

        const div = document.createElement('div');
        div.className = 'tool-call tool-' + normalizedStatus + ' tool-cat-' + toolCategory;
        // 未完成的工具默认展开；已完成的根据设置决定
        if (normalizedStatus !== 'completed') {
          div.classList.add('expanded');
        } else if (!state.settings.toolCallsCollapsed) {
          div.classList.add('expanded');
        }

        const header = document.createElement('div');
        header.className = 'tool-header';

        const badge = document.createElement('span');
        badge.className = 'tool-badge ' + normalizedStatus;
        badge.textContent = statusLabel;
        header.appendChild(badge);

        const name = document.createElement('span');
        name.className = 'tool-name';
        name.textContent = part.tool || part.name || 'tool';
        header.appendChild(name);

        // ---- 按工具类型生成不同的摘要 ----
        const summary = document.createElement('span');
        summary.className = 'tool-summary';
        const inputObj = parseInput(part.state?.input);

        if (toolCategory === 'readonly') {
          // 只读工具：显示文件路径或搜索模式
          const filePath = inputObj.path || inputObj.filePath || inputObj.file || inputObj.pattern || '';
          summary.textContent = filePath
            ? filePath
            : summarizeValue(part.state?.input) || (normalizedStatus === 'running' ? '读取中...' : '');
        } else if (toolCategory === 'write') {
          // 写入工具：显示目标文件路径
          const filePath = inputObj.path || inputObj.filePath || inputObj.file || '';
          summary.textContent = filePath || summarizeValue(part.state?.input) || '';
        } else if (toolCategory === 'exec') {
          // 执行工具：显示命令
          const cmd = inputObj.command || inputObj.cmd || '';
          summary.textContent = cmd
            ? (cmd.length > 80 ? cmd.slice(0, 80) + '...' : cmd)
            : summarizeValue(part.state?.input) || '';
        } else {
          // 通用/MCP 工具
          summary.textContent =
            normalizedStatus === 'error'
              ? summarizeValue(part.state?.error) || '工具调用失败'
              : summarizeValue(part.state?.output) ||
                summarizeValue(part.state?.input) ||
                (normalizedStatus === 'running' ? '等待输出...' : '无输出');
        }
        header.appendChild(summary);

        // ---- 操作按钮区域 ----
        const actions = document.createElement('span');
        actions.className = 'tool-actions';

        if (toolCategory === 'readonly' && normalizedStatus === 'completed') {
          const filePath = inputObj.path || inputObj.filePath || inputObj.file || '';
          if (filePath) {
            const openBtn = document.createElement('span');
            openBtn.className = 'tool-action-btn';
            openBtn.textContent = '打开';
            openBtn.title = '在编辑器中打开此文件';
            openBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              const line = inputObj.line || inputObj.offset || inputObj.startLine || 0;
              vscode.postMessage({ type: 'file:open', path: filePath, line: Number(line) || 0 });
            });
            actions.appendChild(openBtn);
          }
        }

        if (toolCategory === 'write' && normalizedStatus === 'completed') {
          const filePath = inputObj.path || inputObj.filePath || inputObj.file || '';
          if (filePath) {
            const diffBtn = document.createElement('span');
            diffBtn.className = 'tool-action-btn';
            diffBtn.textContent = '查看 Diff';
            diffBtn.title = '在编辑器中查看变更';
            diffBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              vscode.postMessage({
                type: 'file:diff',
                path: filePath,
                oldContent: inputObj.oldContent || inputObj.old_string || inputObj.oldString || '',
                newContent: inputObj.newContent || inputObj.new_string || inputObj.newString || inputObj.content || '',
              });
            });
            actions.appendChild(diffBtn);
          }
        }

        header.appendChild(actions);

        const toggle = document.createElement('span');
        toggle.className = 'tool-toggle';
        const syncToggle = () => {
          toggle.textContent = div.classList.contains('expanded') ? '收起 ▲' : '展开 ▼';
        };
        syncToggle();
        header.appendChild(toggle);

        header.addEventListener('click', () => {
          div.classList.toggle('expanded');
          syncToggle();
        });
        div.appendChild(header);

        const body = document.createElement('div');
        body.className = 'tool-body';

        const appendSection = (title, value, isError = false) => {
          const section = document.createElement('div');
          section.className = 'tool-section';

          const titleEl = document.createElement('div');
          titleEl.className = 'tool-section-title';
          titleEl.textContent = title;
          section.appendChild(titleEl);

          const contentEl = document.createElement('div');
          contentEl.className = 'tool-section-content' + (isError ? ' error' : '');
          contentEl.textContent = formatValue(value);
          section.appendChild(contentEl);

          body.appendChild(section);
        };

        // ---- 按工具类型生成不同的详情内容 ----
        if (toolCategory === 'readonly') {
          // 只读工具：简洁展示，不展示大段输出
          const filePath = inputObj.path || inputObj.filePath || inputObj.file || '';
          const pattern = inputObj.pattern || inputObj.query || inputObj.regex || '';
          if (filePath) appendSection('文件', filePath);
          if (pattern) appendSection('模式', pattern);
          if (inputObj.offset || inputObj.line) appendSection('行号', inputObj.offset || inputObj.line);
          if (inputObj.limit) appendSection('行数', inputObj.limit);
          if (part.state?.output != null && part.state?.output !== '') {
            // 只读工具输出可能很长，截断显示
            const outputStr = formatValue(part.state.output);
            if (outputStr.length > 2000) {
              appendSection('输出（截断）', outputStr.slice(0, 2000) + '\\n... (共 ' + outputStr.length + ' 字符)');
            } else {
              appendSection('输出', part.state.output);
            }
          }
        } else if (toolCategory === 'write') {
          // 写入工具：显示文件路径和变更摘要
          const filePath = inputObj.path || inputObj.filePath || inputObj.file || '';
          if (filePath) appendSection('文件', filePath);
          const oldStr = inputObj.oldContent || inputObj.old_string || inputObj.oldString || '';
          const newStr = inputObj.newContent || inputObj.new_string || inputObj.newString || inputObj.content || '';
          if (oldStr) appendSection('原内容', oldStr);
          if (newStr) appendSection('新内容', newStr);
          if (!oldStr && !newStr && part.state?.input != null) {
            appendSection('输入', part.state.input);
          }
          if (part.state?.output != null && part.state?.output !== '') {
            appendSection('输出', part.state.output);
          }
        } else if (toolCategory === 'exec') {
          // 执行工具：显示命令和完整输出
          const cmd = inputObj.command || inputObj.cmd || '';
          if (cmd) appendSection('命令', cmd);
          if (inputObj.workdir || inputObj.cwd) appendSection('工作目录', inputObj.workdir || inputObj.cwd);
          if (part.state?.output != null && part.state?.output !== '') {
            appendSection('输出', part.state.output);
          }
          if (!cmd && part.state?.input != null) {
            appendSection('输入', part.state.input);
          }
        } else {
          // 通用/MCP 工具：格式化显示输入参数
          if (part.state?.input != null && part.state?.input !== '') {
            if (typeof part.state.input === 'object') {
              // 格式化显示每个参数
              const entries = Object.entries(part.state.input);
              if (entries.length > 0) {
                for (const [key, val] of entries) {
                  appendSection('参数: ' + key, val);
                }
              } else {
                appendSection('输入', part.state.input);
              }
            } else {
              appendSection('输入', part.state.input);
            }
          }
          if (part.state?.output != null && part.state?.output !== '') {
            appendSection('输出', part.state.output);
          }
        }

        if (part.state?.error) {
          appendSection('错误', part.state.error, true);
        }

        if (body.childElementCount === 0) {
          appendSection(
            '状态',
            normalizedStatus === 'running' ? '执行中，等待返回结果。' : '没有可显示的输入或输出。',
            normalizedStatus === 'error'
          );
        }

        div.appendChild(body);
        return div;
      },

      renderDiffPart(part) {
        const div = document.createElement('div');
        div.className = 'diff-block';

        const header = document.createElement('div');
        header.className = 'diff-header';
        const patchFile = part.file || (Array.isArray(part.files) ? part.files[0] : '');
        header.textContent = patchFile || (part.type === 'snapshot' ? '快照' : '补丁');
        if (patchFile) {
          header.style.cursor = 'pointer';
          header.onclick = () => {
            vscode.postMessage({ type: 'file:open', path: patchFile });
          };
        }
        div.appendChild(header);

        const content = document.createElement('div');
        content.className = 'diff-content';
        const patchText = part.content
          || part.snapshot
          || (Array.isArray(part.files) ? part.files.map(f => '文件: ' + f).join('\\n') : '');
        const lines = (patchText || '').split('\\n');
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
          const pct = Math.max(0, Math.round((total / state.contextLimit) * 100));
          percentEl.textContent =
            '总计/上下文 ' +
            this.formatNumber(total) +
            '/' +
            this.formatNumber(state.contextLimit) +
            ' (' +
            pct +
            '%)';
        } else {
          percentEl.textContent = '';
        }

        // 构建分段：用户输入 / 模型输出 / 推理 / 缓存 / 剩余
        const cacheTotal = cacheRead + cacheWrite;
        const remaining = (state.contextLimit > 0) ? Math.max(0, state.contextLimit - total) : 0;
        const segments = [
          { key: 'input', label: '输入', value: input },
          { key: 'output', label: '输出', value: output },
          { key: 'reasoning', label: '推理', value: reasoning },
          { key: 'cache', label: '缓存', value: cacheTotal },
          { key: 'remaining', label: '剩余', value: remaining },
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
          el.dataset.tooltip =
            seg.label + ': ' + this.formatNumber(seg.value) + ' (' + Math.round(pct) + '%)';
          el.title = el.dataset.tooltip;
          el.setAttribute('aria-label', el.dataset.tooltip);
          track.appendChild(el);
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

            const messageId = data.info?.id;
            let existingIdx = -1;
            let mergedMessage = data;

            if (messageId) {
              existingIdx = state.messages.findIndex(m => m.info?.id === messageId);
              if (existingIdx >= 0) {
                const existing = state.messages[existingIdx] || {};
                mergedMessage = {
                  ...existing,
                  ...data,
                  info: data.info || existing.info || {},
                  parts: Array.isArray(data.parts)
                    ? data.parts
                    : (Array.isArray(existing.parts) ? existing.parts : []),
                };
                state.messages[existingIdx] = mergedMessage;
              } else {
                mergedMessage = {
                  ...data,
                  info: data.info || {},
                  parts: Array.isArray(data.parts) ? data.parts : [],
                };
              }
            }

            const msgEl = messageId
              ? document.querySelector('[data-message-id="' + messageId + '"]')
              : null;

            if (msgEl && mergedMessage.info) {
              if (existingIdx < 0) {
                state.messages.push(mergedMessage);
              }
              const parent = msgEl.parentNode;
              if (parent) {
                const newEl = this.renderMessage(mergedMessage);
                parent.replaceChild(newEl, msgEl);
              }
            } else if (!msgEl && existingIdx < 0 && mergedMessage.info) {
              this.addMessageToUI(mergedMessage);
            }

            // 提取 token 用量
            this.extractAndUpdateTokens(mergedMessage);
            break;
          }
          case 'message.part.updated': {
            const sessionId = data.sessionID || data.info?.sessionID;
            if (sessionId && state.sessionId && sessionId !== state.sessionId) {
              break;
            }

            const messageId = data.messageID;
            if (messageId) {
              const msgIdx = state.messages.findIndex(m => m.info?.id === messageId);
              if (msgIdx >= 0) {
                const message = state.messages[msgIdx];
                const parts = Array.isArray(message.parts) ? [...message.parts] : [];
                const partIdx = parts.findIndex(p => p.id === data.id);
                if (partIdx >= 0) {
                  parts[partIdx] = data;
                } else {
                  parts.push(data);
                }
                state.messages[msgIdx] = { ...message, parts };
              }
            }

            // Part 更新
            const partEl = document.querySelector('[data-part-id="' + data.id + '"]');
            if (partEl) {
              const newPartEl = this.renderPart(data, {});
              newPartEl.dataset.partId = data.id;
              partEl.parentNode.replaceChild(newPartEl, partEl);
              this.extractAndUpdateTokens(data);
              break;
            }

            if (messageId) {
              const msgEl = document.querySelector('[data-message-id="' + messageId + '"]');
              if (msgEl) {
                const newPartEl = this.renderPart(data, {});
                newPartEl.dataset.partId = data.id;
                msgEl.appendChild(newPartEl);
              }
            }

            this.extractAndUpdateTokens(data);
            break;
          }
          case 'message.part.delta': {
            const sessionId = data.sessionID || data.info?.sessionID;
            if (sessionId && state.sessionId && sessionId !== state.sessionId) {
              break;
            }

            // 增量文本更新
            const isTextDelta = data.type === 'text' || data.field === 'text';
            if (isTextDelta && data.id) {
              const partEl = document.querySelector('[data-part-id="' + data.id + '"]');
              const current = state.streamingParts[data.id] || '';
              const updatedText = current + (data.delta || '');
              state.streamingParts[data.id] = updatedText;

              if (data.messageID) {
                const msgIdx = state.messages.findIndex(m => m.info?.id === data.messageID);
                if (msgIdx >= 0) {
                  const message = state.messages[msgIdx];
                  const parts = Array.isArray(message.parts) ? [...message.parts] : [];
                  const partIdx = parts.findIndex(p => p.id === data.id);
                  if (partIdx >= 0) {
                    parts[partIdx] = { ...parts[partIdx], type: parts[partIdx].type || 'text', text: updatedText };
                  } else {
                    parts.push({
                      id: data.id,
                      type: 'text',
                      text: updatedText,
                      sessionID: sessionId || state.sessionId,
                      messageID: data.messageID,
                    });
                  }
                  state.messages[msgIdx] = { ...message, parts };
                }
              }

              if (partEl) {
                // 追加文本
                state._pendingHighlights = [];
                partEl.innerHTML = this.simpleMarkdown(updatedText);
                this.deferPendingHighlights(data.id);
              } else if (data.messageID) {
                const msgEl = document.querySelector('[data-message-id="' + data.messageID + '"]');
                if (msgEl) {
                  const newPartEl = this.renderPart({ id: data.id, type: 'text', text: updatedText }, {});
                  newPartEl.dataset.partId = data.id;
                  msgEl.appendChild(newPartEl);
                }
              }
            }
            break;
          }
          case 'session.status': {
            const sessionId = data.sessionID || data.id;
            const status = typeof data.status === 'string' ? data.status : data.status?.type;
            if (sessionId) {
              state.statusMap[sessionId] = status;
            }
            if (sessionId === state.sessionId) {
              this.setBusy(status === 'busy');
              document.getElementById('statusText').textContent =
                status === 'busy' ? '思考中...' : status === 'retry' ? '重试中...' : '就绪';
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
            const errMsg = data.error?.message || data.error?.data?.message || '未知错误';
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
        const panel = document.getElementById('todoPanel');
        const body = document.getElementById('todoPanelBody');
        const titleEl = document.getElementById('todoPanelTitle');
        const header = document.getElementById('todoPanelHeader');

        if (!todos || todos.length === 0) {
          panel.classList.remove('visible');
          state._currentTodos = [];
          return;
        }

        state._currentTodos = todos;

        // 统计
        const completed = todos.filter(t => t.status === 'completed').length;
        const inProgress = todos.find(t => t.status === 'in_progress');
        const total = todos.length;

        panel.classList.add('visible');

        // 折叠模式：只显示标题摘要
        const isCollapsed = panel.classList.contains('collapsed');
        if (isCollapsed && inProgress) {
          titleEl.textContent = '待办 (' + completed + '/' + total + ') — ' + inProgress.content;
        } else {
          titleEl.textContent = '待办列表 (' + completed + '/' + total + ')';
        }

        // 渲染列表
        body.innerHTML = '';
        for (const todo of todos) {
          const item = document.createElement('div');
          item.className = 'todo-item';
          const statusEl = document.createElement('span');
          statusEl.className = 'todo-status ' + (todo.status || 'pending');
          statusEl.textContent = todo.status === 'completed' ? '✓' :
                                  todo.status === 'in_progress' ? '◌' :
                                  todo.status === 'cancelled' ? '✗' : '○';
          item.appendChild(statusEl);
          const text = document.createElement('span');
          text.textContent = todo.content;
          if (todo.status === 'completed') text.style.textDecoration = 'line-through';
          if (todo.status === 'cancelled') {
            text.style.textDecoration = 'line-through';
            text.style.opacity = '0.5';
          }
          item.appendChild(text);
          body.appendChild(item);
        }

        // 绑定切换事件（只绑定一次）
        if (!panel._toggleBound) {
          panel._toggleBound = true;
          header.addEventListener('click', () => {
            panel.classList.toggle('collapsed');
            // 更新折叠状态的标题（使用当前 state 中的 todos）
            this.updateTodoPanelTitle();
          });
        }
      },

      updateTodoPanelTitle() {
        const panel = document.getElementById('todoPanel');
        const titleEl = document.getElementById('todoPanelTitle');
        const todos = state._currentTodos || [];
        const completed = todos.filter(t => t.status === 'completed').length;
        const total = todos.length;
        const inProgress = todos.find(t => t.status === 'in_progress');
        if (panel.classList.contains('collapsed') && inProgress) {
          titleEl.textContent = '待办 (' + completed + '/' + total + ') — ' + inProgress.content;
        } else {
          titleEl.textContent = '待办列表 (' + completed + '/' + total + ')';
        }
      },

      // ---- 更新 UI 组件 ----

      updateProviders(
        data,
        currentModel,
        currentReasoningEffort,
        enabledProviders,
        disabledProviders
      ) {
        state.providers = data;
        state.currentModel = currentModel || '';
        state.currentReasoningEffort = (currentReasoningEffort || '').trim();

        const connected = data.connected || [];
        const groups = [];
        let selectedValue = '';

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
                // 收集模型的图片能力（使用 capabilities.input.image）
                const hasImageInput = !!(model.capabilities && model.capabilities.input && model.capabilities.input.image);
                state.modelCapabilities[provider.id + '/' + model.id] = {
                  imageInput: hasImageInput,
                };
              }
            }
            groups.push({ label: '已连接', options: opts });
          }
        }

        // 更新当前模型的 context limit
        if (currentModel && state.modelLimits[currentModel]) {
          state.contextLimit = state.modelLimits[currentModel].context;
        } else {
          state.contextLimit = 0;
        }

        modelSelectEl.setOptions(groups);
        if (selectedValue) {
          modelSelectEl.setValue(selectedValue);
        } else {
          modelSelectEl.setValue('');
          modelSelectEl.setLabel(currentModel || '模型');
        }

        // 更新状态栏模型信息
        document.getElementById('modelInfo').textContent = currentModel || '-';
        this.renderTokenBar();

        this.updateReasoningEffort(state.currentReasoningEffort);
      },

      updateReasoningEffort(currentReasoningEffort) {
        let normalized = (currentReasoningEffort || '').trim().toLowerCase();
        if (normalized === 'auto') {
          normalized = '';
        }
        state.currentReasoningEffort = normalized;
        const effortOptions = [
          { value: '', label: '推理: 自动' },
          { value: 'minimal', label: '推理: minimal' },
          { value: 'low', label: '推理: low' },
          { value: 'medium', label: '推理: medium' },
          { value: 'high', label: '推理: high' },
        ];

        if (normalized && !effortOptions.some(opt => opt.value === normalized)) {
          effortOptions.push({
            value: normalized,
            label: '推理: ' + normalized,
          });
        }

        const groups = [{ options: effortOptions.map(opt => ({
          ...opt,
          selected: opt.value === normalized,
        })) }];

        reasoningEffortSelectEl.setOptions(groups);
        const current = effortOptions.find(opt => opt.value === normalized);
        if (current) {
          reasoningEffortSelectEl.setValue(current.value);
          reasoningEffortSelectEl.setLabel(current.label);
        } else {
          reasoningEffortSelectEl.setValue('');
          reasoningEffortSelectEl.setLabel('推理: 自动');
        }
      },

      updateAgents(agents, defaultAgent) {
        state.agents = agents;

        const visibleAgents = agents.filter(a => !a.hidden);
        const primaryAgents = visibleAgents.filter(a => a.mode !== 'subagent');
        const subAgents = visibleAgents.filter(a => a.mode === 'subagent');

        const groups = [];
        const defaultLabel = defaultAgent ? ('Agent (' + defaultAgent + ')') : 'Agent';

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
            opts.push({
              value: agent.id,
              label,
              searchOnly: true,
              selected: agent.id === defaultAgent,
            });
          }
          groups.push({ label: '全部 Agent（输入后匹配）', options: opts });
        }

        agentSelectEl.setOptions(groups);
        if (defaultAgent) {
          const found = visibleAgents.find(a => a.id === defaultAgent);
          if (found) {
            agentSelectEl.setValue(defaultAgent);
            agentSelectEl.setLabel((found.name || found.id));
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
          app.updateProviders(
            msg.providers,
            msg.currentModel,
            msg.currentReasoningEffort,
            msg.enabledProviders,
            msg.disabledProviders
          );
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
        case 'command:done':
          app.setBusy(false);
          break;
        case 'messages:clear':
          app.clearMessages();
          app.resetTokenBar();
          break;
        case 'selector:show':
          if (msg.selector === 'model') {
            modelSelectEl.open();
          } else if (msg.selector === 'agent') {
            agentSelectEl.open();
          }
          break;
        case 'info':
          app.addMessageToUI({
            info: { id: 'info-' + Date.now(), role: 'assistant', createdAt: new Date().toISOString() },
            parts: [{ id: 'ip-' + Date.now(), type: 'text', text: 'ℹ️ ' + msg.message }],
          });
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
        case 'reasoningEffort:updated':
          app.updateReasoningEffort(msg.reasoningEffort || '');
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
        case 'settings:update':
          if (msg.settings) {
            Object.assign(state.settings, msg.settings);
          }
          break;
        case 'todo:list':
          if (msg.todos) app.renderTodos(msg.todos);
          break;
        case 'findFiles:results':
          app.atMentionHandleResults(msg.requestId, msg.files);
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

    // @ 文件引用弹出框：点击外部关闭
    document.addEventListener('click', (e) => {
      if (!app.atMentionVisible) return;
      const popup = document.getElementById('atMentionPopup');
      const input = document.getElementById('promptInput');
      if (!popup.contains(e.target) && e.target !== input) {
        app.atMentionHide();
      }
    });

    // 启动
    try {
      app.init();
    } catch (e) {
      console.error('[OpenCode Webview] app.init() 失败:', e);
    }
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
