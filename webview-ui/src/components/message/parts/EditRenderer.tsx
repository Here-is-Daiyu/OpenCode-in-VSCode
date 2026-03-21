/**
 * EditRenderer - Enhanced file editing view for edit/write tool calls.
 *
 * Shows:
 * - Compact card with file path (clickable to open)
 * - For `edit`: mini diff view (old in red, new in green)
 * - For `write`: "Created {filename}" label
 * - Success/error status
 * - Collapsible full output if available
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ToolPart } from '../../../types/opencode';
import type { ToolCallPartProps } from './ToolCallPart';
import { getToolName, toRecord, stringifyValue } from './ToolCallPart';
import { postMessage } from '../../../utils/vscodeApi';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getBaseName(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? path;
}

function shortenPath(path: string, max: number): string {
  return path.length > max ? '...' + path.slice(-(max - 3)) : path;
}

interface EditInfo {
  filePath: string;
  oldString: string;
  newString: string;
  isWrite: boolean;
}

function extractEditInfo(tool: string, input: unknown): EditInfo {
  const record = toRecord(input);
  const isWrite = tool.toLowerCase() === 'write';
  return {
    filePath: typeof record.filePath === 'string' ? record.filePath : '',
    oldString: typeof record.oldString === 'string' ? record.oldString : '',
    newString: typeof record.newString === 'string' ? record.newString : '',
    isWrite,
  };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MiniDiff({ oldStr, newStr }: { oldStr: string; newStr: string }) {
  if (!oldStr && !newStr) return null;

  // Truncate for display in the mini diff
  const maxLines = 8;

  const oldLines = oldStr.split('\n').slice(0, maxLines);
  const newLines = newStr.split('\n').slice(0, maxLines);
  const oldTruncated = oldStr.split('\n').length > maxLines;
  const newTruncated = newStr.split('\n').length > maxLines;

  return (
    <div className="msg-edit__diff">
      {oldStr && (
        <div className="msg-edit__diff-block msg-edit__diff-block--old">
          {oldLines.map((line, i) => (
            <div key={`old-${i}`} className="msg-edit__diff-line msg-edit__diff-line--remove">
              <span className="msg-edit__diff-sign">-</span>
              <span>{line}</span>
            </div>
          ))}
          {oldTruncated && (
            <div className="msg-edit__diff-line msg-edit__diff-line--ellipsis">...</div>
          )}
        </div>
      )}
      {newStr && (
        <div className="msg-edit__diff-block msg-edit__diff-block--new">
          {newLines.map((line, i) => (
            <div key={`new-${i}`} className="msg-edit__diff-line msg-edit__diff-line--add">
              <span className="msg-edit__diff-sign">+</span>
              <span>{line}</span>
            </div>
          ))}
          {newTruncated && (
            <div className="msg-edit__diff-line msg-edit__diff-line--ellipsis">...</div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const EditRenderer = React.memo(function EditRenderer({
  part,
  grouped,
}: ToolCallPartProps) {
  const tool = getToolName(part.tool);
  const status = part.state?.status ?? 'pending';
  const input = part.state?.input;
  const output = stringifyValue(part.state?.output);
  const error = stringifyValue(part.state?.error);

  const { filePath, oldString, newString, isWrite } = useMemo(
    () => extractEditInfo(tool, input),
    [tool, input],
  );

  const hasOutput = output.trim().length > 0;
  const hasError = error.trim().length > 0;
  const hasContent = hasOutput || hasError;

  const [expanded, setExpanded] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [bodyHeight, setBodyHeight] = useState(0);

  useEffect(() => {
    if (bodyRef.current) {
      setBodyHeight(bodyRef.current.scrollHeight);
    }
  }, [error, expanded, output]);

  const toggle = useCallback(() => setExpanded((v) => !v), []);

  const handleFileClick = useCallback(
    (e: React.MouseEvent) => {
      if (filePath) {
        e.stopPropagation();
        postMessage({ type: 'file:open', data: { path: filePath } });
      }
    },
    [filePath],
  );

  const handleFileKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.key === 'Enter' || e.key === ' ') && filePath) {
        e.preventDefault();
        e.stopPropagation();
        postMessage({ type: 'file:open', data: { path: filePath } });
      }
    },
    [filePath],
  );

  const baseName = filePath ? getBaseName(filePath) : '';
  const displayPath = filePath ? shortenPath(filePath, 60) : '';
  const toolLabel = isWrite ? 'WRITE' : 'EDIT';
  const hasDiff = !isWrite && (oldString || newString);

  return (
    <div className={`msg-edit ${grouped ? 'msg-edit--grouped' : ''}`}>
      {/* Header: EDIT/WRITE + file path */}
      <div className="msg-edit__header">
        <span className="msg-edit__label">{toolLabel}</span>
        {status === 'running' && (
          <svg width="12" height="12" viewBox="0 0 16 16" className="msg-edit__spinner">
            <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="8" strokeLinecap="round" />
          </svg>
        )}
        {filePath && (
          <span
            className="msg-edit__path"
            onClick={handleFileClick}
            onKeyDown={handleFileKeyDown}
            title={`Open ${filePath}`}
            role="link"
            tabIndex={0}
          >
            {displayPath}
          </span>
        )}
        {status === 'completed' && !hasError && (
          <span className="msg-edit__status msg-edit__status--success" title="Completed" />
        )}
        {hasError && (
          <span className="msg-edit__status msg-edit__status--error" title="Error" />
        )}
      </div>

      {/* Write: simple "Created filename" */}
      {isWrite && baseName && status === 'completed' && !hasError && (
        <div className="msg-edit__created">Created {baseName}</div>
      )}

      {/* Edit: mini diff view */}
      {hasDiff && <MiniDiff oldStr={oldString} newStr={newString} />}

      {/* Error display (always visible) */}
      {hasError && (
        <div className="msg-edit__error">{error}</div>
      )}

      {/* Collapsible full output */}
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

      {hasContent && (
        <div
          className="msg-tool-compact__collapse"
          style={{
            maxHeight: expanded ? `${Math.min(bodyHeight + 16, 500)}px` : '0px',
          }}
        >
          <div ref={bodyRef} className="msg-edit__output">
            {hasOutput && <pre className="msg-edit__pre">{output}</pre>}
          </div>
        </div>
      )}
    </div>
  );
});
