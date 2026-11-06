import type { MediaVisionEvaluationService } from '@api/services/media-assessment/media-vision-evaluation.service';
import type { MediaPerceptionService } from '@api/services/media-perception/media-perception.service';
import type { MediaPerceptionQueueService } from '@api/services/media-perception/media-perception-queue.service';
import type { MediaTextDecisionService } from '@api/services/media-text-decisions/media-text-decision.service';
import type { MediaModerationService } from '@api/services/moderation/media-moderation.service';
import type { MediaModerationQueueService } from '@api/services/moderation/media-moderation-queue.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { CronMediaPerceptionService } from '@workers/crons/media-perception/cron.media-perception.service';

interface Candidate {
  ingredientId: string;
  organizationId: string;
}

interface Asset extends Candidate {
  at: Date;
}

const now = new Date('2026-09-26T12:00:00.000Z');
const hoursAgo = (hours: number) =>
  new Date(now.getTime() - hours * 60 * 60 * 1000);
const asset = (ingredientId: string, at: Date): Asset => ({
  at,
  ingredientId,
  organizationId: 'org-1',
});
const candidate = (ingredientId: string): Candidate => ({
  ingredientId,
  organizationId: 'org-1',
});

// The media library as each discovery query sees it, and the two queues the
// sweep feeds. Discovery queries honour the lookback window and batch size.
function createWorld() {
  const world = {
    errors: [] as Record<string, unknown>[],
    failingEnqueues: new Set<string>(),
    moderationQueue: [] as Candidate[],
    outages: new Set<string>(),
    perceptionQueue: [] as { candidate: Candidate; kind: string }[],
    retriesDue: [asset('asset-2', hoursAgo(1))],
    settings: { isEnabled: true, lookbackHours: 24 },
    undecided: [asset('asset-5', hoursAgo(2))],
    unevaluated: [asset('asset-4', hoursAgo(2))],
    unmoderated: [asset('asset-3', hoursAgo(2))],
    unperceived: [
      asset('asset-1', hoursAgo(3)),
      asset('asset-old', hoursAgo(30)),
    ],
  };
  const completedSince =
    (source: string, assets: () => Asset[]) =>
    async (since: Date, limit: number) => {
      if (world.outages.has(source)) {
        throw new Error(`${source} discovery outage`);
      }
      return assets()
        .filter((entry) => entry.at >= since)
        .slice(0, limit)
        .map(({ ingredientId, organizationId }) => ({
          ingredientId,
          organizationId,
        }));
    };
  const enqueueOrFail = (candidateToQueue: Candidate) => {
    if (world.failingEnqueues.has(candidateToQueue.ingredientId)) {
      throw new Error('redis down');
    }
  };

  const service = new CronMediaPerceptionService(
    {
      findDueRetries: async (at: Date, limit: number) =>
        world.retriesDue
          .filter((entry) => entry.at <= at)
          .slice(0, limit)
          .map(({ ingredientId, organizationId }) => ({
            ingredientId,
            organizationId,
          })),
      findUnperceivedAssets: completedSince(
        'perception',
        () => world.unperceived,
      ),
      getSettings: async () => ({ ...world.settings }),
    } as unknown as MediaPerceptionService,
    {
      enqueue: async (queued: Candidate, kind: string) => {
        enqueueOrFail(queued);
        world.perceptionQueue.push({ candidate: queued, kind });
      },
    } as unknown as MediaPerceptionQueueService,
    {
      findUnmoderatedAssets: completedSince(
        'moderation',
        () => world.unmoderated,
      ),
    } as unknown as MediaModerationService,
    {
      enqueue: async (queued: Candidate) => {
        enqueueOrFail(queued);
        world.moderationQueue.push(queued);
      },
    } as unknown as MediaModerationQueueService,
    {
      findUnevaluatedAssets: completedSince('vision', () => world.unevaluated),
    } as unknown as MediaVisionEvaluationService,
    {
      findUndecidedAssets: completedSince(
        'text-decision',
        () => world.undecided,
      ),
    } as unknown as MediaTextDecisionService,
    {
      error: (message: string, meta: Record<string, unknown>) =>
        world.errors.push({ message, ...meta }),
      log: () => undefined,
    } as unknown as LoggerService,
  );
  return { service, world };
}

describe('CronMediaPerceptionService', () => {
  it('queues assets completed inside the lookback window and due retries', async () => {
    const { service, world } = createWorld();

    await expect(service.queueDuePerceptions(now)).resolves.toEqual({
      queuedModerations: 3,
      queuedPerceptions: 1,
      queuedRetries: 1,
    });
    expect(world.perceptionQueue).toEqual([
      { candidate: candidate('asset-1'), kind: 'perceive' },
      { candidate: candidate('asset-2'), kind: 'retry' },
    ]);
  });

  it('queues settled assets for moderation, vision evaluation and text decisions', async () => {
    const { service, world } = createWorld();

    await service.queueDuePerceptions(now);

    expect(world.moderationQueue).toEqual([
      candidate('asset-3'),
      candidate('asset-4'),
      candidate('asset-5'),
    ]);
  });

  it('queues nothing when perception is disabled', async () => {
    const { service, world } = createWorld();
    world.settings.isEnabled = false;

    await expect(service.queueDuePerceptions(now)).resolves.toEqual({
      queuedModerations: 0,
      queuedPerceptions: 0,
      queuedRetries: 0,
    });
    expect(world.perceptionQueue).toEqual([]);
    expect(world.moderationQueue).toEqual([]);
  });

  it('reads the perception switch on every tick, not just at startup (#5407)', async () => {
    const { service, world } = createWorld();
    world.settings.isEnabled = false;
    await service.queueDuePerceptions(now);

    world.settings.isEnabled = true;

    await expect(service.queueDuePerceptions(now)).resolves.toEqual({
      queuedModerations: 3,
      queuedPerceptions: 1,
      queuedRetries: 1,
    });
    expect(world.perceptionQueue).toEqual([
      { candidate: candidate('asset-1'), kind: 'perceive' },
      { candidate: candidate('asset-2'), kind: 'retry' },
    ]);
  });

  it('keeps sweeping when one enqueue fails', async () => {
    const { service, world } = createWorld();
    world.failingEnqueues.add('asset-1');

    await expect(service.queueDuePerceptions(now)).resolves.toEqual({
      queuedModerations: 3,
      queuedPerceptions: 0,
      queuedRetries: 1,
    });
    expect(world.errors).toEqual([
      expect.objectContaining({
        error: 'redis down',
        message: 'CronMediaPerceptionService failed to queue asset',
      }),
    ]);
  });

  it('keeps the other discovery candidates when one discovery query fails (#5316)', async () => {
    const { service, world } = createWorld();
    world.outages.add('vision');

    await expect(service.queueDuePerceptions(now)).resolves.toMatchObject({
      queuedModerations: 2,
    });
    expect(world.moderationQueue).toEqual([
      candidate('asset-3'),
      candidate('asset-5'),
    ]);
    expect(world.errors).toEqual([
      expect.objectContaining({
        message: 'CronMediaPerceptionService discovery query failed',
        source: 'vision',
      }),
    ]);
  });
});
