import type { LoggerService } from '@libs/logger/logger.service';
import { CronPatternExtractionService } from '@workers/crons/pattern-extraction/cron.pattern-extraction.service';
import type { PatternExtractionWorkflowService } from '@workers/processors/api/queues/pattern-extraction/pattern-extraction-workflow.service';

/**
 * The daily cron against a workflow queue that records what it accepted, and a
 * logger that keeps its errors. `failing` names organizations whose enqueue
 * throws; `listing` replaces the eligible-organization lookup.
 */
function cronWith(options: {
  failing?: string[];
  listing?: () => Promise<string[]>;
}) {
  const queued: Array<[string, string]> = [];
  const errors: Array<[string, unknown]> = [];
  const workflow = {
    listEligibleOrganizationIds:
      options.listing ?? (async () => ['org-1', 'org-2']),
    queueOrganization: async (organizationId: string, dateKey: string) => {
      if (options.failing?.includes(organizationId)) {
        throw new Error('queue unavailable');
      }
      queued.push([organizationId, dateKey]);
      return `execution-${organizationId}`;
    },
  };
  const logger = {
    error: (message: string, detail: unknown) => {
      errors.push([message, detail]);
    },
    log: () => undefined,
  };
  const service = new CronPatternExtractionService(
    logger as unknown as LoggerService,
    workflow as unknown as PatternExtractionWorkflowService,
  );
  return { errors, queued, service };
}

describe('CronPatternExtractionService', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-05T00:30:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('queues one tenant workflow for every eligible organization, keyed by the UTC day', async () => {
    const { errors, queued, service } = cronWith({});

    await service.computeDailyPatterns();

    expect(queued).toEqual([
      ['org-1', '2026-11-05'],
      ['org-2', '2026-11-05'],
    ]);
    expect(errors).toEqual([]);
  });

  it('continues scheduling other tenants when one enqueue fails', async () => {
    const { errors, queued, service } = cronWith({ failing: ['org-1'] });

    await expect(service.computeDailyPatterns()).resolves.toBeUndefined();

    expect(queued).toEqual([['org-2', '2026-11-05']]);
    expect(errors).toEqual([
      [
        'CronPatternExtractionService computeDailyPatterns failed to queue organization',
        { error: new Error('queue unavailable'), organizationId: 'org-1' },
      ],
    ]);
  });

  it('logs an enumeration failure and queues nothing', async () => {
    const { errors, queued, service } = cronWith({
      listing: async () => {
        throw new Error('database unavailable');
      },
    });

    await expect(service.computeDailyPatterns()).resolves.toBeUndefined();

    expect(queued).toEqual([]);
    expect(errors).toEqual([
      [
        'CronPatternExtractionService computeDailyPatterns failed',
        new Error('database unavailable'),
      ],
    ]);
  });
});
