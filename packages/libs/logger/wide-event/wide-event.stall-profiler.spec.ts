import { performance } from 'node:perf_hooks';
import { describe, expect, it, vi } from 'vitest';
import {
  type CpuProfile,
  EventLoopStallProfiler,
  findBlockedLoop,
} from './wide-event.stall-profiler';

function frame(id: number, functionName: string, children: number[] = []) {
  return {
    callFrame: {
      columnNumber: 0,
      functionName,
      lineNumber: id,
      url: functionName.startsWith('(') ? '' : 'file:///app/main.js',
    },
    children,
    id,
  };
}

/** Samples are 5 ms apart; `ids` lists the node each one landed on. */
function profileOf(ids: number[]): CpuProfile {
  return {
    nodes: [
      frame(1, '(root)', [2, 3]),
      frame(2, '(idle)'),
      frame(3, 'handleRequest', [4, 5]),
      frame(4, 'serializeArticles'),
      frame(5, 'formatLogLine'),
    ],
    samples: ids,
    timeDeltas: ids.map(() => 5_000),
  };
}

const repeat = (id: number, times: number): number[] =>
  Array.from({ length: times }, () => id);

describe('findBlockedLoop', () => {
  it('names the frames that filled the longest stretch without idle time', () => {
    const profile = profileOf([
      ...repeat(2, 20),
      ...repeat(4, 60),
      ...repeat(5, 20),
      ...repeat(2, 20),
      ...repeat(4, 10),
      ...repeat(2, 20),
    ]);

    const report = findBlockedLoop(profile);

    expect(report).toMatchObject({ blockedMs: 400, startedAtMs: 105 });
    expect(report?.topSelf[0]).toEqual({
      frame: 'serializeArticles file:///app/main.js:5',
      ms: 300,
    });
    expect(report?.topStacks[0]).toEqual({
      ms: 300,
      stack: [
        'serializeArticles file:///app/main.js:5',
        'handleRequest file:///app/main.js:4',
      ],
    });
  });

  it('keeps a stretch together across a short idle gap', () => {
    const profile = profileOf([
      ...repeat(4, 30),
      ...repeat(2, 1),
      ...repeat(4, 30),
      ...repeat(2, 40),
    ]);

    expect(findBlockedLoop(profile)?.blockedMs).toBeGreaterThanOrEqual(300);
  });

  it('reports nothing when the loop kept going idle', () => {
    const profile = profileOf(
      Array.from({ length: 200 }, (_, index) => (index % 5 === 0 ? 4 : 2)),
    );

    expect(findBlockedLoop(profile)).toBeUndefined();
  });

  it('reports nothing for a stretch under the threshold', () => {
    const profile = profileOf([...repeat(2, 40), ...repeat(4, 20)]);

    expect(findBlockedLoop(profile)).toBeUndefined();
  });

  it('copes with a profile that has no samples', () => {
    expect(findBlockedLoop({ nodes: [] })).toBeUndefined();
  });
});

function blockTheLoopForStallProfilerSpec(ms: number): void {
  const until = performance.now() + ms;
  let spin = 0;
  while (performance.now() < until) spin += 1;
  if (spin < 0) throw new Error('unreachable');
}

describe('EventLoopStallProfiler', () => {
  it('reports the function that blocked the real event loop', async () => {
    const profiler = new EventLoopStallProfiler(200);
    const reports: Array<ReturnType<typeof findBlockedLoop>> = [];
    profiler.start((report) => reports.push(report));
    try {
      blockTheLoopForStallProfilerSpec(500);
      await new Promise((resolve) => setImmediate(resolve));
      await vi.waitFor(() => expect(reports.length).toBeGreaterThan(0), {
        timeout: 5_000,
      });
    } finally {
      profiler.stop();
    }

    expect(reports[0]?.blockedMs).toBeGreaterThanOrEqual(400);
    expect(
      reports[0]?.topStacks[0]?.stack[0]?.includes(
        'blockTheLoopForStallProfilerSpec',
      ),
    ).toBe(true);
  });
});
