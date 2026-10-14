import { PostAccountGenerationBillingService } from '@api/collections/posts/services/post-account-generation-billing.service';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const scope = {
  actorUserId: 'user-1',
  brandId: 'brand-1',
  organizationId: 'org-1',
};

describe('PostAccountGenerationBillingService', () => {
  const credits = {
    bindReservationOutput: vi.fn(),
    checkOrganizationCreditsAvailable: vi.fn(),
    getOrganizationCreditsBalance: vi.fn(),
    releaseReservation: vi.fn(),
    reserveCredits: vi.fn(),
    settleReservation: vi.fn(),
  };
  const models = { findOne: vi.fn() };
  const textCredits = { resolveDispatch: vi.fn() };
  const logger = { warn: vi.fn() };
  let service: PostAccountGenerationBillingService;

  beforeEach(() => {
    vi.clearAllMocks();
    textCredits.resolveDispatch.mockResolvedValue(undefined);
    models.findOne.mockResolvedValue({ cost: 2, pricingType: 'flat' });
    credits.checkOrganizationCreditsAvailable.mockResolvedValue(true);
    credits.getOrganizationCreditsBalance.mockResolvedValue(3);
    credits.reserveCredits.mockResolvedValue({ id: 'pool-1' });
    credits.bindReservationOutput.mockResolvedValue({ id: 'hold-1' });
    credits.settleReservation.mockResolvedValue(undefined);
    credits.releaseReservation.mockResolvedValue(undefined);
    service = new PostAccountGenerationBillingService(
      credits as never,
      models as never,
      textCredits as never,
      logger as never,
    );
  });

  describe('reserveRun', () => {
    it('holds the whole run once, before any dispatch', async () => {
      const funding = await service.reserveRun({
        dispatchCount: 5,
        model: 'openai/gpt-5-mini',
        runId: 'run-1',
        scope,
      });

      expect(credits.reserveCredits).toHaveBeenCalledTimes(1);
      expect(credits.reserveCredits).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId: 'user-1',
          amount: 10,
          brandId: 'brand-1',
          idempotencyKey: 'generation:account-text:run-1',
          organizationId: 'org-1',
          workloadId: 'run-1',
          workloadType: 'generation',
        }),
      );
      expect(funding).toEqual({
        apiKey: undefined,
        creditsPerDispatch: 2,
        poolReservationId: 'pool-1',
      });
    });

    it('refuses with a 402 when the balance cannot cover every dispatch', async () => {
      credits.checkOrganizationCreditsAvailable.mockResolvedValue(false);

      await expect(
        service.reserveRun({
          dispatchCount: 5,
          model: 'openai/gpt-5-mini',
          runId: 'run-1',
          scope,
        }),
      ).rejects.toMatchObject({
        response: { detail: 'Insufficient credits: 10 required, 3 available' },
        status: 402,
      });
      expect(credits.reserveCredits).not.toHaveBeenCalled();
    });

    it('maps a lost race on the wallet to the same 402', async () => {
      credits.reserveCredits.mockRejectedValue(
        new BusinessLogicException('short', {}, 'INSUFFICIENT_CREDITS'),
      );

      await expect(
        service.reserveRun({
          dispatchCount: 5,
          model: 'openai/gpt-5-mini',
          runId: 'run-1',
          scope,
        }),
      ).rejects.toMatchObject({ status: 402 });
    });

    it('lets other reservation failures through unchanged', async () => {
      const failure = new Error('db down');
      credits.reserveCredits.mockRejectedValue(failure);

      await expect(
        service.reserveRun({
          dispatchCount: 1,
          model: 'openai/gpt-5-mini',
          runId: 'run-1',
          scope,
        }),
      ).rejects.toBe(failure);
    });

    it('takes no hold when the org brings its own key', async () => {
      textCredits.resolveDispatch.mockResolvedValue({
        keys: { openrouter: 'byok-key' },
      });

      await expect(
        service.reserveRun({
          dispatchCount: 5,
          model: 'openai/gpt-5-mini',
          runId: 'run-1',
          scope,
        }),
      ).resolves.toEqual({
        apiKey: 'byok-key',
        creditsPerDispatch: 0,
        poolReservationId: null,
      });
      expect(credits.reserveCredits).not.toHaveBeenCalled();
    });

    it('takes no hold for a free model', async () => {
      models.findOne.mockResolvedValue({ cost: 0, pricingType: 'flat' });

      const funding = await service.reserveRun({
        dispatchCount: 5,
        model: 'openai/gpt-5-mini',
        runId: 'run-1',
        scope,
      });

      expect(funding.poolReservationId).toBeNull();
      expect(credits.reserveCredits).not.toHaveBeenCalled();
    });
  });

  describe('queued funding', () => {
    it('never switches a funded platform run to a new BYOK key', async () => {
      await expect(
        service.queuedApiKey('openai/gpt-5-mini', scope, false),
      ).resolves.toBeUndefined();
      expect(textCredits.resolveDispatch).not.toHaveBeenCalled();
    });
    it('rechecks paid BYOK access at worker dispatch and refuses missing keys', async () => {
      await expect(
        service.queuedApiKey('openai/gpt-5-mini', scope, true),
      ).rejects.toMatchObject({ status: 409 });
      expect(textCredits.resolveDispatch).toHaveBeenCalledWith('org-1', [
        'openai/gpt-5-mini',
      ]);
    });
    it('uses the current organization key without reserving credits for BYOK', async () => {
      textCredits.resolveDispatch.mockResolvedValue({
        keys: { openrouter: 'current-key' },
      });
      await expect(
        service.queuedApiKey('openai/gpt-5-mini', scope, true),
      ).resolves.toBe('current-key');
      expect(credits.reserveCredits).not.toHaveBeenCalled();
    });
    it('refuses missing model pricing rather than treating it as free', async () => {
      models.findOne.mockResolvedValue(null);
      await expect(
        service.reserveRun({
          dispatchCount: 2,
          model: 'missing',
          runId: 'r',
          scope,
        }),
      ).rejects.toMatchObject({ status: 503 });
      expect(credits.reserveCredits).not.toHaveBeenCalled();
    });
  });

  describe('per dispatch', () => {
    const funding = {
      apiKey: undefined,
      creditsPerDispatch: 2,
      poolReservationId: 'pool-1',
    };

    it('carves the dispatch share out of the pool under the text workload type', async () => {
      await expect(
        service.bindDispatch(funding, scope, 'run-1:0'),
      ).resolves.toBe('hold-1');

      expect(credits.bindReservationOutput).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 2,
          organizationId: 'org-1',
          reservationId: 'pool-1',
          workloadId: 'run-1:0',
          workloadType: 'text-generation',
        }),
      );
    });

    it('binds nothing when the run holds nothing', async () => {
      await expect(
        service.bindDispatch(
          { ...funding, poolReservationId: null },
          scope,
          'run-1:0',
        ),
      ).resolves.toBeNull();
      expect(credits.bindReservationOutput).not.toHaveBeenCalled();
    });

    it('settles the dispatch hold at its known price, idempotently per dispatch', async () => {
      await service.settleDispatch(funding, scope, 'hold-1', 'run-1:0');

      expect(credits.settleReservation).toHaveBeenCalledWith(
        expect.objectContaining({
          actualAmount: 2,
          organizationId: 'org-1',
          reservationId: 'hold-1',
          settlementIdempotencyKey: 'text-generation:run-1:0:settled',
        }),
      );
    });

    it('returns an unused dispatch hold and the unclaimed remainder', async () => {
      await service.releaseDispatch(scope, 'hold-1');
      await service.releaseRun(funding, scope);

      expect(credits.releaseReservation).toHaveBeenCalledWith({
        organizationId: 'org-1',
        reservationId: 'hold-1',
      });
      expect(credits.releaseReservation).toHaveBeenCalledWith({
        organizationId: 'org-1',
        reservationId: 'pool-1',
      });
    });

    it('never fails the run when a release fails; expiry returns the hold', async () => {
      credits.releaseReservation.mockRejectedValue(new Error('db down'));

      await expect(service.releaseRun(funding, scope)).resolves.toBeUndefined();
      expect(logger.warn).toHaveBeenCalled();
    });

    it('has nothing to release for a hold-free run', async () => {
      await service.releaseRun({ ...funding, poolReservationId: null }, scope);
      expect(credits.releaseReservation).not.toHaveBeenCalled();
    });
  });
});
