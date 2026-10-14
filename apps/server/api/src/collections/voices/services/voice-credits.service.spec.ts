import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { ModelCreditQuoteService } from '@api/collections/models/services/model-credit-quote.service';
import {
  VOICE_CLONE_CREDITS,
  VoiceCreditsService,
} from '@api/collections/voices/services/voice-credits.service';
import { InsufficientCreditsException } from '@api/exceptions/business-logic.exception';
import { ActivitySource } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { ServiceUnavailableException } from '@nestjs/common';
import type { Request } from 'express';

describe('VoiceCreditsService', () => {
  let creditsUtils: {
    checkOrganizationCreditsAvailable: ReturnType<typeof vi.fn>;
    deductCreditsFromOrganization: ReturnType<typeof vi.fn>;
    getOrganizationCreditsBalance: ReturnType<typeof vi.fn>;
  };
  let quotes: { quoteSnapshotByKey: ReturnType<typeof vi.fn> };
  let service: VoiceCreditsService;

  beforeEach(() => {
    creditsUtils = {
      checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
      deductCreditsFromOrganization: vi.fn(),
      getOrganizationCreditsBalance: vi.fn().mockResolvedValue(5),
    };
    quotes = {
      quoteSnapshotByKey: vi.fn().mockResolvedValue({
        costSource: 'reviewed-provider',
        credits: 10,
        rateVersion: 'rate-v1',
      }),
    };
    service = new VoiceCreditsService(
      creditsUtils as unknown as CreditsUtilsService,
      quotes as unknown as ModelCreditQuoteService,
    );
  });

  it('throws the typed balance error when an organization cannot afford work', async () => {
    creditsUtils.checkOrganizationCreditsAvailable.mockResolvedValue(false);

    await expect(
      service.assertOrganizationCanAfford('org-1', 17),
    ).rejects.toBeInstanceOf(InsufficientCreditsException);
    expect(creditsUtils.getOrganizationCreditsBalance).toHaveBeenCalledWith(
      'org-1',
    );
  });

  it('quotes speech by submitted characters', async () => {
    const snapshot = await service.quoteSpeech({
      characters: 1000,
      modelKey: MODEL_KEYS.HEYGEN_VOICE,
      organizationId: 'org-1',
      provider: 'heygen',
    });

    expect(quotes.quoteSnapshotByKey).toHaveBeenCalledWith(
      MODEL_KEYS.HEYGEN_VOICE,
      { characters: 1000, organizationId: 'org-1', provider: 'heygen' },
    );
    expect(snapshot.credits).toBe(10);
  });

  it.each(['configured-provider', 'legacy-credits', 'explicit-free'])(
    'refuses a %s speech quote with 503',
    async (costSource) => {
      quotes.quoteSnapshotByKey.mockResolvedValue({ costSource, credits: 10 });

      await expect(
        service.quoteSpeech({
          characters: 4000,
          modelKey: MODEL_KEYS.HEYGEN_VOICE,
          organizationId: 'org-1',
          provider: 'heygen',
        }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    },
  );

  it('settles a speech charge once per ingredient', async () => {
    await service.settleSpeechCredits({
      brandId: 'brand-1',
      credits: 27,
      ingredientId: 'ingredient-1',
      organizationId: 'org-1',
      userId: 'user-1',
    });

    expect(creditsUtils.deductCreditsFromOrganization).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      27,
      'Voice generation (TTS)',
      ActivitySource.VOICE_GENERATION,
      {
        brandId: 'brand-1',
        idempotencyKey: 'voice-generation:ingredient-1',
        maxOverdraftCredits: 27,
        referenceId: 'ingredient-1',
        referenceType: 'agent-media:voice-generation',
      },
    );
  });

  it('settles the flat ElevenLabs clone charge', async () => {
    const request = {
      creditsConfig: { deferred: true, description: 'Voice clone' },
    } as unknown as Request;

    await service.settleElevenLabsCloneCredits(request, 'org-1');

    expect(creditsUtils.checkOrganizationCreditsAvailable).toHaveBeenCalledWith(
      'org-1',
      VOICE_CLONE_CREDITS,
    );
    expect(request).toMatchObject({
      creditsConfig: { amount: VOICE_CLONE_CREDITS, deferred: false },
    });
  });
});
