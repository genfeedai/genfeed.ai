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
});
