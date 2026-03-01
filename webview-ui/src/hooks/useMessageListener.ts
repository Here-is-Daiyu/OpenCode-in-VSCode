/**
 * Hook for listening to messages from the VS Code extension host
 */

import { useEffect } from 'react';
import type { ExtensionToWebviewMessage } from '../types/messages';

/**
 * Listen for messages from the extension host
 * Automatically cleans up the listener on unmount
 */
export function useMessageListener(
  handler: (message: ExtensionToWebviewMessage) => void
): void {
  useEffect(() => {
    const listener = (event: MessageEvent<ExtensionToWebviewMessage>) => {
      const message = event.data;
      // Validate that this looks like one of our messages
      if (message && typeof message === 'object' && 'type' in message) {
        handler(message);
      }
    };

    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [handler]);
}
