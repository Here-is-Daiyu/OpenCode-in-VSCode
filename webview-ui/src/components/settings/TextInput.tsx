/**
 * Text input with label, description, and optional validation.
 */

import React, { useCallback } from 'react';

interface TextInputProps {
  label: string;
  description?: string;
  value: string;
  placeholder?: string;
  mono?: boolean;
  error?: string;
  onChange: (value: string) => void;
}

export function TextInput({
  label,
  description,
  value,
  placeholder,
  mono,
  error,
  onChange,
}: TextInputProps) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    },
    [onChange],
  );

  return (
    <div className="setting-row">
      <label className="setting-row__label">{label}</label>
      {description && (
        <span className="setting-row__description">{description}</span>
      )}
      <div className="setting-row__control">
        <input
          type="text"
          className={`setting-text-input${mono ? ' setting-text-input--mono' : ''}${error ? ' setting-text-input--error' : ''}`}
          value={value}
          placeholder={placeholder}
          onChange={handleChange}
        />
        {error && (
          <span className="setting-row__description" style={{ color: 'var(--vscode-errorForeground)' }}>
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
