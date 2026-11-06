import { ClipperAvatarBillingService } from '@api/collections/clipper-projects/services/clipper-avatar-billing.service';
import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { GenerationBillingService } from '@api/collections/credits/services/generation-billing.service';
import type { ModelCreditQuoteService } from '@api/collections/models/services/model-credit-quote.service';
import type { PlatformSettingsService } from '@api/collections/platform-settings/services/platform-settings.service';
import { AvatarVideoBillingService } from '@api/collections/videos/services/avatar-video-billing.service';
import type { AvatarVideoModelService } from '@api/collections/videos/services/avatar-video-model.service';
import {
  avatarEngineSnapshot,
  photoAnimationSnapshot,
} from '@api/helpers/utils/credits/avatar-duration-quote.fixture';
import type { ByokService } from '@api/services/byok/byok.service';
import type { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import type { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ActivitySource, ByokProvider } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { LoggerService } from '@libs/logger/logger.service';
import { ServiceUnavailableException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';

// 24 characters: two seconds at the admission speaking rate.
const SCRIPT = 'Hook. A short hook line.';

interface Pool {
  credits: number;
  description: string;
  id: string;
  organizationId: string;
  source: ActivitySource;
  status: 'held' | 'released';
  userId: string;
}

interface Output {
  credits: number;
  metadata?: Record<string, unknown>;
  organizationId: string;
  settlement?: Record<string, unknown>;
  status: 'bound' | 'released' | 'settled';
  submissionIntentProvider: ByokProvider;
}

describe('ClipperAvatarBillingService', () => {
  let isBindDown: boolean;
  let outputs: Map<string, Output>;
  let pools: Pool[];
  let quoteLookups: number;
  let service: ClipperAvatarBillingService;

  beforeEach(() => {
    isBindDown = false;
    outputs = new Map();
    pools = [];
    quoteLookups = 0;

    // The reviewed price rows: per-second photo animation on heygen/avatar,
    // and the digital-twin row of the Avatar IV engine.
    const quotes = {
      quoteSnapshotByKey: async (
        modelKey: string,
        params: { duration: number; selectors?: Record<string, string> },
      ) => {
        quoteLookups += 1;
        if (modelKey === MODEL_KEYS.HEYGEN_AVATAR && !params.selectors) {
          return photoAnimationSnapshot(params.duration);
        }
        if (
          modelKey === MODEL_KEYS.HEYGEN_AVATAR_IV &&
          params.selectors?.avatar_type === 'digital_twin'
        ) {
          return avatarEngineSnapshot(
            'heygen/avatar-iv',
            'digital_twin',
            params.duration,
          );
        }
        throw new Error(`No reviewed price row for ${modelKey}`);
      },
    };
    const generationBilling = {
      bindOutput: async (
        pool: Pool,
        output: Omit<Output, 'organizationId' | 'status'> & {
          ingredientId: string;
        },
      ) => {
        if (isBindDown) {
          throw new Error('bind failed');
        }
        const { ingredientId, ...bound } = output;
        outputs.set(ingredientId, {
          ...bound,
          organizationId: pool.organizationId,
          status: 'bound',
        });
      },
      holdForService: async (
        hold: Omit<Pool, 'id' | 'status'>,
      ): Promise<Pool> => {
        const pool = {
          ...hold,
          id: `pool-${pools.length + 1}`,
          status: 'held' as const,
        };
        pools.push(pool);
        return pool;
      },
      releaseOutput: async (ingredientId: string, organizationId: string) => {
        const output = outputs.get(ingredientId);
        if (output?.organizationId === organizationId) {
          output.status = 'released';
        }
      },
      releasePool: async (pool: Pool) => {
        pool.status = 'released';
      },
      settleOutput: async (
        ingredientId: string,
        organizationId: string,
        settlement: Record<string, unknown>,
      ) => {
        const output = outputs.get(ingredientId);
        if (output?.organizationId !== organizationId) {
          throw new Error('No bound output');
        }
        Object.assign(output, { settlement, status: 'settled' });
      },
    } as unknown as GenerationBillingService;
    const logger = { error: () => undefined } as unknown as LoggerService;

    service = new ClipperAvatarBillingService(
      new AvatarVideoBillingService(
        {} as CreditsUtilsService,
        generationBilling,
        quotes as unknown as ModelCreditQuoteService,
        logger,
        {} as AvatarVideoModelService,
        {} as ByokService,
        {} as HeyGenService,
        {} as PrismaService,
        {} as FilesClientService,
        {} as PlatformSettingsService,
      ),
      generationBilling,
      logger,
    );
  });

  const fund = (selection: Record<string, string>, isByok = false) =>
    service.fund({
      clipperResultId: 'clip-1',
      organizationId: 'org-1',
      plan: { isByok, selection: selection as { modelKey: string } },
      script: SCRIPT,
      userId: 'user-1',
    });

  it('holds a photo clip per second on heygen/avatar and binds it to the clip result', async () => {
    const credits = photoAnimationSnapshot(2).credits;

    const hold = await fund({ modelKey: MODEL_KEYS.HEYGEN_AVATAR });

    expect(pools).toEqual([
      {
        credits,
        description: `Clip avatar video generation - ${MODEL_KEYS.HEYGEN_AVATAR}`,
        id: 'pool-1',
        organizationId: 'org-1',
        source: ActivitySource.VIDEO_GENERATION,
        status: 'released',
        userId: 'user-1',
      },
    ]);
    expect(outputs.get('clip-1')).toEqual({
      credits,
      metadata: {
        avatarDurationQuote: {
          estimatedSeconds: 2,
          snapshot: photoAnimationSnapshot(2),
        },
      },
      organizationId: 'org-1',
      status: 'bound',
      submissionIntentProvider: ByokProvider.HEYGEN,
    });

    await hold?.release();

    expect(outputs.get('clip-1')?.status).toBe('released');
  });

  it('prices a trained look on its reviewed engine row', async () => {
    await fund({
      avatarType: 'digital_twin',
      engine: 'avatar_iv',
      modelKey: MODEL_KEYS.HEYGEN_AVATAR_IV,
    });

    expect(outputs.get('clip-1')?.credits).toBe(
      avatarEngineSnapshot('heygen/avatar-iv', 'digital_twin', 2).credits,
    );
  });

  it('holds nothing on a customer HeyGen connection', async () => {
    await expect(
      fund({ modelKey: MODEL_KEYS.HEYGEN_AVATAR }, true),
    ).resolves.toBeUndefined();
    expect(quoteLookups).toBe(0);
    expect(pools).toEqual([]);
  });

  it.each([MODEL_KEYS.ARGIL_ATOM, 'genfeedai/clip-video'])(
    'refuses platform %s clips without a supported settlement path',
    async (modelKey) => {
      await expect(fund({ modelKey })).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(pools).toEqual([]);
    },
  );

  it('returns the pool when binding fails', async () => {
    isBindDown = true;

    await expect(fund({ modelKey: MODEL_KEYS.HEYGEN_AVATAR })).rejects.toThrow(
      'bind failed',
    );
    expect(pools.map(({ status }) => status)).toEqual(['released']);
    expect(outputs.size).toBe(0);
  });

  it.each([
    ['the seconds HeyGen rendered', 7.4, { durationSeconds: 7.4 }],
    ['its hold when HeyGen reports no length', undefined, {}],
  ])('settles the clip hold at %s', async (_case, seconds, settlement) => {
    await fund({ modelKey: MODEL_KEYS.HEYGEN_AVATAR });

    await service.settle('clip-1', 'org-1', seconds);

    expect(outputs.get('clip-1')).toMatchObject({
      settlement,
      status: 'settled',
    });
  });
});
