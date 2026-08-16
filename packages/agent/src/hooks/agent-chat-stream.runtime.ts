import type {
  AgentStreamRuntime,
  BufferedThreadEvent,
  PendingStreamCompletion,
} from '@genfeedai/agent/hooks/agent-chat-stream.types';

const runtime: AgentStreamRuntime = {
  activeStreamThreadRef: { current: null },
  bufferedEventsRef: { current: [] as BufferedThreadEvent[] },
  completionTimeoutRef: { current: null },
  mountCount: 0,
  pendingCompletionRef: { current: null as PendingStreamCompletion | null },
  unsubscribersRef: { current: [] as Array<() => void> },
};

/**
 * Stream ownership shared by every mounted `useAgentChatStream`.
 *
 * The hook is mounted more than once at a time — the persistent agent layout
 * owns one instance (composer send) and the per-route chat container owns
 * another. The socket and the chat store are already singletons; keeping the
 * subscription list, buffered events, and completion watchdog per instance
 * meant two owners for one run: the layout instance "adopted" the run the page
 * instance had just started, both handled `agent:token` / `agent:done`, and the
 * first reply rendered twice.
 *
 * The object identity is stable for the lifetime of the module so it can be
 * read at module scope; `resetAgentStreamRuntime` clears it in place.
 */
export function getAgentStreamRuntime(): AgentStreamRuntime {
  return runtime;
}

/** Tear down subscriptions and timers and return the runtime to blank. */
export function resetAgentStreamRuntime(): void {
  for (const unsubscribe of runtime.unsubscribersRef.current) {
    unsubscribe();
  }

  if (runtime.completionTimeoutRef.current) {
    clearTimeout(runtime.completionTimeoutRef.current);
  }

  runtime.activeStreamThreadRef.current = null;
  runtime.bufferedEventsRef.current = [];
  runtime.completionTimeoutRef.current = null;
  runtime.mountCount = 0;
  runtime.pendingCompletionRef.current = null;
  runtime.unsubscribersRef.current = [];
}
