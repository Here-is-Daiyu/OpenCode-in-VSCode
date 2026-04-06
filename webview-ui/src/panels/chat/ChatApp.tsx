/**
 * ChatApp - Main chat panel component
 *
 * Displays messages, handles user input, and communicates with the extension host.
 * Uses a threshold-based approach: normal rendering for small conversations,
 * @tanstack/react-virtual for large ones (>= 40 messages) to avoid performance
 * degradation in VSCode's sidebar/auxiliary panel environment.
 */

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { useModelStore } from '../../stores/modelStore';
import { useAgentStore } from '../../stores/agentStore';
import { useMessageListener } from '../../hooks/useMessageListener';
import { useQueuedMessageAutoSend } from '../../hooks/useQueuedMessageAutoSend';
import { postMessage } from '../../utils/vscodeApi';
import { MessageBubble } from '../../components/message';
import { ChatInput } from '../../components/ChatInput';
import { PermissionCard } from '../../components/PermissionCard';
import { QuestionCard } from '../../components/QuestionCard';
import { MessageErrorBoundary } from '../../components/ErrorBoundary';
import { VirtualizedMessageList } from '../../components/VirtualizedMessageList';
import { OutlineIndex } from '../../components/OutlineIndex';
import { LastApiResponsePanel } from '../../components/LastApiResponsePanel';
import { NotificationToastContainer } from '../../components/NotificationToast';
import { CurrentModelBadge } from '../../components/CurrentModelBadge';
import { useNotificationStore } from '../../stores/notificationStore';
import { useMessageQueueStore } from '../../stores/messageQueueStore';
import type { ExtensionToWebviewMessage } from '../../types/messages';
import { getConfiguredAgent } from '../../utils/opencodeConfig';

/** Distance from bottom (px) within which we consider the user "at bottom" */
const AT_BOTTOM_THRESHOLD = 150;

/** Hard stop for unusably narrow chat panels */
const MIN_CHAT_PANEL_WIDTH = 320;

/** Layout breakpoints for adaptive column sizing */
const COMPACT_CHAT_PANEL_WIDTH = 520;
const ROOMY_CHAT_PANEL_WIDTH = 960;
const LAST_API_RESPONSE_PANEL_WIDTH = ROOMY_CHAT_PANEL_WIDTH * 1.5;

/** Message count at which we switch to virtualized rendering */
const VIRTUALIZE_THRESHOLD = 40;

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
  const [panelWidth, setPanelWidth] = useState(0);

  // Read viewMode from initial data injected by the extension host
  const initialData = (window as unknown as Record<string, unknown>).__OPENCODE_INITIAL__ as
    | Record<string, string>
    | undefined;
  const _viewMode = initialData?.viewMode || 'sidebar';

  // Refs for scroll management
  const appRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const prevMessageCountRef = useRef(0);
  const pendingHistoryPrependScrollRef = useRef<{
    previousScrollHeight: number;
    previousScrollTop: number;
  } | null>(null);
  const skipNextAutoScrollRef = useRef(false);
  const isProgrammaticScrollRef = useRef(false);
  const userScrolledUpRef = useRef(false);
  const scrollRafRef = useRef(0);
  const optimisticMessageTimeoutRef = useRef<number | undefined>(undefined);
  const bufferedSessionMessagesRef = useRef<Map<string, SessionScopedWebviewMessage[]>>(new Map());

  // Store state
  const connected = useChatStore((s) => s.connected);
  const currentSession = useChatStore((s) => s.currentSession);
  const _rawMessages = useChatStore((s) => s.messages);
  const visibleMessages = useChatStore((s) => s.visibleMessages);
  const sessionStatus = useChatStore((s) => s.sessionStatus);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const optimisticMessageID = useChatStore((s) => s.optimisticMessageID);
  const pendingPermission = useChatStore((s) => s.pendingPermission);
  const pendingQuestion = useChatStore((s) => s.pendingQuestion);
  const activeSessionCount = useChatStore((s) => s.activeSessionCount);

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
  const rollbackQueuedOptimisticMessage = useChatStore((s) => s.rollbackQueuedOptimisticMessage);
  const confirmQueuedOptimisticMessage = useChatStore((s) => s.confirmQueuedOptimisticMessage);
  const queueInputInsertion = useChatStore((s) => s.queueInputInsertion);

  useQueuedMessageAutoSend();

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
    (sessionID: string, olderMessages: typeof _rawMessages) => {
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
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth', userInitiated = false) => {
    const el = messagesRef.current;
    if (userInitiated) {
      userScrolledUpRef.current = false;
      atBottomRef.current = true;
      setAtBottom(true);
    }

    if (el) {
      isProgrammaticScrollRef.current = true;
      if (behavior === 'instant') {
        el.scrollTop = el.scrollHeight;
      } else {
        el.scrollTo({ top: el.scrollHeight, behavior });
      }
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          isProgrammaticScrollRef.current = false;
        });
      });
    }
  }, []);

  // Track scroll position to update atBottom state
  const handleScroll = useCallback(() => {
    if (isProgrammaticScrollRef.current) return;
    const next = checkAtBottom();
    atBottomRef.current = next;
    setAtBottom(prev => (prev === next ? prev : next));
    if (!next) {
      userScrolledUpRef.current = true;
    }
    if (next) {
      userScrolledUpRef.current = false;
    }
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

    // This works for both normal and virtualized rendering paths:
    // - Normal: prepended DOM elements increase scrollHeight directly
    // - Virtualized: virtualizer.getTotalSize() is computed synchronously
    //   during render (using estimateSize for new items), so the container's
    //   style.height is already updated when useLayoutEffect fires
    const scrollHeightDelta = scrollContainer.scrollHeight - pendingScrollState.previousScrollHeight;
    scrollContainer.scrollTop = pendingScrollState.previousScrollTop + scrollHeightDelta;
    prevMessageCountRef.current = visibleMessages.length;
    skipNextAutoScrollRef.current = true;
  }, [visibleMessages]);

  // Auto-scroll on new messages or streaming content updates
  useLayoutEffect(() => {
    if (skipNextAutoScrollRef.current) {
      skipNextAutoScrollRef.current = false;
      prevMessageCountRef.current = visibleMessages.length;
      return;
    }

    const newCount = visibleMessages.length;
    prevMessageCountRef.current = newCount;

    if (!newCount || !atBottomRef.current || userScrolledUpRef.current) {
      return;
    }

    cancelAnimationFrame(scrollRafRef.current);
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollToBottom('instant');
    });
  }, [visibleMessages, scrollToBottom]);

  // Scroll to bottom when permission or question cards appear
  useEffect(() => {
    if ((pendingPermission || pendingQuestion) && atBottomRef.current) {
      scrollToBottom('smooth');
    }
  }, [pendingPermission, pendingQuestion, scrollToBottom]);

  useEffect(() => {
    if (!isStreaming) {
      userScrolledUpRef.current = false;
    }
  }, [isStreaming]);

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
            userScrolledUpRef.current = false;
            atBottomRef.current = true;
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
            userScrolledUpRef.current = false;
            atBottomRef.current = true;
            setAtBottom(true);
            prevMessageCountRef.current = 0;
            setSession(message.data, []);
            flushBufferedSessionMessages(message.data.id);
            break;

          case 'session:updated':
            updateSession(message.data);
            break;

          case 'session:deleted':
            useMessageQueueStore.getState().clearSessionQueue(message.data.id);
            bufferedSessionMessagesRef.current.delete(message.data.id);
            if (getActiveSessionID() === message.data.id) {
              pendingHistoryPrependScrollRef.current = null;
              skipNextAutoScrollRef.current = false;
              clearSession();
            }
            break;

          case 'session:cleared': {
            const activeSessionID = getActiveSessionID();
            if (activeSessionID) {
              useMessageQueueStore.getState().clearSessionQueue(activeSessionID);
            }
            pendingHistoryPrependScrollRef.current = null;
            skipNextAutoScrollRef.current = false;
            userScrolledUpRef.current = false;
            atBottomRef.current = true;
            setAtBottom(true);
            bufferedSessionMessagesRef.current.clear();
            clearSession();
            break;
          }

          case 'session:status':
            applyOrBufferSessionMessage(message);
            if (message.data.status.status === 'error') {
              useNotificationStore.getState().push('error', 'Session Error', message.data.status.error || 'An error occurred');
            }
            // Clear stale question/permission when session finishes
            if (message.data.status.status === 'idle' || message.data.status.status === 'error') {
              setPermission(undefined);
              setQuestion(undefined);
            }
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
            useNotificationStore.getState().push('permission', 'Permission Required', message.data.description || 'A tool is requesting permission');
            break;

          case 'permission:cleared':
            setPermission(undefined);
            break;

          case 'question:asked':
            setQuestion(message.data);
            break;

          case 'question:cleared':
            setQuestion(undefined);
            break;

          case 'error':
            setError(message.data.message);
            break;

          case 'chat:sendResult': {
            const queuedSend = useMessageQueueStore.getState().getSendingEntry();
            if (message.data.success) {
              if (queuedSend) {
                confirmQueuedOptimisticMessage(message.data.streaming);
              } else {
                confirmOptimisticMessage(message.data.streaming);
              }
              // Safety net: if SSE message.updated never arrives to replace the
              // optimistic message (and clear optimisticMessageID), force-clear
              // after 10s so the input doesn't stay permanently blocked.
              if (optimisticMessageTimeoutRef.current !== undefined) {
                window.clearTimeout(optimisticMessageTimeoutRef.current);
              }
              optimisticMessageTimeoutRef.current = window.setTimeout(() => {
                const s = useChatStore.getState();
                if (s.optimisticMessageID) {
                  useChatStore.setState({ optimisticMessageID: undefined });
                }
                optimisticMessageTimeoutRef.current = undefined;
              }, 10_000);
              if (queuedSend) {
                useMessageQueueStore.getState().finishSending(queuedSend.sessionID, queuedSend.messageID);
              }
            } else {
              if (queuedSend) {
                rollbackQueuedOptimisticMessage();
              } else {
                rollbackOptimisticMessage();
              }
              if (queuedSend) {
                useMessageQueueStore.getState().failSending(queuedSend.sessionID, queuedSend.messageID);
              }
              setError(message.data.error ?? 'Failed to send message');
            }
            break;
          }

          case 'theme:changed': {
            // Suppress CSS transitions during theme switch to prevent flash
            document.documentElement.classList.add('theme-transitioning');
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                document.documentElement.classList.remove('theme-transitioning');
              });
            });
            break;
          }

          case 'agents:updated':
            useAgentStore.getState().setAgents(message.data);
            break;

          case 'todos:updated':
            break;

          case 'config:updated':
            useModelStore.getState().setConfig(message.data);
            useAgentStore.getState().setSelectedAgent(getConfiguredAgent(message.data));
            break;

          case 'providers:updated':
            useModelStore.getState().setProviders(message.data.providers, message.data.connected);
            break;

          case 'model-prefs:loaded':
            useModelStore.getState().setModelPrefs(message.data);
            break;

          case 'chat:autoSend': {
            // Auto-send a prompt. The extension-side handleChatSend will
            // auto-create a new session if none exists, so we only need
            // to add an optimistic message and fire the send.
            const autoSendText = message.data.text;
            if (autoSendText) {
              // Clear current session so handleChatSend creates a fresh one
              clearSession();
              useChatStore.getState().addOptimisticMessage(autoSendText);
              postMessage({
                type: 'chat:send',
                data: {
                  text: autoSendText,
                  attachDiagnostics: message.data.attachDiagnostics,
                },
              });
            }
            break;
          }

          case 'chat:insertText':
            queueInputInsertion(message.data.text, message.data.focus);
            break;

          case 'activeSessions:updated':
            useChatStore.getState().setActiveSessionCount(message.data.count);
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
      rollbackQueuedOptimisticMessage,
      confirmQueuedOptimisticMessage,
      queueInputInsertion,
    ]
  );

  useMessageListener(handleExtensionMessage);

  useEffect(() => {
    if (optimisticMessageID) {
      return;
    }

    if (optimisticMessageTimeoutRef.current !== undefined) {
      window.clearTimeout(optimisticMessageTimeoutRef.current);
      optimisticMessageTimeoutRef.current = undefined;
    }
  }, [optimisticMessageID]);

  useEffect(() => () => {
    if (optimisticMessageTimeoutRef.current !== undefined) {
      window.clearTimeout(optimisticMessageTimeoutRef.current);
      optimisticMessageTimeoutRef.current = undefined;
    }
  }, []);

  // Send ready signal to extension on mount
  useEffect(() => {
    postMessage({ type: 'ready' });
  }, []);

  useLayoutEffect(() => {
    const app = appRef.current;
    if (!app) {
      return;
    }

    const updateWidth = (nextWidth: number) => {
      const roundedWidth = Math.round(nextWidth);
      setPanelWidth((prev) => (prev === roundedWidth ? prev : roundedWidth));
    };

    updateWidth(app.clientWidth);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      updateWidth(entry?.contentRect.width ?? app.clientWidth);
    });

    observer.observe(app);
    return () => observer.disconnect();
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────

  const scrollToMessageId = useCallback(
    (messageId: string) => {
      const container = messagesRef.current;
      if (!container) return;
      const el = container.querySelector<HTMLElement>(
        `[data-message-id="${CSS.escape(messageId)}"]`
      );
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    },
    []
  );

  const handleNewSession = useCallback(() => {
    postMessage({ type: 'session:create' });
  }, []);

  const handleParentSession = useCallback(() => {
    if (!currentSession?.parentID) {
      return;
    }

    postMessage({ type: 'session:switch', data: { id: currentSession.parentID } });
  }, [currentSession?.parentID]);

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

  const chatAppClassName = [
    'chat-app',
    panelWidth > 0 && panelWidth < COMPACT_CHAT_PANEL_WIDTH ? 'chat-app--compact' : '',
    panelWidth >= ROOMY_CHAT_PANEL_WIDTH ? 'chat-app--roomy' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const lastResponse = useMemo(() => {
    for (let i = visibleMessages.length - 1; i >= 0; i -= 1) {
      const msg = visibleMessages[i];
      if (msg.info.role === 'assistant') {
        return msg;
      }
    }

    return undefined;
  }, [visibleMessages]);

  // ── Connecting state ──────────────────────────────────────────────────

  if (!connected) {
    return (
      <div ref={appRef} className={chatAppClassName}>
        <div className="chat-connecting">
          <div className="chat-connecting__spinner" />
          <div className="chat-connecting__text">Connecting to OpenCode server...</div>
        </div>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────

  const hasMessages = visibleMessages.length > 0;
  const showScrollButton = hasMessages && !atBottom;
  const isTooNarrow = panelWidth > 0 && panelWidth < MIN_CHAT_PANEL_WIDTH;
  const showLastApiResponse = panelWidth >= LAST_API_RESPONSE_PANEL_WIDTH;
  const chatMessagesClassName = [
    'chat-messages',
    isStreaming ? 'chat-messages--streaming' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div ref={appRef} className={chatAppClassName}>
      {/* Header */}
      <div className="chat-header">
        <div className="chat-header__left">
          {currentSession?.parentID && (
            <button
              className="chat-header__parent-btn"
              onClick={handleParentSession}
              title="Back to parent session"
              type="button"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M9.5 3.5 5 8l4.5 4.5" />
              </svg>
              <span>Back</span>
            </button>
          )}
          <span className="chat-header__status">
            <span className={`chat-header__status-dot ${getStatusDotClass()}`} />
          </span>
          <span className="chat-header__title">
            {currentSession?.title || 'OpenCode'}
          </span>
          <CurrentModelBadge />
        </div>
        <div className="chat-header__actions">
          {activeSessionCount > 0 && (
            <span className="chat-header__active-badge" title={`${activeSessionCount} other active session${activeSessionCount > 1 ? 's' : ''}`}>
              <span className="codicon codicon-pulse"></span>
              {activeSessionCount}
            </span>
          )}
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

      {/* Notification toasts */}
      <NotificationToastContainer />

      {/* Error banner */}
      {error && (
        <div className="chat-error">
          <span>&#x26A0; {error}</span>
          <button className="chat-error__dismiss" onClick={dismissError}>
            &times;
          </button>
        </div>
      )}

      {isTooNarrow ? (
        <div className="chat-panel-too-narrow">
          <div className="chat-panel-too-narrow__title">Panel too narrow</div>
          <div className="chat-panel-too-narrow__text">Widen this chat panel to continue.</div>
        </div>
      ) : (
        <div className="chat-body">
          <div className="chat-layout">
            <div className="chat-main">
              <div className="chat-message-stage">
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
                    className={chatMessagesClassName}
                    ref={messagesRef}
                    onScroll={handleScroll}
                  >
                    <div className="chat-messages__inner">
                      {visibleMessages.length >= VIRTUALIZE_THRESHOLD ? (
                        <VirtualizedMessageList
                          messages={visibleMessages}
                          scrollElementRef={messagesRef}
                        />
                      ) : (
                        visibleMessages.map((msg) => (
                          <MessageErrorBoundary key={msg.info.id} messageId={msg.info.id} message={msg}>
                            <MessageBubble message={msg} />
                          </MessageErrorBoundary>
                        ))
                      )}

                      {/* Streaming indicator — hidden when a queued message is already displayed */}
                      {isStreaming && !optimisticMessageID && (
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
                    <OutlineIndex messages={visibleMessages} onScrollToMessageId={scrollToMessageId} />
                  </div>
                )}

                {showScrollButton && (
                  <div className="chat-scroll-bottom-zone">
                    <button
                      className="chat-scroll-bottom"
                      onClick={() => scrollToBottom('smooth', true)}
                      title="Scroll to bottom"
                      aria-label="Scroll to bottom"
                      type="button"
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M8 12.14l-4.5-4.5 1.06-1.06L8 10.02l3.44-3.44 1.06 1.06L8 12.14z" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>

              {/* Input area — question/permission cards overlay the input when active */}
              <div className="chat-input-area">
                {pendingPermission && (
                  <PermissionCard permission={pendingPermission} />
                )}
                {pendingQuestion && (
                  <QuestionCard question={pendingQuestion} />
                )}
                {!pendingPermission && !pendingQuestion && (
                  <ChatInput />
                )}
              </div>
            </div>

            {showLastApiResponse && (
              <LastApiResponsePanel message={lastResponse} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
