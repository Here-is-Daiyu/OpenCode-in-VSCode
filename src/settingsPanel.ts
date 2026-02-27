/**
 * OpenCode 设置面板
 * 使用 Webview Panel 显示设置页面，输入框失焦自动保存
 */

import * as vscode from "vscode";

/** 配置项定义 */
interface SettingEntry {
  key: string;
  label: string;
  type: "string" | "number" | "boolean";
  description: string;
}

const SETTING_ENTRIES: SettingEntry[] = [
  {
    key: "opencode.server.hostname",
    label: "服务器主机地址",
    type: "string",
    description: "OpenCode 服务器监听的主机地址",
  },
  {
    key: "opencode.server.port",
    label: "服务器端口",
    type: "number",
    description: "OpenCode 服务器端口（0 = 自动分配）",
  },
  {
    key: "opencode.server.autoStart",
    label: "自动启动服务器",
    type: "boolean",
    description: "启动 VSCode 时自动启动 OpenCode 服务器",
  },
  {
    key: "opencode.server.executablePath",
    label: "可执行文件路径",
    type: "string",
    description: "opencode 可执行文件的路径",
  },
  {
    key: "opencode.chat.fontSize",
    label: "聊天字体大小",
    type: "number",
    description: "聊天面板的字体大小（px）",
  },
  {
    key: "opencode.chat.showTimestamps",
    label: "显示时间戳",
    type: "boolean",
    description: "在消息中显示时间戳",
  },
  {
    key: "opencode.chat.wordWrap",
    label: "自动换行",
    type: "boolean",
    description: "聊天消息自动换行",
  },
  {
    key: "opencode.chat.toolCallsCollapsed",
    label: "工具调用默认折叠",
    type: "boolean",
    description: "工具调用默认折叠显示",
  },
  {
    key: "opencode.chat.showDiffOnWrite",
    label: "写入时显示 Diff",
    type: "boolean",
    description: "写入工具完成后自动在编辑器中显示 Diff",
  },
];

export class SettingsPanel {
  private static instance: SettingsPanel | undefined;
  private panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel) {
    this.panel = panel;

    // 监听 webview 消息
    this.panel.webview.onDidReceiveMessage(
      (msg) => this.handleMessage(msg),
      null,
      this.disposables
    );

    // 监听配置变更，刷新面板
    vscode.workspace.onDidChangeConfiguration(
      (e) => {
        if (e.affectsConfiguration("opencode")) {
          this.updateWebview();
        }
      },
      null,
      this.disposables
    );

    // 面板关闭时清理
    this.panel.onDidDispose(
      () => {
        SettingsPanel.instance = undefined;
        for (const d of this.disposables) {
          d.dispose();
        }
        this.disposables = [];
      },
      null,
      this.disposables
    );

    this.updateWebview();
  }

  static open(): void {
    if (SettingsPanel.instance) {
      SettingsPanel.instance.panel.reveal();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "opencode.settings",
      "OpenCode 设置",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    SettingsPanel.instance = new SettingsPanel(panel);
  }

  private handleMessage(msg: { type: string; key?: string; value?: any }): void {
    if (msg.type === "update" && msg.key) {
      const config = vscode.workspace.getConfiguration();
      // 静默更新配置，不弹任何通知
      config.update(msg.key, msg.value, vscode.ConfigurationTarget.Global).then(
        () => {
          // 成功，静默
        },
        (err) => {
          console.error(`设置更新失败 [${msg.key}]:`, err);
        }
      );
    }
  }

  private updateWebview(): void {
    const config = vscode.workspace.getConfiguration();
    const nonce = getNonce();

    const values: Record<string, any> = {};
    for (const entry of SETTING_ENTRIES) {
      values[entry.key] = config.get(entry.key);
    }

    this.panel.webview.html = this.getHtml(nonce, values);
  }

  private getHtml(nonce: string, values: Record<string, any>): string {
    const serverEntries = SETTING_ENTRIES.filter((e) => e.key.startsWith("opencode.server."));
    const chatEntries = SETTING_ENTRIES.filter((e) => e.key.startsWith("opencode.chat."));

    const renderEntry = (entry: SettingEntry): string => {
      const val = values[entry.key];
      if (entry.type === "boolean") {
        const checked = val ? "checked" : "";
        return `
          <div class="setting-item">
            <div class="setting-row">
              <label class="toggle-label" for="${entry.key}">
                <span class="setting-name">${entry.label}</span>
                <div class="toggle-switch">
                  <input type="checkbox" id="${entry.key}" data-key="${entry.key}" ${checked} />
                  <span class="toggle-slider"></span>
                </div>
              </label>
            </div>
            <div class="setting-desc">${entry.description}</div>
          </div>`;
      }
      const inputType = entry.type === "number" ? "number" : "text";
      const inputVal = val == null ? "" : String(val);
      return `
        <div class="setting-item">
          <label class="setting-name" for="${entry.key}">${entry.label}</label>
          <div class="setting-desc">${entry.description}</div>
          <input type="${inputType}" id="${entry.key}" data-key="${entry.key}" value="${this.escapeHtml(inputVal)}" />
        </div>`;
    };

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>OpenCode 设置</title>
  <style nonce="${nonce}">
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --input-bg: var(--vscode-input-background);
      --input-fg: var(--vscode-input-foreground);
      --input-border: var(--vscode-input-border, transparent);
      --focus-border: var(--vscode-focusBorder);
      --desc-fg: var(--vscode-descriptionForeground);
      --separator: var(--vscode-panel-border, rgba(128,128,128,0.2));
      --section-fg: var(--vscode-sideBarSectionHeader-foreground, var(--fg));
      --toggle-off: var(--vscode-input-border, #5a5a5a);
      --toggle-on: var(--vscode-button-background, #0078d4);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size, 13px);
      color: var(--fg);
      background: var(--bg);
      padding: 16px 20px;
      line-height: 1.5;
    }
    h1 {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    h1 .icon { font-size: 20px; }
    .section {
      margin-bottom: 24px;
    }
    .section-title {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--section-fg);
      padding-bottom: 8px;
      margin-bottom: 12px;
      border-bottom: 1px solid var(--separator);
    }
    .setting-item {
      margin-bottom: 16px;
    }
    .setting-name {
      font-weight: 500;
      display: block;
      margin-bottom: 2px;
    }
    .setting-desc {
      font-size: 12px;
      color: var(--desc-fg);
      margin-bottom: 6px;
    }
    input[type="text"],
    input[type="number"] {
      width: 100%;
      max-width: 400px;
      padding: 5px 8px;
      background: var(--input-bg);
      color: var(--input-fg);
      border: 1px solid var(--input-border);
      border-radius: 2px;
      font-family: inherit;
      font-size: inherit;
      outline: none;
    }
    input[type="text"]:focus,
    input[type="number"]:focus {
      border-color: var(--focus-border);
    }
    /* 开关样式 */
    .setting-row {
      display: flex;
      align-items: center;
    }
    .toggle-label {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      max-width: 400px;
      cursor: pointer;
    }
    .toggle-switch {
      position: relative;
      width: 36px;
      height: 20px;
      flex-shrink: 0;
    }
    .toggle-switch input {
      opacity: 0;
      width: 0;
      height: 0;
    }
    .toggle-slider {
      position: absolute;
      inset: 0;
      background: var(--toggle-off);
      border-radius: 10px;
      transition: background 0.2s;
      cursor: pointer;
    }
    .toggle-slider::before {
      content: "";
      position: absolute;
      width: 14px;
      height: 14px;
      left: 3px;
      bottom: 3px;
      background: white;
      border-radius: 50%;
      transition: transform 0.2s;
    }
    .toggle-switch input:checked + .toggle-slider {
      background: var(--toggle-on);
    }
    .toggle-switch input:checked + .toggle-slider::before {
      transform: translateX(16px);
    }
    .toggle-switch input:focus-visible + .toggle-slider {
      outline: 1px solid var(--focus-border);
      outline-offset: 2px;
    }
  </style>
</head>
<body>
  <h1><span class="icon">⚙</span> OpenCode 设置</h1>

  <div class="section">
    <div class="section-title">服务器</div>
    ${serverEntries.map(renderEntry).join("")}
  </div>

  <div class="section">
    <div class="section-title">聊天</div>
    ${chatEntries.map(renderEntry).join("")}
  </div>

  <script nonce="${nonce}">
    (function() {
      const vscode = acquireVsCodeApi();

      function sendUpdate(key, value) {
        vscode.postMessage({ type: 'update', key: key, value: value });
      }

      // 为所有输入框和开关绑定事件
      document.querySelectorAll('input[type="text"], input[type="number"]').forEach(function(input) {
        input.addEventListener('blur', function() {
          var key = this.getAttribute('data-key');
          var val = this.value;
          if (this.type === 'number') {
            val = val === '' ? 0 : Number(val);
          }
          sendUpdate(key, val);
        });
        // 回车也触发保存
        input.addEventListener('keydown', function(e) {
          if (e.key === 'Enter') {
            this.blur();
          }
        });
      });

      document.querySelectorAll('input[type="checkbox"]').forEach(function(input) {
        input.addEventListener('change', function() {
          var key = this.getAttribute('data-key');
          sendUpdate(key, this.checked);
        });
      });
    })();
  </script>
</body>
</html>`;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
