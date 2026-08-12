import type { AgentThreadSnapshot } from '@genfeedai/agent/models/agent-chat.model';
import type { AgentMessagesPage } from '@genfeedai/agent/services/agent-api/agent-api.threads';

export interface ConversationHydrationResult<TPage, TSnapshot> {
  page: TPage;
  snapshot: TSnapshot | null;
}

export interface ConversationHydrationFlight<TPage, TSnapshot> {
  abort: () => void;
  promise: Promise<ConversationHydrationResult<TPage, TSnapshot>>;
  signal: AbortSignal;
}

export interface ConversationHydrationFlightRegistry<TPage, TSnapshot> {
  abort: (threadId: string) => void;
  begin: (
    threadId: string,
    start: (
      signal: AbortSignal,
    ) => Promise<ConversationHydrationResult<TPage, TSnapshot>>,
  ) => ConversationHydrationFlight<TPage, TSnapshot>;
  clear: () => void;
  get: (
    threadId: string,
  ) => ConversationHydrationFlight<TPage, TSnapshot> | undefined;
  has: (threadId: string) => boolean;
}

/**
 * Single-flight registry so hover-prefetch and the thread-switch effect cannot
 * stack two messages+snapshot request sets for the same thread (#2790).
 */
export function createConversationHydrationFlightRegistry<
  TPage,
  TSnapshot,
>(): ConversationHydrationFlightRegistry<TPage, TSnapshot> {
  const flights = new Map<
    string,
    ConversationHydrationFlight<TPage, TSnapshot>
  >();

  function begin(
    threadId: string,
    start: (
      signal: AbortSignal,
    ) => Promise<ConversationHydrationResult<TPage, TSnapshot>>,
  ): ConversationHydrationFlight<TPage, TSnapshot> {
    const existing = flights.get(threadId);
    if (existing) {
      return existing;
    }

    const controller = new AbortController();
    const flight: ConversationHydrationFlight<TPage, TSnapshot> = {
      abort: () => {
        controller.abort();
        if (flights.get(threadId)?.signal === controller.signal) {
          flights.delete(threadId);
        }
      },
      promise: start(controller.signal).finally(() => {
        if (flights.get(threadId)?.signal === controller.signal) {
          flights.delete(threadId);
        }
      }),
      signal: controller.signal,
    };
    flights.set(threadId, flight);
    return flight;
  }

  return {
    abort: (threadId) => {
      flights.get(threadId)?.abort();
    },
    begin,
    clear: () => {
      for (const flight of flights.values()) {
        flight.abort();
      }
      flights.clear();
    },
    get: (threadId) => flights.get(threadId),
    has: (threadId) => flights.has(threadId),
  };
}

export const conversationHydrationFlights =
  createConversationHydrationFlightRegistry<
    AgentMessagesPage,
    AgentThreadSnapshot
  >();
