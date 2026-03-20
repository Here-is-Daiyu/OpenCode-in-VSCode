/**
 * Connection settings tab — server connection configuration.
 *
 * Extracted from the old GeneralTab; contains only the settings needed
 * to establish and manage the connection to the OpenCode server.
 */

import React from 'react';
import { SettingGroup } from '../../../components/settings/SettingGroup';
import { TextInput } from '../../../components/settings/TextInput';
import { NumberInput } from '../../../components/settings/NumberInput';
import { Toggle } from '../../../components/settings/Toggle';

interface ConnectionTabProps {
  settings: Record<string, unknown>;
  onUpdate: (key: string, value: unknown) => void;
}

export function ConnectionTab({ settings, onUpdate }: ConnectionTabProps) {
  return (
    <SettingGroup
      title="Server Connection"
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
  );
}
