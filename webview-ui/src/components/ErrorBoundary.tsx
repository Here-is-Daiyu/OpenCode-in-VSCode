/**
 * ErrorBoundary - Catches React render errors to prevent white screen crashes.
 * Displays a user-friendly error message instead of a blank page.
 */

import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Optional fallback to render. If not provided, a default error UI is shown. */
  fallback?: React.ReactNode;
  /** If true, show technical error details (for development). */
  showDetails?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.setState({ errorInfo });
    // Log to console for debugging
    console.error('[ErrorBoundary] Caught render error:', error);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div style={{
          padding: '16px',
          color: 'var(--vscode-errorForeground, #f44)',
          backgroundColor: 'var(--vscode-editor-background, #1e1e1e)',
          fontFamily: 'var(--vscode-font-family, monospace)',
          fontSize: '13px',
          overflow: 'auto',
          height: '100%',
        }}>
          <div style={{ marginBottom: '12px', fontSize: '14px', fontWeight: 'bold' }}>
            ⚠ Something went wrong
          </div>
          <div style={{ marginBottom: '12px', color: 'var(--vscode-descriptionForeground, #999)' }}>
            A rendering error occurred. This is likely a bug.
          </div>
          <button
            onClick={this.handleRetry}
            style={{
              padding: '6px 12px',
              marginBottom: '16px',
              background: 'var(--vscode-button-background, #0e639c)',
              color: 'var(--vscode-button-foreground, #fff)',
              border: 'none',
              borderRadius: '2px',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            Retry
          </button>
          {(this.props.showDetails !== false) && this.state.error && (
            <details style={{ marginTop: '8px' }}>
              <summary style={{ cursor: 'pointer', color: 'var(--vscode-descriptionForeground, #999)' }}>
                Error Details
              </summary>
              <pre style={{
                marginTop: '8px',
                padding: '8px',
                background: 'var(--vscode-textBlockQuote-background, rgba(255,255,255,0.05))',
                borderRadius: '4px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontSize: '12px',
                maxHeight: '300px',
                overflow: 'auto',
              }}>
                {this.state.error.message}
                {this.state.error.stack && `\n\n${this.state.error.stack}`}
                {this.state.errorInfo?.componentStack && `\n\nComponent Stack:${this.state.errorInfo.componentStack}`}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Lightweight error boundary for individual message bubbles.
 * Shows a compact inline error instead of killing the whole chat.
 */
export class MessageErrorBoundary extends React.Component<
  { messageId: string; children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { messageId: string; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): { hasError: true; error: Error } {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error(`[MessageErrorBoundary] Error rendering message ${this.props.messageId}:`, error);
    console.error('[MessageErrorBoundary] Component stack:', errorInfo.componentStack);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '8px 12px',
          margin: '4px 0',
          borderRadius: '6px',
          background: 'var(--vscode-inputValidation-errorBackground, rgba(255,0,0,0.1))',
          border: '1px solid var(--vscode-inputValidation-errorBorder, rgba(255,0,0,0.3))',
          color: 'var(--vscode-errorForeground, #f44)',
          fontSize: '12px',
        }}>
          <span>⚠ Failed to render message</span>
          {this.state.error && (
            <span style={{ marginLeft: '8px', opacity: 0.7 }}>
              ({this.state.error.message})
            </span>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
