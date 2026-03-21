/**
 * useMentionSearch - Hook for @-mention file search.
 *
 * Manages mention search state, debounces search requests, and
 * communicates with the extension host via postMessage to search
 * for files/folders.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { postMessage } from '../utils/vscodeApi';

export interface MentionResult {
  /** Display name (filename) */
  name: string;
  /** Full file path */
  path: string;
  /** 'file' or 'folder' */
  type: 'file' | 'folder';
}

/** Debounce delay in milliseconds for search queries. */
const DEBOUNCE_MS = 200;

export function useMentionSearch() {
  const [results, setResults] = useState<MentionResult[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const activeQueryRef = useRef('');

  // Listen for results from extension
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg?.type === 'mention:results') {
        const data = msg.data as { query: string; results: MentionResult[] };
        // Only apply if this matches our active query
        if (data.query === activeQueryRef.current) {
          setResults(data.results);
          setLoading(false);
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const search = useCallback((query: string) => {
    activeQueryRef.current = query;
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // Capture query in closure to ensure the debounced request
    // matches what activeQueryRef held when search() was called.
    const capturedQuery = query;
    debounceRef.current = setTimeout(() => {
      // Only send if this query is still the active one (not superseded)
      if (activeQueryRef.current === capturedQuery) {
        postMessage({
          type: 'mention:search',
          data: { query: capturedQuery },
        });
      }
    }, DEBOUNCE_MS);
  }, []);

  const clear = useCallback(() => {
    activeQueryRef.current = '';
    setResults([]);
    setLoading(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  return { results, loading, search, clear };
}
