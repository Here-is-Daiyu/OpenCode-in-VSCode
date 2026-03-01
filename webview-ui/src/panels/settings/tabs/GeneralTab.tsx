/**
 * General settings tab — server, chat, and display settings.
 */

import React, { useCallback } from 'react';
import { SettingGroup } from '../../../components/settings/SettingGroup';
import { TextInput } from '../../../components/settings/TextInput';
import { NumberInput } from '../../../components/settings/NumberInput';
import { Toggle } from '../../../components/settings/Toggle';
import { Dropdown } from '../../../components/settings/Dropdown';

interface GeneralTabProps {
  settings: Record<string, unknown>;
  onUpdate: (key: string, value: unknown) => void;
}

export function GeneralTab({ settings, onUpdate }: GeneralTabProps) {
  return (
    <>
      {/* Server Settings */}
      <SettingGroup
        title="Server"
        description="Configure how the extension connects to the OpenCode server."
      >
        <TextInput
          label="Hostname"
          description="The hostname where the OpenCode server is running."
          value={String(settings['server.hostname'] ?? '127.0.0.1')}
          placeholder="127.0.0.1"
          onChange={(v) => onUpdate('server.hostname', v)}
        />
        <NumberInput
          label="Port"
          description="Server port. Set to 0 for auto-detection."
          value={Number(settings['server.port'] ?? 0)}
          min={0}
          max={65535}
          onChange={(v) => onUpdate('server.port', v)}
        />
        <Toggle
          label="Auto-start server"
          description="Automatically start the OpenCode server when the extension activates."
          checked={Boolean(settings['server.autoStart'] ?? true)}
          onChange={(v) => onUpdate('server.autoStart', v)}
        />
        <TextInput
          label="Executable path"
          description="Path to the opencode CLI executable. Use the full path if it's not in your PATH."
          value={String(settings['server.executablePath'] ?? 'opencode')}
          placeholder="opencode"
          mono
          onChange={(v) => onUpdate('server.executablePath', v)}
        />
      </SettingGroup>

      {/* Chat Settings */}
      <SettingGroup
        title="Chat"
        description="Customize the chat panel appearance and behavior."
      >
        <NumberInput
          label="Font size"
          description="Font size for chat messages (10-24 px)."
          value={Number(settings['chat.fontSize'] ?? 14)}
          min={10}
          max={24}
          step={1}
          showSlider
          onChange={(v) => onUpdate('chat.fontSize', v)}
        />
        <Toggle
          label="Show timestamps"
          description="Display timestamps on chat messages."
          checked={Boolean(settings['chat.showTimestamps'] ?? true)}
          onChange={(v) => onUpdate('chat.showTimestamps', v)}
        />
        <Toggle
          label="Word wrap"
          description="Enable word wrapping in chat messages."
          checked={Boolean(settings['chat.wordWrap'] ?? true)}
          onChange={(v) => onUpdate('chat.wordWrap', v)}
        />
        <NumberInput
          label="Max image size (MB)"
          description="Maximum size for image attachments."
          value={Number(settings['chat.maxImageSize'] ?? 10)}
          min={1}
          max={50}
          onChange={(v) => onUpdate('chat.maxImageSize', v)}
        />
        <Dropdown
          label="Tool call display"
          description="How tool calls are shown in chat messages."
          value={String(settings['chat.showToolCalls'] ?? 'collapsed')}
          options={[
            { value: 'expanded', label: 'Expanded — always show details' },
            { value: 'collapsed', label: 'Collapsed — click to expand' },
            { value: 'hidden', label: 'Hidden — do not show tool calls' },
          ]}
          onChange={(v) => onUpdate('chat.showToolCalls', v)}
        />
      </SettingGroup>
    </>
  );
}
