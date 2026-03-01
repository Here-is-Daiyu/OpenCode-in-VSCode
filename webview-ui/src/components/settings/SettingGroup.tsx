/**
 * A group of related settings with a header and optional description.
 */

import React from 'react';

interface SettingGroupProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

export function SettingGroup({ title, description, children }: SettingGroupProps) {
  return (
    <div className="setting-group">
      <div className="setting-group__header">{title}</div>
      {description && (
        <div className="setting-group__description">{description}</div>
      )}
      <div className="setting-group__items">{children}</div>
    </div>
  );
}
