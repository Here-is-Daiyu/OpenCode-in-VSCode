/**
 * Tab navigation component for the settings panel.
 */

import React from 'react';
import type { SettingsTab } from '../../stores/settingsStore';

export interface SettingsTabDef {
  id: SettingsTab;
  label: string;
  description: string;
  icon: string;
}

export const SETTINGS_TABS: SettingsTabDef[] = [
  {
    id: 'general',
    label: 'General',
    description: 'Server, chat, and workspace basics',
    icon: '◎',
  },
  {
    id: 'model',
    label: 'Model & Agent',
    description: 'Choose providers, models, and defaults',
    icon: '✦',
  },
  {
    id: 'providers',
    label: 'Providers',
    description: 'Add, edit, or disable AI providers',
    icon: '⚡',
  },
  {
    id: 'permissions',
    label: 'Permissions',
    description: 'Control what the agent may access',
    icon: '⛨',
  },
  {
    id: 'mcp',
    label: 'MCP Servers',
    description: 'Connect remote or local tool surfaces',
    icon: '⎇',
  },
  {
    id: 'commands',
    label: 'Commands',
    description: 'Shape reusable slash command workflows',
    icon: '⌘',
  },
  {
    id: 'advanced',
    label: 'Advanced',
    description: 'Editor integration and reset controls',
    icon: '⚙',
  },
];

export function getSettingsTabDef(activeTab: SettingsTab): SettingsTabDef {
  return SETTINGS_TABS.find((tab) => tab.id === activeTab) ?? SETTINGS_TABS[0];
}

interface SettingsTabProps {
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
}

export function SettingsTabs({ activeTab, onTabChange }: SettingsTabProps) {
  return (
    <nav className="settings-tabs" aria-label="Settings sections">
      {SETTINGS_TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`settings-tabs__tab ${activeTab === tab.id ? 'settings-tabs__tab--active' : ''}`}
          onClick={() => onTabChange(tab.id)}
        >
          <span className="settings-tabs__icon">{tab.icon}</span>
          <span className="settings-tabs__text">
            <span className="settings-tabs__label">{tab.label}</span>
            <span className="settings-tabs__description">{tab.description}</span>
          </span>
          <span className="settings-tabs__chevron">›</span>
        </button>
      ))}
    </nav>
  );
}
