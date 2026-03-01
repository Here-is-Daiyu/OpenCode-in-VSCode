/**
 * ToolCallPart - Renders an individual tool call card.
 *
 * Features:
 *  - Icon based on tool name
 *  - Status indicator: spinner / checkmark / X
 *  - Collapsible with smooth CSS animation
 *  - Brief args summary in header
 *  - JSON-highlighted output via MarkdownRenderer
 */

import React, { useCallback, useRef, useState, useEffect } from 'react';
import type { ToolPart } from '../../../types/opencode';
import { MarkdownRenderer } from '../../MarkdownRenderer';

// ---------------------------------------------------------------------------
// Tool icon mapping
// ---------------------------------------------------------------------------

const CONTEXT_TOOLS = new Set(['read', 'list', 'glob', 'grep']);

function getToolIcon(toolName: string): React.ReactNode {
  const name = toolName.toLowerCase();

  if (CONTEXT_TOOLS.has(name) || name.includes('search') || name.includes('find')) {
    // Search / context icon
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85zm-5.242.156a5 5 0 1 1 0-10 5 5 0 0 1 0 10z" />
      </svg>
    );
  }

  if (name === 'bash' || name === 'shell' || name.includes('terminal') || name.includes('exec')) {
    // Terminal icon
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <path d="M1 3l5 4-5 4V3zm6 7h8v1H7v-1z" />
      </svg>
    );
  }

  if (name === 'edit' || name === 'write' || name === 'apply_patch' || name.includes('patch') || name.includes('modify')) {
    // Edit icon
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <path d="M13.23 1h-1.46L3.52 9.25l-.16.22L1 13.59 2.41 15l4.12-2.36.22-.16L15 4.23V2.77L13.23 1zM2.41 13.59l1.51-3 1.45 1.45-2.96 1.55zm3.83-2.06L4.47 9.76l6.69-6.69 1.77 1.77-6.69 6.69z" />
      </svg>
    );
  }

  if (name === 'webfetch' || name.includes('fetch') || name.includes('http') || name.includes('web') || name.includes('url')) {
    // Globe icon
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 1c.69 0 1.36.12 1.98.34C9.52 3.13 8.8 4.4 8.33 5.97 7.86 4.4 7.14 3.13 6.68 2.19A5.98 5.98 0 0 1 8 2zM5.5 2.6C6.08 3.72 6.72 5.04 7.08 6.5H2.6A6.01 6.01 0 0 1 5.5 2.6zM2.17 7.5h4.96c.04.49.04.98 0 1.5H2.27A5.96 5.96 0 0 1 2.17 7.5zm.43 2.5h4.48c-.36 1.46-1 2.78-1.58 3.9A6.01 6.01 0 0 1 2.6 10zm5.4 3.81c.46-.79 1.18-2.06 1.65-3.81h4.16A5.98 5.98 0 0 1 8 13.81zm1.83-4.81c.04-.5.04-1 0-1.5h4.86c.1.49.14.99.14 1.5h-5zM10.5 6.5c-.36-1.46-1-2.78-1.58-3.9A6.01 6.01 0 0 1 13.4 6.5H10.5z" />
      </svg>
    );
  }

  if (name === 'task' || name.includes('subtask') || name.includes('agent') || name.includes('dispatch')) {
    // Split/fork icon
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <path d="M14 4a2 2 0 1 0-2.47 1.94V7H8.5v1h3.03v1.06A2 2 0 1 0 14 10a2 2 0 0 0-1.97-2V7.06A2 2 0 0 0 14 4zM4 4a2 2 0 0 0 1.97 1.06V7h3.03v1H5.97v1.06A2 2 0 1 0 4 10a2 2 0 0 0 1.47-.94V8h3.06V7H5.47V5.94A2 2 0 0 0 4 4z" />
      </svg>
    );
  }

  // Default tool icon
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M14.773 3.485l-.78-.184-.503.166-1.327 1.327-1.09-.338-.338-1.09L12.062 2.04l.166-.503-.184-.78C11.357.433 10.614.146 9.86.146c-1.12 0-2.09.755-2.37 1.836l-.158.595.393.393 1.42 1.42-.862.862L6.863 3.83l-.393-.393-.595.158C4.795 3.875 4.04 4.845 4.04 5.965c0 .754.287 1.497.61 1.824L.97 11.47a1.5 1.5 0 1 0 2.121 2.121L6.773 9.91c.327.323 1.07.61 1.824.61 1.12 0 2.09-.755 2.37-1.836l.158-.595-.393-.393-1.42-1.42.862-.862 1.42 1.42.393.393.595-.158c1.081-.28 1.836-1.25 1.836-2.37 0-.754-.287-1.497-.645-1.694z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Status icon
// ---------------------------------------------------------------------------

function getStatusIcon(status: string | undefined): React.ReactNode {
  switch (status) {
    case 'pending':
      return (
        <span className="msg-tool__status msg-tool__status--pending">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" opacity="0.5">
            <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
        </span>
      );
    case 'running':
      return (
        <span className="msg-tool__status msg-tool__status--running">
          <svg width="12" height="12" viewBox="0 0 16 16" className="msg-tool__spinner">
            <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="8" strokeLinecap="round" />
          </svg>
        </span>
      );
    case 'completed':
      return (
        <span className="msg-tool__status msg-tool__status--completed">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6.27 10.87l-2.6-2.6L2.54 9.4l3.73 3.73 8.2-8.2-1.13-1.13z" />
          </svg>
        </span>
      );
    case 'error':
      return (
        <span className="msg-tool__status msg-tool__status--error">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M12.12 3.88L8 8l4.12 4.12-1.06 1.06L7 9.06l-4.12 4.12-1.06-1.06L5.94 8 1.82 3.88l1.06-1.06L7 6.94l4.06-4.12z" />
          </svg>
        </span>
      );
  }
}

// ---------------------------------------------------------------------------
// Arg summary
// ---------------------------------------------------------------------------

function getArgsSummary(tool: string, input: Record<string, unknown>): string {
  const name = tool.toLowerCase();

  if (name === 'read' && input.filePath) {
    const fp = String(input.filePath);
    const short = fp.length > 50 ? '...' + fp.slice(-47) : fp;
    const range =
      input.offset || input.limit
        ? ` lines ${input.offset ?? 1}-${(Number(input.offset ?? 1)) + (Number(input.limit ?? 2000)) - 1}`
        : '';
    return `${short}${range}`;
  }

  if (name === 'glob' && input.pattern) {
    return String(input.pattern);
  }

  if (name === 'grep' && input.pattern) {
    const pat = String(input.pattern);
    const inc = input.include ? ` in ${input.include}` : '';
    return `/${pat}/${inc}`;
  }

  if (name === 'edit' && input.filePath) {
    return String(input.filePath).length > 60
      ? '...' + String(input.filePath).slice(-57)
      : String(input.filePath);
  }

  if (name === 'write' && input.filePath) {
    return String(input.filePath).length > 60
      ? '...' + String(input.filePath).slice(-57)
      : String(input.filePath);
  }

  if (name === 'bash' && input.command) {
    const cmd = String(input.command);
    return cmd.length > 60 ? cmd.slice(0, 57) + '...' : cmd;
  }

  if (name === 'webfetch' && input.url) {
    return String(input.url).length > 60
      ? String(input.url).slice(0, 57) + '...'
      : String(input.url);
  }

  // Generic: show first string value
  const firstVal = Object.values(input).find((v) => typeof v === 'string');
  if (firstVal) {
    const s = String(firstVal);
    return s.length > 50 ? s.slice(0, 47) + '...' : s;
  }

  return '';
}

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatInputForDisplay(input: Record<string, unknown>): string {
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

function formatOutputAsMarkdown(output: string): string {
  // Try to detect JSON output and wrap it
  const trimmed = output.trim();
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      JSON.parse(trimmed);
      return '```json\n' + trimmed + '\n```';
    } catch {
      // Not valid JSON, fall through
    }
  }
  return output;
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

  const duration = part.state?.time?.end && part.state?.time?.start
    ? part.state.time.end - part.state.time.start
    : undefined;

  useEffect(() => {
    if (bodyRef.current) {
      setBodyHeight(bodyRef.current.scrollHeight);
    }
  }, [expanded, part.state?.output, part.state?.error]);

  const toggle = useCallback(() => setExpanded((v) => !v), []);
  const argsSummary = getArgsSummary(part.tool, part.state?.input ?? {});

  return (
    <div
      className={`msg-tool ${grouped ? 'msg-tool--grouped' : ''} msg-tool--${part.state?.status ?? 'pending'}`}
    >
      <button
        className="msg-tool__header"
        onClick={toggle}
        aria-expanded={expanded}
        type="button"
      >
        <span className="msg-tool__tool-icon">{getToolIcon(part.tool)}</span>
        {getStatusIcon(part.state?.status)}
        <span className="msg-tool__name">{part.tool}</span>
        {argsSummary && (
          <span className="msg-tool__args" title={argsSummary}>
            {argsSummary}
          </span>
        )}
        {duration !== undefined && part.state?.status === 'completed' && (
          <span className="msg-tool__duration">{formatDuration(duration)}</span>
        )}
        <span
          className={`msg-tool__chevron ${expanded ? 'msg-tool__chevron--open' : ''}`}
        >
          <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6 4l4 4-4 4" />
          </svg>
        </span>
      </button>

      <div
        className="msg-tool__collapse"
        style={{
          maxHeight: expanded ? `${Math.min(bodyHeight + 32, 600)}px` : '0px',
        }}
      >
        <div ref={bodyRef} className="msg-tool__body">
          {/* Input section */}
          <div className="msg-tool__section">
            <div className="msg-tool__section-label">Input</div>
            <div className="msg-tool__code">
              <MarkdownRenderer
                content={'```json\n' + formatInputForDisplay(part.state?.input ?? {}) + '\n```'}
              />
            </div>
          </div>

          {/* Output section */}
          {part.state?.output && (
            <div className="msg-tool__section">
              <div className="msg-tool__section-label">Output</div>
              <div className="msg-tool__code">
                <MarkdownRenderer content={formatOutputAsMarkdown(part.state.output)} />
              </div>
            </div>
          )}

          {/* Error section */}
          {part.state?.error && (
            <div className="msg-tool__section msg-tool__section--error">
              <div className="msg-tool__section-label">Error</div>
              <pre className="msg-tool__error-text">{part.state.error}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export { CONTEXT_TOOLS };
