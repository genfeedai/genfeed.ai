import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createMajorGcLogListener,
  EventLoopLagSampler,
  eventLoopLagSampler,
  type MajorGcRecord,
  scheduleHeapBaselineLog,
} from './wide-event.event-loop';
import type { WideEventRecord } from './wide-event.interface';
import { finishWideEvent, startWideEvent } from './wide-event.lifecycle';

describe('EventLoopLagSampler', () => {
  it('reports the largest probe delay since a moment, rounded', () => {
    const sampler = new EventLoopLagSampler();
    sampler.record(1_000, 4);
    sampler.record(1_050, 1_220.6);
    sampler.record(1_100, 3);

    expect(sampler.maxLagSince(1_000)).toBe(1_221);
    expect(sampler.maxLagSince(1_060)).toBe(3);
  });

  it('has no reading before any probe ran in the window', () => {
    const sampler = new EventLoopLagSampler();
    sampler.record(1_000, 900);

    expect(sampler.maxLagSince(2_000)).toBeUndefined();
    expect(new EventLoopLagSampler().maxLagSince(0)).toBeUndefined();
  });

  it('forgets probes older than thirty seconds', () => {
    const sampler = new EventLoopLagSampler();
    sampler.record(0, 800);
    sampler.record(31_000, 2);

    expect(sampler.maxLagSince(0)).toBe(2);
  });
});

describe('EventLoopLagSampler garbage-collection pauses', () => {
  afterEach(() => eventLoopLagSampler.stop());

  it('reports the longest pause that began in the window, rounded', () => {
    const sampler = new EventLoopLagSampler();
    sampler.start();
    sampler.recordGcPause(1_000, 12.4);
    sampler.recordGcPause(1_200, 310.6);
    sampler.recordGcPause(1_500, 4);

    expect(sampler.maxGcPauseSince(1_000)).toBe(311);
    expect(sampler.maxGcPauseSince(1_300)).toBe(4);
    expect(sampler.maxGcPauseSince(2_000)).toBe(0);
    sampler.stop();
  });

  it('has no reading while the sampler is not running', () => {
    const sampler = new EventLoopLagSampler();
    sampler.recordGcPause(1_000, 300);

    expect(sampler.maxGcPauseSince(0)).toBeUndefined();
  });

  it('forgets pauses older than thirty seconds', () => {
    const sampler = new EventLoopLagSampler();
    sampler.start();
    sampler.recordGcPause(0, 800);
    sampler.recordGcPause(31_000, 2);

    expect(sampler.maxGcPauseSince(0)).toBe(2);
    sampler.stop();
  });
});

describe('finishWideEvent event-loop reading', () => {
  afterEach(() => eventLoopLagSampler.stop());

  function run(): WideEventRecord {
    const emitted: WideEventRecord[] = [];
    const started = startWideEvent({
      identity: { service: 'api' },
      kind: 'http',
      requestId: 'req-1',
      trace: { spanId: 'span-1', traceId: 'trace-1' },
    });
    eventLoopLagSampler.record(started.startedAt + 1, 640);
    finishWideEvent({ wideEvent: (event) => emitted.push(event) }, started, {
      status_code: 500,
    });
    return emitted[0];
  }

  it('stamps the largest delay seen while the request ran', () => {
    expect(run().runtime).toMatchObject({ event_loop_lag_max_ms: 640 });
  });

  it('stamps the longest collection pause while the request ran', () => {
    eventLoopLagSampler.start();
    const emitted: WideEventRecord[] = [];
    const started = startWideEvent({
      identity: { service: 'api' },
      kind: 'http',
      requestId: 'req-2',
      trace: { spanId: 'span-2', traceId: 'trace-2' },
    });
    eventLoopLagSampler.recordGcPause(started.startedAt + 1, 420);
    eventLoopLagSampler.record(started.startedAt + 1, 430);
    finishWideEvent({ wideEvent: (event) => emitted.push(event) }, started, {
      status_code: 500,
    });

    expect(emitted[0].runtime).toMatchObject({
      event_loop_lag_max_ms: 430,
      gc_pause_max_ms: 420,
    });
  });

  it('stamps how long the request overlapped a full collection that began before it', () => {
    eventLoopLagSampler.start();
    const emitted: WideEventRecord[] = [];
    const started = startWideEvent({
      identity: { service: 'api' },
      kind: 'http',
      requestId: 'req-3',
      trace: { spanId: 'span-3', traceId: 'trace-3' },
    });
    started.startedAt -= 500;
    eventLoopLagSampler.recordGc('incremental', started.startedAt - 400, 5);
    eventLoopLagSampler.recordGc('major', started.startedAt + 100, 20);
    finishWideEvent({ wideEvent: (event) => emitted.push(event) }, started, {
      status_code: 500,
    });

    expect(emitted[0].runtime).toMatchObject({ gc_major_overlap_ms: 120 });
  });
});

describe('EventLoopLagSampler full collections', () => {
  function startSampler(records: MajorGcRecord[] = []): EventLoopLagSampler {
    const sampler = new EventLoopLagSampler();
    sampler.start((record) => records.push(record));
    return sampler;
  }

  it('measures the stall from the start of marking to the end of the final pause', () => {
    const records: MajorGcRecord[] = [];
    const sampler = startSampler(records);
    sampler.recordGc('incremental', 1_000, 9);
    sampler.recordGc('minor' as never, 1_400, 3);
    sampler.recordGc('major', 2_090, 17);
    sampler.stop();

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      finalPauseMs: 17,
      sinceLastMajorSec: undefined,
      stallMs: 1_107,
    });
    expect(records[0].heapUsedMb).toBeGreaterThan(0);
  });

  it('uses the final pause alone when marking was not incremental', () => {
    const records: MajorGcRecord[] = [];
    const sampler = startSampler(records);
    sampler.recordGc('major', 5_000, 80);
    sampler.stop();

    expect(records[0]).toMatchObject({ finalPauseMs: 80, stallMs: 80 });
  });

  it('reports the seconds since the previous full collection', () => {
    const records: MajorGcRecord[] = [];
    const sampler = startSampler(records);
    sampler.recordGc('major', 1_000, 100);
    sampler.recordGc('incremental', 61_000, 5);
    sampler.recordGc('major', 61_500, 20);
    sampler.stop();

    expect(records[1].sinceLastMajorSec).toBe(60);
    expect(records[1].stallMs).toBe(520);
  });

  it('counts the part of a request that overlapped a collection that began before it', () => {
    const sampler = startSampler();
    sampler.recordGc('incremental', 1_000, 5);
    sampler.recordGc('major', 2_000, 20);

    expect(sampler.majorGcOverlapMsSince(1_500, 3_000)).toBe(520);
    expect(sampler.majorGcOverlapMsSince(2_100, 3_000)).toBe(0);
    expect(sampler.majorGcOverlapMsSince(0, 1_200)).toBe(200);
    sampler.stop();
  });

  it('counts a collection that is still marking up to the end of the request', () => {
    const sampler = startSampler();
    sampler.recordGc('incremental', 1_000, 5);

    expect(sampler.majorGcOverlapMsSince(900, 1_800)).toBe(800);
    sampler.stop();
  });

  it('has no overlap reading while the sampler is not running', () => {
    const sampler = new EventLoopLagSampler();
    sampler.recordGc('major', 1_000, 100);

    expect(sampler.majorGcOverlapMsSince(0, 2_000)).toBeUndefined();
  });

  it('keeps counting pauses from every collection kind in gc_pause_max_ms', () => {
    const sampler = startSampler();
    sampler.recordGc('incremental', 1_000, 9);
    sampler.recordGc('major', 2_000, 17);

    expect(sampler.maxGcPauseSince(0)).toBe(17);
    sampler.stop();
  });

  it('survives a listener that throws', () => {
    const sampler = new EventLoopLagSampler();
    sampler.start(() => {
      throw new Error('sink down');
    });

    expect(() => sampler.recordGc('major', 1_000, 10)).not.toThrow();
    expect(sampler.majorGcOverlapMsSince(0, 2_000)).toBe(10);
    sampler.stop();
  });
});

describe('garbage collection log lines', () => {
  it('writes one structured line per full collection', () => {
    const lines: Array<{ message: string; context: Record<string, unknown> }> =
      [];
    const listener = createMajorGcLogListener({
      log: (message, context) => lines.push({ context, message }),
    });
    listener({
      finalPauseMs: 17,
      heapUsedMb: 571,
      sinceLastMajorSec: 42,
      stallMs: 1_107,
    });

    expect(lines).toEqual([
      {
        context: {
          final_pause_ms: 17,
          heap_used_mb: 571,
          since_last_major_s: 42,
          stall_ms: 1_107,
          type: 'gc_major',
        },
        message: 'Full garbage collection',
      },
    ]);
  });

  it('logs the live heap once after the delay', () => {
    vi.useFakeTimers();
    try {
      const lines: Array<Record<string, unknown>> = [];
      scheduleHeapBaselineLog(
        { log: (_m, context) => lines.push(context) },
        60_000,
      );

      vi.advanceTimersByTime(59_999);
      expect(lines).toHaveLength(0);
      vi.advanceTimersByTime(1);
      expect(lines).toHaveLength(1);
      expect(lines[0].type).toBe('heap_baseline');
      expect(lines[0].heap_used_mb).toBeGreaterThan(0);
      vi.advanceTimersByTime(120_000);
      expect(lines).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
