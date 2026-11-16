import { ScheduledPublishWorkflowProcessor } from '@workers/processors/api/collections/workflows/services/scheduled-publish-workflow.processor';
import { WorkflowExecutionProcessor } from '@workers/processors/api/collections/workflows/services/workflow-execution.processor';
import type { PublishGateDecision } from '@workers/services/publish-provider-gate.service';
import { DelayedError } from 'bullmq';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Ask = { jobId: string; provider: string };

describe('ScheduledPublishWorkflowProcessor', () => {
  let asked: Ask[];
  let released: Ask[];
  let delayedTo: number[];
  let ran: string[];
  let decision: PublishGateDecision;
  let isRunFailing: boolean;
  let processor: ScheduledPublishWorkflowProcessor;

  function jobFor(publishProvider: string | undefined) {
    return {
      data: {
        ...(publishProvider ? { publishProvider } : {}),
        type: 'system-run',
      },
      id: 'scheduled-post-op-1',
      moveToDelayed: async (timestamp: number) => {
        delayedTo.push(timestamp);
      },
    } as never;
  }

  beforeEach(() => {
    asked = [];
    released = [];
    delayedTo = [];
    ran = [];
    decision = { isAdmitted: true };
    isRunFailing = false;
    // The graph run is the base class's; only the gate around it is under test.
    vi.spyOn(
      WorkflowExecutionProcessor.prototype,
      'process',
    ).mockImplementation(async (job) => {
      ran.push(String(job.id));
      if (isRunFailing) throw new Error('publish failed');
      return 'published';
    });
    processor = new ScheduledPublishWorkflowProcessor(
      { log: () => undefined } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        admit: async (provider: string, jobId: string) => {
          asked.push({ jobId, provider });
          return decision;
        },
        release: async (provider: string, jobId: string) => {
          released.push({ jobId, provider });
        },
      } as never,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs the publish and frees the provider slot when the provider has room', async () => {
    const result = await processor.process(jobFor('twitter'), 'token');

    expect({ asked, ran, released, result }).toEqual({
      asked: [{ jobId: 'scheduled-post-op-1', provider: 'twitter' }],
      ran: ['scheduled-post-op-1'],
      released: [{ jobId: 'scheduled-post-op-1', provider: 'twitter' }],
      result: 'published',
    });
  });

  it('frees the provider slot when the publish throws', async () => {
    isRunFailing = true;

    await expect(processor.process(jobFor('twitter'), 'token')).rejects.toThrow(
      'publish failed',
    );

    expect(released).toEqual([
      { jobId: 'scheduled-post-op-1', provider: 'twitter' },
    ]);
  });

  it('puts a publish back to delayed without running it when its provider is at the ceiling', async () => {
    decision = {
      isAdmitted: false,
      reason: 'concurrency',
      retryAfterMs: 4_000,
    };
    const before = Date.now();

    await expect(
      processor.process(jobFor('youtube'), 'token'),
    ).rejects.toBeInstanceOf(DelayedError);

    expect({
      isDelayedAtLeastRetryAfter: delayedTo[0] >= before + 4_000,
      ran,
      released,
    }).toEqual({ isDelayedAtLeastRetryAfter: true, ran: [], released: [] });
  });

  it('limits a job queued before providers were recorded under one shared bucket', async () => {
    await processor.process(jobFor(undefined), 'token');

    expect(asked).toEqual([
      { jobId: 'scheduled-post-op-1', provider: 'unknown' },
    ]);
  });
});
