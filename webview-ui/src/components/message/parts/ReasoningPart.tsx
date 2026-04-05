/**
 * ReasoningPart - Expandable thinking section with smooth CSS animation,
 * live elapsed-time timer, text cleaning and auto-expand during streaming.
 */

import React, { useCallback, useLayoutEffect, useRef, useState, useEffect } from 'react';
import { MarkdownRenderer } from '../../MarkdownRenderer';
import { useThrottledValue } from '../../../hooks/useThrottledValue';
import { useElapsedTime } from '../../../hooks/useElapsedTime';
import { cleanReasoningText, formatDuration } from '../../../utils/textCleaning';

interface ReasoningPartProps {
  text: string;
  isStreaming?: boolean;
  cacheKey?: string;
}

export const ReasoningPart = React.memo(function ReasoningPart({
  text,
  isStreaming,
  cacheKey,
}: ReasoningPartProps) {
  const [expanded, setExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [measuredHeight, setMeasuredHeight] = useState(0);

  // --- text processing ---
  const raw = typeof text === 'string' ? text.trim() : '';
  const cleaned = cleanReasoningText(raw);
  const throttled = useThrottledValue(cleaned, undefined, !!isStreaming);

  // --- live timer ---
  const streaming = !!isStreaming;
  const elapsed = useElapsedTime(streaming);
  // Freeze the final duration when streaming ends (use state for consistent rendering)
  const [finalDuration, setFinalDuration] = useState<number | null>(null);
  useEffect(() => {
    if (!streaming && elapsed > 0 && finalDuration === null) {
      setFinalDuration(elapsed);
    }
    if (streaming) {
      setFinalDuration(null);
    }
  }, [streaming, elapsed, finalDuration]);

  const displayDuration = streaming ? elapsed : (finalDuration ?? elapsed);

  // --- auto-expand during streaming, auto-collapse when done ---
  const hasAutoExpandedRef = useRef(false);
  useEffect(() => {
    if (streaming && throttled && !hasAutoExpandedRef.current) {
      setExpanded(true);
      hasAutoExpandedRef.current = true;
    }
  }, [streaming, throttled]);

  useEffect(() => {
    if (!streaming && hasAutoExpandedRef.current) {
      // Collapse after a brief delay so the user can see final content
      const timer = setTimeout(() => {
        setExpanded(false);
        hasAutoExpandedRef.current = false;
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [streaming]);

  // --- height measurement ---
  useLayoutEffect(() => {
    if (contentRef.current) {
      setMeasuredHeight(contentRef.current.scrollHeight);
    }
  }, [expanded, throttled]);

  const toggle = useCallback(() => setExpanded((v) => !v), []);

  if (!throttled && !streaming) return null;

  // --- header title ---
  const durationStr = displayDuration > 0 ? formatDuration(displayDuration) : '';
  const titleText = streaming
    ? `Thinking${durationStr ? ` (${durationStr})` : ''}`
    : `Thought${durationStr ? ` for ${durationStr}` : ''}`;

  return (
    <div className={`msg-reasoning ${expanded ? 'msg-reasoning--expanded' : ''}`}>
      <button
        className="msg-reasoning__header"
        onClick={toggle}
        aria-expanded={expanded}
        type="button"
      >
        <span className="msg-reasoning__icon">
          {streaming ? (
            <svg
              className="msg-reasoning__spinner"
              width="14"
              height="14"
              viewBox="0 0 16 16"
            >
              <circle
                cx="8"
                cy="8"
                r="6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeDasharray="28"
                strokeDashoffset="8"
                strokeLinecap="round"
                opacity="0.7"
              />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" opacity="0.7">
              <path d="M8 1C4.13 1 1 3.58 1 6.75c0 1.83 1.12 3.46 2.86 4.48l-.7 2.52L6.04 12.2c.63.18 1.29.3 1.96.3 3.87 0 7-2.58 7-5.75S11.87 1 8 1z" />
            </svg>
          )}
        </span>
        <span className="msg-reasoning__title">
          {titleText}
        </span>
        {streaming && (
          <span className="msg-reasoning__shimmer">
            <span className="text-shimmer">...</span>
          </span>
        )}
        <span className={`msg-reasoning__chevron ${expanded ? 'msg-reasoning__chevron--open' : ''}`}>
          <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6 4l4 4-4 4" />
          </svg>
        </span>
      </button>

      <div
        className="msg-reasoning__collapse"
        style={{
          maxHeight: expanded ? `${Math.min(measuredHeight + 32, 400)}px` : '0px',
        }}
      >
        <div ref={contentRef} className="msg-reasoning__content">
          {throttled ? (
            <MarkdownRenderer
              content={throttled}
              className="msg-reasoning__markdown"
              cacheKey={cacheKey}
            />
          ) : streaming ? (
            <span className="msg-reasoning__placeholder text-shimmer">Thinking...</span>
          ) : null}
        </div>
      </div>
    </div>
  );
});
