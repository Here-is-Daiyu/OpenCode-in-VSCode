import * as vscode from 'vscode';
import type {
  SettingsToExtensionMessage,
  ExtensionToSettingsMessage,
} from '../types/messages';
import type { OpenCodeConfig } from '../types/opencode';
import { OpenCodeClient } from '../services/openCodeClient';
import { Logger } from '../services/logger';
import { buildWebviewHtmlShell, getWebviewTheme } from '../utils/webviewHtml';

/**
 * Provides the Settings WebviewPanel (opens in the editor area).
 *
 * Handles all settings-related messages between the React settings UI
 * and the extension host, including VSCode config and OpenCode server config.
 */
export class SettingsViewProvider {
  public static readonly viewType = 'opencode.settings';

  private panel: vscode.WebviewPanel | undefined;
  private disposables: vscode.Disposable[] = [];
  private client?: OpenCodeClient;
  private logger?: Logger;
  private mcpPollTimer: ReturnType<typeof setInterval> | undefined;
  private mcpStatusInFlight = false;

  constructor(private readonly extensionUri: vscode.Uri) {}

  /** Inject the OpenCode API client (set from extension.ts after construction). */
  setClient(client: OpenCodeClient): void {
    this.client = client;
  }

  /** Inject the logger instance. */
  setLogger(logger: Logger): void {
    this.logger = logger;
  }

  /**
   * Show (or reveal) the settings panel.
   */
  show(): void {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      SettingsViewProvider.viewType,
      'OpenCode Settings',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, 'out', 'webview'),
        ],
        retainContextWhenHidden: true,
      },
    );

    // Panel icon
    this.panel.iconPath = new vscode.ThemeIcon('gear');

    // Generate HTML
    this.panel.webview.html = this.getHtmlForWebview(this.panel.webview);

    // Message handling
    this.disposables.push(
      this.panel.webview.onDidReceiveMessage(
        (message: SettingsToExtensionMessage) => {
          this.handleMessage(message);
        },
      ),
    );

    // Cleanup on dispose
    this.panel.onDidDispose(() => {
      this.stopMCPPolling();
      this.panel = undefined;
      this.disposables.forEach((d) => d.dispose());
      this.disposables = [];
    });

    // Start MCP status polling while settings panel is open
    this.startMCPPolling();
  }

  /**
   * Post a typed message to the settings webview.
   */
  postMessage(message: ExtensionToSettingsMessage): void {
    this.panel?.webview.postMessage(message);
  }

  /**
   * Refresh MCP status and send to the webview (if open).
   * Called externally when SSE events indicate MCP state changed.
   */
  async refreshMCPStatus(): Promise<void> {
    if (!this.panel) return; // Settings panel not open — skip
    await this.sendMCPStatus();
  }

  // ---------------------------------------------------------------------------
  //  Message handler
  // ---------------------------------------------------------------------------

  private async handleMessage(message: SettingsToExtensionMessage): Promise<void> {
    switch (message.type) {
      case 'ready':
        await this.handleReady();
        break;

      case 'settings:get':
        await this.handleSettingsGet();
        break;

      case 'settings:update':
        await this.handleSettingsUpdate(message.data);
        break;

      case 'settings:opencode:get':
        await this.handleOpenCodeGet();
        break;

      case 'settings:opencode:update':
        await this.handleOpenCodeUpdate(message.data);
        break;

      case 'settings:mcp:add':
        await this.handleMCPAdd(message.data);
        break;

      case 'settings:mcp:remove':
        await this.handleMCPRemove(message.data);
        break;

      case 'settings:mcp:toggle':
        await this.handleMCPToggle(message.data);
        break;

      case 'settings:openConfigFile':
        vscode.commands.executeCommand('opencode.openConfigFile');
        break;
    }
  }

  // ---------------------------------------------------------------------------
  //  Handlers
  // ---------------------------------------------------------------------------

  /** Send all settings when the webview is ready. */
  private async handleReady(): Promise<void> {
    this.logger?.debug('Settings webview ready — loading settings, providers, and MCP status');
    await this.handleSettingsGet();
    await this.sendProviders();
    await this.sendMCPStatus();
  }

  /** Read VSCode config + OpenCode config and send to webview. */
  private async handleSettingsGet(): Promise<void> {
    try {
      const vscodeSettings = this.readVSCodeSettings();
      let opencodeConfig: OpenCodeConfig = {};

      if (this.client) {
        try {
          opencodeConfig = await this.client.getConfig();
        } catch (err) {
          this.logger?.warn('Failed to fetch OpenCode config', err);
        }
      }

      this.postMessage({
        type: 'settings:loaded',
        data: { vscode: vscodeSettings, opencode: opencodeConfig },
      });
    } catch (err) {
      this.postMessage({ type: 'error', data: { message: String(err) } });
    }
  }

  /** Update a single VSCode setting. */
  private async handleSettingsUpdate(data: {
    section: string;
    key: string;
    value: unknown;
  }): Promise<void> {
    try {
      const config = vscode.workspace.getConfiguration(data.section);
      await config.update(data.key, data.value, vscode.ConfigurationTarget.Global);

      this.postMessage({
        type: 'settings:updated',
        data: { section: data.section, key: data.key, value: data.value },
      });
    } catch (err) {
      this.postMessage({
        type: 'error',
        data: { message: `Failed to update setting: ${err}` },
      });
    }
  }

  /** Fetch OpenCode config from the server. */
  private async handleOpenCodeGet(): Promise<void> {
    if (!this.client) {
      this.postMessage({
        type: 'error',
        data: { message: 'OpenCode server is not connected' },
      });
      return;
    }

    try {
      const config = await this.client.getConfig();
      const vscodeSettings = this.readVSCodeSettings();
      this.postMessage({
        type: 'settings:loaded',
        data: { vscode: vscodeSettings, opencode: config },
      });
    } catch (err) {
      this.postMessage({
        type: 'error',
        data: { message: `Failed to fetch OpenCode config: ${err}` },
      });
    }
  }

  /** Send a config update to the OpenCode server. */
  private async handleOpenCodeUpdate(data: Partial<OpenCodeConfig>): Promise<void> {
    if (!this.client) {
      this.postMessage({
        type: 'error',
        data: { message: 'OpenCode server is not connected' },
      });
      return;
    }

    try {
      const updated = await this.client.updateConfig(data);
      const vscodeSettings = this.readVSCodeSettings();
      this.postMessage({
        type: 'settings:loaded',
        data: { vscode: vscodeSettings, opencode: updated },
      });
    } catch (err) {
      this.postMessage({
        type: 'error',
        data: { message: `Failed to update OpenCode config: ${err}` },
      });
    }
  }

  /** Add an MCP server. */
  private async handleMCPAdd(data: {
    name: string;
    config: import('../types/opencode').MCPServerConfig;
  }): Promise<void> {
    if (!this.client) {
      this.postMessage({
        type: 'error',
        data: { message: 'OpenCode server is not connected' },
      });
      return;
    }

    try {
      await this.client.addMCPServer(data.name, data.config);
      await this.sendMCPStatus();
      // Also refresh the full config so MCP list is updated
      await this.handleSettingsGet();
    } catch (err) {
      this.postMessage({
        type: 'error',
        data: { message: `Failed to add MCP server: ${err}` },
      });
    }
  }

  /** Remove an MCP server via config update (remove key from mcp map). */
  private async handleMCPRemove(data: { name: string }): Promise<void> {
    if (!this.client) {
      this.postMessage({
        type: 'error',
        data: { message: 'OpenCode server is not connected' },
      });
      return;
    }

    try {
      const config = await this.client.getConfig();
      const mcp = { ...(config.mcp ?? {}) };
      delete mcp[data.name];
      await this.client.updateConfig({ mcp });
      await this.sendMCPStatus();
      await this.handleSettingsGet();
    } catch (err) {
      this.postMessage({
        type: 'error',
        data: { message: `Failed to remove MCP server: ${err}` },
      });
    }
  }

  /** Toggle an MCP server enabled/disabled. */
  private async handleMCPToggle(data: {
    name: string;
    enabled: boolean;
  }): Promise<void> {
    if (!this.client) {
      this.postMessage({
        type: 'error',
        data: { message: 'OpenCode server is not connected' },
      });
      return;
    }

    try {
      const config = await this.client.getConfig();
      const mcp = { ...(config.mcp ?? {}) };
      if (mcp[data.name]) {
        mcp[data.name] = { ...mcp[data.name], enabled: data.enabled };
      }
      await this.client.updateConfig({ mcp });
      await this.sendMCPStatus();
      await this.handleSettingsGet();
    } catch (err) {
      this.postMessage({
        type: 'error',
        data: { message: `Failed to toggle MCP server: ${err}` },
      });
    }
  }

  // ---------------------------------------------------------------------------
  //  Helpers
  // ---------------------------------------------------------------------------

  /** Read all OpenCode VSCode settings. */
  private readVSCodeSettings(): Record<string, unknown> {
    const cfg = vscode.workspace.getConfiguration('opencode');
    return {
      'server.hostname': cfg.get<string>('server.hostname', '127.0.0.1'),
      'server.port': cfg.get<number>('server.port', 0),
      'server.autoStart': cfg.get<boolean>('server.autoStart', true),
      'server.executablePath': cfg.get<string>('server.executablePath', 'opencode'),
      'chat.fontSize': cfg.get<number>('chat.fontSize', 14),
      'chat.showTimestamps': cfg.get<boolean>('chat.showTimestamps', true),
      'chat.wordWrap': cfg.get<boolean>('chat.wordWrap', true),
      'chat.maxImageSize': cfg.get<number>('chat.maxImageSize', 10),
      'chat.showToolCalls': cfg.get<string>('chat.showToolCalls', 'collapsed'),
      'editor.showInlineDiffs': cfg.get<boolean>('editor.showInlineDiffs', true),
      'editor.codeLensEnabled': cfg.get<boolean>('editor.codeLensEnabled', false),
    };
  }

  /** Fetch and send provider info to the webview. */
  private async sendProviders(): Promise<void> {
    if (!this.client) return;
    try {
      const resp = await this.client.getProviderInfo();
      this.postMessage({
        type: 'providers:loaded',
        data: { providers: resp.all, connected: resp.connected },
      });
    } catch (err) {
      this.logger?.debug('Failed to fetch providers for settings panel', err);
    }
  }

  /** Fetch and send MCP status to the webview. */
  private async sendMCPStatus(): Promise<void> {
    if (!this.client || this.mcpStatusInFlight) return;
    this.mcpStatusInFlight = true;
    try {
      const status = await this.client.getMCPStatus();
      this.postMessage({ type: 'mcp:status', data: status });
    } catch (err) {
      this.logger?.debug('Failed to fetch MCP status for settings panel', err);
    } finally {
      this.mcpStatusInFlight = false;
    }
  }

  /** Start periodic MCP status polling (every 10 seconds). */
  private startMCPPolling(): void {
    this.stopMCPPolling();
    this.mcpPollTimer = setInterval(() => {
      this.sendMCPStatus();
    }, 10_000);
  }

  /** Stop MCP status polling. */
  private stopMCPPolling(): void {
    if (this.mcpPollTimer !== undefined) {
      clearInterval(this.mcpPollTimer);
      this.mcpPollTimer = undefined;
    }
  }

  // ---------------------------------------------------------------------------
  //  HTML
  // ---------------------------------------------------------------------------

  private getHtmlForWebview(webview: vscode.Webview): string {
    return buildWebviewHtmlShell({
      webview,
      extensionUri: this.extensionUri,
      initialData: { theme: getWebviewTheme() },
      loadingText: 'Loading OpenCode Settings...',
      scriptName: 'settings.js',
      title: 'OpenCode Settings',
    });
  }
}
