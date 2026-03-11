/**
 * Toggle switch with label and description.
 */

import React, { useCallback } from 'react';

interface ToggleProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function Toggle({ label, description, checked, onChange }: ToggleProps) {
  const handleClick = useCallback(() => {
    onChange(!checked);
  }, [checked, onChange]);

  return (
    <button
      type="button"
      className={`setting-toggle ${checked ? 'setting-toggle--on' : ''}`}
      onClick={handleClick}
      role="switch"
      aria-checked={checked}
    >
      <span className={`setting-toggle__track ${checked ? 'setting-toggle__track--on' : ''}`}>
        <span className="setting-toggle__thumb" />
      </span>

      <span className="setting-toggle__text">
        <span className="setting-toggle__topline">
          <span className="setting-toggle__label">{label}</span>
          <span
            className={`setting-toggle__state ${checked ? 'setting-toggle__state--on' : 'setting-toggle__state--off'}`}
          >
            {checked ? 'On' : 'Off'}
          </span>
        </span>
        {description && (
          <span className="setting-toggle__description">{description}</span>
        )}
      </span>
    </button>
  );
}
