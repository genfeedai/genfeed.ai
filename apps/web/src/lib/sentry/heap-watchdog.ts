import * as Sentry from '@sentry/nextjs';

/**
 * A renderer that runs out of JavaScript memory dies with "Aw, Snap! Error code
 * 5" before it can report anything, so Sentry never sees the crash. This
 * samples the heap while the tab is alive and reports once per threshold on
 * the way up, with what was big at that moment, so the next crash names its
 * own cause.
 *
 * `performance.memory` exists in Chromium only; elsewhere this does nothing.
 */

const MIB = 1024 * 1024;
const SAMPLE_INTERVAL_MS = 5_000;
const HISTORY_LENGTH = 24;
const TOP_URLS = 8;
// A normal session sits well under 400 MiB. The crashes seen reached the
// 4 GiB limit within two to eighteen minutes, so each step leaves time to send.
const HEAP_THRESHOLDS_MIB = [768, 1536, 2560] as const;

interface ChromiumMemory {
  readonly jsHeapSizeLimit: number;
  readonly usedJSHeapSize: number;
}

interface HeapSample {
  /** Rising with the heap: the DOM is leaking. Flat: state in JS is. */
  readonly domNodes: number;
  readonly heapMiB: number;
  readonly secondsSinceStart: number;
}

interface HeapReport {
  readonly domNodes: number;
  readonly heapLimitMiB: number;
  readonly heapMiB: number;
  readonly history: readonly HeapSample[];
  readonly path: string;
  readonly replayStopped: boolean;
  readonly requestsInLastMinute: number;
  readonly resourceEntries: number;
  readonly stores: Record<string, number>;
  readonly threshold: number;
  readonly topRequests: readonly { count: number; url: string }[];
  readonly visibility: DocumentVisibilityState;
}

function readMemory(): ChromiumMemory | null {
  const memory = (performance as Performance & { memory?: ChromiumMemory })
    .memory;

  return memory && memory.usedJSHeapSize > 0 ? memory : null;
}

function toMiB(bytes: number): number {
  return Math.round(bytes / MIB);
}

/** Requests of the last minute grouped by origin + path, query dropped. */
function summarizeRecentRequests(now: number): {
  top: { count: number; url: string }[];
  total: number;
} {
  const counts = new Map<string, number>();
  let total = 0;

  for (const entry of performance.getEntriesByType('resource')) {
    if (entry.startTime < now - 60_000) {
      continue;
    }
    total += 1;
    const key = entry.name.split('?')[0].split('#')[0];
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const top = [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, TOP_URLS)
    .map(([url, count]) => ({ count, url }));

  return { top, total };
}

/**
 * Sizes of the long-lived client stores. Imported when a threshold is crossed,
 * so the watchdog adds nothing to the first bundle.
 */
async function readStoreSizes(): Promise<Record<string, number>> {
  const sizes: Record<string, number> = {};

  try {
    const { useAgentChatStore } = await import('@genfeedai/agent');
    const chat = useAgentChatStore.getState();
    sizes.agentMessages = chat.messages.length;
    sizes.agentThreads = chat.threads.length;
    sizes.agentWorkEvents = chat.workEvents.length;
  } catch {
    // The store is a hint, not the report.
  }

  try {
    const { useWorkflowStore } = await import('@genfeedai/workflows/ui/stores');
    const workflow = useWorkflowStore.getState();
    sizes.workflowNodes = workflow.nodes.length;
    sizes.workflowEdges = workflow.edges.length;
    sizes.workflowUndoSteps =
      useWorkflowStore.temporal.getState().pastStates.length;
  } catch {
    // The store is a hint, not the report.
  }

  return sizes;
}

/**
 * Error replay buffers every DOM mutation, and a tab that is already this
 * large cannot afford to keep recording. Reports whether it was running.
 */
function stopReplayRecording(): boolean {
  try {
    const replay = Sentry.getClient()?.getIntegrationByName<{
      stop(): Promise<void>;
    }>('Replay');
    if (!replay) {
      return false;
    }
    void replay.stop().catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}

async function buildReport(
  memory: ChromiumMemory,
  threshold: number,
  history: readonly HeapSample[],
  replayStopped: boolean,
): Promise<HeapReport> {
  const requests = summarizeRecentRequests(performance.now());

  return {
    domNodes: document.getElementsByTagName('*').length,
    heapLimitMiB: toMiB(memory.jsHeapSizeLimit),
    heapMiB: toMiB(memory.usedJSHeapSize),
    history,
    path: window.location.pathname,
    replayStopped,
    requestsInLastMinute: requests.total,
    resourceEntries: performance.getEntriesByType('resource').length,
    stores: await readStoreSizes(),
    threshold,
    topRequests: requests.top,
    visibility: document.visibilityState,
  };
}

/** Starts sampling; returns a function that stops it. */
export function startHeapWatchdog(): () => void {
  if (typeof window === 'undefined' || !readMemory()) {
    return () => undefined;
  }

  const startedAt = performance.now();
  const history: HeapSample[] = [];
  const reported = new Set<number>();

  const sample = () => {
    const memory = readMemory();
    if (!memory) {
      return;
    }

    history.push({
      domNodes: document.getElementsByTagName('*').length,
      heapMiB: toMiB(memory.usedJSHeapSize),
      secondsSinceStart: Math.round((performance.now() - startedAt) / 1000),
    });
    if (history.length > HISTORY_LENGTH) {
      history.shift();
    }

    const heapMiB = memory.usedJSHeapSize / MIB;
    const crossed = HEAP_THRESHOLDS_MIB.filter(
      (threshold) => heapMiB >= threshold && !reported.has(threshold),
    );
    if (crossed.length === 0) {
      return;
    }

    for (const threshold of crossed) {
      reported.add(threshold);
    }
    const threshold = crossed[crossed.length - 1];
    const replayStopped = stopReplayRecording();
    void buildReport(memory, threshold, [...history], replayStopped).then(
      (report) => {
        Sentry.captureMessage(`Renderer heap above ${threshold} MiB`, {
          extra: { ...report },
          fingerprint: ['renderer-heap-threshold', String(threshold)],
          level: 'warning',
          tags: { heap_threshold_mib: String(threshold) },
        });
      },
    );
  };

  const interval = window.setInterval(sample, SAMPLE_INTERVAL_MS);

  return () => window.clearInterval(interval);
}
