/**
 * OpenCode VSCode 扩展主入口
 * 整合所有模块，注册命令和事件
 */

import * as vscode from "vscode";
import { ServerManager } from "./server";
import { OpenCodeClient } from "./client";
import { ChatViewProvider } from "./chatPanel";
import { SessionTreeProvider, StatusTreeProvider } from "./treeViews";
import { SettingsPanel } from "./settingsPanel";

let serverManager: ServerManager;
let sessionProvider: SessionTreeProvider;
let statusProvider: StatusTreeProvider;
let statusBarItem: vscode.StatusBarItem;
let sseController: AbortController | null = null;
let sseReconnectTimer: ReturnType<typeof setTimeout> | null = null;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // ---- 初始化核心组件 ----
  serverManager = new ServerManager(context);
  sessionProvider = new SessionTreeProvider();
  statusProvider = new StatusTreeProvider();

  // ---- 注册 TreeView ----
  const chatViewProvider = new ChatViewProvider(context.extensionUri);

  const chatViewDisposable = vscode.window.registerWebviewViewProvider(
    ChatViewProvider.viewType,
    chatViewProvider,
    { webviewOptions: { retainContextWhenHidden: true } }
  );

  const sessionTreeView = vscode.window.createTreeView("opencode.sessions", {
    treeDataProvider: sessionProvider,
    showCollapseAll: false,
  });

  const statusTreeView = vscode.window.createTreeView("opencode.status", {
    treeDataProvider: statusProvider,
    showCollapseAll: true,
  });

  // ---- 状态栏 ----
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = "opencode.openChat";
  updateStatusBar("stopped");
  statusBarItem.show();

  // ---- 监听服务器状态变化 ----
  serverManager.onStateChange((state) => {
    updateStatusBar(state);
    if (state === "running") {
      const client = serverManager.client;
      if (client) {
        onServerReady(client);
      }
    } else if (state === "stopped" || state === "error") {
      sseController?.abort();
      sseController = null;
      if (sseReconnectTimer) {
        clearTimeout(sseReconnectTimer);
        sseReconnectTimer = null;
      }
      statusProvider.stopAutoRefresh();
      statusProvider.setClient(null as any);
      statusProvider.refresh();
    }
  });

  // ---- 注册所有命令 ----
  registerCommands(context);

  // ---- 自动启动 ----
  const autoStart = vscode.workspace
    .getConfiguration("opencode")
    .get<boolean>("server.autoStart", true);

  if (autoStart) {
    // 延迟启动，让 VSCode 先完成初始化
    setTimeout(async () => {
      const config = vscode.workspace.getConfiguration("opencode");
      const hostname = config.get<string>("server.hostname", "127.0.0.1");
      const port = config.get<number>("server.port", 0);

      // 策略：如果配置了固定端口，先尝试连接已有实例，避免重复启动
      if (port > 0) {
        const endpoint = `http://${hostname}:${port}`;
        try {
          await serverManager.connectToExisting(endpoint);
          return; // 连接成功，无需启动新进程
        } catch {
          // 已有实例不可用，继续启动新进程
        }
      }

      try {
        await serverManager.start();
      } catch (error: any) {
        vscode.window.showWarningMessage(
          `OpenCode 服务器启动失败: ${error.message}。请确保 opencode 已安装。`
        );
      }
    }, 800);
  }

  // ---- 首次安装时将聊天面板移动到辅助侧栏 ----
  const MOVED_KEY = "opencode.chatViewMovedToAuxiliary";
  if (!context.globalState.get<boolean>(MOVED_KEY)) {
    // 延迟执行，等待 views 注册完成
    setTimeout(async () => {
      try {
        await vscode.commands.executeCommand(
          "workbench.action.moveViewToSecondarySideBar",
          "opencode.chatView"
        );
        // 同时打开辅助侧栏让用户看到
        await vscode.commands.executeCommand(
          "workbench.action.focusAuxiliaryBar"
        );
        context.globalState.update(MOVED_KEY, true);
      } catch {
        // 命令可能在某些 VSCode 版本中不可用，静默忽略
      }
    }, 3000);
  }

  // ---- 注册到 subscriptions ----
  context.subscriptions.push(
    chatViewDisposable,
    sessionTreeView,
    statusTreeView,
    statusBarItem,
    { dispose: () => serverManager.dispose() },
    { dispose: () => sessionProvider.dispose() },
    { dispose: () => statusProvider.dispose() },
    { dispose: () => {
      sseController?.abort();
      if (sseReconnectTimer) {
        clearTimeout(sseReconnectTimer);
        sseReconnectTimer = null;
      }
    } }
  );
}

/**
 * 服务器就绪后的初始化
 */
function onServerReady(client: OpenCodeClient): void {
  // 更新 TreeView
  sessionProvider.setClient(client);
  statusProvider.setClient(client);
  sessionProvider.refresh();
  statusProvider.refresh();

  // 启动状态树定时自动刷新（30 秒间隔）
  statusProvider.startAutoRefresh();

  // 更新聊天面板
  if (ChatViewProvider.instance) {
    ChatViewProvider.instance.setClient(client);
  }

  // 订阅 SSE 事件（带断线重连）
  subscribeSSE(client);
}

/**
 * 订阅 SSE 事件流，断线后自动重连
 */
function subscribeSSE(client: OpenCodeClient): void {
  // 清理旧连接
  sseController?.abort();
  sseController = null;
  if (sseReconnectTimer) {
    clearTimeout(sseReconnectTimer);
    sseReconnectTimer = null;
  }

  sseController = client.subscribeEvents(
    (event) => handleGlobalEvent(event),
    (error) => {
      console.error("OpenCode SSE 错误:", error);
      // 仅在服务器仍运行时尝试重连
      if (serverManager.state === "running") {
        sseReconnectTimer = setTimeout(() => {
          if (serverManager.state === "running" && serverManager.client) {
            subscribeSSE(serverManager.client);
          }
        }, 3000);
      }
    }
  );
}

/**
 * 处理全局 SSE 事件
 */
function handleGlobalEvent(event: { type: string; properties: Record<string, any> }): void {
  switch (event.type) {
    case "session.created":
    case "session.updated":
    case "session.deleted":
      sessionProvider.refresh();
      break;
    case "session.status":
      sessionProvider.refresh();
      break;
    case "installation.updated":
    case "config.updated":
    case "provider.updated":
    case "provider.connected":
    case "provider.disconnected":
    case "mcp.updated":
    case "mcp.connected":
    case "mcp.disconnected":
    case "lsp.updated":
    case "tool.updated":
      statusProvider.refresh();
      break;
  }
}

/**
 * 注册所有扩展命令
 */
function registerCommands(context: vscode.ExtensionContext): void {
  const commands: Array<[string, (...args: any[]) => any]> = [
    // ---- 聊天面板 ----
    ["opencode.openChat", () => {
      const client = serverManager.client;
      if (!client) {
        vscode.window.showWarningMessage("OpenCode 服务器未运行，正在启动...");
        serverManager.start().then((c) => {
          if (ChatViewProvider.instance) {
            ChatViewProvider.instance.setClient(c);
          }
          ChatViewProvider.instance?.focus();
        }).catch((e) => {
          vscode.window.showErrorMessage(`启动失败: ${e.message}`);
        });
        return;
      }
      if (ChatViewProvider.instance) {
        ChatViewProvider.instance.setClient(client);
      }
      ChatViewProvider.instance?.focus();
    }],

    // ---- 会话管理 ----
    ["opencode.newSession", async () => {
      const client = serverManager.client;
      if (!client) return showNotRunning();

      const title = await vscode.window.showInputBox({
        prompt: "会话标题 (可选)",
        placeHolder: "新建会话",
      });

      try {
        const session = await client.createSession(title || undefined);
        sessionProvider.refresh();

        // 如果聊天面板打开，切换到新会话
        if (ChatViewProvider.instance) {
          ChatViewProvider.instance.switchSession(session.id);
        }

        // 面板已切换到新会话，无需额外 toast
      } catch (error: any) {
        vscode.window.showErrorMessage(`创建会话失败: ${error.message}`);
      }
    }],

    ["opencode.deleteSession", async (item: any) => {
      const client = serverManager.client;
      if (!client) return showNotRunning();

      const sessionId = item?.session?.id;
      if (!sessionId) return;

      const confirm = await vscode.window.showWarningMessage(
        `确定要删除会话 "${item.session.title || sessionId.slice(0, 8)}" 吗？`,
        { modal: true },
        "删除"
      );

      if (confirm === "删除") {
        try {
          await client.deleteSession(sessionId);
          sessionProvider.refresh();
          // TreeView 已刷新，无需额外 toast
        } catch (error: any) {
          vscode.window.showErrorMessage(`删除失败: ${error.message}`);
        }
      }
    }],

    ["opencode.refreshSessions", () => {
      sessionProvider.refresh();
      statusProvider.refresh();
    }],

    ["opencode.shareSession", async (item: any) => {
      const client = serverManager.client;
      if (!client) return showNotRunning();

      const sessionId = item?.session?.id;
      if (!sessionId) return;

      try {
        const session = await client.shareSession(sessionId);
        if (session.share) {
          await vscode.env.clipboard.writeText(session.share);
          vscode.window.showInformationMessage(`分享链接已复制到剪贴板: ${session.share}`);
        }
        sessionProvider.refresh();
      } catch (error: any) {
        vscode.window.showErrorMessage(`分享失败: ${error.message}`);
      }
    }],

    ["opencode.forkSession", async (item: any) => {
      const client = serverManager.client;
      if (!client) return showNotRunning();

      const sessionId = item?.session?.id;
      if (!sessionId) return;

      try {
        const newSession = await client.forkSession(sessionId);
        sessionProvider.refresh();
        if (ChatViewProvider.instance) {
          ChatViewProvider.instance.switchSession(newSession.id);
        }
        // 面板已切换到分叉会话，无需额外 toast
      } catch (error: any) {
        vscode.window.showErrorMessage(`分叉失败: ${error.message}`);
      }
    }],

    ["opencode.abortSession", async (item?: any) => {
      const client = serverManager.client;
      if (!client) return showNotRunning();

      // 如果是从 TreeView 调用，使用 item 的 session ID
      // 否则尝试中止当前聊天面板的会话
      const sessionId = item?.session?.id;
      if (sessionId) {
        try {
          await client.abortSession(sessionId);
          sessionProvider.refresh();
          // 状态已刷新，无需额外 toast
        } catch (error: any) {
          vscode.window.showErrorMessage(`中止失败: ${error.message}`);
        }
      }
    }],

    ["opencode.selectSession", async (sessionId: string) => {
      const client = serverManager.client;
      if (!client) return showNotRunning();

      // 聚焦聊天视图并切换到指定会话
      if (ChatViewProvider.instance) {
        ChatViewProvider.instance.setClient(client);
        ChatViewProvider.instance.focus();
        ChatViewProvider.instance.switchSession(sessionId);
      }
    }],

    // ---- 服务器管理 ----
    ["opencode.startServer", async () => {
      try {
        await serverManager.start();
        // 状态栏已更新，无需额外 toast
      } catch (error: any) {
        vscode.window.showErrorMessage(`启动失败: ${error.message}`);
      }
    }],

    ["opencode.stopServer", async () => {
      await serverManager.stop();
      // 状态栏已更新，无需额外 toast
    }],

    ["opencode.restartServer", async () => {
      try {
        await serverManager.restart();
        // 状态栏已更新，无需额外 toast
      } catch (error: any) {
        vscode.window.showErrorMessage(`重启失败: ${error.message}`);
      }
    }],

    // ---- TUI 终端 ----
    ["opencode.openTerminal", async () => {
      const existing = vscode.window.terminals.find((t) => t.name === "opencode");
      if (existing) {
        existing.show();
        return;
      }

      const port = Math.floor(Math.random() * 49152) + 16384;
      const terminal = vscode.window.createTerminal({
        name: "opencode",
        location: { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
        env: {
          _EXTENSION_OPENCODE_PORT: port.toString(),
          OPENCODE_CALLER: "vscode",
        },
      });
      terminal.show();
      terminal.sendText(`opencode --port ${port}`);
    }],

    // ---- 文件引用 ----
    ["opencode.addFileToPrompt", () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const doc = editor.document;
      const wsFolder = vscode.workspace.getWorkspaceFolder(doc.uri);
      if (!wsFolder) return;

      let ref = `@${vscode.workspace.asRelativePath(doc.uri)}`;
      const sel = editor.selection;
      if (!sel.isEmpty) {
        const startLine = sel.start.line + 1;
        const endLine = sel.end.line + 1;
        ref += startLine === endLine ? `#L${startLine}` : `#L${startLine}-${endLine}`;
      }

      if (ChatViewProvider.instance) {
        ChatViewProvider.instance.appendToPrompt(ref);
      } else {
        // 如果面板没打开，复制到剪贴板
        vscode.env.clipboard.writeText(ref);
        vscode.window.showInformationMessage(`文件引用已复制: ${ref}`);
      }
    }],

    ["opencode.addSelectionToPrompt", () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const sel = editor.selection;
      if (sel.isEmpty) {
        vscode.window.showWarningMessage("请先选中一段代码");
        return;
      }

      const selectedText = editor.document.getText(sel);
      const filePath = vscode.workspace.asRelativePath(editor.document.uri);
      const startLine = sel.start.line + 1;
      const endLine = sel.end.line + 1;

      const ref = `\`\`\`\n// ${filePath}#L${startLine}-${endLine}\n${selectedText}\n\`\`\``;

      if (ChatViewProvider.instance) {
        ChatViewProvider.instance.appendToPrompt(ref);
      } else {
        vscode.env.clipboard.writeText(ref);
        vscode.window.showInformationMessage("代码片段已复制到剪贴板");
      }
    }],

    // ---- Diff 查看 ----
    ["opencode.viewDiff", async () => {
      const client = serverManager.client;
      if (!client) return showNotRunning();

      try {
        const sessions = await client.listSessions();
        if (sessions.length === 0) {
          vscode.window.showInformationMessage("没有可用的会话");
          return;
        }

        const items = sessions.slice(0, 20).map((s) => ({
          label: s.title || s.id.slice(0, 12),
          description: new Date(s.updatedAt || s.createdAt).toLocaleString(),
          sessionId: s.id,
        }));

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: "选择要查看 Diff 的会话",
        });

        if (!selected) return;

        const diffs = await client.getSessionDiff(selected.sessionId);
        if (!diffs || diffs.length === 0) {
          vscode.window.showInformationMessage("该会话没有文件变更");
          return;
        }

        // 显示 diff 文件列表
        const diffItems = diffs.map((d) => ({
          label: d.path,
          description: d.status,
          diff: d,
        }));

        const selectedDiff = await vscode.window.showQuickPick(diffItems, {
          placeHolder: "选择要查看的文件",
        });

        if (selectedDiff) {
          // 打开文件
          const wsFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
          if (wsFolder) {
            const fileUri = vscode.Uri.joinPath(wsFolder, selectedDiff.diff.path);
            try {
              await vscode.window.showTextDocument(fileUri);
            } catch {
              vscode.window.showWarningMessage(`无法打开文件: ${selectedDiff.diff.path}`);
            }
          }
        }
      } catch (error: any) {
        vscode.window.showErrorMessage(`获取 Diff 失败: ${error.message}`);
      }
    }],

    // ---- 撤销更改 ----
    ["opencode.undoChanges", async () => {
      const client = serverManager.client;
      if (!client) return showNotRunning();

      const sessions = await client.listSessions();
      if (sessions.length === 0) return;

      const items = sessions.slice(0, 10).map((s) => ({
        label: s.title || s.id.slice(0, 12),
        sessionId: s.id,
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: "选择要撤销更改的会话",
      });

      if (!selected) return;

      try {
        const messages = await client.listMessages(selected.sessionId);
        const lastAssistantMsg = [...messages].reverse().find(
          (m) => m.info.role === "assistant"
        );

        if (lastAssistantMsg) {
          await client.revertMessage(selected.sessionId, lastAssistantMsg.info.id);
          vscode.window.showInformationMessage("已撤销最近的更改");
        } else {
          vscode.window.showInformationMessage("没有可撤销的更改");
        }
      } catch (error: any) {
        vscode.window.showErrorMessage(`撤销失败: ${error.message}`);
      }
    }],

    // ---- 搜索 ----
    ["opencode.searchFiles", async () => {
      const client = serverManager.client;
      if (!client) return showNotRunning();

      const query = await vscode.window.showInputBox({
        prompt: "搜索文件名",
        placeHolder: "输入文件名关键词...",
      });

      if (!query) return;

      try {
        const files = await client.findFiles(query, "file", 50);
        if (files.length === 0) {
          vscode.window.showInformationMessage("未找到匹配的文件");
          return;
        }

        const selected = await vscode.window.showQuickPick(
          files.map((f) => ({ label: f, filePath: f })),
          { placeHolder: "选择文件打开" }
        );

        if (selected) {
          const wsFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
          if (wsFolder) {
            const fileUri = vscode.Uri.joinPath(wsFolder, selected.filePath);
            await vscode.window.showTextDocument(fileUri);
          }
        }
      } catch (error: any) {
        vscode.window.showErrorMessage(`搜索失败: ${error.message}`);
      }
    }],

    ["opencode.searchText", async () => {
      const client = serverManager.client;
      if (!client) return showNotRunning();

      const pattern = await vscode.window.showInputBox({
        prompt: "搜索文件内容 (正则表达式)",
        placeHolder: "输入搜索模式...",
      });

      if (!pattern) return;

      try {
        const results = await client.findText(pattern);
        if (results.length === 0) {
          vscode.window.showInformationMessage("未找到匹配的内容");
          return;
        }

        const items = results.slice(0, 100).map((r) => ({
          label: `${r.path}:${r.line_number}`,
          description: r.lines.trim().slice(0, 100),
          filePath: r.path,
          line: r.line_number,
        }));

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: "选择搜索结果",
        });

        if (selected) {
          const wsFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
          if (wsFolder) {
            const fileUri = vscode.Uri.joinPath(wsFolder, selected.filePath);
            const doc = await vscode.workspace.openTextDocument(fileUri);
            const editor = await vscode.window.showTextDocument(doc);
            const pos = new vscode.Position(selected.line - 1, 0);
            editor.selection = new vscode.Selection(pos, pos);
            editor.revealRange(new vscode.Range(pos, pos));
          }
        }
      } catch (error: any) {
        vscode.window.showErrorMessage(`搜索失败: ${error.message}`);
      }
    }],

    // ---- 模型和 Agent 选择 ----
    ["opencode.selectModel", async () => {
      const client = serverManager.client;
      if (!client) return showNotRunning();

      try {
        const [providers, config] = await Promise.all([
          client.getProviders(),
          client.getConfig().catch(() => ({})),
        ]);
        const currentModel = (config as any)?.model || "";
        const connected = providers.connected || [];
        const enabledProviders: string[] = (config as any)?.enabled_providers || [];
        const disabledProviders: string[] = (config as any)?.disabled_providers || [];

        const items: Array<{ label: string; description: string; providerID: string; modelID: string; kind?: vscode.QuickPickItemKind }> = [];

        // 仅显示已连接且可用的 providers
        const connectedProviders = (providers.all || []).filter((p) => {
          if (disabledProviders.includes(p.id)) return false;
          if (enabledProviders.length > 0 && !enabledProviders.includes(p.id)) return false;
          return connected.includes(p.id);
        });
        if (connectedProviders.length > 0) {
          items.push({ label: "已连接", description: "", providerID: "", modelID: "", kind: vscode.QuickPickItemKind.Separator });
          for (const provider of connectedProviders) {
            const models = provider.models ? Object.values(provider.models) : [];
            for (const model of models) {
              const fullId = `${provider.id}/${model.id}`;
              const isCurrent = currentModel === fullId;
              items.push({
                label: `${provider.name || provider.id}/${model.name || model.id}${isCurrent ? " (当前)" : ""}`,
                description: isCurrent ? "当前模型" : "",
                providerID: provider.id,
                modelID: model.id,
              });
            }
          }
        }

        if (items.length === 0) {
          vscode.window.showWarningMessage("没有可用的已连接模型，请先配置 AI 提供商连接");
          return;
        }

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: `选择模型 (当前: ${currentModel || "未设置"})`,
        });

        if (selected && selected.providerID && selected.modelID) {
          try {
            await client.updateConfig({
              model: `${selected.providerID}/${selected.modelID}`,
            });
            // 面板内 selector 已反映变化，无需额外 toast
            statusProvider.refresh();
          } catch (error: any) {
            vscode.window.showErrorMessage(`切换模型失败: ${error.message}`);
          }
        }
      } catch (error: any) {
        vscode.window.showErrorMessage(`获取模型列表失败: ${error.message}`);
      }
    }],

    ["opencode.selectAgent", async () => {
      const client = serverManager.client;
      if (!client) return showNotRunning();

      try {
        const [agents, config] = await Promise.all([
          client.listAgents(),
          client.getConfig().catch(() => ({})),
        ]);
        const agentConfig = (config as any)?.agent || {};
        const defaultAgent = (config as any)?.default_agent || "build";

        // 合并 agent 信息并过滤隐藏的
        const enrichedAgents = agents.map((a: any) => {
          const cfg = agentConfig[a.id] || {};
          return {
            ...a,
            mode: a.mode || cfg.mode || "primary",
            hidden: a.hidden ?? cfg.hidden ?? false,
            description: a.description || cfg.description || "",
          };
        }).filter((a: any) => !a.hidden);

        const primaryAgents = enrichedAgents.filter((a: any) => a.mode !== "subagent");
        const subAgents = enrichedAgents.filter((a: any) => a.mode === "subagent");

        const items: Array<{ label: string; description: string; agentId: string; kind: vscode.QuickPickItemKind | undefined }> = [];

        // Primary agents
        if (primaryAgents.length > 0) {
          items.push({ label: "主要 Agent", description: "", agentId: "", kind: vscode.QuickPickItemKind.Separator });
          for (const a of primaryAgents) {
            items.push({
              label: (a.name || a.id) + (a.id === defaultAgent ? " (当前)" : ""),
              description: a.description || "",
              agentId: a.id,
              kind: undefined,
            });
          }
        }

        // Subagents
        if (subAgents.length > 0) {
          items.push({ label: "子 Agent", description: "", agentId: "", kind: vscode.QuickPickItemKind.Separator });
          for (const a of subAgents) {
            items.push({
              label: a.name || a.id,
              description: a.description || "",
              agentId: a.id,
              kind: undefined,
            });
          }
        }

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: `选择默认 Agent (当前: ${defaultAgent})`,
        });

        if (selected && selected.agentId) {
          try {
            await client.updateConfig({ default_agent: selected.agentId });
            // 面板内 selector 已反映变化，无需额外 toast
          } catch (error: any) {
            vscode.window.showErrorMessage(`切换 Agent 失败: ${error.message}`);
          }
        }
      } catch (error: any) {
        vscode.window.showErrorMessage(`获取 Agent 列表失败: ${error.message}`);
      }
    }],

    // ---- 配置 ----
    ["opencode.showConfig", async () => {
      const client = serverManager.client;
      if (!client) return showNotRunning();

      try {
        const config = await client.getConfig();
        const doc = await vscode.workspace.openTextDocument({
          content: JSON.stringify(config, null, 2),
          language: "json",
        });
        await vscode.window.showTextDocument(doc);
      } catch (error: any) {
        vscode.window.showErrorMessage(`获取配置失败: ${error.message}`);
      }
    }],

    // ---- 连接 Provider ----
    ["opencode.connectProvider", async () => {
      const client = serverManager.client;
      if (!client) return showNotRunning();

      try {
        const providers = await client.getProviders();
        const items = (providers.all || []).map((p) => ({
          label: p.name || p.id,
          description: providers.connected?.includes(p.id) ? "已连接" : "未连接",
          providerId: p.id,
        }));

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: "选择要连接的 AI 提供商",
        });

        if (!selected) return;

        const key = await vscode.window.showInputBox({
          prompt: `输入 ${selected.label} 的 API Key`,
          password: true,
        });

        if (key) {
          await client.setAuth(selected.providerId, { type: "api", key });
          vscode.window.showInformationMessage(`已连接 ${selected.label}`);
          statusProvider.refresh();
        }
      } catch (error: any) {
        vscode.window.showErrorMessage(`连接失败: ${error.message}`);
      }
    }],

    // ---- 手动连接已有实例 ----
    ["opencode.connectToEndpoint", async () => {
      const currentUrl = serverManager.url;
      const url = await vscode.window.showInputBox({
        prompt: "输入 OpenCode 服务器地址",
        placeHolder: "http://127.0.0.1:3000",
        value: currentUrl || "http://127.0.0.1:",
        validateInput: (v) => {
          try {
            const u = new URL(v);
            if (!["http:", "https:"].includes(u.protocol)) {
              return "仅支持 http/https 协议";
            }
            return undefined;
          } catch {
            return "请输入有效的 URL";
          }
        },
      });

      if (!url) return;

      try {
        await serverManager.connectToExisting(url);
        vscode.window.showInformationMessage(
          `已连接到: ${url} (v${serverManager.version})`
        );
      } catch (error: any) {
        vscode.window.showErrorMessage(error.message);
      }
    }],

    // ---- 设置 ----
    ["opencode.openSetting", (_settingKey: string) => {
      // 旧命令兼容：统一打开设置面板
      SettingsPanel.open();
    }],

    ["opencode.openSettings", () => {
      SettingsPanel.open();
    }],
  ];

  for (const [id, handler] of commands) {
    context.subscriptions.push(vscode.commands.registerCommand(id, handler));
  }
}

/**
 * 更新状态栏
 */
function updateStatusBar(state: string): void {
  switch (state) {
    case "running":
      statusBarItem.text = "$(check) OpenCode";
      statusBarItem.tooltip = `OpenCode 服务器运行中 (v${serverManager.version})\n${serverManager.url}\n点击打开聊天面板`;
      statusBarItem.backgroundColor = undefined;
      break;
    case "starting":
      statusBarItem.text = "$(sync~spin) OpenCode";
      statusBarItem.tooltip = "OpenCode 服务器启动中...";
      statusBarItem.backgroundColor = undefined;
      break;
    case "error":
      statusBarItem.text = "$(error) OpenCode";
      statusBarItem.tooltip = "OpenCode 服务器错误\n点击打开聊天面板";
      statusBarItem.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.errorBackground"
      );
      break;
    default:
      statusBarItem.text = "$(circle-slash) OpenCode";
      statusBarItem.tooltip = "OpenCode 服务器未运行\n点击启动并打开聊天面板";
      statusBarItem.backgroundColor = undefined;
  }
}

function showNotRunning(): void {
  vscode.window.showWarningMessage(
    "OpenCode 服务器未运行",
    "启动服务器"
  ).then((action) => {
    if (action === "启动服务器") {
      vscode.commands.executeCommand("opencode.startServer");
    }
  });
}

export async function deactivate(): Promise<void> {
  sseController?.abort();
  sseController = null;
  if (sseReconnectTimer) {
    clearTimeout(sseReconnectTimer);
    sseReconnectTimer = null;
  }
  if (serverManager) {
    await serverManager.dispose();
  }
}
