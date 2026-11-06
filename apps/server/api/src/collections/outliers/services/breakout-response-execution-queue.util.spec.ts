import {
  breakoutResponseExecutionJobId,
  enqueueDetectedBreakoutResponse,
  enqueueDetectedBreakoutResponseAfterCommit,
} from '@api/collections/outliers/services/breakout-response-execution-queue.util';
import { BreakoutResponseState, Platform } from '@genfeedai/contracts';
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

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

/** Prisma `where` over scalar columns and `{ has }` on array columns. */
function matches(row: Row, where: Where): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (value !== null && typeof value === 'object' && 'has' in value) {
      const column = row[key];
      return Array.isArray(column) && column.includes(value.has);
    }
    return row[key] === value;
  });
}

const detectedResponse = (overrides: Row = {}): Row => ({
  brandId: 'brand-a',
  credentialId: 'credential-a',
  externalId: 'tweet-a',
  id: 'response-a',
  isDeleted: false,
  organizationId: 'org-a',
  platform: Platform.TWITTER,
  state: BreakoutResponseState.DETECTED,
  ...overrides,
});

const strategy = (overrides: Row = {}): Row => ({
  brandId: 'brand-a',
  id: 'strategy-a',
  isActive: true,
  isDeleted: false,
  organizationId: 'org-a',
  platforms: [Platform.TWITTER],
  ...overrides,
});

interface QueuedJob {
  input: unknown;
  jobId: string;
  options: unknown;
}

/**
 * In-memory organization settings, breakout responses and agent strategies,
 * plus a system-workflow queue that joins a job id it already holds. Every
 * table read is recorded, and logger warnings are kept.
 */
function harness({
  isBreakoutResponsesEnabled = true as boolean | null,
  queueError = null as Error | null,
  responses = [detectedResponse()],
  strategies = [strategy()],
} = {}) {
  const settings: Row[] =
    isBreakoutResponsesEnabled === null
      ? []
      : [{ isBreakoutResponsesEnabled, organizationId: 'org-a' }];
  const reads: string[] = [];
  const jobs = new Map<string, QueuedJob>();
  const warnings: { context: Row; message: string }[] = [];
  const findFirst =
    (table: string, rows: Row[]) =>
    async ({ where }: { where: Where }) => {
      reads.push(table);
      return rows.find((row) => matches(row, where)) ?? null;
    };
  const deps = {
    logger: {
      warn: (message: string, context: Row) => {
        warnings.push({ context, message });
      },
    },
    prisma: {
      agentStrategy: {
        findMany: async ({ take, where }: { take: number; where: Where }) => {
          reads.push('agentStrategy');
          return strategies
            .filter((row) => matches(row, where))
            .slice(0, take)
            .map(({ id }) => ({ id }));
        },
      },
      breakoutResponse: { findFirst: findFirst('breakoutResponse', responses) },
      organizationSetting: {
        findFirst: findFirst('organizationSetting', settings),
      },
    },
    queue: {
      queueSystemWorkflow: async (
        input: unknown,
        jobId: string,
        options: unknown,
      ) => {
        if (queueError) throw queueError;
        if (!jobs.has(jobId)) jobs.set(jobId, { input, jobId, options });
        return jobId;
      },
    },
  } as unknown as Parameters<typeof enqueueDetectedBreakoutResponse>[0];
  return { deps, jobs, reads, settings, warnings };
}

describe('enqueueDetectedBreakoutResponse', () => {
  it('queues one priority system job with a deterministic id and the pinned actor', async () => {
    const h = harness();

    await expect(
      enqueueDetectedBreakoutResponse(h.deps, actor, source),
    ).resolves.toBe('breakout-response-execute-response-a');
    await enqueueDetectedBreakoutResponse(h.deps, actor, source);

    expect(breakoutResponseExecutionJobId('response-a')).toBe(
      'breakout-response-execute-response-a',
    );
    expect([...h.jobs.values()]).toEqual([
      {
        input: {
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
        },
        jobId: 'breakout-response-execute-response-a',
        options: {
          attempts: 1,
          dispatchClass: SystemWorkflowDispatchClass.INTERACTIVE,
        },
      },
    ]);
  });

  describe('the organization opt-in (#6526)', () => {
    it('enqueues nothing and reads nothing else while breakout responses are off', async () => {
      const h = harness({ isBreakoutResponsesEnabled: false });

      await expect(
        enqueueDetectedBreakoutResponse(h.deps, actor, source),
      ).resolves.toBeNull();

      expect(h.reads).toEqual(['organizationSetting']);
      expect(h.jobs.size).toBe(0);
    });

    it('treats an organization without a settings row as off', async () => {
      const h = harness({ isBreakoutResponsesEnabled: null });

      await expect(
        enqueueDetectedBreakoutResponse(h.deps, actor, source),
      ).resolves.toBeNull();
      expect(h.jobs.size).toBe(0);
    });

    it('reads the setting for every enqueue, so turning it off takes effect at once', async () => {
      const h = harness({
        responses: [detectedResponse()],
      });
      await enqueueDetectedBreakoutResponse(h.deps, actor, source);
      h.jobs.clear();
      h.settings[0].isBreakoutResponsesEnabled = false;

      await expect(
        enqueueDetectedBreakoutResponse(h.deps, actor, source),
      ).resolves.toBeNull();
      expect(h.jobs.size).toBe(0);
    });

    it('stays silent after commit while off: nothing is warned or queued', async () => {
      const h = harness({ isBreakoutResponsesEnabled: false });

      await expect(
        enqueueDetectedBreakoutResponseAfterCommit(h.deps, actor, source),
      ).resolves.toBeUndefined();
      expect(h.jobs.size).toBe(0);
      expect(h.warnings).toEqual([]);
    });
  });

  it.each([
    ['another organization', strategy({ organizationId: 'org-b' })],
    ['another brand', strategy({ brandId: 'brand-b' })],
    ['a deleted row', strategy({ isDeleted: true })],
    ['an inactive strategy', strategy({ isActive: false })],
    ['another platform', strategy({ platforms: [Platform.INSTAGRAM] })],
  ])('ignores a strategy from %s', async (_name, other) => {
    const h = harness({ strategies: [other, strategy()] });

    await enqueueDetectedBreakoutResponse(h.deps, actor, source);

    expect([...h.jobs.values()]).toEqual([
      expect.objectContaining({
        input: expect.objectContaining({
          inputValues: {
            request: expect.objectContaining({ strategyId: 'strategy-a' }),
          },
        }),
      }),
    ]);
  });

  it.each([
    ['no detected response', []],
    [
      'only a planned response',
      [detectedResponse({ state: BreakoutResponseState.PLANNED })],
    ],
    [
      'only another tenant response',
      [detectedResponse({ organizationId: 'org-b' })],
    ],
    ['only a deleted response', [detectedResponse({ isDeleted: true })]],
  ])('does not queue with %s', async (_name, responses) => {
    const h = harness({ responses });

    await expect(
      enqueueDetectedBreakoutResponse(h.deps, actor, source),
    ).resolves.toBeNull();
    expect(h.jobs.size).toBe(0);
  });

  it.each([
    ['no strategy', []],
    ['two strategies', [strategy({ id: 'one' }), strategy({ id: 'two' })]],
  ])(
    'does not guess a governing strategy with %s',
    async (_name, strategies) => {
      const h = harness({ strategies });

      await expect(
        enqueueDetectedBreakoutResponse(h.deps, actor, source),
      ).resolves.toBeNull();
      expect(h.jobs.size).toBe(0);
      expect(h.warnings).toEqual([
        {
          context: {
            candidates: strategies.length,
            organizationId: 'org-a',
            responseId: 'response-a',
          },
          message: 'Breakout response has no single governing strategy',
        },
      ]);
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
    expect(h.reads).toEqual([]);
    expect(h.jobs.size).toBe(0);
  });

  it('after commit, never throws into the committed collection', async () => {
    const h = harness({ queueError: new Error('redis down') });

    await expect(
      enqueueDetectedBreakoutResponseAfterCommit(h.deps, actor, source),
    ).resolves.toBeUndefined();
    expect(h.warnings).toEqual([
      {
        context: { error: 'redis down', organizationId: 'org-a' },
        message: 'Breakout response execution was not queued',
      },
    ]);
  });
});
