import { PerformanceObserver, performance } from 'node:perf_hooks';

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

/**
 * Remembers how late each probe ran in the last few seconds, so a request that
 * took a second can say whether the process was blocked while it waited. A
 * slow span that is fast everywhere else (a cache read, a query) is the sign
 * of a blocked loop rather than a slow dependency.
 */
export class EventLoopLagSampler {
  private samples: EventLoopLagSample[] = [];
  private gcPauses: GcPauseSample[] = [];
  private timer?: ReturnType<typeof setInterval>;
  private gcObserver?: PerformanceObserver;

  /** Starts probing. Calling it again while running does nothing. */
  start(): void {
    if (this.timer) return;
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
  }

  get isRunning(): boolean {
    return this.timer !== undefined;
  }

  /** Garbage collection stops the loop too; keep each pause beside the probes. */
  private observeGcPauses(): void {
    try {
      this.gcObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.recordGcPause(entry.startTime, entry.duration);
        }
      });
      this.gcObserver.observe({ entryTypes: ['gc'] });
    } catch {
      // A runtime without the gc entry type still gets the lag reading.
      this.gcObserver = undefined;
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
    let max = 0;
    for (let index = this.gcPauses.length - 1; index >= 0; index -= 1) {
      const pause = this.gcPauses[index];
      if (pause.at < since) break;
      if (pause.pauseMs > max) max = pause.pauseMs;
    }
    return Math.round(max);
  }
}

/** The one sampler a service runs; wide events read from it. */
export const eventLoopLagSampler = new EventLoopLagSampler();
