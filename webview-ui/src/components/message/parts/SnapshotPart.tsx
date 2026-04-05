/**
 * SnapshotPart - Compact card showing a file snapshot reference.
 *
 * Layout: clock icon + "Snapshot: {path}" (clickable to open file)
 */

import React, { useCallback } from 'react';
import type { SnapshotPart as SnapshotPartType } from '../../../types/opencode';
import { postMessage } from '../../../utils/vscodeApi';

// ---------------------------------------------------------------------------
// Icon
// ---------------------------------------------------------------------------

function HistoryIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M13.507 12.324a7 7 0 0 0 .065-8.56A7 7 0 0 0 2 4.393V2H1v3.5l.5.5H5V5H2.811a6.008 6.008 0 1 1-.135 5.77l-.887.462a7 7 0 0 0 11.718 1.092zM8 4v4.5l3.5 2.1.5-.86L9 7.74V4H8z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getBaseName(path: string): string {
  if (!path) return '';
  const normalized = path.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? path;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface SnapshotPartProps {
  part: SnapshotPartType;
}

export const SnapshotPartView = React.memo(function SnapshotPartView({
  part,
}: SnapshotPartProps) {
  const handleClick = useCallback(() => {
    postMessage({ type: 'file:open', data: { path: part.path } });
  }, [part.path]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleClick();
      }
    },
    [handleClick],
  );

  const baseName = getBaseName(part.path);

  return (
    <div
      className="msg-snapshot"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      title={`Open ${part.path}`}
    >
      <span className="msg-snapshot__icon">
        <HistoryIcon />
      </span>
      <span className="msg-snapshot__label">
        Snapshot: <span className="msg-snapshot__path">{baseName}</span>
      </span>
    </div>
  );
});
