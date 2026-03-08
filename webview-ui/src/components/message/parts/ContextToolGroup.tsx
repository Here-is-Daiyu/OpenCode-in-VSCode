/**
 * ContextToolGroup - Groups consecutive read/glob/grep/list tool calls
 * into a collapsible "Gathered Context" section, modeled on OpenCode Desktop.
 */

import React, { useCallback, useRef, useState, useEffect } from 'react';
import type { ToolPart } from '../../../types/opencode';
import { ToolCallPart, CONTEXT_TOOLS } from './ToolCallPart';

interface ContextToolGroupProps {
  tools: ToolPart[];
}

function getToolName(value: unknown): string {
  return typeof value === 'string' && value ? value : 'tool';
}

/** Checks whether a tool part belongs to the "context gathering" category. */
export function isContextTool(part: ToolPart): boolean {
  return CONTEXT_TOOLS.has(getToolName(part.tool).toLowerCase());
}

function buildGroupSummary(tools: ToolPart[]): string {
  const counts: Record<string, number> = {};
  for (const t of tools) {
    const tool = getToolName(t.tool);
    const name = tool.toLowerCase();
    if (name === 'read' || name === 'list') {
      counts['reads'] = (counts['reads'] ?? 0) + 1;
    } else if (name === 'glob' || name === 'grep') {
      counts['searches'] = (counts['searches'] ?? 0) + 1;
    } else {
      counts[tool] = (counts[tool] ?? 0) + 1;
    }
  }

  return Object.entries(counts)
    .map(([label, n]) => `${n} ${label}`)
    .join(', ');
}

export const ContextToolGroup = React.memo(function ContextToolGroup({
  tools,
}: ContextToolGroupProps) {
  // Default collapsed if all completed
  const allDone = tools.every((t) => t.state?.status === 'completed' || t.state?.status === 'error');
  const [expanded, setExpanded] = useState(!allDone);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [bodyHeight, setBodyHeight] = useState(0);

  useEffect(() => {
    if (bodyRef.current) {
      setBodyHeight(bodyRef.current.scrollHeight);
    }
  }, [expanded, tools]);

  // Auto-collapse when all tools finish
  useEffect(() => {
    if (allDone) {
      setExpanded(false);
    }
  }, [allDone]);

  const toggle = useCallback(() => setExpanded((v) => !v), []);
  const summary = buildGroupSummary(tools);
  const hasError = tools.some((t) => t.state?.status === 'error');
  const isRunning = tools.some((t) => t.state?.status === 'running' || t.state?.status === 'pending');

  return (
    <div
      className={`msg-context-group ${
        hasError ? 'msg-context-group--error' : isRunning ? 'msg-context-group--running' : 'msg-context-group--done'
      }`}
    >
      <button
        className="msg-context-group__header"
        onClick={toggle}
        aria-expanded={expanded}
        type="button"
      >
        <span className="msg-context-group__icon">
          {/* Book / file-search icon */}
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M14.5 2H5.5C4.67 2 4 2.67 4 3.5V4H2.5C1.67 4 1 4.67 1 5.5v7c0 .83.67 1.5 1.5 1.5h9c.83 0 1.5-.67 1.5-1.5V12h1.5c.83 0 1.5-.67 1.5-1.5v-7c0-.83-.67-1.5-1.5-1.5zM12 12.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5v-7a.5.5 0 0 1 .5-.5H4v5.5c0 .83.67 1.5 1.5 1.5H12v.5zM15 10.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5v-7a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 .5.5v7z" />
          </svg>
        </span>
        <span className="msg-context-group__title">Gathered Context</span>
        <span className="msg-context-group__summary">({summary})</span>
        {isRunning && (
          <span className="msg-context-group__running-indicator">
            <svg width="12" height="12" viewBox="0 0 16 16" className="msg-tool__spinner">
              <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="8" strokeLinecap="round" />
            </svg>
          </span>
        )}
        <span
          className={`msg-context-group__chevron ${expanded ? 'msg-context-group__chevron--open' : ''}`}
        >
          <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6 4l4 4-4 4" />
          </svg>
        </span>
      </button>

      <div
        className="msg-context-group__collapse"
        style={{
          maxHeight: expanded ? `${bodyHeight + 32}px` : '0px',
        }}
      >
        <div ref={bodyRef} className="msg-context-group__body">
          {tools.map((tool) => (
            <ToolCallPart key={tool.id} part={tool} grouped />
          ))}
        </div>
      </div>
    </div>
  );
});
