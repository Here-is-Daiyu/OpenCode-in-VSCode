/**
 * RetryPartView - Inline retry status with countdown timer.
 *
 * Shows a warning-styled card indicating a retry is in progress.
 * When `isStreaming` is true (retry actively happening), displays
 * a live elapsed-time counter using useElapsedTime.
 * The error reason is collapsible.
 */

import React, { useCallback, useRef, useState, useEffect } from 'react';
import type { RetryPart } from '../../../types/opencode';
import { useElapsedTime } from '../../../hooks/useElapsedTime';
import { hasDisplayText, toDisplayText } from '../../../utils/renderText';

// ---------------------------------------------------------------------------
// Icon
// ---------------------------------------------------------------------------

function WarningIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M7.56 1.22a.5.5 0 0 1 .88 0l6.5 12A.5.5 0 0 1 14.5 14h-13a.5.5 0 0 1-.44-.78l6.5-12zM8 5v4h.01L8 5zm0 5.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatElapsed(ms: number): string {
  const seconds = ms / 1000;
  if (seconds < 10) return `${seconds.toFixed(1)}s`;
  return `${Math.floor(seconds)}s`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface RetryPartViewProps {
  part: RetryPart;
  isStreaming?: boolean;
}

export const RetryPartView = React.memo(function RetryPartView({
  part,
  isStreaming,
}: RetryPartViewProps) {
  const [expanded, setExpanded] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [bodyHeight, setBodyHeight] = useState(0);
  const elapsed = useElapsedTime(!!isStreaming);
  const reason = toDisplayText(part.reason, 'retry.reason');

  useEffect(() => {
    if (bodyRef.current) {
      setBodyHeight(bodyRef.current.scrollHeight);
    }
  }, [expanded, reason]);

  const toggle = useCallback(() => setExpanded((v) => !v), []);
  const hasReason = hasDisplayText(part.reason, 'retry.reason.visible');

  return (
    <div className="msg-retry">
      {/* Header */}
      <div className="msg-retry__header">
        <span className="msg-retry__icon">
          <WarningIcon />
        </span>
        <span className="msg-retry__title">
          {isStreaming ? 'Retrying...' : 'Retried'}
        </span>
        {isStreaming && (
          <span className="msg-retry__timer">{formatElapsed(elapsed)}</span>
        )}
      </div>

      {/* Collapsible reason toggle */}
      {hasReason && (
        <button className="msg-retry__toggle" onClick={toggle} type="button">
          <span className="msg-tool-compact__toggle-icon">
            <svg
              width="11"
              height="11"
              viewBox="0 0 16 16"
              fill="currentColor"
              style={{ opacity: 0.85 }}
            >
              {expanded ? <path d="M4 6l4 4 4-4" /> : <path d="M6 4l4 4-4 4" />}
            </svg>
          </span>
          {expanded ? 'Hide reason' : 'Show reason'}
        </button>
      )}

      {/* Collapsible body */}
      {hasReason && (
        <div
          className="msg-tool-compact__collapse"
          style={{
            maxHeight: expanded ? `${Math.min(bodyHeight + 16, 400)}px` : '0px',
          }}
        >
          <div ref={bodyRef} className="msg-retry__reason">
            <pre className="msg-retry__reason-text">{reason}</pre>
          </div>
        </div>
      )}
    </div>
  );
});
