/**
 * Advanced settings tab — editor settings, debug options, and reset.
 */

import React, { useCallback, useState } from 'react';
import { SettingGroup } from '../../../components/settings/SettingGroup';
import { Toggle } from '../../../components/settings/Toggle';

interface AdvancedTabProps {
  settings: Record<string, unknown>;
  onUpdate: (key: string, value: unknown) => void;
}

export function AdvancedTab({ settings, onUpdate }: AdvancedTabProps) {
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const handleReset = useCallback(() => {
    // Reset all VSCode settings to defaults
    const defaults: Record<string, unknown> = {
      'server.hostname': '127.0.0.1',
      'server.port': 0,
      'server.autoStart': true,
      'server.executablePath': 'opencode',
      'chat.fontSize': 14,
      'chat.showTimestamps': true,
      'chat.wordWrap': true,
      'chat.maxImageSize': 10,
      'chat.showToolCalls': 'collapsed',
      'editor.showInlineDiffs': true,
      'editor.codeLensEnabled': false,
    };

    for (const [key, value] of Object.entries(defaults)) {
      onUpdate(key, value);
    }

    setShowResetConfirm(false);
  }, [onUpdate]);

  return (
    <>
      {/* Editor Settings */}
      <SettingGroup
        title="Editor Integration"
        description="Settings that affect how OpenCode integrates with the VSCode editor."
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

      {/* Reset */}
      <SettingGroup
        title="Reset"
        description="Reset all VSCode extension settings to their default values. This does not affect OpenCode server configuration."
      >
        {showResetConfirm ? (
          <div className="confirm-dialog" onClick={() => setShowResetConfirm(false)}>
            <div className="confirm-dialog__box" onClick={(e) => e.stopPropagation()}>
              <div className="confirm-dialog__title">Reset all settings?</div>
              <div className="confirm-dialog__message">
                This will reset all OpenCode VSCode extension settings to their default
                values. OpenCode server configuration (model, permissions, MCP, commands) will not be affected.
              </div>
              <div className="confirm-dialog__actions">
                <button
                  className="btn btn--secondary"
                  type="button"
                  onClick={() => setShowResetConfirm(false)}
                >
                  Cancel
                </button>
                <button className="btn btn--danger" type="button" onClick={handleReset}>
                  Reset All Settings
                </button>
              </div>
            </div>
          </div>
        ) : null}
        <button
          className="btn btn--danger"
          type="button"
          onClick={() => setShowResetConfirm(true)}
        >
          Reset All Settings to Defaults
        </button>
      </SettingGroup>
    </>
  );
}
