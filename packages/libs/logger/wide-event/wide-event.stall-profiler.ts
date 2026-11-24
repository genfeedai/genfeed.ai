import { Session } from 'node:inspector';

/** How often V8 samples the stack. A 250 ms block still yields 50 samples. */
const SAMPLING_INTERVAL_MICROSECONDS = 5_000;

/** The profile is read and restarted this often; one window is one report. */
const PROFILE_WINDOW_MS = 15_000;

/** A busy stretch shorter than this is ordinary work, not a stall. */
const MIN_BLOCKED_MS = 250;

/** Idle gaps up to this long inside a busy stretch do not end it. */
const MAX_IDLE_GAP_MS = 10;

const TOP_FRAMES = 8;
const TOP_STACKS = 5;
const STACK_DEPTH = 6;

const IDLE_FRAME = '(idle)';
const ROOT_FRAME = '(root)';

interface CpuProfileCallFrame {
  functionName: string;
  url: string;
  lineNumber: number;
  columnNumber: number;
}

interface CpuProfileNode {
  id: number;
  callFrame: CpuProfileCallFrame;
  children?: number[];
}

/** The `Profiler.stop` payload: a call tree plus one node id per sample. */
export interface CpuProfile {
  nodes: CpuProfileNode[];
  samples?: number[];
  timeDeltas?: number[];
}

export interface StallFrameShare {
  frame: string;
  ms: number;
}

export interface StallStackShare {
  /** The innermost frame first, then its callers. */
  stack: string[];
  ms: number;
}

/** What ran while the event loop was blocked for `blockedMs`. */
export interface BlockedLoopReport {
  blockedMs: number;
  /** Where the blocked stretch began, in ms after the profile window opened. */
  startedAtMs: number;
  /** Frames with the most own time, which is where the CPU was spent. */
  topSelf: StallFrameShare[];
  /** The call paths that held the loop longest, which name who asked for it. */
  topStacks: StallStackShare[];
}

function describeFrame(frame: CpuProfileCallFrame): string {
  const name = frame.functionName || '(anonymous)';
  return frame.url ? `${name} ${frame.url}:${frame.lineNumber + 1}` : name;
}

function rankStacks(totals: Map<string, number>): StallStackShare[] {
  return [...totals.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, TOP_STACKS)
    .map(([stack, micros]) => ({
      ms: Math.round(micros / 1000),
      stack: stack.split('\n'),
    }));
}

function rank(totals: Map<string, number>): StallFrameShare[] {
  return [...totals.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, TOP_FRAMES)
    .map(([frame, micros]) => ({ frame, ms: Math.round(micros / 1000) }));
}

/**
 * Finds the longest stretch of one profile window in which the loop never
 * went idle, and says which frames filled it. A request that waits behind the
 * stretch cannot say what it waited for; this can.
 */
export function findBlockedLoop(
  profile: CpuProfile,
  minBlockedMs = MIN_BLOCKED_MS,
): BlockedLoopReport | undefined {
  const { samples, timeDeltas } = profile;
  if (!samples || !timeDeltas || samples.length === 0) return undefined;

  const nodes = new Map<number, CpuProfileNode>();
  const parents = new Map<number, number>();
  for (const node of profile.nodes) {
    nodes.set(node.id, node);
    for (const child of node.children ?? []) parents.set(child, node.id);
  }
  const isIdle = (nodeId: number): boolean =>
    nodes.get(nodeId)?.callFrame.functionName === IDLE_FRAME;

  // Sample i covers the time until sample i + 1.
  const durationOf = (index: number): number => timeDeltas[index + 1] ?? 0;

  let best = { endIndex: 0, micros: 0, startIndex: -1 };
  let runStart = -1;
  let runMicros = 0;
  let idleMicros = 0;
  let lastBusy = -1;
  const closeRun = () => {
    if (runStart >= 0 && runMicros > best.micros) {
      best = { endIndex: lastBusy, micros: runMicros, startIndex: runStart };
    }
    runStart = -1;
    runMicros = 0;
    idleMicros = 0;
  };

  for (let index = 0; index < samples.length; index += 1) {
    const duration = durationOf(index);
    if (isIdle(samples[index])) {
      if (runStart < 0) continue;
      idleMicros += duration;
      if (idleMicros > MAX_IDLE_GAP_MS * 1000) closeRun();
      continue;
    }
    if (runStart < 0) runStart = index;
    // A short idle gap inside a stretch is part of it.
    runMicros += idleMicros + duration;
    idleMicros = 0;
    lastBusy = index;
  }
  closeRun();

  if (best.startIndex < 0 || best.micros < minBlockedMs * 1000) {
    return undefined;
  }

  const self = new Map<string, number>();
  const stacks = new Map<string, number>();
  for (let index = best.startIndex; index <= best.endIndex; index += 1) {
    const duration = durationOf(index);
    if (isIdle(samples[index])) continue;
    const chain: string[] = [];
    let nodeId: number | undefined = samples[index];
    while (nodeId !== undefined && chain.length < STACK_DEPTH) {
      const node = nodes.get(nodeId);
      if (!node) break;
      if (node.callFrame.functionName !== ROOT_FRAME) {
        chain.push(describeFrame(node.callFrame));
      }
      nodeId = parents.get(nodeId);
    }
    if (chain.length === 0) continue;
    self.set(chain[0], (self.get(chain[0]) ?? 0) + duration);
    const key = chain.join('\n');
    stacks.set(key, (stacks.get(key) ?? 0) + duration);
  }

  let startedAtMicros = 0;
  for (let index = 0; index <= best.startIndex; index += 1) {
    startedAtMicros += timeDeltas[index] ?? 0;
  }

  return {
    blockedMs: Math.round(best.micros / 1000),
    startedAtMs: Math.round(startedAtMicros / 1000),
    topSelf: rank(self),
    topStacks: rankStacks(stacks),
  };
}

/**
 * Samples the main thread's stack all the time and, once per window, reports
 * the longest stretch in which the loop never went idle. V8's sampler runs on
 * its own thread, so it sees a stall the loop itself cannot report. Reading
 * the profile costs a few milliseconds once per window.
 */
export class EventLoopStallProfiler {
  private session?: Session;
  private timer?: ReturnType<typeof setInterval>;

  constructor(private readonly windowMs = PROFILE_WINDOW_MS) {}

  /** Starts sampling; calling it again while running does nothing. */
  start(onBlocked: (report: BlockedLoopReport) => void): void {
    if (this.session) return;
    try {
      const session = new Session();
      session.connect();
      session.post('Profiler.enable');
      session.post('Profiler.setSamplingInterval', {
        interval: SAMPLING_INTERVAL_MICROSECONDS,
      });
      session.post('Profiler.start');
      this.session = session;
    } catch {
      // A runtime without the inspector still serves requests.
      this.stop();
      return;
    }

    this.timer = setInterval(() => this.readWindow(onBlocked), this.windowMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    try {
      this.session?.post('Profiler.stop');
      this.session?.disconnect();
    } catch {
      // Already disconnected.
    }
    this.session = undefined;
  }

  private readWindow(onBlocked: (report: BlockedLoopReport) => void): void {
    const session = this.session;
    if (!session) return;
    session.post('Profiler.stop', (error, result) => {
      // Restart first, so the blind spot is the length of this callback.
      try {
        session.post('Profiler.start');
      } catch {
        this.stop();
        return;
      }
      if (error || !result) return;
      try {
        const report = findBlockedLoop(result.profile as CpuProfile);
        if (report) onBlocked(report);
      } catch {
        // Diagnostics must never break the process they describe.
      }
    });
  }
}

/** The one profiler the API runs. */
export const eventLoopStallProfiler = new EventLoopStallProfiler();
