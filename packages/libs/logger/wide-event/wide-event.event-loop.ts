import { constants, PerformanceObserver, performance } from 'node:perf_hooks';
import { getHeapStatistics } from 'node:v8';

/** How often the loop is probed. A blocked loop delays the probe by the block. */
const EVENT_LOOP_TICK_MS = 50;

/** Longest request window a reading can cover; older probes are dropped. */
const EVENT_LOOP_RETAIN_MS = 30_000;

interface EventLoopLagSample {
  at: number;
  lagMs: number;
}

interface GcPauseSample {
  at: number;
  pauseMs: number;
}

/** Wall-clock span of one full collection, marking start to end of final pause. */
interface MajorGcWindow {
  start: number;
  end: number;
}

type GcKind = 'incremental' | 'major' | 'other';

/** One full garbage collection, as written to the log. */
export interface MajorGcRecord {
  /** Wall time from the start of incremental marking to the end of the final pause. */
  stallMs: number;
  /** Duration of the final pause alone, the only part `gc_pause_max_ms` sees. */
  finalPauseMs: number;
  /** Live heap right after the collection. */
  heapUsedMb: number;
  /** Seconds since the previous full collection; undefined for the first. */
  sinceLastMajorSec?: number;
}

export type MajorGcListener = (record: MajorGcRecord) => void;

/** Where the sampler writes its lines; the Nest `LoggerService` fits. */
export interface GcLogSink {
  log(message: string, context: Record<string, unknown>): void;
}

const BYTES_PER_MB = 1024 * 1024;

function readGcKind(entry: PerformanceEntry): GcKind {
  const detail = (entry as { detail?: { kind?: number } }).detail;
  if (detail?.kind === constants.NODE_PERFORMANCE_GC_MAJOR) return 'major';
  if (detail?.kind === constants.NODE_PERFORMANCE_GC_INCREMENTAL)
    return 'incremental';
  return 'other';
}

function readHeapUsedMb(): number {
  return Math.round(getHeapStatistics().used_heap_size / BYTES_PER_MB);
}

/** Writes one line per full collection, for `onMajorGc`. */
export function createMajorGcLogListener(sink: GcLogSink): MajorGcListener {
  return (record) => {
    sink.log('Full garbage collection', {
      final_pause_ms: record.finalPauseMs,
      heap_used_mb: record.heapUsedMb,
      since_last_major_s: record.sinceLastMajorSec,
      stall_ms: record.stallMs,
      type: 'gc_major',
    });
  };
}

/**
 * Logs the live heap once, `delayMs` after the call, so each release shows its
 * baseline. The timer does not keep the process alive.
 */
export function scheduleHeapBaselineLog(
  sink: GcLogSink,
  delayMs = 60_000,
): ReturnType<typeof setTimeout> {
  const timer = setTimeout(() => {
    sink.log('Heap baseline', {
      heap_used_mb: readHeapUsedMb(),
      type: 'heap_baseline',
    });
  }, delayMs);
  timer.unref();
  return timer;
}

/**
 * Remembers how late each probe ran in the last few seconds, so a request that
 * took a second can say whether the process was blocked while it waited. A
 * slow span that is fast everywhere else (a cache read, a query) is the sign
 * of a blocked loop rather than a slow dependency.
 */
export class EventLoopLagSampler {
  private samples: EventLoopLagSample[] = [];
  private gcPauses: GcPauseSample[] = [];
  private majorWindows: MajorGcWindow[] = [];
  /** Start of incremental marking whose final pause has not arrived yet. */
  private markingStartedAt?: number;
  private lastMajorEndedAt?: number;
  private onMajorGc?: MajorGcListener;
  private timer?: ReturnType<typeof setInterval>;
  private gcObserver?: PerformanceObserver;

  /**
   * Starts probing. Calling it again while running does nothing. `onMajorGc`
   * hears every full collection, not tied to any request.
   */
  start(onMajorGc?: MajorGcListener): void {
    if (this.timer) return;
    this.onMajorGc = onMajorGc;
    let expectedAt = performance.now() + EVENT_LOOP_TICK_MS;
    this.timer = setInterval(() => {
      const now = performance.now();
      this.record(now, Math.max(0, now - expectedAt));
      expectedAt = now + EVENT_LOOP_TICK_MS;
    }, EVENT_LOOP_TICK_MS);
    this.timer.unref();
    this.observeGcPauses();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.gcObserver?.disconnect();
    this.gcObserver = undefined;
    this.samples = [];
    this.gcPauses = [];
    this.majorWindows = [];
    this.markingStartedAt = undefined;
    this.lastMajorEndedAt = undefined;
    this.onMajorGc = undefined;
  }

  get isRunning(): boolean {
    return this.timer !== undefined;
  }

  /** Garbage collection stops the loop too; keep each pause beside the probes. */
  private observeGcPauses(): void {
    try {
      this.gcObserver = new PerformanceObserver((list) => {
        this.recordGcEntries(list.getEntries());
      });
      this.gcObserver.observe({ entryTypes: ['gc'] });
    } catch {
      // A runtime without the gc entry type still gets the lag reading.
      this.gcObserver = undefined;
    }
  }

  private recordGcEntries(entries: readonly PerformanceEntry[]): void {
    for (const entry of entries) {
      this.recordGc(readGcKind(entry), entry.startTime, entry.duration);
    }
  }

  /**
   * Entries reach the observer a tick late. Pull the ones already waiting so a
   * request that just ended sees the collection that ended with it.
   */
  private flushGcEntries(): void {
    if (!this.gcObserver) return;
    this.recordGcEntries(this.gcObserver.takeRecords());
  }

  /**
   * A full collection arrives as two entries: the start of incremental marking
   * and the final pause. The marking between them runs on the request thread
   * and is in neither, so the stall is measured from the first to the end of
   * the second.
   */
  recordGc(kind: GcKind, at: number, durationMs: number): void {
    this.recordGcPause(at, durationMs);
    if (kind === 'incremental') {
      this.markingStartedAt ??= at;
      return;
    }
    if (kind !== 'major') return;

    const end = at + durationMs;
    const start = Math.min(this.markingStartedAt ?? at, at);
    this.markingStartedAt = undefined;
    this.majorWindows.push({ end, start });
    const oldest = end - EVENT_LOOP_RETAIN_MS;
    this.majorWindows = this.majorWindows.filter(
      (window) => window.end >= oldest,
    );

    const sinceLastMajorSec =
      this.lastMajorEndedAt === undefined
        ? undefined
        : Math.round((start - this.lastMajorEndedAt) / 100) / 10;
    this.lastMajorEndedAt = end;
    try {
      this.onMajorGc?.({
        finalPauseMs: Math.round(durationMs),
        heapUsedMb: readHeapUsedMb(),
        sinceLastMajorSec,
        stallMs: Math.round(end - start),
      });
    } catch {
      // A failing log sink must not break the collection bookkeeping.
    }
  }

  recordGcPause(at: number, pauseMs: number): void {
    this.gcPauses.push({ at, pauseMs });
    const oldest = at - EVENT_LOOP_RETAIN_MS;
    let stale = 0;
    while (stale < this.gcPauses.length && this.gcPauses[stale].at < oldest) {
      stale += 1;
    }
    if (stale > 0) this.gcPauses.splice(0, stale);
  }

  record(at: number, lagMs: number): void {
    this.samples.push({ at, lagMs });
    const oldest = at - EVENT_LOOP_RETAIN_MS;
    let stale = 0;
    while (stale < this.samples.length && this.samples[stale].at < oldest) {
      stale += 1;
    }
    if (stale > 0) this.samples.splice(0, stale);
  }

  /**
   * Largest probe delay, in whole milliseconds, among probes that ran at or
   * after `since` (a `performance.now()` reading). Undefined while the sampler
   * is not running or holds no probe for that window.
   */
  maxLagSince(since: number): number | undefined {
    let max: number | undefined;
    for (let index = this.samples.length - 1; index >= 0; index -= 1) {
      const sample = this.samples[index];
      if (sample.at < since) break;
      if (max === undefined || sample.lagMs > max) max = sample.lagMs;
    }
    return max === undefined ? undefined : Math.round(max);
  }

  /**
   * Longest garbage-collection pause, in whole milliseconds, that began at or
   * after `since`. Zero when none ran in the window; undefined while the
   * sampler is not running. A slow request with high lag and a long pause was
   * waiting on the collector; high lag with no pause was waiting on code.
   */
  maxGcPauseSince(since: number): number | undefined {
    if (!this.timer || !this.gcObserver) return undefined;
    this.flushGcEntries();
    let max = 0;
    for (let index = this.gcPauses.length - 1; index >= 0; index -= 1) {
      const pause = this.gcPauses[index];
      if (pause.at < since) break;
      if (pause.pauseMs > max) max = pause.pauseMs;
    }
    return Math.round(max);
  }

  /**
   * Milliseconds of `[since, until]` that overlapped a full collection, from
   * the first marking step to the end of the final pause. Counts a collection
   * that began before `since`, which `maxGcPauseSince` misses, and one still
   * marking. Undefined while the sampler is not running.
   */
  majorGcOverlapMsSince(since: number, until: number): number | undefined {
    if (!this.timer || !this.gcObserver) return undefined;
    this.flushGcEntries();
    let overlap = 0;
    for (const window of this.majorWindows) {
      overlap += overlapMs(window.start, window.end, since, until);
    }
    if (this.markingStartedAt !== undefined) {
      overlap += overlapMs(this.markingStartedAt, until, since, until);
    }
    return Math.round(overlap);
  }
}

function overlapMs(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
): number {
  return Math.max(0, Math.min(endA, endB) - Math.max(startA, startB));
}

/** The one sampler a service runs; wide events read from it. */
export const eventLoopLagSampler = new EventLoopLagSampler();
