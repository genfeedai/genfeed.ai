import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import {
  VOICE_CLONE_CREDITS,
  VOICE_CREDITS_PER_MINUTE,
  VoiceCreditsService,
} from '@api/collections/voices/services/voice-credits.service';
import { InsufficientCreditsException } from '@api/helpers/exceptions/business/business-logic.exception';
import type { Request } from 'express';

describe('VoiceCreditsService', () => {
  let creditsUtils: {
    checkOrganizationCreditsAvailable: ReturnType<typeof vi.fn>;
    getOrganizationCreditsBalance: ReturnType<typeof vi.fn>;
  };
  let service: VoiceCreditsService;

  beforeEach(() => {
    creditsUtils = {
      checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
      getOrganizationCreditsBalance: vi.fn().mockResolvedValue(5),
    };
    service = new VoiceCreditsService(
      creditsUtils as unknown as CreditsUtilsService,
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

  it('settles generation credits from duration with a one-credit floor', async () => {
    const request = {
      creditsConfig: { deferred: true, description: 'Voice generation' },
    } as unknown as Request;

    await service.settleGenerationCredits(request, 'org-1', 90);

    expect(creditsUtils.checkOrganizationCreditsAvailable).toHaveBeenCalledWith(
      'org-1',
      Math.ceil(1.5 * VOICE_CREDITS_PER_MINUTE),
    );
    expect(request).toMatchObject({
      creditsConfig: { amount: 26, deferred: false },
    });
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
