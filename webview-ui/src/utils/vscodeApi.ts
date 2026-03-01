/**
 * VS Code webview API singleton utility
 * Provides typed access to the VS Code postMessage API
 */

import type { WebviewToExtensionMessage } from '../types/messages';

interface VSCodeAPI {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

// Cache the API instance - acquireVsCodeApi can only be called once
let vsCodeApi: VSCodeAPI | undefined;

/**
 * Get the VS Code API instance (singleton)
 */
export function getVsCodeApi(): VSCodeAPI {
  if (!vsCodeApi) {
    // acquireVsCodeApi is injected by the VS Code webview runtime
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vsCodeApi = (window as any).acquireVsCodeApi?.();
    if (!vsCodeApi) {
      // Fallback for development/testing outside VS Code
      console.warn('acquireVsCodeApi not available, using mock');
      vsCodeApi = {
        postMessage: (msg: unknown) => console.log('[mock postMessage]', msg),
        getState: () => null,
        setState: () => {},
      };
    }
  }
  return vsCodeApi;
}

/**
 * Send a typed message to the extension host
 */
export function postMessage(message: WebviewToExtensionMessage): void {
  getVsCodeApi().postMessage(message);
}

/**
 * Get persisted webview state
 */
export function getState<T>(): T | undefined {
  return getVsCodeApi().getState() as T | undefined;
}

/**
 * Persist webview state (survives webview hide/show)
 */
export function setState<T>(state: T): void {
  getVsCodeApi().setState(state);
}
