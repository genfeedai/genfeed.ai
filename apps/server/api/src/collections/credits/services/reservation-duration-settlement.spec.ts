import {
  reservationDurationTopUpKey,
  settleReservationAtDuration,
} from '@api/collections/credits/services/reservation-duration-settlement';
import { UnsettleableReservationException } from '@api/exceptions/business-logic.exception';
import { photoAnimationSnapshot } from '@api/helpers/utils/credits/avatar-duration-quote.fixture';
import { ActivitySource, CreditReservationStatus } from '@genfeedai/contracts';
import { MEDIA_GENERATION_LATE_SETTLEMENT_MAX_OVERDRAFT_CREDITS } from '@genfeedai/contracts/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// $0.0385/s at 3.33x: a 12 s hold is 154 credits, 8 s costs 103, 20 s costs 257.
const HELD = 154;

function reservation(overrides: Record<string, unknown> = {}) {
  return {
    amount: HELD,
    id: 'reservation-1',
    metadata: {
      avatarDurationQuote: {
        estimatedSeconds: 12,
        snapshot: photoAnimationSnapshot(12),
      },
    },
    settledAmount: null,
    status: CreditReservationStatus.RESERVED,
    ...overrides,
  };
}

const input = {
  actorUserId: 'user-1',
  brandId: 'brand-1',
  description: 'Remix video',
  fallbackCredits: HELD,
  organizationId: 'org-1',
  source: ActivitySource.VIDEO_GENERATION,
  workloadId: 'remix-run-op-scene-video-1',
  workloadType: 'brand-remix-scene',
};

describe('settleReservationAtDuration', () => {
  const credits = {
    deductCreditsFromOrganization: vi.fn(),
    findReservationForWorkload: vi.fn(),
    settleReservation: vi.fn(),
  };
  const deps = { credits: credits as never };

  beforeEach(() => {
    vi.clearAllMocks();
    credits.findReservationForWorkload.mockResolvedValue(reservation());
  });

  it('settles a shorter clip below the hold so the rest is refunded', async () => {
    await expect(
      settleReservationAtDuration(deps, { ...input, actualSeconds: 8 }),
    ).resolves.toEqual({ settledCredits: 103, topUpCredits: 0 });

    expect(credits.findReservationForWorkload).toHaveBeenCalledWith({
      organizationId: 'org-1',
      workloadId: input.workloadId,
      workloadType: 'brand-remix-scene',
    });
    expect(credits.settleReservation).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        actualAmount: 103,
        metadata: {
          durationSettlement: {
            actualCredits: 103,
            actualSeconds: 8,
            estimatedSeconds: 12,
            heldCredits: HELD,
          },
        },
        reservationId: 'reservation-1',
      }),
    );
    expect(credits.deductCreditsFromOrganization).not.toHaveBeenCalled();
  });

  it('settles the whole hold and tops up a longer clip under one key', async () => {
    await expect(
      settleReservationAtDuration(deps, { ...input, actualSeconds: 20 }),
    ).resolves.toEqual({ settledCredits: HELD, topUpCredits: 103 });

    expect(credits.settleReservation).toHaveBeenCalledWith(
      expect.objectContaining({ actualAmount: HELD }),
    );
    expect(
      credits.deductCreditsFromOrganization,
    ).toHaveBeenCalledExactlyOnceWith(
      'org-1',
      'user-1',
      103,
      'Remix video (duration top-up)',
      ActivitySource.VIDEO_GENERATION,
      {
        brandId: 'brand-1',
        idempotencyKey: reservationDurationTopUpKey('reservation-1'),
        maxOverdraftCredits:
          MEDIA_GENERATION_LATE_SETTLEMENT_MAX_OVERDRAFT_CREDITS,
        metadata: { durationTopUpOfReservationId: 'reservation-1' },
      },
    );
    expect(credits.settleReservation.mock.invocationCallOrder[0]).toBeLessThan(
      credits.deductCreditsFromOrganization.mock.invocationCallOrder[0],
    );
  });

  it('keeps the amount a retry already settled instead of re-pricing it', async () => {
    credits.findReservationForWorkload.mockResolvedValue(
      reservation({
        settledAmount: 103,
        status: CreditReservationStatus.SETTLED,
      }),
    );

    // The retry reports a different length; the settled hold still wins.
    await expect(
      settleReservationAtDuration(deps, { ...input, actualSeconds: 20 }),
    ).resolves.toEqual({ settledCredits: 103, topUpCredits: 0 });
    expect(credits.settleReservation).not.toHaveBeenCalled();
    expect(credits.deductCreditsFromOrganization).not.toHaveBeenCalled();
  });

  it('replays the overrun of a hold that settled whole under the same key', async () => {
    credits.findReservationForWorkload.mockResolvedValue(
      reservation({
        settledAmount: HELD,
        status: CreditReservationStatus.SETTLED,
      }),
    );

    await settleReservationAtDuration(deps, { ...input, actualSeconds: 20 });

    expect(credits.settleReservation).not.toHaveBeenCalled();
    expect(credits.deductCreditsFromOrganization).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      103,
      expect.any(String),
      ActivitySource.VIDEO_GENERATION,
      expect.objectContaining({
        idempotencyKey: reservationDurationTopUpKey('reservation-1'),
      }),
    );
  });

  it('settles at the estimate, never zero, without a measured length', async () => {
    await expect(settleReservationAtDuration(deps, input)).resolves.toEqual({
      settledCredits: HELD,
      topUpCredits: 0,
    });
    expect(credits.settleReservation).toHaveBeenCalledWith(
      expect.objectContaining({ actualAmount: HELD }),
    );
  });

  it('settles a hold without a per-second quote at the accepted amount', async () => {
    credits.findReservationForWorkload.mockResolvedValue(
      reservation({ metadata: null }),
    );

    await expect(
      settleReservationAtDuration(deps, { ...input, actualSeconds: 20 }),
    ).resolves.toEqual({ settledCredits: HELD, topUpCredits: 0 });
    expect(credits.settleReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        actualAmount: HELD,
        reservationId: 'reservation-1',
      }),
    );
    expect(credits.deductCreditsFromOrganization).not.toHaveBeenCalled();
  });

  it('charges no overrun for a hold that was already released', async () => {
    credits.settleReservation.mockRejectedValue(
      new UnsettleableReservationException(CreditReservationStatus.RELEASED),
    );

    await expect(
      settleReservationAtDuration(deps, { ...input, actualSeconds: 20 }),
    ).rejects.toBeInstanceOf(UnsettleableReservationException);
    expect(credits.deductCreditsFromOrganization).not.toHaveBeenCalled();
  });
});
