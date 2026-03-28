import { useEffect } from 'react';
import { useChatStore } from '../stores/chatStore';
import { useMessageQueueStore } from '../stores/messageQueueStore';
import { postMessage } from '../utils/vscodeApi';

/**
 * Auto-send the next queued follow-up after the active session becomes idle.
 */
export function useQueuedMessageAutoSend(): void {
  const connected = useChatStore((state) => state.connected);
  const currentSession = useChatStore((state) => state.currentSession);
  const sessionStatus = useChatStore((state) => state.sessionStatus);
  const optimisticMessageID = useChatStore((state) => state.optimisticMessageID);

  const sessionID = currentSession?.id;
  const revertMessageID = currentSession?.revert?.messageID;
  const queueLength = useMessageQueueStore((state) =>
    sessionID ? (state.queuedMessages[sessionID]?.length ?? 0) : 0,
  );
  const sendingMessageID = useMessageQueueStore((state) =>
    sessionID ? state.sendingMessageIDs[sessionID] : undefined,
  );
  const failedMessageID = useMessageQueueStore((state) =>
    sessionID ? state.failedMessageIDs[sessionID] : undefined,
  );

  useEffect(() => {
    if (!connected || !sessionID || revertMessageID) {
      return;
    }

    if (sessionStatus !== 'idle' || optimisticMessageID || sendingMessageID || failedMessageID) {
      return;
    }

    const activeSessionID = useChatStore.getState().currentSession?.id;
    if (!activeSessionID || activeSessionID !== sessionID) {
      return;
    }

    const item = useMessageQueueStore.getState().peek(activeSessionID);
    if (!item) {
      return;
    }

    const images = item.images.map((image) => image.dataUrl);

    useMessageQueueStore.getState().markSending(activeSessionID, item.id);
    useChatStore.getState().addQueuedOptimisticMessage(item.text, images.length > 0 ? images : undefined);
    postMessage({
      type: 'chat:send',
      data: {
        text: item.text,
        images: images.length > 0 ? images : undefined,
        mentions: item.mentions?.length ? item.mentions : undefined,
      },
    });
  }, [
    connected,
    failedMessageID,
    optimisticMessageID,
    queueLength,
    revertMessageID,
    sendingMessageID,
    sessionID,
    sessionStatus,
  ]);
}
