/**
 * ChatApp - Main chat panel component
 *
 * Displays messages, handles user input, and communicates with the extension host.
 * Uses a simple scrollable container instead of virtualization for reliability
 * in VSCode's sidebar/auxiliary panel environment (matching Desktop's approach).
 */

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { useModelStore } from '../../stores/modelStore';
import { useMessageListener } from '../../hooks/useMessageListener';
import { postMessage } from '../../utils/vscodeApi';
import { MessageBubble } from '../../components/message';
import { ChatInput } from '../../components/ChatInput';
import { PermissionCard } from '../../components/PermissionCard';
import { QuestionCard } from '../../components/QuestionCard';
import { MessageErrorBoundary } from '../../components/ErrorBoundary';
import type { ExtensionToWebviewMessage } from '../../types/messages';

/** Distance from bottom (px) within which we consider the user "at bottom" */
const AT_BOTTOM_THRESHOLD = 150;

type SessionScopedWebviewMessage = Extract<
  ExtensionToWebviewMessage,
  | { type: 'session:status' }
  | { type: 'message:updated' }
  | { type: 'message:partUpdated' }
  | { type: 'message:partDelta' }
  | { type: 'message:removed' }
>;

function getBufferedPartKey(sessionID: string, messageID: string, partID: string): string {
  return `${sessionID}:${messageID}:${partID}`;
}

function coalesceBufferedSessionMessages(
  messages: SessionScopedWebviewMessage[]
): SessionScopedWebviewMessage[] {
  const queued: SessionScopedWebviewMessage[] = [];
  const updatedParts = new Map<string, number>();
  const staleDeltas = new Set<string>();

  for (const message of messages) {
    if (message.type === 'message:partUpdated') {
      const key = getBufferedPartKey(
        message.data.sessionID,
        message.data.messageID,
        message.data.part.id,
      );
      const index = updatedParts.get(key);

      if (index !== undefined) {
        queued[index] = message;
        staleDeltas.add(key);
        continue;
      }

      updatedParts.set(key, queued.length);
    }

    queued.push(message);
  }

  if (staleDeltas.size === 0) {
    return queued;
  }

  return queued.filter((message) =>
    message.type !== 'message:partDelta'
      || !staleDeltas.has(
        getBufferedPartKey(message.data.sessionID, message.data.messageID, message.data.partID)
      )
  );
}

function getSessionScopedMessageSessionID(message: SessionScopedWebviewMessage): string {
  switch (message.type) {
    case 'message:updated':
      return message.data.info.sessionID;
    case 'session:status':
    case 'message:partUpdated':
    case 'message:partDelta':
    case 'message:removed':
      return message.data.sessionID;
  }
}

export function ChatApp() {
  const [error, setError] = useState<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);

  // Refs for scroll management
  const messagesRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(0);
  const pendingHistoryPrependScrollRef = useRef<{
    previousScrollHeight: number;
    previousScrollTop: number;
  } | null>(null);
  const skipNextAutoScrollRef = useRef(false);
  const bufferedSessionMessagesRef = useRef<Map<string, SessionScopedWebviewMessage[]>>(new Map());

  // Store state
  const connected = useChatStore((s) => s.connected);
  const currentSession = useChatStore((s) => s.currentSession);
  const messages = useChatStore((s) => s.messages);
  const sessionStatus = useChatStore((s) => s.sessionStatus);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const pendingPermission = useChatStore((s) => s.pendingPermission);
  const pendingQuestion = useChatStore((s) => s.pendingQuestion);

  // Store actions
  const setConnected = useChatStore((s) => s.setConnected);
  const setSession = useChatStore((s) => s.setSession);
  const updateSession = useChatStore((s) => s.updateSession);
  const clearSession = useChatStore((s) => s.clearSession);
  const setSessionStatus = useChatStore((s) => s.setSessionStatus);
  const prependMessages = useChatStore((s) => s.prependMessages);
  const updateMessage = useChatStore((s) => s.updateMessage);
  const updatePart = useChatStore((s) => s.updatePart);
  const appendPartDelta = useChatStore((s) => s.appendPartDelta);
  const removeMessage = useChatStore((s) => s.removeMessage);
  const setPermission = useChatStore((s) => s.setPermission);
  const setQuestion = useChatStore((s) => s.setQuestion);
  const rollbackOptimisticMessage = useChatStore((s) => s.rollbackOptimisticMessage);
  const confirmOptimisticMessage = useChatStore((s) => s.confirmOptimisticMessage);

  const applySessionScopedMessage = useCallback(
    (message: SessionScopedWebviewMessage) => {
      switch (message.type) {
        case 'session:status':
          setSessionStatus(message.data.status.status);
          break;

        case 'message:updated':
          updateMessage(message.data);
          break;

        case 'message:partUpdated':
          updatePart(message.data.messageID, message.data.part);
          break;

        case 'message:partDelta':
          appendPartDelta(
            message.data.messageID,
            message.data.partID,
            message.data.delta,
            message.data.field,
            message.data.sessionID
          );
          break;

        case 'message:removed':
          removeMessage(message.data.messageID);
          break;
      }
    },
    [setSessionStatus, updateMessage, updatePart, appendPartDelta, removeMessage]
  );

  const bufferSessionMessage = useCallback((message: SessionScopedWebviewMessage) => {
    const sessionID = getSessionScopedMessageSessionID(message);
    const bufferedMessages = bufferedSessionMessagesRef.current.get(sessionID) ?? [];

    bufferedMessages.push(message);
    bufferedSessionMessagesRef.current.set(sessionID, bufferedMessages);
  }, []);

  const flushBufferedSessionMessages = useCallback(
    (sessionID: string) => {
      const bufferedMessages = bufferedSessionMessagesRef.current.get(sessionID);

      for (const bufferedSessionID of Array.from(bufferedSessionMessagesRef.current.keys())) {
        if (bufferedSessionID !== sessionID) {
          bufferedSessionMessagesRef.current.delete(bufferedSessionID);
        }
      }

      if (!bufferedMessages?.length) {
        return;
      }

      bufferedSessionMessagesRef.current.delete(sessionID);

      if (useChatStore.getState().currentSession?.id !== sessionID) {
        return;
      }

      for (const bufferedMessage of coalesceBufferedSessionMessages(bufferedMessages)) {
        applySessionScopedMessage(bufferedMessage);
      }
    },
    [applySessionScopedMessage]
  );

  const applyOrBufferSessionMessage = useCallback(
    (message: SessionScopedWebviewMessage) => {
      const sessionID = getSessionScopedMessageSessionID(message);
      const activeSessionID = useChatStore.getState().currentSession?.id;

      if (activeSessionID !== sessionID) {
        bufferSessionMessage(message);
        return;
      }

      applySessionScopedMessage(message);
    },
    [applySessionScopedMessage, bufferSessionMessage]
  );

  const prependSessionHistory = useCallback(
    (sessionID: string, olderMessages: typeof messages) => {
      if (useChatStore.getState().currentSession?.id !== sessionID) {
        return;
      }

      const scrollContainer = messagesRef.current;
      if (scrollContainer) {
        pendingHistoryPrependScrollRef.current = {
          previousScrollHeight: scrollContainer.scrollHeight,
          previousScrollTop: scrollContainer.scrollTop,
        };
      }

      const prependedCount = prependMessages(olderMessages);
      if (prependedCount === 0 || !scrollContainer) {
        pendingHistoryPrependScrollRef.current = null;
      }
    },
    [prependMessages]
  );

  // ── Scroll helpers ────────────────────────────────────────────────────

  /** Check whether the scroll container is near the bottom */
  const checkAtBottom = useCallback(() => {
    const el = messagesRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < AT_BOTTOM_THRESHOLD;
  }, []);

  /** Scroll to the bottom of the messages container */
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({ behavior, block: 'end' });
  }, []);

  // Track scroll position to update atBottom state
  const handleScroll = useCallback(() => {
    setAtBottom(checkAtBottom());
  }, [checkAtBottom]);

  useLayoutEffect(() => {
    const pendingScrollState = pendingHistoryPrependScrollRef.current;
    if (!pendingScrollState) {
      return;
    }

    pendingHistoryPrependScrollRef.current = null;

    const scrollContainer = messagesRef.current;
    if (!scrollContainer) {
      return;
    }

    const scrollHeightDelta = scrollContainer.scrollHeight - pendingScrollState.previousScrollHeight;
    scrollContainer.scrollTop = pendingScrollState.previousScrollTop + scrollHeightDelta;
    prevMessageCountRef.current = messages.length;
    skipNextAutoScrollRef.current = true;
  }, [messages]);

  // Auto-scroll on new messages or streaming content updates
  useLayoutEffect(() => {
    if (skipNextAutoScrollRef.current) {
      skipNextAutoScrollRef.current = false;
      return;
    }

    const newCount = messages.length;
    const isNewMessage = newCount > prevMessageCountRef.current;
    prevMessageCountRef.current = newCount;

    if (atBottom || isNewMessage) {
      // Use instant scroll for initial load / session switch, smooth for streaming
      scrollToBottom(isNewMessage ? 'instant' : 'smooth');
    }
  }, [messages, atBottom, scrollToBottom]);

  // Also auto-scroll when streaming content updates (part changes)
  useEffect(() => {
    if (isStreaming && atBottom) {
      // Use requestAnimationFrame for smooth follow during streaming
      const raf = requestAnimationFrame(() => {
        scrollToBottom('instant');
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [isStreaming, atBottom, messages, scrollToBottom]);

  // Scroll to bottom when permission or question cards appear
  useEffect(() => {
    if ((pendingPermission || pendingQuestion) && atBottom) {
      scrollToBottom('smooth');
    }
  }, [pendingPermission, pendingQuestion, atBottom, scrollToBottom]);

  // ── Extension message handler ─────────────────────────────────────────

  const handleExtensionMessage = useCallback(
    (message: ExtensionToWebviewMessage) => {
      try {
        const getActiveSessionID = () => useChatStore.getState().currentSession?.id;

        switch (message.type) {
          case 'server:status':
            setConnected(message.data.connected, message.data.version);
            break;

          case 'session:loaded':
            pendingHistoryPrependScrollRef.current = null;
            skipNextAutoScrollRef.current = false;
            setAtBottom(true);
            prevMessageCountRef.current = 0; // reset so auto-scroll triggers
            setSession(message.data.session, message.data.messages);
            flushBufferedSessionMessages(message.data.session.id);
            break;

          case 'session:historyPrepended':
            prependSessionHistory(message.data.sessionID, message.data.messages);
            break;

          case 'session:created':
            pendingHistoryPrependScrollRef.current = null;
            skipNextAutoScrollRef.current = false;
            setAtBottom(true);
            prevMessageCountRef.current = 0;
            setSession(message.data, []);
            flushBufferedSessionMessages(message.data.id);
            break;

          case 'session:updated':
            updateSession(message.data);
            break;

          case 'session:deleted':
            bufferedSessionMessagesRef.current.delete(message.data.id);
            if (getActiveSessionID() === message.data.id) {
              pendingHistoryPrependScrollRef.current = null;
              skipNextAutoScrollRef.current = false;
              clearSession();
            }
            break;

          case 'session:cleared':
            pendingHistoryPrependScrollRef.current = null;
            skipNextAutoScrollRef.current = false;
            setAtBottom(true);
            bufferedSessionMessagesRef.current.clear();
            clearSession();
            break;

          case 'session:status':
            applyOrBufferSessionMessage(message);
            break;

          case 'message:updated':
            applyOrBufferSessionMessage(message);
            break;

          case 'message:partUpdated':
            applyOrBufferSessionMessage(message);
            break;

          case 'message:partDelta':
            applyOrBufferSessionMessage(message);
            break;

          case 'message:removed':
            applyOrBufferSessionMessage(message);
            break;

          case 'permission:asked':
            setPermission(message.data);
            break;

          case 'question:asked':
            setQuestion(message.data);
            break;

          case 'error':
            setError(message.data.message);
            break;

          case 'chat:sendResult':
            if (message.data.success) {
              confirmOptimisticMessage();
            } else {
              rollbackOptimisticMessage();
              setError(message.data.error ?? 'Failed to send message');
            }
            break;

          case 'theme:changed':
          case 'todos:updated':
            break;

          case 'agents:updated':
            useChatStore.getState().setAgents(message.data);
            break;

          case 'config:updated':
            useModelStore.getState().setConfig(message.data);
            break;

          case 'providers:updated':
            useModelStore.getState().setProviders(message.data.providers, message.data.connected);
            break;

          case 'model-prefs:loaded':
            useModelStore.getState().setModelPrefs(message.data);
            break;
        }
      } catch (err) {
        console.error('[ChatApp] Error handling extension message:', message.type, err);
      }
    },
    [
      setConnected,
      setSession,
      updateSession,
      clearSession,
      flushBufferedSessionMessages,
      applyOrBufferSessionMessage,
      prependSessionHistory,
      setPermission,
      setQuestion,
      rollbackOptimisticMessage,
      confirmOptimisticMessage,
    ]
  );

  useMessageListener(handleExtensionMessage);

  // Send ready signal to extension on mount
  useEffect(() => {
    postMessage({ type: 'ready' });
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────

  const handleNewSession = useCallback(() => {
    postMessage({ type: 'session:create' });
  }, []);

  const dismissError = useCallback(() => setError(null), []);

  // ── Status display helpers ────────────────────────────────────────────

  const getStatusDotClass = () => {
    if (!connected) return 'chat-header__status-dot--disconnected';
    if (sessionStatus === 'active') return 'chat-header__status-dot--active';
    if (sessionStatus === 'retry') return 'chat-header__status-dot--retry';
    return 'chat-header__status-dot--connected';
  };

  const getStatusText = () => {
    if (!connected) return 'Disconnected';
    if (sessionStatus === 'active') return 'Generating...';
    if (sessionStatus === 'compacting') return 'Compacting...';
    if (sessionStatus === 'retry') return 'Retrying...';
    if (sessionStatus === 'error') return 'Error';
    return 'Connected';
  };

  // ── Connecting state ──────────────────────────────────────────────────

  if (!connected) {
    return (
      <div className="chat-app">
        <div className="chat-connecting">
          <div className="chat-connecting__spinner" />
          <div className="chat-connecting__text">Connecting to OpenCode server...</div>
        </div>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────

  const hasMessages = messages.length > 0;
  const showScrollButton = hasMessages && !atBottom;

  return (
    <div className="chat-app">
      {/* Header */}
      <div className="chat-header">
        <div className="chat-header__left">
          <span className="chat-header__status">
            <span className={`chat-header__status-dot ${getStatusDotClass()}`} />
          </span>
          <span className="chat-header__title">
            {currentSession?.title || 'OpenCode'}
          </span>
        </div>
        <div className="chat-header__actions">
          <span className="chat-header__status-text">{getStatusText()}</span>
          <button
            className="chat-header__new-btn"
            onClick={handleNewSession}
            title="New Session"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M14 7v1H8v6H7V8H1V7h6V1h1v6h6z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="chat-error">
          <span>&#x26A0; {error}</span>
          <button className="chat-error__dismiss" onClick={dismissError}>
            &times;
          </button>
        </div>
      )}

      {/* Messages area */}
      {!hasMessages ? (
        <div className="chat-messages chat-messages--empty">
          <div className="chat-messages__inner chat-messages__inner--empty">
            <div className="chat-welcome">
              <div className="chat-welcome__icon">
                {/* Stylized bot icon */}
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                  <rect x="8" y="16" width="32" height="24" rx="6" fill="var(--vscode-badge-background, rgba(128,128,128,0.15))" />
                  <rect x="12" y="20" width="10" height="8" rx="3" fill="var(--vscode-focusBorder, #007acc)" opacity="0.7" />
                  <rect x="26" y="20" width="10" height="8" rx="3" fill="var(--vscode-focusBorder, #007acc)" opacity="0.7" />
                  <rect x="18" y="32" width="12" height="3" rx="1.5" fill="var(--vscode-descriptionForeground, rgba(128,128,128,0.5))" />
                  <rect x="22" y="8" width="4" height="10" rx="2" fill="var(--vscode-badge-background, rgba(128,128,128,0.15))" />
                  <circle cx="24" cy="7" r="3" fill="var(--vscode-focusBorder, #007acc)" opacity="0.5" />
                </svg>
              </div>
              <div className="chat-welcome__title">Start a conversation</div>
              <div className="chat-welcome__subtitle">
                Ask questions, write code, or get help with your project.
              </div>
              <div className="chat-welcome__hints">
                <span className="chat-welcome__hint">
                  <kbd>@</kbd> reference files
                </span>
                <span className="chat-welcome__hint-sep">·</span>
                <span className="chat-welcome__hint">
                  <kbd>/</kbd> commands
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div
          className="chat-messages"
          ref={messagesRef}
          onScroll={handleScroll}
          key={currentSession?.id ?? 'no-session'}
        >
          <div className="chat-messages__inner">
            {messages.map((msg) => (
              <MessageErrorBoundary key={msg.info.id} messageId={msg.info.id} message={msg}>
                <MessageBubble message={msg} />
              </MessageErrorBoundary>
            ))}

            {/* Permission request card */}
            {pendingPermission && (
              <PermissionCard permission={pendingPermission} />
            )}

            {/* Question card */}
            {pendingQuestion && (
              <QuestionCard question={pendingQuestion} />
            )}

            {/* Streaming indicator */}
            {isStreaming && (
              <div className="chat-streaming-indicator">
                <div className="chat-streaming-indicator__dots">
                  <span className="chat-streaming-indicator__dot" />
                  <span className="chat-streaming-indicator__dot" />
                  <span className="chat-streaming-indicator__dot" />
                </div>
                <span>Generating...</span>
              </div>
            )}

            {/* Scroll anchor */}
            <div ref={bottomRef} className="chat-scroll-anchor" />
          </div>
        </div>
      )}

      {/* Scroll-to-bottom button */}
      {showScrollButton && (
        <button
          className="chat-scroll-bottom"
          onClick={() => scrollToBottom('smooth')}
          title="Scroll to bottom"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 12.14l-4.5-4.5 1.06-1.06L8 10.02l3.44-3.44 1.06 1.06L8 12.14z" />
          </svg>
        </button>
      )}

      {/* Input */}
      <ChatInput />
    </div>
  );
}
