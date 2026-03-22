import type { EventType, EventPayloads } from '../types/events';

type EventHandler<T extends EventType> = (payload: EventPayloads[T]) => void;
type HandlerRegistry = { [K in EventType]?: Set<EventHandler<K>> };

/**
 * Typed event bus for internal extension communication
 */
export class EventBus {
  private handlers: HandlerRegistry = {};

  on<T extends EventType>(event: T, handler: EventHandler<T>): () => void {
    const handlers = this.handlers[event] as Set<EventHandler<T>> | undefined;

    if (handlers) {
      handlers.add(handler);
    } else {
      this.handlers[event] = new Set([handler]) as HandlerRegistry[T];
    }

    // Return unsubscribe function
    return () => {
      (this.handlers[event] as Set<EventHandler<T>> | undefined)?.delete(handler);
    };
  }

  emit<T extends EventType>(event: T, payload: EventPayloads[T]): void {
    (this.handlers[event] as Set<EventHandler<T>> | undefined)?.forEach((handler) => {
      try {
        handler(payload);
      } catch (error) {
        console.error(`Error in event handler for ${event}:`, error);
      }
    });
  }

  removeAllListeners(event?: EventType): void {
    if (event) {
      delete this.handlers[event];
    } else {
      this.handlers = {};
    }
  }
}
