/**
 * TaskRenderer - Structured task card for subagent delegation.
 *
 * Shows:
 * - Subagent type as the main task title
 * - Task description as the subtitle
 * - Child session entry CTA when a delegated session exists
 * - Collapsible output/error details without falling back to the generic tool summary
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ToolStatus } from '../../../types/opencode';
import { postMessage } from '../../../utils/vscodeApi';
import { ansiToHtml, containsAnsi } from '../../../utils/ansiToHtml';
import type { ToolCallPartProps } from './ToolCallPart';
import { formatDuration, stringifyValue, toRecord } from './ToolCallPart';

function formatTaskType(value: string): string {
  return value
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function shortenSessionId(value: string): string {
  if (value.length <= 20) {
    return value;
  }

  return `${value.slice(0, 8)}…${value.slice(-8)}`;
}

function getTaskTitle(rawType: string): string {
  if (!rawType) {
    return 'Subagent task';
  }

  const label = formatTaskType(rawType);
  if (!label) {
    return 'Subagent task';
  }

  if (/\b(agent|subagent)\b/i.test(label)) {
    return label;
  }

  return `${label} subagent`;
}

function getTaskTone(status: ToolStatus, hasError: boolean): 'running' | 'completed' | 'error' {
  if (hasError || status === 'error') {
    return 'error';
  }

  if (status === 'completed') {
    return 'completed';
  }

  return 'running';
}

function getTaskStatusLabel(status: ToolStatus, hasError: boolean): string {
  if (hasError || status === 'error') {
    return 'Error';
  }

  if (status === 'completed') {
    return 'Done';
  }

  if (status === 'running') {
    return 'Running';
  }

  return 'Pending';
}

function getTaskMeta(input: unknown, metadata: unknown): {
  title: string;
  subtitle: string;
  sessionId?: string;
  sessionLabel?: string;
} {
  const inputRecord = toRecord(input);
  const metadataRecord = toRecord(metadata);
  const rawType = typeof inputRecord.subagent_type === 'string' ? inputRecord.subagent_type.trim() : '';
  const sessionId = typeof metadataRecord.sessionId === 'string' && metadataRecord.sessionId.trim()
    ? metadataRecord.sessionId.trim()
    : undefined;
  const sessionLabel = sessionId ? shortenSessionId(sessionId) : undefined;
  const description = typeof inputRecord.description === 'string' ? inputRecord.description.trim() : '';

  return {
    title: getTaskTitle(rawType),
    subtitle: description || (sessionLabel ? `Session ${sessionLabel}` : ''),
    sessionId,
    sessionLabel,
  };
}

export const TaskRenderer = React.memo(function TaskRenderer({
  part,
  grouped,
}: ToolCallPartProps) {
  const status = part.state?.status ?? 'pending';
  const input = part.state?.input;
  const metadata = part.state?.metadata;
  const output = stringifyValue(part.state?.output);
  const error = stringifyValue(part.state?.error);
  const start = part.state?.time?.start;
  const end = part.state?.time?.end;

  const { title, subtitle, sessionId, sessionLabel } = useMemo(
    () => getTaskMeta(input, metadata),
    [input, metadata],
  );

  const hasOutput = output.trim().length > 0;
  const hasError = error.trim().length > 0;
  const hasContent = hasOutput || hasError;
  const tone = getTaskTone(status, hasError);
  const statusLabel = getTaskStatusLabel(status, hasError);
  const isRunning = status === 'pending' || status === 'running';

  const duration =
    typeof start === 'number' && typeof end === 'number'
      ? end - start
      : undefined;
  const showDuration = duration !== undefined && duration > 2000 && !isRunning;

  const [expanded, setExpanded] = useState(hasError);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [bodyHeight, setBodyHeight] = useState(0);

  useEffect(() => {
    if (hasError && !expanded) {
      setExpanded(true);
    }
  }, [expanded, hasError]);

  useEffect(() => {
    if (bodyRef.current) {
      setBodyHeight(bodyRef.current.scrollHeight);
    }
  }, [error, expanded, output]);

  const toggle = useCallback(() => setExpanded((value) => !value), []);

  const handleSessionClick = useCallback(() => {
    if (!sessionId) {
      return;
    }

    postMessage({
      type: 'session:switch',
      data: { id: sessionId },
    });
  }, [sessionId]);

  const outputHtml = useMemo(
    () => (containsAnsi(output) ? ansiToHtml(output) : null),
    [output],
  );
  const errorHtml = useMemo(
    () => (containsAnsi(error) ? ansiToHtml(error) : null),
    [error],
  );

  return (
    <div className={`msg-task msg-task--${tone} ${grouped ? 'msg-task--grouped' : ''}`}>
      <div className="msg-task__header">
        <div className="msg-task__meta">
          <span className="msg-task__label">Task</span>
          <span className={`msg-task__badge msg-task__badge--${tone}`}>{statusLabel}</span>
        </div>

        <div
          className="msg-task__title-row"
          onClick={hasContent ? toggle : undefined}
          style={hasContent ? { cursor: 'pointer' } : undefined}
          role={hasContent ? 'button' : undefined}
          tabIndex={hasContent ? 0 : undefined}
          aria-expanded={hasContent ? expanded : undefined}
          onKeyDown={hasContent ? (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggle();
            }
          } : undefined}
        >
          <div className="msg-task__title-wrap">
            <span className="msg-task__title">{title}</span>
            {isRunning && (
              <svg width="12" height="12" viewBox="0 0 16 16" className="msg-task__spinner">
                <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="8" strokeLinecap="round" />
              </svg>
            )}
          </div>

          {showDuration && duration !== undefined && (
            <span className="msg-task__duration">{formatDuration(duration)}</span>
          )}

          {hasContent && (
            <span
              className="msg-tool-compact__chevron"
              style={showDuration && duration !== undefined ? { marginLeft: 0 } : undefined}
            >
              <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" style={{ opacity: 0.5 }}>
                {expanded ? <path d="M4 6l4 4 4-4" /> : <path d="M6 4l4 4-4 4" />}
              </svg>
            </span>
          )}
        </div>

        {subtitle && (
          <div className="msg-task__subtitle" title={subtitle}>{subtitle}</div>
        )}
      </div>

      {sessionId && (
        <div className="msg-task__session">
          <span className="msg-task__session-label">Session</span>
          <button
            className="msg-task__session-link"
            onClick={handleSessionClick}
            title={`Open subagent session ${sessionId}`}
            type="button"
          >
            <span className="msg-task__session-id">{sessionLabel ?? sessionId}</span>
            <span className="msg-task__session-text">Open subagent session</span>
            <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M6 3.5 10.5 8 6 12.5" />
            </svg>
          </button>
        </div>
      )}

      {hasContent && (
        <div
          className="msg-tool-compact__collapse"
          style={{
            maxHeight: expanded ? `${Math.min(bodyHeight + 16, 560)}px` : '0px',
          }}
        >
          <div ref={bodyRef} className="msg-task__details">
            {hasOutput && (
              <div className="msg-task__section">
                <div className="msg-task__section-label">Output</div>
                {outputHtml !== null ? (
                  <pre
                    className="msg-task__pre ansi-output"
                    dangerouslySetInnerHTML={{ __html: outputHtml }}
                  />
                ) : (
                  <pre className="msg-task__pre">{output}</pre>
                )}
              </div>
            )}

            {hasError && (
              <div className="msg-task__section">
                <div className="msg-task__section-label">Error</div>
                {errorHtml !== null ? (
                  <pre
                    className="msg-task__pre msg-task__pre--error ansi-output"
                    dangerouslySetInnerHTML={{ __html: errorHtml }}
                  />
                ) : (
                  <pre className="msg-task__pre msg-task__pre--error">{error}</pre>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
