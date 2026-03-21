/**
 * ToolCallPart - Compact tool call card (official OpenCode style).
 *
 * Layout:
 *   TOOL_NAME target/path
 *     [Show results ▸] / [Hide results ▾]
 *     (collapsed content when expanded)
 *     2.5s (only if duration > 2000ms)
 */

import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import type { ToolPart } from '../../../types/opencode';
import { postMessage } from '../../../utils/vscodeApi';
import { ansiToHtml, containsAnsi } from '../../../utils/ansiToHtml';

// ---------------------------------------------------------------------------
// Tool helpers
// ---------------------------------------------------------------------------

const CONTEXT_TOOLS = new Set(['read', 'list', 'glob', 'grep']);

const EMPTY_RECORD: Record<string, unknown> = {};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : EMPTY_RECORD;
}

function stringifyValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (value == null) {
    return '';
  }

  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

function getToolName(value: unknown): string {
  return typeof value === 'string' && value ? value : 'tool';
}

// ---------------------------------------------------------------------------
// Tool icon mapping (kept for ContextToolGroup import compatibility)
// ---------------------------------------------------------------------------

function getToolIcon(toolName: string): React.ReactNode {
  const name = toolName.toLowerCase();

  if (CONTEXT_TOOLS.has(name) || name.includes('search') || name.includes('find')) {
    return (
      <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
        <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85zm-5.242.156a5 5 0 1 1 0-10 5 5 0 0 1 0 10z" />
      </svg>
    );
  }

  if (name === 'bash' || name === 'shell' || name.includes('terminal') || name.includes('exec')) {
    return (
      <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
        <path d="M1 3l5 4-5 4V3zm6 7h8v1H7v-1z" />
      </svg>
    );
  }

  if (name === 'edit' || name === 'write' || name === 'apply_patch' || name.includes('patch') || name.includes('modify')) {
    return (
      <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
        <path d="M13.23 1h-1.46L3.52 9.25l-.16.22L1 13.59 2.41 15l4.12-2.36.22-.16L15 4.23V2.77L13.23 1zM2.41 13.59l1.51-3 1.45 1.45-2.96 1.55zm3.83-2.06L4.47 9.76l6.69-6.69 1.77 1.77-6.69 6.69z" />
      </svg>
    );
  }

  if (name === 'webfetch' || name.includes('fetch') || name.includes('http') || name.includes('web') || name.includes('url')) {
    return (
      <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 1c.69 0 1.36.12 1.98.34C9.52 3.13 8.8 4.4 8.33 5.97 7.86 4.4 7.14 3.13 6.68 2.19A5.98 5.98 0 0 1 8 2zM5.5 2.6C6.08 3.72 6.72 5.04 7.08 6.5H2.6A6.01 6.01 0 0 1 5.5 2.6zM2.17 7.5h4.96c.04.49.04.98 0 1.5H2.27A5.96 5.96 0 0 1 2.17 7.5zm.43 2.5h4.48c-.36 1.46-1 2.78-1.58 3.9A6.01 6.01 0 0 1 2.6 10zm5.4 3.81c.46-.79 1.18-2.06 1.65-3.81h4.16A5.98 5.98 0 0 1 8 13.81zm1.83-4.81c.04-.5.04-1 0-1.5h4.86c.1.49.14.99.14 1.5h-5zM10.5 6.5c-.36-1.46-1-2.78-1.58-3.9A6.01 6.01 0 0 1 13.4 6.5H10.5z" />
      </svg>
    );
  }

  if (name === 'task' || name.includes('subtask') || name.includes('agent') || name.includes('dispatch')) {
    return (
      <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
        <path d="M14 4a2 2 0 1 0-2.47 1.94V7H8.5v1h3.03v1.06A2 2 0 1 0 14 10a2 2 0 0 0-1.97-2V7.06A2 2 0 0 0 14 4zM4 4a2 2 0 0 0 1.97 1.06V7h3.03v1H5.97v1.06A2 2 0 1 0 4 10a2 2 0 0 0 1.47-.94V8h3.06V7H5.47V5.94A2 2 0 0 0 4 4z" />
      </svg>
    );
  }

  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
      <path d="M14.773 3.485l-.78-.184-.503.166-1.327 1.327-1.09-.338-.338-1.09L12.062 2.04l.166-.503-.184-.78C11.357.433 10.614.146 9.86.146c-1.12 0-2.09.755-2.37 1.836l-.158.595.393.393 1.42 1.42-.862.862L6.863 3.83l-.393-.393-.595.158C4.795 3.875 4.04 4.845 4.04 5.965c0 .754.287 1.497.61 1.824L.97 11.47a1.5 1.5 0 1 0 2.121 2.121L6.773 9.91c.327.323 1.07.61 1.824.61 1.12 0 2.09-.755 2.37-1.836l.158-.595-.393-.393-1.42-1.42.862-.862 1.42 1.42.393.393.595-.158c1.081-.28 1.836-1.25 1.836-2.37 0-.754-.287-1.497-.645-1.694z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Arg summary — returns structured info so file paths can be made clickable
// ---------------------------------------------------------------------------

interface ArgsSummaryInfo {
  text: string;
  /** If set, clicking the summary should open this file. */
  filePath?: string;
  /** Optional line number to jump to. */
  line?: number;
}

function getArgsSummaryInfo(tool: string, input: unknown): ArgsSummaryInfo {
  const name = tool.toLowerCase();
  const value = toRecord(input);

  if (name === 'read' && value.filePath) {
    const fp = String(value.filePath);
    const short = fp.length > 50 ? '...' + fp.slice(-47) : fp;
    const offset = value.offset ? Number(value.offset) : undefined;
    const range =
      value.offset || value.limit
        ? ` lines ${value.offset ?? 1}-${(Number(value.offset ?? 1)) + (Number(value.limit ?? 2000)) - 1}`
        : '';
    return { text: `${short}${range}`, filePath: fp, line: offset ?? 1 };
  }

  if (name === 'glob' && value.pattern) {
    return { text: String(value.pattern) };
  }

  if (name === 'grep' && value.pattern) {
    const pat = String(value.pattern);
    const inc = value.include ? ` in ${value.include}` : '';
    return { text: `/${pat}/${inc}` };
  }

  if (name === 'edit' && value.filePath) {
    const fp = String(value.filePath);
    return {
      text: fp.length > 60 ? '...' + fp.slice(-57) : fp,
      filePath: fp,
    };
  }

  if (name === 'write' && value.filePath) {
    const fp = String(value.filePath);
    return {
      text: fp.length > 60 ? '...' + fp.slice(-57) : fp,
      filePath: fp,
    };
  }

  if ((name === 'bash' || name === 'shell') && (value.description || value.command)) {
    const display = value.description ? String(value.description) : String(value.command);
    return { text: display.length > 60 ? display.slice(0, 57) + '...' : display };
  }

  if (name === 'webfetch' && value.url) {
    const url = String(value.url);
    return { text: url.length > 60 ? url.slice(0, 57) + '...' : url };
  }

  const firstVal = Object.values(value).find((item) => typeof item === 'string');
  if (firstVal) {
    const s = String(firstVal);
    return { text: s.length > 50 ? s.slice(0, 47) + '...' : s };
  }

  return { text: '' };
}

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function getToolDisplayName(tool: string): string {
  const name = tool.toLowerCase();
  switch (name) {
    case 'bash': case 'shell': return 'BASH';
    case 'edit': return 'EDIT';
    case 'write': return 'WRITE';
    case 'read': return 'READ';
    case 'grep': return 'GREP';
    case 'glob': return 'GLOB';
    case 'list': return 'LS';
    case 'webfetch': return 'FETCH';
    case 'task': case 'subtask': return 'TASK';
    case 'todowrite': return 'PLAN';
    case 'todoread': return 'TODOS';
    default: return tool.toUpperCase();
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface ToolCallPartProps {
  part: ToolPart;
  /** If true, rendered inside a context group (minimal chrome). */
  grouped?: boolean;
}

export const ToolCallPart = React.memo(function ToolCallPart({
  part,
  grouped,
}: ToolCallPartProps) {
  const [expanded, setExpanded] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [bodyHeight, setBodyHeight] = useState(0);
  const tool = getToolName(part.tool);
  const input = part.state?.input;
  const output = stringifyValue(part.state?.output);
  const error = stringifyValue(part.state?.error);
  const status = part.state?.status ?? 'pending';
  const start = part.state?.time?.start;
  const end = part.state?.time?.end;

  const duration = typeof start === 'number' && typeof end === 'number'
    ? end - start
    : undefined;

  // Only show duration if > 2000ms
  const showDuration = duration !== undefined && duration > 2000 && status === 'completed';

  useEffect(() => {
    if (bodyRef.current) {
      setBodyHeight(bodyRef.current.scrollHeight);
    }
  }, [error, expanded, output]);

  const toggle = useCallback(() => setExpanded((v) => !v), []);
  const summaryInfo = getArgsSummaryInfo(tool, input);

  const handleFileClick = useCallback((e: React.MouseEvent) => {
    if (summaryInfo.filePath) {
      e.stopPropagation();
      postMessage({
        type: 'file:open',
        data: { path: summaryInfo.filePath, line: summaryInfo.line },
      });
    }
  }, [summaryInfo.filePath, summaryInfo.line]);

  const hasContent = output.trim() || error.trim();
  const toolDisplayName = getToolDisplayName(tool);
  const outputHtml = useMemo(
    () => (containsAnsi(output) ? ansiToHtml(output) : null),
    [output],
  );

  return (
    <div className={`msg-tool-compact ${grouped ? 'msg-tool-compact--grouped' : ''}`}>
      {/* Title line: TOOL_NAME target */}
      <div className="msg-tool-compact__title">
        <span className="msg-tool-compact__name">{toolDisplayName}</span>
        {status === 'running' && (
          <svg width="12" height="12" viewBox="0 0 16 16" className="msg-tool-compact__spinner">
            <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="8" strokeLinecap="round" />
          </svg>
        )}
        {summaryInfo.text && (
          summaryInfo.filePath ? (
            <span
              className="msg-tool-compact__target msg-tool-compact__target--clickable"
              title={`Open ${summaryInfo.filePath}`}
              onClick={handleFileClick}
              role="link"
              tabIndex={0}
            >
              {summaryInfo.text}
            </span>
          ) : (
            <span className="msg-tool-compact__target" title={summaryInfo.text}>
              {summaryInfo.text}
            </span>
          )
        )}
      </div>

      {/* Error display (inline, always visible) */}
      {error.trim() && (
        <div className="msg-tool-compact__error">{error}</div>
      )}

      {/* Collapsible result toggle */}
      {hasContent && (
        <button className="msg-tool-compact__toggle" onClick={toggle} type="button">
          <span className="msg-tool-compact__toggle-icon">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" style={{ opacity: 0.85 }}>
              {expanded ? <path d="M4 6l4 4 4-4" /> : <path d="M6 4l4 4-4 4" />}
            </svg>
          </span>
          {expanded ? 'Hide results' : 'Show results'}
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
          <div ref={bodyRef} className="msg-tool-compact__result">
            {output.trim() && (
              outputHtml !== null ? (
                <pre
                  className="ansi-output"
                  dangerouslySetInnerHTML={{ __html: outputHtml }}
                />
              ) : (
                <pre>{output}</pre>
              )
            )}
          </div>
        </div>
      )}

      {/* Duration footer */}
      {showDuration && duration !== undefined && (
        <div className="msg-tool-compact__footer">{formatDuration(duration)}</div>
      )}
    </div>
  );
});

export { CONTEXT_TOOLS, getToolIcon };
