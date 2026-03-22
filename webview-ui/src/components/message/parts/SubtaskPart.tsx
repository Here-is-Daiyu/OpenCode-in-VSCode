/**
 * SubtaskPart - Renders a subtask card with expand/collapse and session navigation.
 *
 * Features:
 *  - Status dot: running (blue pulsing) / completed (green) / idle (gray)
 *  - Fork icon for subtask identification
 *  - Truncated input preview in collapsed header
 *  - Expand/collapse with smooth animation
 *  - "Enter" button to navigate to the subtask's session
 *  - Expanded view shows full input and output
 *  - "View full session" link in expanded body
 */

import React, { useCallback, useRef, useState, useEffect } from 'react';
import type { SubtaskPart as SubtaskPartType } from '../../../types/opencode';
import { postMessage } from '../../../utils/vscodeApi';
import { hasDisplayText, toDisplayText } from '../../../utils/renderText';

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

type SubtaskStatus = 'running' | 'completed' | 'idle';

function inferStatus(part: SubtaskPartType): SubtaskStatus {
  if (hasDisplayText(part.output, 'subtask.output.status')) return 'completed';
  // If there's input but no output yet, assume running
  if (hasDisplayText(part.input, 'subtask.input.status')) return 'running';
  return 'idle';
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

/** Fork / split icon for subtask identification */
function SubtaskIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M5 3.25a2.25 2.25 0 1 1-1 4.27V9c0 .55.45 1 1 1h6c.55 0 1-.45 1-1V7.52a2.25 2.25 0 1 1 1 0V9a2 2 0 0 1-2 2H9v1.48a2.25 2.25 0 1 1-1 0V11H5a2 2 0 0 1-2-2V7.52A2.25 2.25 0 0 1 5 3.25zM5 4.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zm6 0a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM8.5 13.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0z" />
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

/** Arrow-right icon for "Enter" button */
function EnterIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
      <path d="M1 8h11.17l-4.59-4.59L8.99 2l6.5 6-6.5 6-1.41-1.41L12.17 9H1V8z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncateText(text: string, maxLength: number): string {
  if (!text) return '';
  const singleLine = text.replace(/\n/g, ' ').trim();
  if (singleLine.length <= maxLength) return singleLine;
  return singleLine.slice(0, maxLength - 3) + '...';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface SubtaskPartProps {
  part: SubtaskPartType;
}

export const SubtaskPartComponent = React.memo(function SubtaskPartComponent({
  part,
}: SubtaskPartProps) {
  const [expanded, setExpanded] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [bodyHeight, setBodyHeight] = useState(0);
  const status = inferStatus(part);
  const input = toDisplayText(part.input, 'subtask.input');
  const output = toDisplayText(part.output, 'subtask.output');

  useEffect(() => {
    if (bodyRef.current) {
      setBodyHeight(bodyRef.current.scrollHeight);
    }
  }, [expanded, input, output]);

  const toggle = useCallback(() => setExpanded((v) => !v), []);

  const handleHeaderKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    },
    [toggle],
  );

  const handleEnter = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      postMessage({ type: 'session:switch', data: { id: part.sessionID } });
    },
    [part.sessionID],
  );

  const handleEnterKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        postMessage({ type: 'session:switch', data: { id: part.sessionID } });
      }
    },
    [part.sessionID],
  );

  const handleViewSession = useCallback(() => {
    postMessage({ type: 'session:switch', data: { id: part.sessionID } });
  }, [part.sessionID]);

  const preview = truncateText(input, 60);

  return (
    <div className={`msg-subtask msg-subtask--${status}`}>
      {/* Header as <div> to allow nested interactive "Enter" element */}
      <div
        className="msg-subtask__header"
        onClick={toggle}
        onKeyDown={handleHeaderKeyDown}
        aria-expanded={expanded}
        role="button"
        tabIndex={0}
      >
        {/* Status dot */}
        <span className={`msg-subtask__status-dot msg-subtask__status-dot--${status}`} />

        {/* Subtask icon */}
        <span className="msg-subtask__icon">
          <SubtaskIcon />
        </span>

        {/* Title */}
        <span className="msg-subtask__title">Subtask</span>

        {/* Input preview (collapsed only, hidden when expanded) */}
        {!expanded && preview && (
          <span className="msg-subtask__preview" title={input}>
            {preview}
          </span>
        )}

        {/* Enter button */}
        <span
          className="msg-subtask__enter"
          onClick={handleEnter}
          onKeyDown={handleEnterKeyDown}
          title="Navigate to subtask session"
          aria-label="Navigate to subtask session"
          role="button"
          tabIndex={0}
        >
          Enter
          <EnterIcon />
        </span>

        {/* Chevron */}
        <span className={`msg-subtask__chevron ${expanded ? 'msg-subtask__chevron--open' : ''}`}>
          <ChevronIcon />
        </span>
      </div>

      {/* Collapsible body */}
      <div
        className="msg-subtask__collapse"
        style={{
          maxHeight: expanded ? `${Math.min(bodyHeight + 32, 600)}px` : '0px',
        }}
      >
        <div ref={bodyRef} className="msg-subtask__body">
          {/* Input section */}
          <div className="msg-subtask__section">
            <div className="msg-subtask__section-label">Input</div>
            <div className="msg-subtask__section-text">{input}</div>
          </div>

          {/* Output section */}
          {output.trim() !== '' && (
            <div className="msg-subtask__section">
              <div className="msg-subtask__section-label">Output</div>
              <div className="msg-subtask__section-text">{output}</div>
            </div>
          )}

          {/* View full session link */}
          <button
            className="msg-subtask__view-session"
            onClick={handleViewSession}
            type="button"
          >
            View full session
          </button>
        </div>
      </div>
    </div>
  );
});
