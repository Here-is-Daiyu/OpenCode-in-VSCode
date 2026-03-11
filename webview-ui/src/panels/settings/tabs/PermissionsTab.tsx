/**
 * Permissions settings tab.
 *
 * Shows a table of permission rules (read, edit, bash, glob, grep, etc.)
 * with allow/ask/deny dropdowns.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { SettingGroup } from '../../../components/settings/SettingGroup';
import { SegmentedControl } from '../../../components/settings/SegmentedControl';
import type { OpenCodeConfig, PermissionValue } from '../../../types/opencode';

/** Well-known permission keys. */
const KNOWN_PERMISSIONS = [
  { key: 'read', label: 'Read files', description: 'Read file contents' },
  { key: 'edit', label: 'Edit files', description: 'Create or modify files' },
  { key: 'bash', label: 'Run commands', description: 'Execute shell commands' },
  { key: 'glob', label: 'Glob search', description: 'Search for files by pattern' },
  { key: 'grep', label: 'Grep search', description: 'Search file contents' },
  { key: 'fetch', label: 'Fetch URLs', description: 'Make HTTP requests' },
  { key: 'mcp', label: 'MCP tools', description: 'Use MCP server tools' },
];

const PERMISSION_OPTIONS = [
  { value: 'allow', label: 'Allow' },
  { value: 'ask', label: 'Ask' },
  { value: 'deny', label: 'Deny' },
] as const;

interface PermissionsTabProps {
  config: OpenCodeConfig;
  onUpdateConfig: (partial: Record<string, unknown>) => void;
}

export function PermissionsTab({ config, onUpdateConfig }: PermissionsTabProps) {
  const permission = config.permission ?? {};

  const handlePermissionChange = useCallback(
    (key: string, value: PermissionValue) => {
      const updated = { ...permission, [key]: value };
      onUpdateConfig({ permission: updated });
    },
    [permission, onUpdateConfig],
  );

  // Bash sub-permissions (patterns)
  const bashPerms = useMemo(() => {
    const bash = permission['bash'];
    if (typeof bash === 'object' && bash !== null) {
      return bash as Record<string, PermissionValue>;
    }
    return {};
  }, [permission]);

  const [bashPatterns, setBashPatterns] = useState<Array<{ pattern: string; value: PermissionValue }>>(
    () =>
      Object.entries(bashPerms).map(([pattern, value]) => ({
        pattern,
        value: value as PermissionValue,
      })),
  );

  useEffect(() => {
    setBashPatterns(
      Object.entries(bashPerms).map(([pattern, value]) => ({
        pattern,
        value: value as PermissionValue,
      })),
    );
  }, [bashPerms]);

  const handleBashPatternChange = useCallback(
    (index: number, field: 'pattern' | 'value', newValue: string) => {
      const updated = [...bashPatterns];
      if (field === 'pattern') {
        updated[index] = { ...updated[index], pattern: newValue };
      } else {
        updated[index] = { ...updated[index], value: newValue as PermissionValue };
      }
      setBashPatterns(updated);

      // Build the bash permissions object
      const bashObj: Record<string, PermissionValue> = {};
      for (const bp of updated) {
        if (bp.pattern.trim()) {
          bashObj[bp.pattern.trim()] = bp.value;
        }
      }
      const updatedPerms = { ...permission, bash: bashObj };
      onUpdateConfig({ permission: updatedPerms });
    },
    [bashPatterns, permission, onUpdateConfig],
  );

  const addBashPattern = useCallback(() => {
    setBashPatterns((prev) => [...prev, { pattern: '', value: 'ask' }]);
  }, []);

  const removeBashPattern = useCallback(
    (index: number) => {
      const updated = bashPatterns.filter((_, i) => i !== index);
      setBashPatterns(updated);

      const bashObj: Record<string, PermissionValue> = {};
      for (const bp of updated) {
        if (bp.pattern.trim()) {
          bashObj[bp.pattern.trim()] = bp.value;
        }
      }
      const updatedPerms = { ...permission, bash: bashObj };
      onUpdateConfig({ permission: updatedPerms });
    },
    [bashPatterns, permission, onUpdateConfig],
  );

  return (
    <>
      {/* Basic Permissions */}
      <SettingGroup
        title="Permission Rules"
        description="Control what actions the AI agent can perform. 'Allow' grants permission automatically, 'Ask' prompts you each time, and 'Deny' blocks the action."
      >
        <div className="permission-grid">
          {KNOWN_PERMISSIONS.map(({ key, label, description }) => {
            const value = permission[key];
            const currentValue =
              typeof value === 'string'
                ? (value as PermissionValue)
                : 'ask';

            if (key === 'bash' && typeof permission['bash'] === 'object') {
              return null;
            }

            return (
              <div key={key} className="permission-rule">
                <div className="permission-rule__content">
                  <div className="permission-rule__label">{label}</div>
                  <div className="permission-rule__description">{description}</div>
                </div>

                <div className="permission-rule__control">
                  <SegmentedControl
                    size="compact"
                    value={currentValue}
                    options={PERMISSION_OPTIONS}
                    onChange={(nextValue) => handlePermissionChange(key, nextValue)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </SettingGroup>

      {/* Bash Pattern Permissions */}
      <SettingGroup
        title="Bash Command Patterns"
        description="Fine-grained permissions for shell commands. Use glob patterns to match specific commands (e.g. 'git *' to allow all git commands)."
      >
        <div className="permission-patterns">
          {bashPatterns.length === 0 && (
            <div className="empty-state empty-state--compact">
              <div className="empty-state__text">
                No command-specific overrides yet. Add patterns for trusted or blocked
                shell commands.
              </div>
            </div>
          )}

          {bashPatterns.map((bp, i) => (
            <div key={i} className="permission-pattern">
              <input
                className="setting-text-input setting-text-input--mono permission-pattern__input"
                placeholder="Pattern (e.g. git *)"
                value={bp.pattern}
                onChange={(e) => handleBashPatternChange(i, 'pattern', e.target.value)}
              />
              <SegmentedControl
                size="compact"
                value={bp.value}
                options={PERMISSION_OPTIONS}
                onChange={(nextValue) => handleBashPatternChange(i, 'value', nextValue)}
              />
              <button
                className="kv-editor__remove-btn"
                type="button"
                onClick={() => removeBashPattern(i)}
                title="Remove"
              >
                ×
              </button>
            </div>
          ))}

          <button className="btn btn--secondary" type="button" onClick={addBashPattern}>
            + Add bash pattern
          </button>
        </div>
      </SettingGroup>
    </>
  );
}
