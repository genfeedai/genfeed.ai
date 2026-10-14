import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { GenerationBillingService } from '@api/collections/credits/services/generation-billing.service';
import type { ModelCreditQuoteService } from '@api/collections/models/services/model-credit-quote.service';
import { AvatarVideoBillingService } from '@api/collections/videos/services/avatar-video-billing.service';
import { avatarEngineSnapshot } from '@api/helpers/utils/credits/avatar-duration-quote.fixture';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('AvatarVideoBillingService.quoteRender', () => {
  const modelCreditQuote = {
    quoteByKey: vi.fn(),
    quoteSnapshotByKey: vi.fn(),
  };
  const service = new AvatarVideoBillingService(
    {} as CreditsUtilsService,
    {} as GenerationBillingService,
    modelCreditQuote as unknown as ModelCreditQuoteService,
    { error: vi.fn() } as unknown as LoggerService,
  );

  beforeEach(() => {
    modelCreditQuote.quoteByKey.mockReset().mockResolvedValue(40);
    modelCreditQuote.quoteSnapshotByKey
      .mockReset()
      .mockResolvedValue(
        avatarEngineSnapshot('heygen/avatar-iv', 'digital_twin', 10),
      );
  });

  it('keeps photo animation on the flat heygen/avatar quote', async () => {
    await expect(
      service.quoteRender({ modelKey: MODEL_KEYS.HEYGEN_AVATAR }, 12),
    ).resolves.toEqual({ credits: 40 });
    expect(modelCreditQuote.quoteByKey).toHaveBeenCalledWith(
      MODEL_KEYS.HEYGEN_AVATAR,
    );
    expect(modelCreditQuote.quoteSnapshotByKey).not.toHaveBeenCalled();
  });

  it('holds an engine render at the estimated seconds for its avatar type', async () => {
    const quote = await service.quoteRender(
      {
        avatarType: 'digital_twin',
        engine: 'avatar_iv',
        modelKey: MODEL_KEYS.HEYGEN_AVATAR_IV,
      },
      10,
    );

    expect(modelCreditQuote.quoteSnapshotByKey).toHaveBeenCalledWith(
      MODEL_KEYS.HEYGEN_AVATAR_IV,
      { duration: 10, selectors: { avatar_type: 'digital_twin' } },
    );
    expect(quote.credits).toBe(269);
    expect(quote.durationQuote).toMatchObject({
      estimatedSeconds: 10,
      snapshot: { costSource: 'reviewed-provider', credits: 269 },
    });
  });

  it('refuses an engine row that would price from a flat reading', async () => {
    modelCreditQuote.quoteSnapshotByKey.mockResolvedValue({
      ...avatarEngineSnapshot('heygen/avatar-iv', 'photo_avatar', 10),
      costSource: 'configured-provider',
    });

    await expect(
      service.quoteRender(
        {
          avatarType: 'photo_avatar',
          engine: 'avatar_iv',
          modelKey: MODEL_KEYS.HEYGEN_AVATAR_IV,
        },
        10,
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('refuses a render with no duration basis before quoting', async () => {
    await expect(
      service.quoteRender(
        {
          avatarType: 'photo_avatar',
          engine: 'avatar_iv',
          modelKey: MODEL_KEYS.HEYGEN_AVATAR_IV,
        },
        undefined,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(modelCreditQuote.quoteSnapshotByKey).not.toHaveBeenCalled();
  });

  it('refuses a look whose avatar type could not be verified', async () => {
    await expect(
      service.quoteRender(
        { engine: 'avatar_iv', modelKey: MODEL_KEYS.HEYGEN_AVATAR_IV },
        10,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
