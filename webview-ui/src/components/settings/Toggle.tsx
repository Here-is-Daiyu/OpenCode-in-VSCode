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
    <div className="setting-toggle" onClick={handleClick} role="switch" aria-checked={checked} tabIndex={0}>
      <div className={`setting-toggle__track ${checked ? 'setting-toggle__track--on' : ''}`}>
        <div className="setting-toggle__thumb" />
      </div>
      <div className="setting-toggle__text">
        <span className="setting-toggle__label">{label}</span>
        {description && (
          <span className="setting-toggle__description">{description}</span>
        )}
      </div>
    </div>
  );
}
