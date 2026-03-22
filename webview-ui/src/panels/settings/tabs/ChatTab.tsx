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

interface ShortcutDefinition {
  label: string;
  command: string;
  shortcut: string;
  macShortcut?: string;
  description: string;
}

const KEYBOARD_SHORTCUTS: ShortcutDefinition[] = [
  {
    label: 'Focus Chat',
    command: 'OpenCode: Focus Chat Panel',
    shortcut: 'Ctrl+Shift+O',
    macShortcut: 'Cmd+Shift+O',
    description: 'Moves focus to the OpenCode chat panel from anywhere in VS Code.',
  },
  {
    label: 'New Session',
    command: 'OpenCode: New Session',
    shortcut: 'Ctrl+Shift+N',
    macShortcut: 'Cmd+Shift+N',
    description: 'Starts a new session when the OpenCode server is connected.',
  },
  {
    label: 'Abort Session',
    command: 'OpenCode: Abort Current Session',
    shortcut: 'Esc',
    description: 'Stops the current OpenCode run while a session is busy.',
  },
  {
    label: 'Insert Current Editor Code into Chat',
    command: 'OpenCode: Insert Current Editor Code into Chat',
    shortcut: 'Ctrl+Alt+Shift+C',
    macShortcut: 'Cmd+Alt+Shift+C',
    description: 'Adds the active editor code to chat when the editor is writable and OpenCode is connected.',
  },
];

interface ChatTabProps {
  settings: Record<string, unknown>;
  onUpdate: (key: string, value: unknown) => void;
  onOpenKeyboardShortcuts: () => void;
}

function ShortcutKeys({ combo }: { combo: string }) {
  const keys = combo.split('+');

  return (
    <span className="settings-shortcuts__combo" aria-label={combo}>
      {keys.map((key, index) => (
        <React.Fragment key={`${combo}-${key}-${index}`}>
          <kbd className="settings-shortcuts__key">{key}</kbd>
          {index < keys.length - 1 && (
            <span className="settings-shortcuts__key-separator" aria-hidden="true">
              +
            </span>
          )}
        </React.Fragment>
      ))}
    </span>
  );
}

export function ChatTab({ settings, onUpdate, onOpenKeyboardShortcuts }: ChatTabProps) {
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

      <SettingGroup
        title="Keyboard Shortcuts"
        description="These are the current default OpenCode shortcuts. To change the real keybindings, open VS Code Keyboard Shortcuts and remap the OpenCode commands there."
      >
        <div className="settings-shortcuts">
          <p className="settings-shortcuts__intro">
            The list below mirrors this extension&apos;s built-in defaults for common chat
            and editor actions.
          </p>

          <div className="settings-shortcuts__list">
            {KEYBOARD_SHORTCUTS.map((shortcut) => {
              const bindings = shortcut.macShortcut && shortcut.macShortcut !== shortcut.shortcut
                ? [
                    { label: 'Windows / Linux', combo: shortcut.shortcut },
                    { label: 'macOS', combo: shortcut.macShortcut },
                  ]
                : [{ label: 'All platforms', combo: shortcut.shortcut }];

              return (
                <article key={shortcut.command} className="settings-shortcuts__item">
                  <div className="settings-shortcuts__item-header">
                    <div className="settings-shortcuts__item-title">{shortcut.label}</div>
                    <div className="settings-shortcuts__item-command">{shortcut.command}</div>
                  </div>

                  <div className="settings-shortcuts__bindings">
                    {bindings.map((binding) => (
                      <div key={`${shortcut.command}-${binding.label}`} className="settings-shortcuts__binding-row">
                        <span className="settings-shortcuts__binding-label">{binding.label}</span>
                        <ShortcutKeys combo={binding.combo} />
                      </div>
                    ))}
                  </div>

                  <p className="settings-shortcuts__item-description">{shortcut.description}</p>
                </article>
              );
            })}
          </div>

          <div className="settings-shortcuts__actions">
            <button
              type="button"
              className="btn btn--secondary settings-shortcuts__action"
              onClick={onOpenKeyboardShortcuts}
            >
              <span className="codicon codicon-keyboard" aria-hidden="true" />
              Open Keyboard Shortcuts
            </button>

            <p className="settings-shortcuts__hint">
              Use VS Code Keyboard Shortcuts to customize any of these bindings.
            </p>
          </div>
        </div>
      </SettingGroup>
    </>
  );
}
