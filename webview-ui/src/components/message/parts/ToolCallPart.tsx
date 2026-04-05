/**
 * ToolCallPart - Compact tool call card (official OpenCode style).
 *
 * Layout:
 *   TOOL_NAME target/path
 *     [Show results ▸] / [Hide results ▾]
 *     (collapsed content when expanded)
 *     2.5s (only if duration > 2000ms)
 *
 * Specialized renderers are dispatched for certain tools (task, todo, bash, edit/write).
 */

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ToolPart } from '../../../types/opencode';
import { postMessage } from '../../../utils/vscodeApi';
import { ansiToHtml, containsAnsi } from '../../../utils/ansiToHtml';
import { TodoRenderer } from './TodoRenderer';
import { BashRenderer } from './BashRenderer';
import { EditRenderer } from './EditRenderer';
import { TaskRenderer } from './TaskRenderer';

// ---------------------------------------------------------------------------
// Tool helpers (exported for use by specialized renderers)
// ---------------------------------------------------------------------------

const CONTEXT_TOOLS = new Set(['read', 'list', 'glob', 'grep']);

const EMPTY_RECORD: Record<string, unknown> = {};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function toRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : EMPTY_RECORD;
}

export function stringifyValue(value: unknown): string {
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

export function getToolName(value: unknown): string {
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

export interface ArgsSummaryInfo {
  text: string;
  /** If set, clicking the summary should open this file. */
  filePath?: string;
  /** If set, clicking the summary should open this URL externally. */
  url?: string;
  /** Optional line number to jump to. */
  line?: number;
}

interface ReadOutputLine {
  lineNumber: number;
  text: string;
}

interface ReadOutputInfo {
  lines: ReadOutputLine[];
  note?: string;
}

function toNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const text = value.trim();
  return text ? text : undefined;
}

function toPositiveLineNumber(value: unknown): number | undefined {
  if (value == null || value === '') {
    return undefined;
  }

  const line = Number(value);
  if (!Number.isFinite(line) || line < 1) {
    return undefined;
  }

  return Math.trunc(line);
}

function splitOutputLines(output: string): string[] {
  const normalized = output.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');

  if (normalized.endsWith('\n')) {
    lines.pop();
  }

  return lines;
}

function parseReadOutput(value: unknown): ReadOutputInfo | undefined {
  if (typeof value !== 'string' || !value.trim()) {
    return undefined;
  }

  const all = splitOutputLines(value);
  const typeIndex = all.indexOf('<type>file</type>');
  const start = all.indexOf('<content>');
  const end = all.indexOf('</content>');

  if (typeIndex === -1 || start === -1 || end <= start || typeIndex > start) {
    return undefined;
  }

  const note: string[] = [];
  const lines = all.slice(start + 1, end).flatMap((text) => {
    const match = text.match(/^(\d+):(.*)$/);
    if (!match) {
      note.push(text);
      return [];
    }

    const lineNumber = toPositiveLineNumber(match[1]);
    if (lineNumber === undefined) {
      note.push(text);
      return [];
    }

    const lineText = match[2].startsWith(' ') ? match[2].slice(1) : match[2];
    return [{ lineNumber, text: lineText }];
  });

  if (lines.length === 0) {
    return undefined;
  }

  const summary = note.join('\n').trim();
  return {
    lines,
    note: summary || undefined,
  };
}

export function getArgsSummaryInfo(tool: string, input: unknown): ArgsSummaryInfo {
  const name = tool.toLowerCase();
  const value = toRecord(input);

  if (name === 'task') {
    if (typeof value.description === 'string' && value.description.trim()) {
      return { text: value.description };
    }

    if (typeof value.subagent_type === 'string' && value.subagent_type.trim()) {
      return { text: value.subagent_type };
    }
  }

  const filePath = toNonEmptyString(value.filePath);

  if (name === 'read' && filePath) {
    const fp = filePath;
    const short = fp.length > 50 ? '...' + fp.slice(-47) : fp;
    const offset = toPositiveLineNumber(value.offset);
    const limit = toPositiveLineNumber(value.limit);
    const range =
      offset !== undefined || limit !== undefined
        ? ` lines ${offset ?? 1}-${(offset ?? 1) + (limit ?? 2000) - 1}`
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

  if (name === 'edit' && filePath) {
    const fp = filePath;
    return {
      text: fp.length > 60 ? '...' + fp.slice(-57) : fp,
      filePath: fp,
    };
  }

  if (name === 'write' && filePath) {
    const fp = filePath;
    return {
      text: fp.length > 60 ? '...' + fp.slice(-57) : fp,
      filePath: fp,
    };
  }

  if ((name === 'bash' || name === 'shell') && (value.description || value.command)) {
    const display = value.description ? String(value.description) : String(value.command);
    return { text: display.length > 60 ? display.slice(0, 57) + '...' : display };
  }

  const url = toNonEmptyString(value.url);

  if (name === 'webfetch' && url) {
    return {
      text: url.length > 60 ? url.slice(0, 57) + '...' : url,
      url,
    };
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

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
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
  /** If true, render in timeline layout with rail + connector lines. */
  timelineMode?: boolean;
  /** First item in a timeline group (no top connector line). */
  isFirst?: boolean;
  /** Last item in a timeline group (no bottom connector line). */
  isLast?: boolean;
}

/** Generic renderer — used for all tools without a specialized renderer. */
const GenericToolCallPart = React.memo(function GenericToolCallPart({
  part,
  grouped,
}: ToolCallPartProps) {
  const [expanded, setExpanded] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const [bodyHeight, setBodyHeight] = useState(0);
  const [settled, setSettled] = useState(false);
  const tool = getToolName(part.tool);
  const input = part.state?.input;
  const rawOutput = part.state?.output;
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

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;

    setBodyHeight(el.scrollHeight);

    const observer = new ResizeObserver(() => {
      setBodyHeight(el.scrollHeight);
    });
    observer.observe(el);

    return () => observer.disconnect();
  }, []);

  // After expand transition completes, remove maxHeight constraint.
  const handleTransitionEnd = useCallback(() => {
    if (expanded) {
      setSettled(true);
    }
  }, [expanded]);

  useEffect(() => {
    if (!expanded) {
      setSettled(false);
    }
  }, [expanded]);

  const toggle = useCallback(() => {
    // Anchor scroll to the title element so expanding pushes content down
    // while the top edge stays put.
    const titleEl = titleRef.current;
    if (titleEl) {
      const rect = titleEl.getBoundingClientRect();
      setExpanded((v) => !v);
      requestAnimationFrame(() => {
        const newRect = titleEl.getBoundingClientRect();
        const delta = newRect.top - rect.top;
        if (Math.abs(delta) > 1) {
          const scroller = titleEl.closest('.chat-messages');
          if (scroller) {
            scroller.scrollTop += delta;
          }
        }
      });
    } else {
      setExpanded((v) => !v);
    }
  }, []);
  const summaryInfo = getArgsSummaryInfo(tool, input);
  const summaryLine = toPositiveLineNumber(summaryInfo.line);
  const childSessionId = tool === 'task'
    ? (() => {
      const value = toRecord(part.state?.metadata).sessionId;
      return typeof value === 'string' && value ? value : undefined;
    })()
    : undefined;

  const openFileAtLine = useCallback((line?: number) => {
    if (!summaryInfo.filePath) {
      return;
    }

    postMessage({
      type: 'file:open',
      data: { path: summaryInfo.filePath, line },
    });
  }, [summaryInfo.filePath]);

  const handleFileClick = useCallback((e: React.MouseEvent) => {
    if (summaryInfo.filePath) {
      e.stopPropagation();
      openFileAtLine(summaryLine);
    }
  }, [openFileAtLine, summaryInfo.filePath, summaryLine]);

  const handleFileKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && summaryInfo.filePath) {
      e.preventDefault();
      e.stopPropagation();
      openFileAtLine(summaryLine);
    }
  }, [openFileAtLine, summaryInfo.filePath, summaryLine]);

  const openUrl = useCallback(() => {
    if (!summaryInfo.url) {
      return;
    }

    postMessage({
      type: 'url:open',
      data: { url: summaryInfo.url },
    });
  }, [summaryInfo.url]);

  const handleUrlClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!summaryInfo.url) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    openUrl();
  }, [openUrl, summaryInfo.url]);

  const handleSessionClick = useCallback(() => {
    if (!childSessionId) {
      return;
    }

    postMessage({
      type: 'session:switch',
      data: { id: childSessionId },
    });
  }, [childSessionId]);

  const hasContent = Boolean(output.trim() || error.trim());
  const toolDisplayName = getToolDisplayName(tool);
  const canOpenUrl = Boolean(summaryInfo.url && status !== 'pending' && status !== 'running');
  const outputHtml = useMemo(
    () => (containsAnsi(output) ? ansiToHtml(output) : null),
    [output],
  );
  const readOutputInfo = useMemo(() => {
    if (tool !== 'read' || !summaryInfo.filePath || outputHtml !== null) {
      return undefined;
    }

    return parseReadOutput(rawOutput);
  }, [outputHtml, rawOutput, summaryInfo.filePath, tool]);

  return (
    <div className={`msg-tool-compact ${grouped ? 'msg-tool-compact--grouped' : ''}`}>
      {/* Title line: TOOL_NAME target */}
      <div
        ref={titleRef}
        className="msg-tool-compact__title"
        onClick={hasContent ? toggle : undefined}
        style={hasContent ? { cursor: 'pointer' } : undefined}
        role={hasContent ? 'button' : undefined}
        tabIndex={hasContent ? 0 : undefined}
        aria-expanded={hasContent ? expanded : undefined}
        onKeyDown={hasContent ? (e) => {
          if (e.currentTarget !== e.target) {
            return;
          }

          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
          }
        } : undefined}
      >
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
              onKeyDown={handleFileKeyDown}
              role="link"
              tabIndex={0}
            >
              {summaryInfo.text}
            </span>
          ) : canOpenUrl ? (
            <a
              className="msg-tool-compact__target msg-tool-compact__target--external"
              href={summaryInfo.url}
              onClick={handleUrlClick}
              rel="noopener noreferrer"
              target="_blank"
              title={summaryInfo.url}
            >
              <span className="msg-tool-compact__target-text">{summaryInfo.text}</span>
              <svg
                aria-hidden="true"
                className="msg-tool-compact__target-icon"
                fill="currentColor"
                height="12"
                viewBox="0 0 16 16"
                width="12"
              >
                <path d="M10 2.5a.5.5 0 0 1 .5-.5h3A1.5 1.5 0 0 1 15 3.5v3a.5.5 0 0 1-1 0V4.707L8.354 10.354a.5.5 0 1 1-.708-.708L13.293 4H10.5a.5.5 0 0 1-.5-.5Z" />
                <path d="M3.5 4A1.5 1.5 0 0 0 2 5.5v7A1.5 1.5 0 0 0 3.5 14h7a1.5 1.5 0 0 0 1.5-1.5V8.75a.5.5 0 0 0-1 0v3.75a.5.5 0 0 1-.5.5h-7a.5.5 0 0 1-.5-.5v-7a.5.5 0 0 1 .5-.5h3.75a.5.5 0 0 0 0-1H3.5Z" />
              </svg>
            </a>
          ) : (
            <span className="msg-tool-compact__target" title={summaryInfo.text}>
              {summaryInfo.text}
            </span>
          )
        )}
        {hasContent && (
          <span className="msg-tool-compact__chevron">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" style={{ opacity: 0.5 }}>
              {expanded ? <path d="M4 6l4 4 4-4" /> : <path d="M6 4l4 4-4 4" />}
            </svg>
          </span>
        )}
      </div>

      {childSessionId && (
        <button
          className="msg-tool-compact__session-link"
          onClick={handleSessionClick}
          title={`Open subagent session ${childSessionId}`}
          type="button"
        >
          Open subagent session
          <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M6 3.5 10.5 8 6 12.5" />
          </svg>
        </button>
      )}

      {/* Error display (inline, always visible) */}
      {error.trim() && (
        <div className="msg-tool-compact__error">{error}</div>
      )}

      {/* Collapsible body */}
      {hasContent && (
        <div
          className="msg-tool-compact__collapse"
          style={{
            maxHeight: settled ? 'none' : expanded ? `${Math.min(bodyHeight + 16, 500)}px` : '0px',
            overflow: settled ? 'visible' : undefined,
            transition: settled ? 'none' : undefined,
          }}
          onTransitionEnd={handleTransitionEnd}
        >
          <div ref={bodyRef} className="msg-tool-compact__result">
            {output.trim() && (
              readOutputInfo ? (
                <div className="msg-tool-compact__read-result" aria-label={`Read result for ${summaryInfo.filePath}`}>
                  {readOutputInfo.lines.map(({ lineNumber, text }) => (
                    <div key={lineNumber} className="msg-tool-compact__read-row">
                      <button
                        aria-label={`Open ${summaryInfo.filePath} at line ${lineNumber}`}
                        className="msg-tool-compact__read-line-number"
                        onClick={() => openFileAtLine(lineNumber)}
                        title={`Open ${summaryInfo.filePath} at line ${lineNumber}`}
                        type="button"
                      >
                        {lineNumber}
                      </button>
                      <span className="msg-tool-compact__read-line-text">{text || '\u00a0'}</span>
                    </div>
                  ))}
                  {readOutputInfo.note && (
                    <div className="msg-tool-compact__read-note">{readOutputInfo.note}</div>
                  )}
                </div>
              ) : outputHtml !== null ? (
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

// ---------------------------------------------------------------------------
// Dispatcher — routes to specialized renderers or falls back to generic
// ---------------------------------------------------------------------------

export const ToolCallPart = React.memo(function ToolCallPart({
  part,
  grouped,
  timelineMode,
  isFirst,
  isLast,
}: ToolCallPartProps) {
  const tool = getToolName(part.tool).toLowerCase();
  const status = part.state?.status ?? 'pending';

  let inner: React.ReactNode;
  switch (tool) {
    case 'todowrite':
    case 'todoread':
      inner = <TodoRenderer part={part} />;
      break;
    case 'task':
      inner = <TaskRenderer part={part} grouped={grouped} />;
      break;
    case 'bash':
    case 'shell':
      inner = <BashRenderer part={part} grouped={grouped} />;
      break;
    case 'edit':
    case 'write':
      inner = <EditRenderer part={part} grouped={grouped} />;
      break;
    default:
      inner = <GenericToolCallPart part={part} grouped={grouped} />;
      break;
  }

  if (!timelineMode) {
    return <>{inner}</>;
  }

  const itemClass =
    `msg-tool-timeline__item` +
    (status === 'running' ? ' msg-tool-timeline__item--active' : '') +
    (status === 'error' ? ' msg-tool-timeline__item--error' : '');

  return (
    <div className={itemClass}>
      <div className="msg-tool-timeline__rail">
        {!isFirst && <div className="msg-tool-timeline__line msg-tool-timeline__line--top" />}
        <div className="msg-tool-timeline__dot">
          {getToolIcon(part.tool)}
        </div>
        {!isLast && <div className="msg-tool-timeline__line msg-tool-timeline__line--bottom" />}
      </div>
      <div className="msg-tool-timeline__content">
        {inner}
      </div>
    </div>
  );
});

export { CONTEXT_TOOLS, getToolIcon };
