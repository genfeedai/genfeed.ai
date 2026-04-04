/**
 * Event Bus Service
 * Provides a unified interface for emitting and subscribing to domain events.
 * Supports both synchronous (in-process) and asynchronous (queue-based) events.
 *
 * NOTE: Domain event interfaces were removed as dead code. This service now uses
 * generic string-based event types. Define concrete event types when wiring up
 * actual event producers/consumers.
 */
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

/** Generic event type — replace with a concrete union when events are wired up */
export type DomainEventType = string;

/** Generic event data by type — replace with a concrete mapped type when events are wired up */
export type EventDataByType<_T extends DomainEventType> = Record<
  string,
  unknown
>;

export type EventHandler<T extends DomainEventType> = (
  data: EventDataByType<T>,
) => void | Promise<void>;

@Injectable()
export class EventBusService implements OnModuleDestroy {
  private readonly context = 'EventBusService';
  private readonly handlers = new Map<
    DomainEventType,
    Set<EventHandler<DomainEventType>>
  >();

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Emit an event synchronously (in-process).
   * All registered handlers will be called.
   */
  emit<T extends DomainEventType>(type: T, data: EventDataByType<T>): void {
    // @ts-expect-error TS2554
    this.logger.debug(`Emitting event: ${type}`, { data }, this.context);

    // Emit via EventEmitter2 for NestJS @OnEvent decorators
    this.eventEmitter.emit(type, data);

    // Also call directly registered handlers
    const handlers = this.handlers.get(type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          const result = handler(data as EventDataByType<DomainEventType>);
          // Handle async handlers
          if (result instanceof Promise) {
            result.catch((error) => {
              this.logger.error(
                `Event handler failed for ${type}`,
                { error: (error as Error)?.message },
                this.context,
              );
            });
          }
        } catch (error: unknown) {
          this.logger.error(
            `Event handler failed for ${type}`,
            { error: (error as Error)?.message },
            this.context,
          );
        }
      }
    }
  }

  /**
   * Emit an event and wait for all handlers to complete.
   * Useful when you need to ensure handlers have finished before proceeding.
   */
  async emitAsync<T extends DomainEventType>(
    type: T,
    data: EventDataByType<T>,
  ): Promise<void> {
    // @ts-expect-error TS2554
    this.logger.debug(`Emitting async event: ${type}`, { data }, this.context);

    // Emit via EventEmitter2 and wait for all listeners
    await this.eventEmitter.emitAsync(type, data);

    // Also call directly registered handlers
    const handlers = this.handlers.get(type);
    if (handlers) {
      const promises: Promise<void>[] = [];
      for (const handler of handlers) {
        try {
          const result = handler(data as EventDataByType<DomainEventType>);
          if (result instanceof Promise) {
            promises.push(result);
          }
        } catch (error: unknown) {
          this.logger.error(
            `Event handler failed for ${type}`,
            { error: (error as Error)?.message },
            this.context,
          );
        }
      }
      await Promise.all(promises);
    }
  }

  /**
   * Subscribe to an event type.
   * Returns an unsubscribe function.
   */
  subscribe<T extends DomainEventType>(
    type: T,
    handler: EventHandler<T>,
  ): () => void {
    let handlers = this.handlers.get(type);
    if (!handlers) {
      handlers = new Set();
      this.handlers.set(type, handlers);
    }

    handlers.add(handler as EventHandler<DomainEventType>);

    this.logger.debug(
      `Subscribed to event: ${type}`,
      { handlerCount: handlers.size },
      // @ts-expect-error TS2554
      this.context,
    );

    // Return unsubscribe function
    return () => {
      handlers?.delete(handler as EventHandler<DomainEventType>);
      this.logger.debug(
        `Unsubscribed from event: ${type}`,
        { handlerCount: handlers?.size ?? 0 },
        // @ts-expect-error TS2554
        this.context,
      );
    };
  }

  /**
   * Subscribe to multiple event types with a single handler.
   * Returns an unsubscribe function that removes all subscriptions.
   */
  subscribeMany<T extends DomainEventType>(
    types: T[],
    handler: EventHandler<T>,
  ): () => void {
    const unsubscribes = types.map((type) => this.subscribe(type, handler));

    return () => {
      for (const unsubscribe of unsubscribes) {
        unsubscribe();
      }
    };
  }

  /**
   * Check if there are any handlers for an event type.
   */
  hasHandlers(type: DomainEventType): boolean {
    const handlers = this.handlers.get(type);
    const directCount = handlers?.size ?? 0;
    const eventEmitterCount = this.eventEmitter.listenerCount(type);
    return directCount > 0 || eventEmitterCount > 0;
  }

  /**
   * Get the number of handlers for an event type.
   */
  getHandlerCount(type: DomainEventType): number {
    const handlers = this.handlers.get(type);
    const directCount = handlers?.size ?? 0;
    const eventEmitterCount = this.eventEmitter.listenerCount(type);
    return directCount + eventEmitterCount;
  }

  /**
   * Clear all direct handlers (does not affect @OnEvent decorators).
   */
  clearHandlers(): void {
    this.handlers.clear();
    // @ts-expect-error TS2554
    this.logger.debug('Cleared all event handlers', undefined, this.context);
  }

  onModuleDestroy(): void {
    this.clearHandlers();
  }
}
