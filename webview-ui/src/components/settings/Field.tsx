/**
 * Shared field wrapper for settings controls.
 */

import React from 'react';

interface FieldProps {
  label: string;
  description?: string;
  error?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export function Field({
  label,
  description,
  error,
  footer,
  children,
}: FieldProps) {
  return (
    <div className={`setting-row${error ? ' setting-row--error' : ''}`}>
      <div className="setting-row__header">
        <span className="setting-row__label">{label}</span>
        {description && (
          <span className="setting-row__description">{description}</span>
        )}
      </div>

      <div className="setting-row__control">{children}</div>

      {error ? <span className="setting-row__error">{error}</span> : footer ?? null}
    </div>
  );
}
