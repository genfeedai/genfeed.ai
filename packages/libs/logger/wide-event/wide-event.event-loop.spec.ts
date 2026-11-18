import { afterEach, describe, expect, it } from 'vitest';
import {
  EventLoopLagSampler,
  eventLoopLagSampler,
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
    expect(run().runtime).toEqual({ event_loop_lag_max_ms: 640 });
  });
});
