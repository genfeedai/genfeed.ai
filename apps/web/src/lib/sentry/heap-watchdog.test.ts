import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const captureMessage = vi.hoisted(() => vi.fn());

vi.mock('@sentry/nextjs', () => ({ captureMessage }));
vi.mock('@genfeedai/agent', () => ({
  useAgentChatStore: {
    getState: () => ({
      messages: new Array(3),
      threads: new Array(2),
      workEvents: new Array(5),
    }),
  },
}));
vi.mock('@genfeedai/workflows/ui/stores', () => ({
  useWorkflowStore: Object.assign(
    { getState: () => ({ edges: new Array(4), nodes: new Array(7) }) },
    { temporal: { getState: () => ({ pastStates: new Array(9) }) } },
  ),
}));

import { startHeapWatchdog } from './heap-watchdog';

const MIB = 1024 * 1024;

function setHeapMiB(heapMiB: number | null): void {
  Object.defineProperty(performance, 'memory', {
    configurable: true,
    value:
      heapMiB === null
        ? undefined
        : { jsHeapSizeLimit: 4096 * MIB, usedJSHeapSize: heapMiB * MIB },
  });
}

describe('startHeapWatchdog', () => {
  beforeEach(() => {
    captureMessage.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    setHeapMiB(null);
  });

  it('stays silent while the heap is below the first threshold', async () => {
    setHeapMiB(300);
    const stop = startHeapWatchdog();

    await vi.advanceTimersByTimeAsync(60_000);

    expect(captureMessage).not.toHaveBeenCalled();
    stop();
  });

  it('reports the heap, the store sizes and the heap history once per threshold', async () => {
    setHeapMiB(300);
    const stop = startHeapWatchdog();
    await vi.advanceTimersByTimeAsync(10_000);

    setHeapMiB(900);
    await vi.advanceTimersByTimeAsync(5_000);
    await vi.advanceTimersByTimeAsync(30_000);

    expect(captureMessage).toHaveBeenCalledTimes(1);
    const [message, context] = captureMessage.mock.calls[0];
    expect(message).toBe('Renderer heap above 768 MiB');
    expect(context.level).toBe('warning');
    expect(context.extra).toMatchObject({
      heapLimitMiB: 4096,
      heapMiB: 900,
      stores: {
        agentMessages: 3,
        agentThreads: 2,
        agentWorkEvents: 5,
        workflowEdges: 4,
        workflowNodes: 7,
        workflowUndoSteps: 9,
      },
      threshold: 768,
    });
    expect(
      context.extra.history.map(
        (sample: { heapMiB: number }) => sample.heapMiB,
      ),
    ).toEqual([300, 300, 900]);

    setHeapMiB(1700);
    await vi.advanceTimersByTimeAsync(5_000);

    expect(captureMessage).toHaveBeenCalledTimes(2);
    expect(captureMessage.mock.calls[1][0]).toBe(
      'Renderer heap above 1536 MiB',
    );
    stop();
  });

  it('reports only the highest threshold when the heap jumps past several', async () => {
    setHeapMiB(3000);
    const stop = startHeapWatchdog();

    await vi.advanceTimersByTimeAsync(5_000);

    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage.mock.calls[0][0]).toBe(
      'Renderer heap above 2560 MiB',
    );
    stop();
  });

  it('does nothing where the browser does not expose heap size', async () => {
    setHeapMiB(null);
    const stop = startHeapWatchdog();

    await vi.advanceTimersByTimeAsync(60_000);

    expect(captureMessage).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    stop();
  });
});
