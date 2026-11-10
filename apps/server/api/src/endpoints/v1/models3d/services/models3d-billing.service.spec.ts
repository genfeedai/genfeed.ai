import { Models3dBillingService } from '@api/endpoints/v1/models3d/services/models3d-billing.service';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import { HttpException, ServiceUnavailableException } from '@nestjs/common';

const REQUEST = { id: 'hold-1' };

function setup({
  balance = 10,
  build = 27,
  holdError = null as Error | null,
  sheet = 50,
} = {}) {
  const credits = {
    getOrganizationCreditsBalance: vi.fn().mockResolvedValue(balance),
  };
  const generationBilling = {
    bindOutput: vi.fn().mockResolvedValue(undefined),
    holdForService: holdError
      ? vi.fn().mockRejectedValue(holdError)
      : vi.fn().mockResolvedValue(REQUEST),
    releaseOutput: vi.fn().mockResolvedValue(undefined),
    releasePool: vi.fn().mockResolvedValue(undefined),
  };
  const quotes = {
    quoteSnapshotByKey: vi.fn(async (modelKey: string) => ({
      credits: modelKey === 'firtoz/trellis' ? build : sheet,
    })),
  };
  const logger = { error: vi.fn() };
  const service = new Models3dBillingService(
    credits as never,
    generationBilling as never,
    logger as never,
    quotes as never,
  );
  return { credits, generationBilling, logger, quotes, service };
}

const HOLD = {
  brandId: 'brand-1',
  credits: 50,
  ingredientId: 'ing-1',
  organizationId: 'org-1',
  step: 'sheet' as const,
  userId: 'user-1',
};

describe('Models3dBillingService', () => {
  describe('quote', () => {
    it('freezes sheet 50, build 27 and a total of 77', async () => {
      const { service } = setup();

      await expect(service.quote('org-1')).resolves.toEqual({
        build: 27,
        sheet: 50,
        total: 77,
      });
    });

    it('prices the sheet at 2K and the build without selectors', async () => {
      const { quotes, service } = setup();

      await service.quote('org-1');

      expect(quotes.quoteSnapshotByKey).toHaveBeenCalledWith(
        'google/nano-banana-pro',
        expect.objectContaining({ selectors: { resolution: '2K' } }),
      );
      expect(quotes.quoteSnapshotByKey).toHaveBeenCalledWith(
        'firtoz/trellis',
        expect.not.objectContaining({ selectors: expect.anything() }),
      );
    });

    it('returns 503 when a rate is missing', async () => {
      const { service } = setup({ build: 0 });

      await expect(service.quote('org-1')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });

  describe('hold', () => {
    it('holds, binds the hold to the ingredient and releases the pool', async () => {
      const { generationBilling, service } = setup();

      await service.hold(HOLD);

      expect(generationBilling.holdForService).toHaveBeenCalledWith(
        expect.objectContaining({
          brandId: 'brand-1',
          credits: 50,
          organizationId: 'org-1',
          userId: 'user-1',
        }),
      );
      expect(generationBilling.bindOutput).toHaveBeenCalledWith(REQUEST, {
        credits: 50,
        ingredientId: 'ing-1',
        metadata: { models3dStep: 'sheet' },
      });
      expect(generationBilling.releasePool).toHaveBeenCalledWith(REQUEST);
    });

    it('releases the pool even when binding fails', async () => {
      const { generationBilling, service } = setup();
      generationBilling.bindOutput.mockRejectedValue(new Error('bind failed'));

      await expect(service.hold(HOLD)).rejects.toThrow('bind failed');

      expect(generationBilling.releasePool).toHaveBeenCalledWith(REQUEST);
    });

    it('answers 402 with required and available credits on a short balance', async () => {
      const { service } = setup({
        balance: 12,
        holdError: new BusinessLogicException(
          'Insufficient credits',
          { available: 12, required: 50 },
          'INSUFFICIENT_CREDITS',
        ),
      });

      const error = await service.hold(HOLD).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(402);
      expect((error as HttpException).getResponse()).toMatchObject({
        available: 12,
        required: 50,
      });
    });

    it('never binds when the balance is short', async () => {
      const { generationBilling, service } = setup({
        holdError: new BusinessLogicException(
          'Insufficient credits',
          { available: 12, required: 50 },
          'INSUFFICIENT_CREDITS',
        ),
      });

      await service.hold(HOLD).catch(() => undefined);

      expect(generationBilling.bindOutput).not.toHaveBeenCalled();
    });

    it('rethrows other hold errors untouched', async () => {
      const { service } = setup({ holdError: new Error('db down') });

      await expect(service.hold(HOLD)).rejects.toThrow('db down');
    });
  });

  describe('release', () => {
    it('refunds the ingredient hold', async () => {
      const { generationBilling, service } = setup();

      await service.release('ing-1', 'org-1');

      expect(generationBilling.releaseOutput).toHaveBeenCalledWith(
        'ing-1',
        'org-1',
      );
    });

    it('never throws when the refund fails', async () => {
      const { generationBilling, logger, service } = setup();
      generationBilling.releaseOutput.mockRejectedValue(new Error('boom'));

      await expect(service.release('ing-1', 'org-1')).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalled();
    });
  });
});
