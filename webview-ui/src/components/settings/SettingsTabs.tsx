/**
 * Tab navigation component for the settings panel.
 */

import React from 'react';
import type { SettingsTab } from '../../stores/settingsStore';

interface TabDef {
  id: SettingsTab;
  label: string;
}

const TABS: TabDef[] = [
  { id: 'general', label: 'General' },
  { id: 'model', label: 'Model & Agent' },
  { id: 'permissions', label: 'Permissions' },
  { id: 'mcp', label: 'MCP Servers' },
  { id: 'commands', label: 'Commands' },
  { id: 'advanced', label: 'Advanced' },
];

interface SettingsTabProps {
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
}

export function SettingsTabs({ activeTab, onTabChange }: SettingsTabProps) {
  return (
    <div className="settings-tabs">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          className={`settings-tabs__tab ${activeTab === tab.id ? 'settings-tabs__tab--active' : ''}`}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
