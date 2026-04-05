/**
 * Anchor navigation component for the settings panel.
 */

import React, { useCallback } from 'react';
import type { SettingsTab } from '../../stores/settingsStore';

const SETTINGS_SECTION_ID_PREFIX = 'settings-section-';

export interface SettingsTabDef {
  id: SettingsTab;
  label: string;
  description: string;
  icon: string; // codicon name (without 'codicon-' prefix)
}

export const SETTINGS_TABS: SettingsTabDef[] = [
  {
    id: 'connection',
    label: 'Connection',
    description: 'Server connection and startup',
    icon: 'plug',
  },
  {
    id: 'chat',
    label: 'Chat',
    description: 'Display, behavior, and editor integration',
    icon: 'comment-discussion',
  },
  {
    id: 'models',
    label: 'Models',
    description: 'Model selection, agents, and reasoning',
    icon: 'sparkle',
  },
  {
    id: 'integrations',
    label: 'Integrations',
    description: 'MCP servers, commands, and providers',
    icon: 'extensions',
  },
  {
    id: 'permissions',
    label: 'Permissions',
    description: 'Access control and safety rules',
    icon: 'shield',
  },
];

export function getSettingsTabDef(activeTab: SettingsTab): SettingsTabDef {
  return SETTINGS_TABS.find((tab) => tab.id === activeTab) ?? SETTINGS_TABS[0];
}

export function getSettingsSectionId(tab: SettingsTab): string {
  return `${SETTINGS_SECTION_ID_PREFIX}${tab}`;
}

interface SettingsTabProps {
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
}

export function SettingsTabs({ activeTab, onTabChange }: SettingsTabProps) {
  const handleClick = useCallback((tabId: SettingsTab) => {
    onTabChange(tabId);

    const section = document.getElementById(getSettingsSectionId(tabId));
    section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [onTabChange]);

  return (
    <nav className="settings-tabs" aria-label="Settings sections">
      {SETTINGS_TABS.map((tab) => (
        <a
          key={tab.id}
          href={`#${getSettingsSectionId(tab.id)}`}
          className={`settings-tabs__tab ${activeTab === tab.id ? 'settings-tabs__tab--active' : ''}`}
          onClick={(event) => {
            event.preventDefault();
            handleClick(tab.id);
          }}
          aria-current={activeTab === tab.id ? 'location' : undefined}
        >
          <span className="settings-tabs__icon">
            <span className={`codicon codicon-${tab.icon}`} aria-hidden="true" />
          </span>
          <span className="settings-tabs__text">
            <span className="settings-tabs__label">{tab.label}</span>
            <span className="settings-tabs__description">{tab.description}</span>
          </span>
          <span className="settings-tabs__chevron">
            <span className="codicon codicon-chevron-right" aria-hidden="true" />
          </span>
        </a>
      ))}
    </nav>
  );
}
