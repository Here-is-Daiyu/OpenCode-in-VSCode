/**
 * OutlineIndex — fisheye outline navigation for the chat messages area.
 *
 * Shows user message entries as small ticks on the right side of the chat.
 * On hover, a cosine-interpolated fisheye effect expands nearby ticks and
 * reveals truncated labels. Clicking a tick scrolls to that message.
 *
 * All animation is driven by RAF + direct DOM manipulation (no React state)
 * for smooth 60 fps performance.
 */

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import type { MessageWithParts, TextPart } from '../types/opencode';

// ── Fisheye configuration (desktop only) ────────────────────────────────

const INFLUENCE_RADIUS = 55;
const TICK_WIDTH_MIN = 8;
const TICK_WIDTH_MAX = 22;
const TICK_HEIGHT = 2.5;
const MARGIN_MIN = 4;
const MARGIN_MAX = 14;
const LABEL_THRESHOLD = 0.65;
const LERP_SPEED = 0.18;
const EPSILON = 0.005;
const LABEL_MAX_CHARS = 80;
const MIN_ENTRIES = 2;
const HIT_AREA_PADDING = 60;

// ── Types ───────────────────────────────────────────────────────────────

interface OutlineEntry {
  id: string;
  label: string;
}

interface OutlineIndexProps {
  messages: MessageWithParts[];
  onScrollToMessageId: (messageId: string) => void;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function extractOutlineEntries(messages: MessageWithParts[]): OutlineEntry[] {
  const entries: OutlineEntry[] = [];
  for (const msg of messages) {
    if (msg.info.role !== 'user') continue;
    const textParts = msg.parts.filter(
      (p): p is TextPart => p.type === 'text'
    );
    const text = textParts.map((p) => p.text).join(' ').trim();
    if (!text) continue;
    const label =
      text.length > LABEL_MAX_CHARS
        ? text.slice(0, LABEL_MAX_CHARS) + '\u2026'
        : text;
    entries.push({ id: msg.info.id, label });
  }
  return entries;
}

/** Cosine interpolation: 0 at edge, 1 at center of influence radius. */
function cosineStrength(distance: number, radius: number): number {
  if (distance >= radius) return 0;
  return 0.5 * (1 + Math.cos((Math.PI * distance) / radius));
}

/** Lerp with dead-zone epsilon. Returns final value if close enough. */
function lerp(current: number, target: number, speed: number): number {
  const delta = target - current;
  if (Math.abs(delta) < EPSILON) return target;
  return current + delta * speed;
}

// ── Component ───────────────────────────────────────────────────────────

export const OutlineIndex = React.memo(function OutlineIndex({
  messages,
  onScrollToMessageId,
}: OutlineIndexProps) {
  const entries = useMemo(() => extractOutlineEntries(messages), [messages]);

  // Refs for DOM manipulation
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const tickRefs = useRef<(HTMLDivElement | null)[]>([]);
  const labelRefs = useRef<(HTMLSpanElement | null)[]>([]);

  // Animation state refs (not React state — perf)
  const cursorYRef = useRef<number | null>(null);
  const rafIdRef = useRef<number>(0);
  const isHoveredRef = useRef(false);

  // Current animated values for each entry
  const strengthsRef = useRef<number[]>([]);

  // Ensure strengths array matches entry count
  useEffect(() => {
    strengthsRef.current = entries.map(() => 0);
  }, [entries]);

  // ── Animation loop ──────────────────────────────────────────────────

  const animate = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const items = itemRefs.current;
    const ticks = tickRefs.current;
    const labels = labelRefs.current;
    const strengths = strengthsRef.current;
    const cursorY = cursorYRef.current;
    const entryCount = strengths.length;

    let needsFrame = false;

    for (let i = 0; i < entryCount; i++) {
      const item = items[i];
      const tick = ticks[i];
      const label = labels[i];
      if (!item || !tick || !label) continue;

      // Calculate target strength based on cursor proximity
      let targetStrength = 0;
      if (cursorY !== null) {
        const rect = item.getBoundingClientRect();
        const itemCenterY = rect.top + rect.height / 2;
        const distance = Math.abs(cursorY - itemCenterY);
        targetStrength = cosineStrength(distance, INFLUENCE_RADIUS);
      }

      // Lerp toward target
      const prevStrength = strengths[i];
      const newStrength = lerp(prevStrength, targetStrength, LERP_SPEED);
      strengths[i] = newStrength;

      // Apply styles directly to DOM
      const tickWidth =
        TICK_WIDTH_MIN + (TICK_WIDTH_MAX - TICK_WIDTH_MIN) * newStrength;
      const margin =
        MARGIN_MIN + (MARGIN_MAX - MARGIN_MIN) * newStrength;

      tick.style.width = `${tickWidth}px`;
      tick.style.height = `${TICK_HEIGHT}px`;
      item.style.margin = `${margin}px 0`;

      // Label visibility
      if (newStrength >= LABEL_THRESHOLD) {
        const labelOpacity = Math.min(
          1,
          (newStrength - LABEL_THRESHOLD) / (1 - LABEL_THRESHOLD)
        );
        const labelTranslateX = 10 * (1 - labelOpacity);
        label.style.opacity = String(labelOpacity);
        label.style.transform = `translateX(${labelTranslateX}px)`;
        label.style.visibility = 'visible';
      } else {
        label.style.opacity = '0';
        label.style.transform = 'translateX(10px)';
        label.style.visibility = 'hidden';
      }

      // Tick highlight color when strongly focused
      if (newStrength > 0.5) {
        tick.style.backgroundColor = 'var(--text-weak)';
      } else if (newStrength > 0.1) {
        tick.style.backgroundColor = 'var(--border-weak-base)';
      } else {
        tick.style.backgroundColor = '';
      }

      // Check if animation needs to continue
      if (Math.abs(newStrength - targetStrength) > EPSILON) {
        needsFrame = true;
      }
    }

    if (needsFrame || isHoveredRef.current) {
      rafIdRef.current = requestAnimationFrame(animate);
    }
  }, []);

  // ── Event handlers ──────────────────────────────────────────────────

  const handleMouseEnter = useCallback(() => {
    isHoveredRef.current = true;
    // Expand hit area via padding
    if (containerRef.current) {
      containerRef.current.style.paddingLeft = `${HIT_AREA_PADDING}px`;
    }
    rafIdRef.current = requestAnimationFrame(animate);
  }, [animate]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      cursorYRef.current = e.clientY;
    },
    []
  );

  const handleMouseLeave = useCallback(() => {
    isHoveredRef.current = false;
    cursorYRef.current = null;
    // Shrink hit area
    if (containerRef.current) {
      containerRef.current.style.paddingLeft = '';
    }
    // Keep animating to decay strengths back to 0
    rafIdRef.current = requestAnimationFrame(animate);
  }, [animate]);

  const handleItemClick = useCallback(
    (messageId: string) => {
      // Dismiss fisheye immediately
      isHoveredRef.current = false;
      cursorYRef.current = null;
      if (containerRef.current) {
        containerRef.current.style.paddingLeft = '';
      }
      // Reset all strengths to 0 immediately
      const strengths = strengthsRef.current;
      const ticks = tickRefs.current;
      const labels = labelRefs.current;
      const items = itemRefs.current;
      for (let i = 0; i < strengths.length; i++) {
        strengths[i] = 0;
        const tick = ticks[i];
        const label = labels[i];
        const item = items[i];
        if (tick) {
          tick.style.width = `${TICK_WIDTH_MIN}px`;
          tick.style.backgroundColor = '';
        }
        if (label) {
          label.style.opacity = '0';
          label.style.visibility = 'hidden';
          label.style.transform = 'translateX(10px)';
        }
        if (item) {
          item.style.margin = `${MARGIN_MIN}px 0`;
        }
      }
      cancelAnimationFrame(rafIdRef.current);
      onScrollToMessageId(messageId);
    },
    [onScrollToMessageId]
  );

  const handleItemKeyDown = useCallback(
    (e: React.KeyboardEvent, messageId: string) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleItemClick(messageId);
      }
    },
    [handleItemClick]
  );

  // Cleanup RAF on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafIdRef.current);
    };
  }, []);

  // ── Render ──────────────────────────────────────────────────────────

  if (entries.length < MIN_ENTRIES) return null;

  return (
    <div
      ref={containerRef}
      className="outline-index"
      role="navigation"
      aria-label="Message outline"
      onMouseEnter={handleMouseEnter}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {entries.map((entry, i) => (
        <div
          key={entry.id}
          ref={(el) => { itemRefs.current[i] = el; }}
          className="outline-index__item"
          role="button"
          tabIndex={0}
          aria-label={entry.label}
          onClick={() => handleItemClick(entry.id)}
          onKeyDown={(e) => handleItemKeyDown(e, entry.id)}
        >
          <span
            ref={(el) => { labelRefs.current[i] = el; }}
            className="outline-index__label"
          >
            {entry.label}
          </span>
          <div
            ref={(el) => { tickRefs.current[i] = el; }}
            className="outline-index__tick"
          />
        </div>
      ))}
    </div>
  );
});
