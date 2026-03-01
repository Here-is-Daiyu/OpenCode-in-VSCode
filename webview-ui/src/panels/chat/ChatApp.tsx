/**
 * ChatApp - Main chat panel component
 * Displays messages, handles user input, and communicates with the extension host
 * Uses react-virtuoso for virtual scrolling of the message list.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { useChatStore } from '../../stores/chatStore';
import { useMessageListener } from '../../hooks/useMessageListener';
import { postMessage } from '../../utils/vscodeApi';
import { MessageBubble } from '../../components/MessageBubble';
import { ChatInput } from '../../components/ChatInput';
import { PermissionCard } from '../../components/PermissionCard';
import { QuestionCard } from '../../components/QuestionCard';
import type { ExtensionToWebviewMessage } from '../../types/messages';
import type { MessageWithParts } from '../../types/opencode';

export function ChatApp() {
  const [error, setError] = useState<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);

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
  const updateMessage = useChatStore((s) => s.updateMessage);
  const updatePart = useChatStore((s) => s.updatePart);
  const removeMessage = useChatStore((s) => s.removeMessage);
  const setPermission = useChatStore((s) => s.setPermission);
  const setQuestion = useChatStore((s) => s.setQuestion);

  // Handle messages from extension host
  const handleExtensionMessage = useCallback(
    (message: ExtensionToWebviewMessage) => {
      switch (message.type) {
        case 'server:status':
          setConnected(message.data.connected, message.data.version);
          break;

        case 'session:loaded':
          setSession(message.data.session, message.data.messages);
          break;

        case 'session:created':
          // Session created but no messages yet
          setSession(message.data, []);
          break;

        case 'session:updated':
          updateSession(message.data);
          break;

        case 'session:deleted':
          if (currentSession?.id === message.data.id) {
            clearSession();
          }
          break;

        case 'session:status':
          if (currentSession?.id === message.data.sessionID) {
            setSessionStatus(message.data.status.status);
          }
          break;

        case 'message:updated':
          updateMessage(message.data);
          break;

        case 'message:partUpdated':
          if (currentSession?.id === message.data.sessionID) {
            updatePart(message.data.messageID, message.data.part);
          }
          break;

        case 'message:removed':
          if (currentSession?.id === message.data.sessionID) {
            removeMessage(message.data.messageID);
          }
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

        case 'theme:changed':
        case 'config:updated':
        case 'providers:updated':
        case 'agents:updated':
        case 'todos:updated':
          // These can be handled later as needed
          break;
      }
    },
    [
      currentSession?.id,
      setConnected,
      setSession,
      updateSession,
      clearSession,
      setSessionStatus,
      updateMessage,
      updatePart,
      removeMessage,
      setPermission,
      setQuestion,
    ]
  );

  useMessageListener(handleExtensionMessage);

  // Send ready signal to extension on mount
  useEffect(() => {
    postMessage({ type: 'ready' });
  }, []);

  // Handle new session creation
  const handleNewSession = useCallback(() => {
    postMessage({ type: 'session:create' });
  }, []);

  // Dismiss error
  const dismissError = useCallback(() => setError(null), []);

  // Get session status display
  const getStatusDotClass = () => {
    if (!connected) return 'chat-header__status-dot--disconnected';
    if (sessionStatus === 'active') return 'chat-header__status-dot--active';
    return 'chat-header__status-dot--connected';
  };

  const getStatusText = () => {
    if (!connected) return 'Disconnected';
    if (sessionStatus === 'active') return 'Generating...';
    if (sessionStatus === 'compacting') return 'Compacting...';
    if (sessionStatus === 'error') return 'Error';
    return 'Connected';
  };

  // Virtuoso: followOutput callback — auto-scroll when streaming and user is at bottom
  const followOutput = useCallback(
    () => {
      if (isStreaming && atBottom) {
        return 'smooth';
      }
      return false;
    },
    [isStreaming, atBottom]
  );

  // Virtuoso: render each message item
  const itemContent = useCallback(
    (_index: number, msg: MessageWithParts) => (
      <MessageBubble message={msg} />
    ),
    []
  );

  // Virtuoso: stable key from message id
  const computeItemKey = useCallback(
    (_index: number, msg: MessageWithParts) => msg.info.id,
    []
  );

  // Virtuoso: footer with permission card, question card, and streaming indicator
  const Footer = useCallback(() => {
    const hasFooterContent = pendingPermission || pendingQuestion || isStreaming;
    if (!hasFooterContent) return null;

    return (
      <div className="chat-virtuoso-footer">
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
      </div>
    );
  }, [pendingPermission, pendingQuestion, isStreaming]);

  // Show connecting state if not yet connected
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

  return (
    <div className="chat-app">
      {/* Header */}
      <div className="chat-header">
        <span className="chat-header__title">
          {currentSession?.title || 'OpenCode Chat'}
        </span>
        <div className="chat-header__info">
          <span className="chat-header__status">
            <span className={`chat-header__status-dot ${getStatusDotClass()}`} />
            <span>{getStatusText()}</span>
          </span>
          <button
            className="chat-header__new-btn"
            onClick={handleNewSession}
            title="New Session"
          >
            + New
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

      {/* Messages — Welcome screen (no Virtuoso) or Virtuoso-powered list */}
      {messages.length === 0 ? (
        <div className="chat-messages chat-messages--empty">
          <div className="chat-welcome">
            <div className="chat-welcome__icon">
              <svg width="40" height="40" viewBox="0 0 16 16" fill="currentColor" opacity="0.5">
                <path d="M5 3a2 2 0 0 0-2 2v2h2V5h6v2h2V5a2 2 0 0 0-2-2H5zm8 6H3v2a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9zM6 10h1v1H6v-1zm3 0h1v1H9v-1z" />
              </svg>
            </div>
            <div className="chat-welcome__title">OpenCode</div>
            <div className="chat-welcome__subtitle">
              Start a conversation by typing below.
              <br />
              Use <strong>@</strong> to reference files, <strong>/</strong> for commands.
            </div>
          </div>
        </div>
      ) : (
        <Virtuoso
          className="chat-virtuoso"
          data={messages}
          alignToBottom
          followOutput={followOutput}
          atBottomThreshold={150}
          atBottomStateChange={setAtBottom}
          increaseViewportBy={{ top: 200, bottom: 200 }}
          computeItemKey={computeItemKey}
          itemContent={itemContent}
          components={{ Footer }}
        />
      )}

      {/* Input */}
      <ChatInput />
    </div>
  );
}
