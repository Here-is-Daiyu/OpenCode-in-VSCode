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
    <div className="settings-tabs">
      {SETTINGS_TABS.map((tab) => (
        <a
          key={tab.id}
          href={`#${getSettingsSectionId(tab.id)}`}
          className={`settings-tabs__tab ${activeTab === tab.id ? 'settings-tabs__tab--active' : ''}`}
          title={tab.description}
          onClick={(event) => {
            event.preventDefault();
            handleClick(tab.id);
          }}
          aria-label={`${tab.label}: ${tab.description}`}
          aria-current={activeTab === tab.id ? 'location' : undefined}
        >
          <span className="settings-tabs__icon">
            <span className={`codicon codicon-${tab.icon}`} aria-hidden="true" />
          </span>
          <span className="settings-tabs__label">{tab.label}</span>
        </a>
      ))}
    </div>
  );
}
