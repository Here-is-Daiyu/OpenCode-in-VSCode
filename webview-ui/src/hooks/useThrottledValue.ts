import { useEffect, useRef, useState } from 'react';

export const TEXT_RENDER_THROTTLE_MS = 100;

export function useThrottledValue<T>(
  value: T,
  wait = TEXT_RENDER_THROTTLE_MS,
  enabled = true,
): T {
  const [throttled, setThrottled] = useState(value);
  const lastRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      lastRef.current = Date.now();
      setThrottled(value);
      return;
    }

    const now = Date.now();
    const remaining = wait - (now - lastRef.current);
    if (remaining <= 0) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      lastRef.current = now;
      setThrottled(value);
      return;
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      lastRef.current = Date.now();
      setThrottled(value);
      timeoutRef.current = null;
    }, remaining);
  }, [enabled, value, wait]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return enabled ? throttled : value;
}
