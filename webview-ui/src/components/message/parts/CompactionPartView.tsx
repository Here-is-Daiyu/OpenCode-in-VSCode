/**
 * CompactionPartView - Collapsible card showing context compaction summary.
 *
 * Collapsed by default. Shows "Context compacted" header with a compress icon.
 * Expands to reveal the summary text.
 */

import React, { useCallback, useRef, useState, useEffect } from 'react';
import type { CompactionPart } from '../../../types/opencode';

// ---------------------------------------------------------------------------
// Icon
// ---------------------------------------------------------------------------

function CompressIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M1 3h14v1H1V3zm2 3h10v1H3V6zm2 3h6v1H5V9zm2 3h2v1H7v-1z" />
    </svg>
  );
}

/** Chevron for expand/collapse */
function ChevronIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
      <path d="M6 4l4 4-4 4" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface CompactionPartViewProps {
  part: CompactionPart;
}

export const CompactionPartView = React.memo(function CompactionPartView({
  part,
}: CompactionPartViewProps) {
  const [expanded, setExpanded] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [bodyHeight, setBodyHeight] = useState(0);

  useEffect(() => {
    if (bodyRef.current) {
      setBodyHeight(bodyRef.current.scrollHeight);
    }
  }, [expanded, part.summary]);

  const toggle = useCallback(() => setExpanded((v) => !v), []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    },
    [toggle],
  );

  const hasSummary = part.summary.trim().length > 0;

  return (
    <div className="msg-compaction">
      {/* Header */}
      <div
        className="msg-compaction__header"
        onClick={toggle}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
      >
        <span className="msg-compaction__icon">
          <CompressIcon />
        </span>
        <span className="msg-compaction__title">Context compacted</span>
        {hasSummary && (
          <span
            className={`msg-compaction__chevron ${expanded ? 'msg-compaction__chevron--open' : ''}`}
          >
            <ChevronIcon />
          </span>
        )}
      </div>

      {/* Collapsible body */}
      {hasSummary && (
        <div
          className="msg-compaction__collapse"
          style={{
            maxHeight: expanded ? `${Math.min(bodyHeight + 32, 500)}px` : '0px',
          }}
        >
          <div ref={bodyRef} className="msg-compaction__body">
            <div className="msg-compaction__summary">{part.summary}</div>
          </div>
        </div>
      )}
    </div>
  );
});
