/**
 * BashRenderer - Enhanced terminal-style renderer for bash/shell tool calls.
 *
 * Shows a terminal-like card with:
 * - `$` prompt prefix + command
 * - Description subtitle (if available)
 * - ANSI-colored output in a dark terminal block
 * - Exit status indicator and duration
 * - Auto-expands on error
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ToolCallPartProps } from './ToolCallPart';
import { toRecord, stringifyValue, formatDuration } from './ToolCallPart';
import { ansiToHtml, containsAnsi } from '../../../utils/ansiToHtml';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractBashInfo(input: unknown): { command: string; description: string } {
  const record = toRecord(input);
  return {
    command: typeof record.command === 'string' ? record.command : '',
    description: typeof record.description === 'string' ? record.description : '',
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const BashRenderer = React.memo(function BashRenderer({
  part,
  grouped,
}: ToolCallPartProps) {
  const status = part.state?.status ?? 'pending';
  const input = part.state?.input;
  const output = stringifyValue(part.state?.output);
  const error = stringifyValue(part.state?.error);
  const start = part.state?.time?.start;
  const end = part.state?.time?.end;

  const duration =
    typeof start === 'number' && typeof end === 'number' ? end - start : undefined;
  const showDuration = duration !== undefined && duration > 2000 && status === 'completed';

  const { command, description } = useMemo(() => extractBashInfo(input), [input]);
  const hasError = status === 'error' || error.trim().length > 0;
  const hasContent = output.trim().length > 0 || error.trim().length > 0;

  // Auto-expand on error
  const [expanded, setExpanded] = useState(hasError);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [bodyHeight, setBodyHeight] = useState(0);

  useEffect(() => {
    if (hasError && !expanded) {
      setExpanded(true);
    }
  }, [hasError]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (bodyRef.current) {
      setBodyHeight(bodyRef.current.scrollHeight);
    }
  }, [error, expanded, output]);

  const toggle = useCallback(() => setExpanded((v) => !v), []);

  const outputHtml = useMemo(
    () => (containsAnsi(output) ? ansiToHtml(output) : null),
    [output],
  );

  const displayCommand = command || 'bash';

  return (
    <div className={`msg-bash ${grouped ? 'msg-bash--grouped' : ''}`}>
      {/* Terminal header */}
      <div className="msg-bash__header">
        <span className="msg-bash__status-dot" data-status={hasError ? 'error' : status} />
        <span className="msg-bash__prompt">$</span>
        <span className="msg-bash__command" title={command}>{displayCommand}</span>
        {status === 'running' && (
          <svg width="12" height="12" viewBox="0 0 16 16" className="msg-bash__spinner">
            <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="8" strokeLinecap="round" />
          </svg>
        )}
        {showDuration && duration !== undefined && (
          <span className="msg-bash__duration">{formatDuration(duration)}</span>
        )}
      </div>

      {/* Description subtitle */}
      {description && (
        <div className="msg-bash__description">{description}</div>
      )}

      {/* Error display (always visible) */}
      {error.trim() && (
        <div className="msg-bash__error">{error}</div>
      )}

      {/* Collapsible result toggle */}
      {hasContent && (
        <button className="msg-tool-compact__toggle" onClick={toggle} type="button">
          <span className="msg-tool-compact__toggle-icon">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" style={{ opacity: 0.85 }}>
              {expanded ? <path d="M4 6l4 4 4-4" /> : <path d="M6 4l4 4-4 4" />}
            </svg>
          </span>
          {expanded ? 'Hide output' : 'Show output'}
        </button>
      )}

      {/* Collapsible body */}
      {hasContent && (
        <div
          className="msg-tool-compact__collapse"
          style={{
            maxHeight: expanded ? `${Math.min(bodyHeight + 16, 500)}px` : '0px',
          }}
        >
          <div ref={bodyRef} className="msg-bash__output">
            {output.trim() && (
              outputHtml !== null ? (
                <pre
                  className="msg-bash__pre ansi-output"
                  dangerouslySetInnerHTML={{ __html: outputHtml }}
                />
              ) : (
                <pre className="msg-bash__pre">{output}</pre>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
});
