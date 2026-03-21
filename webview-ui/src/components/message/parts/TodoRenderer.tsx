/**
 * TodoRenderer - Specialized renderer for todowrite/todoread tool calls.
 *
 * Displays a compact "PLAN" card with a checklist of todo items showing
 * status icons and priority indicators.
 */

import React, { useMemo } from 'react';
import type { ToolPart } from '../../../types/opencode';
import { toRecord, isRecord, stringifyValue } from './ToolCallPart';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TodoItem {
  content: string;
  status: 'completed' | 'in_progress' | 'pending';
  priority: 'high' | 'medium' | 'low';
}

interface TodoRendererProps {
  part: ToolPart;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseTodos(input: unknown): TodoItem[] {
  const record = toRecord(input);
  const raw = record.todos;

  if (!Array.isArray(raw)) return [];

  return raw
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map((item) => ({
      content: typeof item.content === 'string' ? item.content : stringifyValue(item.content),
      status: isValidStatus(item.status) ? item.status : 'pending',
      priority: isValidPriority(item.priority) ? item.priority : 'medium',
    }));
}

function isValidStatus(v: unknown): v is TodoItem['status'] {
  return v === 'completed' || v === 'in_progress' || v === 'pending';
}

function isValidPriority(v: unknown): v is TodoItem['priority'] {
  return v === 'high' || v === 'medium' || v === 'low';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusIcon({ status }: { status: TodoItem['status'] }) {
  switch (status) {
    case 'completed':
      return (
        <svg className="msg-todo__status-icon msg-todo__status-icon--completed" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M6.27 10.87h.01l4.49-4.49a.5.5 0 0 1 .71.71l-4.85 4.85a.5.5 0 0 1-.71 0L3.29 9.31a.5.5 0 1 1 .71-.71l2.27 2.27z" />
          <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1" />
        </svg>
      );
    case 'in_progress':
      return (
        <svg className="msg-todo__status-icon msg-todo__status-icon--in-progress" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 1a6 6 0 1 1 0 12A6 6 0 0 1 8 2z" />
          <path d="M8 4v4l3 1.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    case 'pending':
    default:
      return (
        <svg className="msg-todo__status-icon msg-todo__status-icon--pending" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1" />
        </svg>
      );
  }
}

function PriorityDot({ priority }: { priority: TodoItem['priority'] }) {
  const className = `msg-todo__priority msg-todo__priority--${priority}`;
  return <span className={className} title={`${priority} priority`} />;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const TodoRenderer = React.memo(function TodoRenderer({ part }: TodoRendererProps) {
  const todos = useMemo(() => parseTodos(part.state?.input), [part.state?.input]);
  const status = part.state?.status ?? 'pending';
  const error = stringifyValue(part.state?.error);

  // Fallback if no todos could be parsed
  if (todos.length === 0 && !error.trim()) {
    return (
      <div className="msg-todo">
        <div className="msg-todo__header">
          <span className="msg-todo__label">PLAN</span>
          {status === 'running' && (
            <svg width="12" height="12" viewBox="0 0 16 16" className="msg-todo__spinner">
              <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="8" strokeLinecap="round" />
            </svg>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="msg-todo">
      <div className="msg-todo__header">
        <span className="msg-todo__label">PLAN</span>
        {status === 'running' && (
          <svg width="12" height="12" viewBox="0 0 16 16" className="msg-todo__spinner">
            <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="8" strokeLinecap="round" />
          </svg>
        )}
      </div>

      {error.trim() && (
        <div className="msg-todo__error">{error}</div>
      )}

      <ul className="msg-todo__list">
        {todos.map((todo, i) => (
          <li key={i} className={`msg-todo__item msg-todo__item--${todo.status}`}>
            <StatusIcon status={todo.status} />
            <PriorityDot priority={todo.priority} />
            <span className="msg-todo__text">{todo.content}</span>
          </li>
        ))}
      </ul>
    </div>
  );
});
