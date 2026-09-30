import { reserveGenerationRequestCredits } from '@api/helpers/utils/credits/generation-credit-reservation.util';
import { CreditReservationStatus } from '@genfeedai/contracts';
import { describe, expect, it, vi } from 'vitest';

describe('reserveGenerationRequestCredits', () => {
  it('preserves a released attempt and creates a fresh hold for a retried source action', async () => {
    const reserveCredits = vi
      .fn()
      .mockResolvedValueOnce({
        amount: 10,
        id: 'released-reservation',
        status: CreditReservationStatus.RELEASED,
      })
      .mockResolvedValueOnce({
        amount: 10,
        id: 'retry-reservation',
        status: CreditReservationStatus.RESERVED,
      });
    const request = {
      body: { sourceActionId: 'source-action-1' },
      creditsConfig: { amount: 10 },
      user: { userId: 'user-1' },
    };

    await reserveGenerationRequestCredits({
      amount: 10,
      creditsUtilsService: { reserveCredits } as never,
      organizationId: 'org-1',
      request: request as never,
    });

    expect(reserveCredits).toHaveBeenCalledTimes(2);
    expect(reserveCredits.mock.calls[0]?.[0]).toMatchObject({
      idempotencyKey: 'generation:source-action-1',
    });
    expect(reserveCredits.mock.calls[1]?.[0]).toMatchObject({
      idempotencyKey: expect.stringMatching(
        /^generation:source-action-1:retry:/u,
      ),
    });
    expect(request.creditsConfig).toMatchObject({
      reservationId: 'retry-reservation',
    });
  });

  it('keeps the price pinned by an existing source-action reservation', async () => {
    const reserveCredits = vi.fn().mockResolvedValue({
      amount: 7,
      id: 'existing-reservation',
      settledAmount: null,
      status: CreditReservationStatus.RESERVED,
    });
    const request = {
      body: { sourceActionId: 'source-action-1' },
      creditsConfig: { amount: 10 },
      user: { userId: 'user-1' },
    };

    await reserveGenerationRequestCredits({
      amount: 10,
      creditsUtilsService: { reserveCredits } as never,
      organizationId: 'org-1',
      request: request as never,
    });

    expect(request.creditsConfig).toMatchObject({
      amount: 7,
      reservationId: 'existing-reservation',
    });
  });

  it('makes the hold self-describing so a completion path can settle it', async () => {
    const reserveCredits = vi.fn().mockResolvedValue({
      amount: 8,
      id: 'pool-1',
      status: CreditReservationStatus.RESERVED,
    });
    const request = {
      creditsConfig: {
        amount: 8,
        description: 'Avatar video generation',
        pricingMetadata: {
          marginMultiplier: 3.33,
          pricingType: 'flat',
          providerCostUsd: 0.5,
        },
        settlement: 'completion',
        source: 'video-generation',
      },
      user: { userId: 'user-1' },
    };

    await reserveGenerationRequestCredits({
      amount: 8,
      creditsUtilsService: { reserveCredits } as never,
      organizationId: 'org-1',
      request: request as never,
    });

    expect(reserveCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Avatar video generation',
        metadata: {
          marginMultiplier: 3.33,
          pricingType: 'flat',
          providerCostUsd: 0.5,
        },
        source: 'video-generation',
        workloadType: 'generation',
      }),
    );
    expect(request.creditsConfig).toMatchObject({
      reservationId: 'pool-1',
      settlement: 'completion',
    });
  });

  it('holds a generation for hours, not days', async () => {
    const reserveCredits = vi.fn().mockResolvedValue({
      amount: 8,
      id: 'pool-1',
      status: CreditReservationStatus.RESERVED,
    });

    await reserveGenerationRequestCredits({
      amount: 8,
      creditsUtilsService: { reserveCredits } as never,
      organizationId: 'org-1',
      request: {
        creditsConfig: { amount: 8, description: 'x' },
        user: { userId: 'user-1' },
      } as never,
    });

    const { expiresAt } = reserveCredits.mock.calls[0][0] as {
      expiresAt: Date;
    };
    expect(expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(
      2 * 60 * 60 * 1000,
    );
  });
});
