/**
 * PatchPartView - Shows a file patch/diff with collapsible content.
 *
 * Layout:
 *   PATCH icon + path (clickable)
 *   [Show diff / Hide diff] toggle
 *   Collapsible <pre> block with +/- line coloring
 */

import React, { useCallback, useRef, useState, useEffect, useMemo } from 'react';
import type { PatchPart } from '../../../types/opencode';
import { postMessage } from '../../../utils/vscodeApi';
import { hasDisplayText, toDisplayText } from '../../../utils/renderText';

// ---------------------------------------------------------------------------
// Icon
// ---------------------------------------------------------------------------

function DiffIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M2 3.5l.5-.5h5l.5.5v9l-.5.5h-5l-.5-.5v-9zM3 4v8h4V4H3zm6.5-.5l.5-.5h4l.5.5v9l-.5.5h-4l-.5-.5v-9zM10 4v8h3V4h-3zM4 7h2v1H4V7zm6 0h2v1h-2V7zM4 5h2v1H4V5zm6 5h2v1h-2v-1z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getBaseName(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? path;
}

interface DiffLine {
  type: 'add' | 'remove' | 'context' | 'header';
  text: string;
}

function parseDiffLines(content: string): DiffLine[] {
  return content.split('\n').map((line) => {
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@')) {
      return { type: 'header', text: line };
    }
    if (line.startsWith('+')) {
      return { type: 'add', text: line };
    }
    if (line.startsWith('-')) {
      return { type: 'remove', text: line };
    }
    return { type: 'context', text: line };
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface PatchPartViewProps {
  part: PatchPart;
}

export const PatchPartView = React.memo(function PatchPartView({
  part,
}: PatchPartViewProps) {
  const [expanded, setExpanded] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [bodyHeight, setBodyHeight] = useState(0);
  const content = toDisplayText(part.content, 'patch.content');

  useEffect(() => {
    if (bodyRef.current) {
      setBodyHeight(bodyRef.current.scrollHeight);
    }
  }, [content, expanded]);

  const toggle = useCallback(() => setExpanded((v) => !v), []);

  const handleFileClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      postMessage({ type: 'file:open', data: { path: part.path } });
    },
    [part.path],
  );

  const handleFileKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        postMessage({ type: 'file:open', data: { path: part.path } });
      }
    },
    [part.path],
  );

  const diffLines = useMemo(() => parseDiffLines(content), [content]);
  const baseName = getBaseName(part.path);
  const hasContent = hasDisplayText(part.content, 'patch.content.visible');

  return (
    <div className="msg-patch">
      {/* Header: icon + path */}
      <div className="msg-patch__title">
        <span className="msg-patch__icon">
          <DiffIcon />
        </span>
        <span className="msg-patch__name">PATCH</span>
        <span
          className="msg-patch__path"
          onClick={handleFileClick}
          onKeyDown={handleFileKeyDown}
          title={`Open ${part.path}`}
          role="link"
          tabIndex={0}
        >
          {baseName}
        </span>
      </div>

      {/* Toggle */}
      {hasContent && (
        <button className="msg-tool-compact__toggle" onClick={toggle} type="button">
          <span className="msg-tool-compact__toggle-icon">
            <svg
              width="11"
              height="11"
              viewBox="0 0 16 16"
              fill="currentColor"
              style={{ opacity: 0.85 }}
            >
              {expanded ? <path d="M4 6l4 4 4-4" /> : <path d="M6 4l4 4-4 4" />}
            </svg>
          </span>
          {expanded ? 'Hide diff' : 'Show diff'}
        </button>
      )}

      {/* Collapsible diff body */}
      {hasContent && (
        <div
          className="msg-tool-compact__collapse"
          style={{
            maxHeight: expanded ? `${Math.min(bodyHeight + 16, 500)}px` : '0px',
          }}
        >
          <div ref={bodyRef} className="msg-patch__diff">
            <pre className="msg-patch__pre">
              {diffLines.map((line, i) => (
                <span key={i} className={`msg-patch__line msg-patch__line--${line.type}`}>
                  {line.text}
                  {'\n'}
                </span>
              ))}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
});
