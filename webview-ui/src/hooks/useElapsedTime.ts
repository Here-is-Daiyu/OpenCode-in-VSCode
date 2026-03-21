/**
 * useElapsedTime - A hook that returns elapsed milliseconds since mount,
 * updating every `interval` ms while `running` is true.
 *
 * Used by ReasoningPart to show a live "Thinking (2.3s)..." timer.
 */

import { useEffect, useRef, useState } from 'react';

/**
 * @param running - Whether the timer should be ticking.
 * @param interval - Update interval in ms (default 100).
 * @returns Elapsed time in milliseconds.
 */
export function useElapsedTime(running: boolean, interval = 100): number {
  const startRef = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (running) {
      // Capture start time on first run (or after a reset)
      if (startRef.current === null) {
        startRef.current = Date.now();
      }

      const tick = () => {
        if (startRef.current !== null) {
          setElapsed(Date.now() - startRef.current);
        }
      };

      // Fire immediately then at interval
      tick();
      const id = setInterval(tick, interval);
      return () => clearInterval(id);
    }
    // Reset on stop so next start begins fresh
    startRef.current = null;
  }, [running, interval]);

  return elapsed;
}
