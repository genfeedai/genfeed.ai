import { TextGenerationCreditsService } from '@api/services/byok/text-generation-credits.service';
import { ByokProvider } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { ConflictException } from '@nestjs/common';
import type { Request } from 'express';

const OPENROUTER_MODEL = MODEL_KEYS.OPENROUTER_GOOGLE_GEMINI_3_8_FLASH;
const REPLICATE_MODEL = 'mistralai/mixtral-8x7b-instruct-v0.1';

type CreditsRequest = {
  creditsConfig?: {
    amount?: number;
    byokApiKeyOverride?: string;
    deferred?: boolean;
    isByokBypass?: boolean;
    provider?: ByokProvider;
  };
};

function asRequest(request: CreditsRequest): Request {
  return request as unknown as Request;
}

describe('TextGenerationCreditsService', () => {
  const byokService = { resolveApiKey: vi.fn() };
  const service = new TextGenerationCreditsService(byokService as never);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('resolveDispatch', () => {
    it('resolves each dispatch provider once and returns its key', async () => {
      byokService.resolveApiKey.mockResolvedValue({ apiKey: 'org-or-key' });

      const dispatch = await service.resolveDispatch('org-1', [
        OPENROUTER_MODEL,
        OPENROUTER_MODEL,
      ]);

      expect(byokService.resolveApiKey).toHaveBeenCalledTimes(1);
      expect(byokService.resolveApiKey).toHaveBeenCalledWith(
        'org-1',
        ByokProvider.OPENROUTER,
      );
      expect(dispatch).toEqual({
        keys: { [ByokProvider.OPENROUTER]: 'org-or-key' },
      });
    });

    it('resolves the Replicate key for a natively dispatched model', async () => {
      byokService.resolveApiKey.mockResolvedValue({ apiKey: 'org-r8-key' });

      const dispatch = await service.resolveDispatch('org-1', [
        REPLICATE_MODEL,
      ]);

      expect(byokService.resolveApiKey).toHaveBeenCalledWith(
        'org-1',
        ByokProvider.REPLICATE,
      );
      expect(dispatch?.keys).toEqual({
        [ByokProvider.REPLICATE]: 'org-r8-key',
      });
    });
  });

  describe('ensureDeferredCredits', () => {
    it('keeps the guard decision for a request that was not deferred', async () => {
      const request: CreditsRequest = { creditsConfig: { amount: 3 } };

      await expect(
        service.ensureDeferredCredits(asRequest(request), 'org-1', [
          OPENROUTER_MODEL,
        ]),
      ).resolves.toBeUndefined();
      expect(byokService.resolveApiKey).not.toHaveBeenCalled();
      expect(request.creditsConfig).toEqual({ amount: 3 });
    });

    it('marks the deferred charge as BYOK in the same step that yields the key', async () => {
      byokService.resolveApiKey.mockResolvedValue({ apiKey: 'org-or-key' });
      const request: CreditsRequest = {
        creditsConfig: { amount: 0, deferred: true },
      };

      const dispatch = await service.ensureDeferredCredits(
        asRequest(request),
        'org-1',
        [OPENROUTER_MODEL],
      );

      expect(dispatch?.keys[ByokProvider.OPENROUTER]).toBe('org-or-key');
      expect(request.creditsConfig).toEqual({
        amount: 0,
        deferred: true,
        isByokBypass: true,
      });
      // The decrypted key never rides on the request's credits config.
      expect(JSON.stringify(request)).not.toContain('org-or-key');
    });
  });

  describe('deferredKeyResolver', () => {
    it('returns the key for the model the service resolved (the Admin default)', async () => {
      byokService.resolveApiKey.mockResolvedValue({ apiKey: 'org-r8-key' });
      const request: CreditsRequest = { creditsConfig: { deferred: true } };

      const resolveApiKey = service.deferredKeyResolver(
        asRequest(request),
        'org-1',
      );

      await expect(resolveApiKey(REPLICATE_MODEL)).resolves.toBe('org-r8-key');
      expect(byokService.resolveApiKey).toHaveBeenCalledWith(
        'org-1',
        ByokProvider.REPLICATE,
      );
      expect(request.creditsConfig?.isByokBypass).toBe(true);
    });
  });

  describe('guardResolvedDispatch', () => {
    it('reuses the key CreditsGuard resolved for an allowByokBypass route', () => {
      expect(
        service.guardResolvedDispatch(
          asRequest({
            creditsConfig: {
              byokApiKeyOverride: 'org-or-key',
              isByokBypass: true,
              provider: ByokProvider.OPENROUTER,
            },
          }),
        ),
      ).toEqual({ keys: { [ByokProvider.OPENROUTER]: 'org-or-key' } });
      expect(byokService.resolveApiKey).not.toHaveBeenCalled();
    });

    it('fails closed when a bypass carries no usable text key', () => {
      expect(() =>
        service.guardResolvedDispatch(
          asRequest({
            creditsConfig: {
              byokApiKeyOverride: 'org-fal-key',
              isByokBypass: true,
              provider: ByokProvider.FAL,
            },
          }),
        ),
      ).toThrow(ConflictException);
    });
  });
});
