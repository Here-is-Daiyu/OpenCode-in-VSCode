/**
 * Settings panel — main React application component.
 *
 * Renders a tabbed settings UI that communicates with the extension host
 * via postMessage to read/write VSCode settings and OpenCode server config.
 */

import React, { useCallback, useEffect, useRef } from 'react';
import { useSettingsStore, type SettingsTab } from '../../stores/settingsStore';
import { getVsCodeApi } from '../../utils/vscodeApi';
import { SettingsTabs } from '../../components/settings/SettingsTabs';
import { GeneralTab } from './tabs/GeneralTab';
import { ModelTab } from './tabs/ModelTab';
import { PermissionsTab } from './tabs/PermissionsTab';
import { MCPTab } from './tabs/MCPTab';
import { CommandsTab } from './tabs/CommandsTab';
import { AdvancedTab } from './tabs/AdvancedTab';
import type { ExtensionToSettingsMessage } from '../../types/messages';
import '../../styles/settings.css';

// Debounce timer for auto-save
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function postMessage(message: unknown): void {
  getVsCodeApi().postMessage(message);
}

export function SettingsApp() {
  const store = useSettingsStore();
  const initialised = useRef(false);

  // ------------------------------------------------------------------
  //  Listen for messages from extension host
  // ------------------------------------------------------------------
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data as ExtensionToSettingsMessage;
      if (!msg || typeof msg !== 'object' || !('type' in msg)) return;

      switch (msg.type) {
        case 'settings:loaded':
          store.loadAll(msg.data);
          break;
        case 'settings:updated':
          store.setVSCodeSetting(msg.data.key, msg.data.value);
          store.flashSaved();
          break;
        case 'providers:loaded':
          store.setProviders(msg.data.providers, msg.data.connected);
          break;
        case 'mcp:status':
          store.setMCPStatus(msg.data);
          break;
        case 'error':
          store.setError(msg.data.message);
          break;
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // ------------------------------------------------------------------
  //  Notify extension host that we're ready
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!initialised.current) {
      initialised.current = true;
      postMessage({ type: 'ready' });
    }
  }, []);

  // ------------------------------------------------------------------
  //  Auto-save helpers (debounced)
  // ------------------------------------------------------------------

  /** Update a VSCode setting (debounced 500ms). */
  const updateVSCodeSetting = useCallback((key: string, value: unknown) => {
    // Update local state immediately
    useSettingsStore.getState().setVSCodeSetting(key, value);

    // Debounced save to extension
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      postMessage({
        type: 'settings:update',
        data: { section: 'opencode', key, value },
      });
    }, 500);
  }, []);

  /** Update OpenCode server config (debounced 500ms). */
  const updateOpenCodeConfig = useCallback((partial: Record<string, unknown>) => {
    useSettingsStore.getState().setOpenCodeConfig(partial);

    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      postMessage({
        type: 'settings:opencode:update',
        data: partial,
      });
    }, 500);
  }, []);

  /** Add MCP server (immediate). */
  const addMCPServer = useCallback((name: string, config: unknown) => {
    postMessage({ type: 'settings:mcp:add', data: { name, config } });
  }, []);

  /** Remove MCP server (immediate). */
  const removeMCPServer = useCallback((name: string) => {
    postMessage({ type: 'settings:mcp:remove', data: { name } });
  }, []);

  /** Toggle MCP server (immediate). */
  const toggleMCPServer = useCallback((name: string, enabled: boolean) => {
    postMessage({ type: 'settings:mcp:toggle', data: { name, enabled } });
  }, []);

  // ------------------------------------------------------------------
  //  Tab change
  // ------------------------------------------------------------------
  const handleTabChange = useCallback((tab: SettingsTab) => {
    store.setActiveTab(tab);
  }, []);

  // ------------------------------------------------------------------
  //  Render active tab content
  // ------------------------------------------------------------------
  const renderTab = () => {
    switch (store.activeTab) {
      case 'general':
        return (
          <GeneralTab
            settings={store.vscodeSettings}
            onUpdate={updateVSCodeSetting}
          />
        );
      case 'model':
        return (
          <ModelTab
            config={store.opencodeConfig}
            providers={store.providers}
            connectedProviders={store.connectedProviders}
            onUpdateConfig={updateOpenCodeConfig}
          />
        );
      case 'permissions':
        return (
          <PermissionsTab
            config={store.opencodeConfig}
            onUpdateConfig={updateOpenCodeConfig}
          />
        );
      case 'mcp':
        return (
          <MCPTab
            config={store.opencodeConfig}
            mcpStatus={store.mcpStatus}
            onAdd={addMCPServer}
            onRemove={removeMCPServer}
            onToggle={toggleMCPServer}
          />
        );
      case 'commands':
        return (
          <CommandsTab
            config={store.opencodeConfig}
            providers={store.providers}
            onUpdateConfig={updateOpenCodeConfig}
          />
        );
      case 'advanced':
        return (
          <AdvancedTab
            settings={store.vscodeSettings}
            onUpdate={updateVSCodeSetting}
          />
        );
      default:
        return null;
    }
  };

  // ------------------------------------------------------------------
  //  Render
  // ------------------------------------------------------------------
  return (
    <div className="settings-app">
      {/* Header */}
      <div className="settings-header">
        <h1 className="settings-header__title">OpenCode Settings</h1>
        {store.saveIndicator && (
          <span className="settings-header__indicator settings-header__indicator--saved">
            Saved
          </span>
        )}
        {store.isDirty && !store.saveIndicator && (
          <span className="settings-header__indicator settings-header__indicator--dirty">
            Unsaved
          </span>
        )}
      </div>

      {/* Error banner */}
      {store.error && (
        <div className="settings-error">
          <span>{store.error}</span>
          <button
            className="settings-error__dismiss"
            onClick={() => store.setError(null)}
          >
            ×
          </button>
        </div>
      )}

      {/* Tabs */}
      <SettingsTabs activeTab={store.activeTab} onTabChange={handleTabChange} />

      {/* Content */}
      <div className="settings-content">
        {store.loaded ? (
          renderTab()
        ) : (
          <div className="empty-state">
            <div className="empty-state__text">Loading settings...</div>
          </div>
        )}
      </div>
    </div>
  );
}
