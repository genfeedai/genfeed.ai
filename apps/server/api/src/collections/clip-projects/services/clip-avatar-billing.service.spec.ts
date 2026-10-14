import { ClipAvatarBillingService } from '@api/collections/clip-projects/services/clip-avatar-billing.service';
import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { GenerationBillingService } from '@api/collections/credits/services/generation-billing.service';
import type { ModelCreditQuoteService } from '@api/collections/models/services/model-credit-quote.service';
import { AvatarVideoBillingService } from '@api/collections/videos/services/avatar-video-billing.service';
import type { AvatarVideoModelService } from '@api/collections/videos/services/avatar-video-model.service';
import {
  avatarEngineSnapshot,
  photoAnimationSnapshot,
} from '@api/helpers/utils/credits/avatar-duration-quote.fixture';
import type { ByokService } from '@api/services/byok/byok.service';
import type { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ActivitySource, ByokProvider } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { LoggerService } from '@libs/logger/logger.service';
import { ServiceUnavailableException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const POOL = {
  creditsConfig: {
    amount: 26,
    reservationId: 'pool-1',
    settlement: 'completion' as const,
  },
  user: { id: 'user-1', organizationId: 'org-1' },
};
// 24 characters: two seconds at the admission speaking rate.
const SCRIPT = 'Hook. A short hook line.';

describe('ClipAvatarBillingService', () => {
  const holdForService = vi.fn();
  const bindOutput = vi.fn();
  const releasePool = vi.fn();
  const settleOutput = vi.fn();
  const releaseOutput = vi.fn();
  const quoteSnapshotByKey = vi.fn();
  const generationBilling = {
    bindOutput,
    holdForService,
    releaseOutput,
    releasePool,
    settleOutput,
  } as unknown as GenerationBillingService;
  const logger = { error: vi.fn() } as unknown as LoggerService;
  const service = new ClipAvatarBillingService(
    new AvatarVideoBillingService(
      {} as CreditsUtilsService,
      generationBilling,
      { quoteSnapshotByKey } as unknown as ModelCreditQuoteService,
      logger,
      {} as AvatarVideoModelService,
      {} as ByokService,
      {} as HeyGenService,
      {} as PrismaService,
      {} as never,
      {} as never,
    ),
    generationBilling,
    logger,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    holdForService.mockResolvedValue(POOL);
  });

  it('holds a photo clip per second on heygen/avatar and binds it to the clip result', async () => {
    quoteSnapshotByKey.mockResolvedValue(photoAnimationSnapshot(2));

    const hold = await service.fund({
      clipResultId: 'clip-1',
      organizationId: 'org-1',
      plan: {
        isByok: false,
        selection: { modelKey: MODEL_KEYS.HEYGEN_AVATAR },
      },
      script: SCRIPT,
      userId: 'user-1',
    });

    expect(quoteSnapshotByKey).toHaveBeenCalledWith(MODEL_KEYS.HEYGEN_AVATAR, {
      duration: 2,
    });
    const credits = photoAnimationSnapshot(2).credits;
    expect(holdForService).toHaveBeenCalledWith({
      credits,
      description: `Clip avatar video generation - ${MODEL_KEYS.HEYGEN_AVATAR}`,
      organizationId: 'org-1',
      source: ActivitySource.VIDEO_GENERATION,
      userId: 'user-1',
    });
    expect(bindOutput).toHaveBeenCalledWith(POOL, {
      credits,
      ingredientId: 'clip-1',
      metadata: {
        avatarDurationQuote: {
          estimatedSeconds: 2,
          snapshot: photoAnimationSnapshot(2),
        },
      },
      submissionIntentProvider: ByokProvider.HEYGEN,
    });
    expect(releasePool).toHaveBeenCalledWith(POOL);
    expect(hold).toBeDefined();

    await hold?.release();
    expect(releaseOutput).toHaveBeenCalledWith('clip-1', 'org-1');
  });

  it('prices a trained look on its reviewed engine row', async () => {
    quoteSnapshotByKey.mockResolvedValue(
      avatarEngineSnapshot('heygen/avatar-iv', 'digital_twin', 2),
    );

    await service.fund({
      clipResultId: 'clip-1',
      organizationId: 'org-1',
      plan: {
        isByok: false,
        selection: {
          avatarType: 'digital_twin',
          engine: 'avatar_iv',
          modelKey: MODEL_KEYS.HEYGEN_AVATAR_IV,
        },
      },
      script: SCRIPT,
      userId: 'user-1',
    });

    expect(quoteSnapshotByKey).toHaveBeenCalledWith(
      MODEL_KEYS.HEYGEN_AVATAR_IV,
      { duration: 2, selectors: { avatar_type: 'digital_twin' } },
    );
    expect(holdForService).toHaveBeenCalledWith(
      expect.objectContaining({
        credits: avatarEngineSnapshot('heygen/avatar-iv', 'digital_twin', 2)
          .credits,
      }),
    );
  });

  it('holds nothing on a customer HeyGen connection', async () => {
    const hold = await service.fund({
      clipResultId: 'clip-1',
      organizationId: 'org-1',
      plan: { isByok: true, selection: { modelKey: MODEL_KEYS.HEYGEN_AVATAR } },
      script: SCRIPT,
      userId: 'user-1',
    });

    expect(hold).toBeUndefined();
    expect(quoteSnapshotByKey).not.toHaveBeenCalled();
    expect(holdForService).not.toHaveBeenCalled();
  });

  it.each([MODEL_KEYS.ARGIL_ATOM, 'genfeedai/clip-video'])(
    'refuses platform %s clips without a supported settlement path',
    async (modelKey) => {
      quoteSnapshotByKey.mockResolvedValue(photoAnimationSnapshot(2));
      await expect(
        service.fund({
          clipResultId: 'clip-1',
          organizationId: 'org-1',
          plan: { isByok: false, selection: { modelKey } },
          script: SCRIPT,
          userId: 'user-1',
        }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(holdForService).not.toHaveBeenCalled();
    },
  );

  it('returns the pool when binding fails', async () => {
    quoteSnapshotByKey.mockResolvedValue(photoAnimationSnapshot(2));
    bindOutput.mockRejectedValueOnce(new Error('bind failed'));

    await expect(
      service.fund({
        clipResultId: 'clip-1',
        organizationId: 'org-1',
        plan: {
          isByok: false,
          selection: { modelKey: MODEL_KEYS.HEYGEN_AVATAR },
        },
        script: SCRIPT,
        userId: 'user-1',
      }),
    ).rejects.toThrow('bind failed');
    expect(releasePool).toHaveBeenCalledWith(POOL);
  });

  it('settles the clip hold at the seconds HeyGen rendered', async () => {
    await service.settle('clip-1', 'org-1', 7.4);
    await service.settle('clip-2', 'org-1');

    expect(settleOutput).toHaveBeenCalledWith('clip-1', 'org-1', {
      durationSeconds: 7.4,
    });
    expect(settleOutput).toHaveBeenCalledWith('clip-2', 'org-1', {});
  });
});
