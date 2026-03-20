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
    id: 'connection',
    label: 'Connection',
    description: 'Server connection and startup',
    icon: '\u2299', // CIRCLED DOT OPERATOR
  },
  {
    id: 'chat',
    label: 'Chat',
    description: 'Display, behavior, and editor integration',
    icon: '\u25C9', // FISHEYE
  },
  {
    id: 'models',
    label: 'Models',
    description: 'Model selection, agents, and reasoning',
    icon: '\u2726', // BLACK FOUR POINTED STAR
  },
  {
    id: 'integrations',
    label: 'Integrations',
    description: 'MCP servers, commands, and providers',
    icon: '\u26A1', // HIGH VOLTAGE
  },
  {
    id: 'permissions',
    label: 'Permissions',
    description: 'Access control and safety rules',
    icon: '\u26E8', // BLACK CROSS ON SHIELD
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
