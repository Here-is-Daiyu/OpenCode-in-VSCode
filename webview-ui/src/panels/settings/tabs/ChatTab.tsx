/**
 * Chat settings tab — chat display preferences and editor integration.
 *
 * Combines the old GeneralTab's chat settings with the old AdvancedTab's
 * editor integration section into a single, focused tab.
 */

import React from 'react';
import { SettingGroup } from '../../../components/settings/SettingGroup';
import { NumberInput } from '../../../components/settings/NumberInput';
import { Toggle } from '../../../components/settings/Toggle';
import { Dropdown } from '../../../components/settings/Dropdown';

interface ChatTabProps {
  settings: Record<string, unknown>;
  onUpdate: (key: string, value: unknown) => void;
}

export function ChatTab({ settings, onUpdate }: ChatTabProps) {
  return (
    <>
      {/* Chat Display */}
      <SettingGroup
        title="Chat Display"
        description="Customize how chat messages appear."
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

      {/* Editor Integration */}
      <SettingGroup
        title="Editor Integration"
        description="Settings that affect how OpenCode integrates with the VS Code editor."
      >
        <Toggle
          label="Show inline diffs"
          description="Display inline diff decorations in the editor when the AI modifies files."
          checked={Boolean(settings['editor.showInlineDiffs'] ?? true)}
          onChange={(v) => onUpdate('editor.showInlineDiffs', v)}
        />
        <Toggle
          label="CodeLens enabled"
          description="Show AI-powered CodeLens suggestions above functions and classes."
          checked={Boolean(settings['editor.codeLensEnabled'] ?? false)}
          onChange={(v) => onUpdate('editor.codeLensEnabled', v)}
        />
      </SettingGroup>
    </>
  );
}
