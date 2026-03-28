import { create } from 'zustand';
import type { ChatImageAttachment } from './chatStore';

export interface QueuedChatMessage {
  id: string;
  text: string;
  images: ChatImageAttachment[];
  mentions?: string[];
  createdAt: number;
}

interface MessageQueueState {
  queuedMessages: Record<string, QueuedChatMessage[]>;
  sendingMessageIDs: Record<string, string | undefined>;
  failedMessageIDs: Record<string, string | undefined>;
  enqueue: (
    sessionID: string,
    message: { text: string; images: ChatImageAttachment[]; mentions?: string[] },
  ) => QueuedChatMessage;
  recall: (sessionID: string, messageID: string) => QueuedChatMessage | undefined;
  remove: (sessionID: string, messageID: string) => void;
  peek: (sessionID: string) => QueuedChatMessage | undefined;
  markSending: (sessionID: string, messageID: string) => void;
  finishSending: (sessionID: string, messageID: string) => void;
  failSending: (sessionID: string, messageID: string) => void;
  clearFailure: (sessionID: string) => void;
  clearSessionQueue: (sessionID: string) => void;
  getSendingEntry: () => { sessionID: string; messageID: string } | undefined;
}

function omitKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) {
    return record;
  }

  const { [key]: _removed, ...rest } = record;
  return rest;
}

function withQueue(
  state: MessageQueueState,
  sessionID: string,
  queue: QueuedChatMessage[],
): Pick<MessageQueueState, 'queuedMessages'> {
  if (queue.length === 0) {
    return { queuedMessages: omitKey(state.queuedMessages, sessionID) };
  }

  return {
    queuedMessages: {
      ...state.queuedMessages,
      [sessionID]: queue,
    },
  };
}

function withSessionValue<T>(
  record: Record<string, T | undefined>,
  sessionID: string,
  value: T | undefined,
): Record<string, T | undefined> {
  if (value === undefined) {
    return omitKey(record, sessionID);
  }

  return {
    ...record,
    [sessionID]: value,
  };
}

export const useMessageQueueStore = create<MessageQueueState>((set, get) => ({
  queuedMessages: {},
  sendingMessageIDs: {},
  failedMessageIDs: {},

  enqueue: (sessionID, message) => {
    const item: QueuedChatMessage = {
      id: `queued_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      text: message.text,
      images: message.images.map((image) => ({ ...image })),
      mentions: message.mentions ? [...message.mentions] : undefined,
      createdAt: Date.now(),
    };

    set((state) => ({
      queuedMessages: {
        ...state.queuedMessages,
        [sessionID]: [...(state.queuedMessages[sessionID] ?? []), item],
      },
    }));

    return item;
  },

  recall: (sessionID, messageID) => {
    const item = (get().queuedMessages[sessionID] ?? []).find((entry) => entry.id === messageID);
    if (!item) {
      return undefined;
    }

    set((state) => {
      const queue = (state.queuedMessages[sessionID] ?? []).filter((entry) => entry.id !== messageID);

      return {
        ...withQueue(state, sessionID, queue),
        sendingMessageIDs: state.sendingMessageIDs[sessionID] === messageID
          ? omitKey(state.sendingMessageIDs, sessionID)
          : state.sendingMessageIDs,
        failedMessageIDs: state.failedMessageIDs[sessionID] === messageID
          ? omitKey(state.failedMessageIDs, sessionID)
          : state.failedMessageIDs,
      };
    });

    return {
      ...item,
      images: item.images.map((image) => ({ ...image })),
      mentions: item.mentions ? [...item.mentions] : undefined,
    };
  },

  remove: (sessionID, messageID) => {
    set((state) => {
      const queue = (state.queuedMessages[sessionID] ?? []).filter((entry) => entry.id !== messageID);

      return {
        ...withQueue(state, sessionID, queue),
        sendingMessageIDs: state.sendingMessageIDs[sessionID] === messageID
          ? omitKey(state.sendingMessageIDs, sessionID)
          : state.sendingMessageIDs,
        failedMessageIDs: state.failedMessageIDs[sessionID] === messageID
          ? omitKey(state.failedMessageIDs, sessionID)
          : state.failedMessageIDs,
      };
    });
  },

  peek: (sessionID) => get().queuedMessages[sessionID]?.[0],

  markSending: (sessionID, messageID) => {
    set((state) => {
      const item = (state.queuedMessages[sessionID] ?? []).find((entry) => entry.id === messageID);
      if (!item) {
        return state;
      }

      return {
        sendingMessageIDs: {
          ...state.sendingMessageIDs,
          [sessionID]: messageID,
        },
      };
    });
  },

  finishSending: (sessionID, messageID) => {
    set((state) => {
      const queue = (state.queuedMessages[sessionID] ?? []).filter((entry) => entry.id !== messageID);

      return {
        ...withQueue(state, sessionID, queue),
        sendingMessageIDs: state.sendingMessageIDs[sessionID] === messageID
          ? omitKey(state.sendingMessageIDs, sessionID)
          : state.sendingMessageIDs,
        failedMessageIDs: state.failedMessageIDs[sessionID] === messageID
          ? omitKey(state.failedMessageIDs, sessionID)
          : state.failedMessageIDs,
      };
    });
  },

  failSending: (sessionID, messageID) => {
    set((state) => ({
      sendingMessageIDs: state.sendingMessageIDs[sessionID] === messageID
        ? omitKey(state.sendingMessageIDs, sessionID)
        : state.sendingMessageIDs,
      failedMessageIDs: withSessionValue(state.failedMessageIDs, sessionID, messageID),
    }));
  },

  clearFailure: (sessionID) => {
    set((state) => ({
      failedMessageIDs: omitKey(state.failedMessageIDs, sessionID),
    }));
  },

  clearSessionQueue: (sessionID) => {
    set((state) => ({
      queuedMessages: omitKey(state.queuedMessages, sessionID),
      sendingMessageIDs: omitKey(state.sendingMessageIDs, sessionID),
      failedMessageIDs: omitKey(state.failedMessageIDs, sessionID),
    }));
  },

  getSendingEntry: () => {
    for (const [sessionID, messageID] of Object.entries(get().sendingMessageIDs)) {
      if (messageID) {
        return { sessionID, messageID };
      }
    }

    return undefined;
  },
}));
