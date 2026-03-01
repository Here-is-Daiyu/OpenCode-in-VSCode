import type { EventType, EventPayloads } from '../types/events';

type EventHandler<T extends EventType> = (payload: EventPayloads[T]) => void;

/**
 * Typed event bus for internal extension communication
 */
export class EventBus {
  private handlers: Map<string, Set<Function>> = new Map();

  on<T extends EventType>(event: T, handler: EventHandler<T>): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.handlers.get(event)?.delete(handler);
    };
  }

  emit<T extends EventType>(event: T, payload: EventPayloads[T]): void {
    this.handlers.get(event)?.forEach(handler => {
      try {
        (handler as EventHandler<T>)(payload);
      } catch (error) {
        console.error(`Error in event handler for ${event}:`, error);
      }
    });
  }

  removeAllListeners(event?: EventType): void {
    if (event) {
      this.handlers.delete(event);
    } else {
      this.handlers.clear();
    }
  }
}
