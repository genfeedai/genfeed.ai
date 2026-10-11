import {
  breakoutResponseExecutionJobId,
  enqueueDetectedBreakoutResponse,
  enqueueDetectedBreakoutResponseAfterCommit,
} from '@api/collections/outliers/services/breakout-response-execution-queue.util';
import { Platform } from '@genfeedai/contracts';
import { SystemWorkflowDispatchClass } from '@genfeedai/contracts/queue';

const actor = {
  userId: 'user-a',
  organizationId: 'org-a',
  isApiKey: false,
  scopes: ['b', 'a'],
};
const source = {
  organizationId: 'org-a',
  brandId: 'brand-a',
  credentialId: 'credential-a',
  platform: Platform.TWITTER,
  externalId: 'tweet-a',
};

function harness() {
  const findResponse = vi.fn(
    async (): Promise<{ id: string } | null> => ({
      id: 'response-a',
    }),
  );
  const findStrategies = vi.fn(async () => [{ id: 'strategy-a' }]);
  const queueSystemWorkflow = vi.fn(async (..._args: unknown[]) => 'job');
  const warn = vi.fn();
  const deps = {
    prisma: {
      breakoutResponse: { findFirst: findResponse },
      agentStrategy: { findMany: findStrategies },
    },
    queue: { queueSystemWorkflow },
    logger: { warn },
  } as unknown as Parameters<typeof enqueueDetectedBreakoutResponse>[0];
  return { deps, findResponse, findStrategies, queueSystemWorkflow, warn };
}

describe('enqueueDetectedBreakoutResponse', () => {
  it('queues one priority system job with a deterministic id and the pinned actor', async () => {
    const h = harness();
    await expect(
      enqueueDetectedBreakoutResponse(h.deps, actor, source),
    ).resolves.toBe('job');
    await enqueueDetectedBreakoutResponse(h.deps, actor, source);
    expect(h.queueSystemWorkflow).toHaveBeenCalledTimes(2);
    const [input, jobId, options] = h.queueSystemWorkflow.mock.calls[0];
    expect(jobId).toBe('breakout-response-execute-response-a');
    expect(h.queueSystemWorkflow.mock.calls[1][1]).toBe(jobId);
    expect(jobId).toBe(breakoutResponseExecutionJobId('response-a'));
    expect(options).toEqual({
      attempts: 1,
      dispatchClass: SystemWorkflowDispatchClass.INTERACTIVE,
    });
    expect(input).toEqual({
      actionType: 'breakout.response.execute',
      canonicalId: 'breakout.response.execute',
      inputValues: {
        request: {
          brandId: 'brand-a',
          credentialId: 'credential-a',
          initiatingActor: { ...actor, scopes: ['a', 'b'] },
          organizationId: 'org-a',
          platform: Platform.TWITTER,
          responseId: 'response-a',
          strategyId: 'strategy-a',
        },
      },
      organizationId: 'org-a',
      source: 'breakout-response',
      userId: 'user-a',
    });
  });

  it('only reads tenant-scoped, undeleted rows', async () => {
    const h = harness();
    await enqueueDetectedBreakoutResponse(h.deps, actor, source);
    expect(h.findStrategies).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-a',
          brandId: 'brand-a',
          isDeleted: false,
          isActive: true,
          platforms: { has: Platform.TWITTER },
        }),
        take: 2,
      }),
    );
  });

  it('does not queue without a detected response', async () => {
    const h = harness();
    h.findResponse.mockResolvedValue(null);
    await expect(
      enqueueDetectedBreakoutResponse(h.deps, actor, source),
    ).resolves.toBeNull();
    expect(h.queueSystemWorkflow).not.toHaveBeenCalled();
  });

  it.each([[[]], [[{ id: 'one' }, { id: 'two' }]]])(
    'does not guess a governing strategy among %j',
    async (strategies) => {
      const h = harness();
      h.findStrategies.mockResolvedValue(strategies);
      await expect(
        enqueueDetectedBreakoutResponse(h.deps, actor, source),
      ).resolves.toBeNull();
      expect(h.queueSystemWorkflow).not.toHaveBeenCalled();
      expect(h.warn).toHaveBeenCalled();
    },
  );

  it.each([
    ['another organization', { ...actor, organizationId: 'org-b' }],
    ['an empty user', { ...actor, userId: '' }],
  ])('rejects an actor from %s before any read', async (_name, bad) => {
    const h = harness();
    await expect(
      enqueueDetectedBreakoutResponse(h.deps, bad, source),
    ).rejects.toThrow('Breakout execution denied');
    expect(h.findResponse).not.toHaveBeenCalled();
    expect(h.queueSystemWorkflow).not.toHaveBeenCalled();
  });

  it('after commit, never throws into the committed collection', async () => {
    const h = harness();
    h.queueSystemWorkflow.mockRejectedValue(new Error('redis down'));
    await expect(
      enqueueDetectedBreakoutResponseAfterCommit(h.deps, actor, source),
    ).resolves.toBeUndefined();
    expect(h.warn).toHaveBeenCalledWith(
      'Breakout response execution was not queued',
      expect.objectContaining({ error: 'redis down' }),
    );
  });
});
