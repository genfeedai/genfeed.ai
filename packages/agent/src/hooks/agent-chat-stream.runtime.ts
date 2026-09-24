import { isForeignRunEvent } from '@genfeedai/agent/hooks/agent-chat-stream.helpers';
import { createProvisionalEventPool } from '@genfeedai/agent/hooks/agent-chat-stream.provisional';
import type {
  AgentStreamEntry,
  AgentStreamRuntime,
} from '@genfeedai/agent/hooks/agent-chat-stream.types';
import type { AgentThreadSnapshot } from '@genfeedai/agent/models/agent-chat.model';
import {
  type AgentChatStore,
  createAgentChatStore,
  useAgentChatStore,
} from '@genfeedai/agent/stores/agent-chat.store';
import { mapSnapshotRunStatus } from '@genfeedai/agent/utils/agent-thread-snapshot.util';

function blankRuntime(): AgentStreamRuntime {
  return {
    activeStreamRunIdRef: { current: null },
    activeStreamThreadRef: { current: null },
    bufferedEventsRef: { current: [] },
    completionTimeoutRef: { current: null },
    isAwaitingRunIdRef: { current: false },
    mountCount: 0,
    ownerGeneration: 0,
    pendingCompletionRef: { current: null },
    unsubscribersRef: { current: [] },
  };
}
const runtime = Object.assign(blankRuntime(), {
  entries: new Map<string, AgentStreamEntry>(),
  transport: null as
    | null
    | (<T>(event: string, handler: (payload: T) => void) => () => void),
  physical: new Map<string, () => void>(),
  connectionState: 'connecting',
  managerIdentity: null as unknown,
  nextEntryId: 0,
  visibleDraftOwner: null as AgentStreamEntry | null,
  projecting: false,
  ensureVisibleEntry: null as (() => void) | null,
  disposeVisibleBridge: null as (() => void) | null,
});

const provisionalEvents = createProvisionalEventPool();
const provisionalReceipts = new Map<
  AgentStreamEntry,
  { threadId: string; runId: string }
>();
function protectedProvisionalKeys() {
  return new Set(
    [...provisionalReceipts.values()].flatMap(({ threadId, runId }) => [
      provisionalEvents.keyFor(threadId, runId),
      provisionalEvents.keyFor(threadId),
    ]),
  );
}
function releaseProvisionalReceipt(entry: AgentStreamEntry) {
  provisionalReceipts.delete(entry);
  provisionalEvents.prune(protectedProvisionalKeys(), runtime.nextEntryId);
}
export function hasProvisionalAgentProgress(threadId: string, runId: string) {
  return provisionalEvents.hasProgress(threadId, runId);
}
export function claimProvisionalAgentEvents(
  entry: AgentStreamEntry,
  threadId: string,
  runId: string,
) {
  const claimed = provisionalEvents.claim(
    threadId,
    runId,
    entry.createdAt,
    protectedProvisionalKeys(),
    runtime.nextEntryId,
  );
  entry.needsReconciliation ||= claimed.reconcile;
  for (const { event, payload } of claimed.events) {
    const handler = entry.handlers.get(event);
    if (!handler) continue;
    const data = payload as {
      threadId?: string;
      runId?: string;
      inputRequestId?: string;
    };
    entry.bufferedEventsRef.current.push({
      data: payload,
      handler,
      threadId: data.threadId,
      runId: data.runId,
      resolvedInputRequestId:
        event === 'agent:input_resolved' ? data.inputRequestId : undefined,
    });
  }
  releaseProvisionalReceipt(entry);
}

export function getAgentStreamRuntime() {
  return runtime;
}

export function conversationProjection(state: AgentChatStore) {
  return {
    activeRunId: state.activeRunId,
    activeRunStatus: state.activeRunStatus,
    error: state.error,
    latestProposedPlan: state.latestProposedPlan,
    messages: state.messages,
    messagesCursor: state.messagesCursor,
    hasMoreMessages: state.hasMoreMessages,
    pendingInputRequest: state.pendingInputRequest,
    runStartedAt: state.runStartedAt,
    stream: state.stream,
    workEvents: state.workEvents,
  };
}

function pruneTerminalEntries() {
  const terminals = [...runtime.entries.values()]
    .filter((entry) => entry.terminalAt !== null)
    .sort((a, b) => (a.terminalAt ?? 0) - (b.terminalAt ?? 0));
  for (const [index, entry] of terminals.entries()) {
    if (
      index < terminals.length - 50 ||
      Date.now() - (entry.terminalAt ?? 0) > 300_000
    ) {
      disposeAgentStreamEntry(entry);
    }
  }
}
export function findAgentStreamEntry(
  threadId: string | null,
): AgentStreamEntry | undefined {
  pruneTerminalEntries();
  if (threadId) return runtime.entries.get(threadId);
  return runtime.visibleDraftOwner &&
    isCurrentAgentStreamEntry(runtime.visibleDraftOwner) &&
    !runtime.visibleDraftOwner.activeStreamThreadRef.current
    ? runtime.visibleDraftOwner
    : undefined;
}
export function isCurrentAgentStreamEntry(entry: AgentStreamEntry) {
  return runtime.entries.get(entry.key) === entry;
}
export function ownsVisibleAgentStreamEntry(entry: AgentStreamEntry) {
  return (
    isCurrentAgentStreamEntry(entry) &&
    useAgentChatStore.getState().activeThreadId ===
      entry.activeStreamThreadRef.current &&
    (entry.activeStreamThreadRef.current !== null ||
      runtime.visibleDraftOwner === entry)
  );
}
export function projectAgentStreamEntry(entry: AgentStreamEntry) {
  if (!ownsVisibleAgentStreamEntry(entry)) return;
  useAgentChatStore.disposeStreamTokens();
  runtime.projecting = true;
  try {
    useAgentChatStore.setState(
      conversationProjection(entry.presentation.getState()),
    );
  } finally {
    runtime.projecting = false;
  }
}
export function createAgentStreamEntry(
  threadId: string | null,
  clientRequestId: string,
): AgentStreamEntry {
  pruneTerminalEntries();
  const old = threadId ? runtime.entries.get(threadId) : undefined;
  if (old) disposeAgentStreamEntry(old);
  const presentation = createAgentChatStore({ ephemeral: true });
  const visible = useAgentChatStore.getState();
  if (visible.activeThreadId === threadId)
    presentation.setState({
      ...conversationProjection(visible),
      pageContext: visible.pageContext,
    });
  presentation.setState({ activeThreadId: threadId });
  const entry: AgentStreamEntry = {
    ...blankRuntime(),
    key: threadId ?? `request:${clientRequestId}`,
    clientRequestId,
    createdAt: ++runtime.nextEntryId,
    terminalAt: null,
    revision: 0,
    bufferBytes: 0,
    needsReconciliation: false,
    hasProgress: false,
    abortRef: { current: null },
    presentation,
    handlers: new Map(),
    disposeProjection: () => {},
    controller: null,
    recover: null,
  };
  entry.activeStreamThreadRef.current = threadId;
  runtime.entries.set(entry.key, entry);
  if (threadId === null && visible.activeThreadId === null)
    runtime.visibleDraftOwner = entry;
  runtime.disposeVisibleBridge ??= useAgentChatStore.subscribe(
    (next, previous) => {
      if (runtime.projecting) return;
      if (next.activeThreadId !== previous.activeThreadId) {
        if (
          runtime.visibleDraftOwner &&
          !runtime.visibleDraftOwner.activeStreamThreadRef.current
        )
          runtime.visibleDraftOwner = null;
        return;
      }
      const owner = next.activeThreadId
        ? runtime.entries.get(next.activeThreadId)
        : runtime.visibleDraftOwner;
      if (
        !owner ||
        !isCurrentAgentStreamEntry(owner) ||
        (!owner.isAwaitingRunIdRef.current &&
          (!next.activeRunId ||
            next.activeRunId !==
              (owner.activeStreamRunIdRef.current ??
                owner.presentation.getState().activeRunId))) ||
        next.activeRunStatus === 'idle'
      )
        return;
      const patch: Partial<AgentChatStore> = {};
      if (
        owner.terminalAt === null &&
        next.pendingInputRequest !== previous.pendingInputRequest
      )
        patch.pendingInputRequest = next.pendingInputRequest;
      if (next.messages !== previous.messages) patch.messages = next.messages;
      if (next.messagesCursor !== previous.messagesCursor)
        patch.messagesCursor = next.messagesCursor;
      if (next.hasMoreMessages !== previous.hasMoreMessages)
        patch.hasMoreMessages = next.hasMoreMessages;
      if (
        owner.terminalAt === null &&
        next.activeRunStatus !== previous.activeRunStatus
      )
        patch.activeRunStatus = next.activeRunStatus;
      if (
        owner.terminalAt === null &&
        next.stream.pendingUiActions !== previous.stream.pendingUiActions
      )
        patch.stream = {
          ...owner.presentation.getState().stream,
          pendingUiActions: next.stream.pendingUiActions,
        };
      if (Object.keys(patch).length) owner.presentation.setState(patch);
    },
  );
  // Only named conversation fields are projected; private store actions never
  // replace global actions, navigation, persisted settings or sidebar state.
  entry.disposeProjection = presentation.subscribe((next, previous) => {
    if (
      next.stream !== previous.stream ||
      next.messages !== previous.messages ||
      next.messagesCursor !== previous.messagesCursor ||
      next.hasMoreMessages !== previous.hasMoreMessages ||
      next.workEvents !== previous.workEvents ||
      next.pendingInputRequest !== previous.pendingInputRequest ||
      next.activeRunId !== previous.activeRunId ||
      next.activeRunStatus !== previous.activeRunStatus ||
      next.error !== previous.error ||
      next.runStartedAt !== previous.runStartedAt
    ) {
      projectAgentStreamEntry(entry);
    }
  });
  return entry;
}
export function bindAgentStreamEntry(
  entry: AgentStreamEntry,
  threadId: string,
) {
  if (!isCurrentAgentStreamEntry(entry)) return false;
  const existing = runtime.entries.get(threadId);
  if (existing && existing !== entry) {
    if (existing.createdAt >= entry.createdAt) {
      disposeAgentStreamEntry(entry);
      return false;
    }
    disposeAgentStreamEntry(existing);
  }
  runtime.entries.delete(entry.key);
  entry.key = threadId;
  entry.activeStreamThreadRef.current = threadId;
  runtime.entries.set(threadId, entry);
  return true;
}
export function settleAgentStreamEntry(entry: AgentStreamEntry) {
  releaseProvisionalReceipt(entry);
  if (!isCurrentAgentStreamEntry(entry)) return;
  if (entry.completionTimeoutRef.current)
    clearTimeout(entry.completionTimeoutRef.current);
  entry.completionTimeoutRef.current = null;
  entry.pendingCompletionRef.current = null;
  entry.bufferedEventsRef.current = [];
  entry.handlers.clear();
  entry.presentation.disposeStreamTokens();
  entry.terminalAt = Date.now();
  pruneTerminalEntries();
}
export function disposeAgentStreamEntry(entry: AgentStreamEntry) {
  releaseProvisionalReceipt(entry);
  entry.ownerGeneration += 1;
  entry.abortRef.current?.abort();
  runtime.entries.delete(entry.key);
  if (entry.completionTimeoutRef.current)
    clearTimeout(entry.completionTimeoutRef.current);
  entry.completionTimeoutRef.current = null;
  entry.pendingCompletionRef.current = null;
  entry.bufferedEventsRef.current = [];
  entry.handlers.clear();
  entry.presentation.disposeStreamTokens();
  entry.disposeProjection();
}
function deliver(event: string, payload: unknown) {
  runtime.ensureVisibleEntry?.();
  const data = payload as {
    threadId?: string;
    runId?: string;
    clientRequestId?: string;
  };
  const entries = [...runtime.entries.values()];
  if (
    event !== 'agent:turn_accepted' &&
    data.threadId &&
    !runtime.entries.has(data.threadId) &&
    entries.some(
      (entry) =>
        entry.terminalAt === null && !entry.activeStreamThreadRef.current,
    )
  ) {
    provisionalEvents.add(
      event,
      payload,
      protectedProvisionalKeys(),
      runtime.nextEntryId,
    );
  }
  for (const entry of entries) {
    if (!entry.activeStreamThreadRef.current) {
      if (event === 'agent:turn_accepted') {
        if (
          data.clientRequestId !== entry.clientRequestId ||
          !data.threadId ||
          !data.runId ||
          entry.terminalAt !== null
        )
          continue;
        const receipt = provisionalReceipts.get(entry);
        if (
          receipt &&
          (receipt.threadId !== data.threadId || receipt.runId !== data.runId)
        )
          continue;
        if (!receipt)
          provisionalReceipts.set(entry, {
            threadId: data.threadId,
            runId: data.runId,
          });
      } else {
        const receipt = provisionalReceipts.get(entry);
        if (
          receipt &&
          receipt.threadId === data.threadId &&
          !isForeignRunEvent(data.runId, receipt.runId)
        ) {
          entry.hasProgress = true;
          entry.revision += 1;
          entry.presentation.setState((state) => ({
            stream: { ...state.stream, acceptedReceipt: undefined },
          }));
        }
        continue;
      }
    }
    if (
      entry.terminalAt !== null ||
      (entry.activeStreamThreadRef.current &&
        entry.activeStreamThreadRef.current !== data.threadId)
    )
      continue;
    const handler = entry.handlers.get(event);
    if (!handler) continue;
    if (
      event !== 'agent:turn_accepted' &&
      !isForeignRunEvent(
        data.runId,
        entry.activeStreamRunIdRef.current ??
          entry.presentation.getState().stream.acceptedReceipt?.runId ??
          null,
      )
    ) {
      if (
        !entry.activeStreamRunIdRef.current ||
        !data.runId ||
        data.runId === entry.activeStreamRunIdRef.current
      ) {
        entry.hasProgress = true;
        entry.presentation.setState((state) =>
          state.stream.acceptedReceipt
            ? { stream: { ...state.stream, acceptedReceipt: undefined } }
            : state,
        );
      }
      entry.revision += 1;
    }
    handler(payload);
  }
}
function bindPhysical(event: string) {
  if (!runtime.transport || runtime.physical.has(event)) return;
  runtime.physical.set(
    event,
    runtime.transport(event, (payload) => deliver(event, payload)),
  );
}
export function bindAgentStreamTransport(
  subscribe: NonNullable<typeof runtime.transport>,
  managerIdentity: unknown = subscribe,
) {
  if (runtime.managerIdentity === managerIdentity) return;
  runtime.managerIdentity = managerIdentity;
  for (const unsubscribe of runtime.physical.values()) unsubscribe();
  runtime.physical.clear();
  runtime.transport = subscribe;
  for (const entry of runtime.entries.values())
    for (const event of entry.handlers.keys()) bindPhysical(event);
}
export function subscribeAgentStreamEntry<T>(
  entry: AgentStreamEntry,
  event: string,
  handler: (payload: T) => void,
) {
  const listener = (payload: unknown) => {
    if (isCurrentAgentStreamEntry(entry) && entry.terminalAt === null)
      handler(payload as T);
  };
  entry.handlers.set(event, listener);
  bindPhysical(event);
  return () => {
    if (entry.handlers.get(event) === listener) entry.handlers.delete(event);
  };
}
export function resetAgentStreamRuntime() {
  provisionalReceipts.clear();
  provisionalEvents.reset();
  for (const entry of [...runtime.entries.values()])
    disposeAgentStreamEntry(entry);
  for (const unsubscribe of runtime.physical.values()) unsubscribe();
  runtime.physical.clear();
  runtime.transport = null;
  runtime.managerIdentity = null;
  runtime.visibleDraftOwner = null;
  runtime.ensureVisibleEntry = null;
  runtime.disposeVisibleBridge?.();
  runtime.disposeVisibleBridge = null;
  Object.assign(runtime, blankRuntime());
}

/** Guard both identity and event revision across hydration awaits. */
export function captureAgentStreamHydration(threadId: string) {
  const entry = findAgentStreamEntry(threadId);
  const generation = entry?.ownerGeneration;
  const revision = entry?.revision;
  return (snapshot?: AgentThreadSnapshot | null) => {
    const current = findAgentStreamEntry(threadId);
    if (
      current?.terminalAt !== null &&
      current &&
      snapshot?.activeRun &&
      mapSnapshotRunStatus(snapshot.activeRun.status) === 'running'
    ) {
      const retained = current.presentation.getState();
      if (snapshot.activeRun.runId === retained.activeRunId) return false;
      if (
        snapshot.activeRun.startedAt &&
        retained.runStartedAt &&
        Date.parse(snapshot.activeRun.startedAt) <=
          Date.parse(retained.runStartedAt)
      )
        return false;
    }
    return (
      current === entry &&
      current?.ownerGeneration === generation &&
      current?.revision === revision
    );
  };
}
