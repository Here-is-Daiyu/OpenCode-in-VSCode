/**
 * Dropdown select with options.
 */

import React, { useCallback } from 'react';

export interface DropdownOption {
  value: string;
  label: string;
  disabled?: boolean;
  group?: string;
}

interface DropdownProps {
  label: string;
  description?: string;
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
}

export function Dropdown({
  label,
  description,
  value,
  options,
  onChange,
}: DropdownProps) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChange(e.target.value);
    },
    [onChange],
  );

  // Group options if any have a group property
  const groups = new Map<string, DropdownOption[]>();
  const ungrouped: DropdownOption[] = [];

  for (const opt of options) {
    if (opt.group) {
      const list = groups.get(opt.group) ?? [];
      list.push(opt);
      groups.set(opt.group, list);
    } else {
      ungrouped.push(opt);
    }
  }

  return (
    <div className="setting-row">
      <label className="setting-row__label">{label}</label>
      {description && (
        <span className="setting-row__description">{description}</span>
      )}
      <div className="setting-row__control">
        <div className="setting-dropdown">
          <select
            className="setting-dropdown__select"
            value={value}
            onChange={handleChange}
          >
            {ungrouped.map((opt) => (
              <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                {opt.label}
              </option>
            ))}
            {Array.from(groups.entries()).map(([group, opts]) => (
              <optgroup key={group} label={group}>
                {opts.map((opt) => (
                  <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                    {opt.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <span className="setting-dropdown__arrow">&#9662;</span>
        </div>
      </div>
    </div>
  );
}
