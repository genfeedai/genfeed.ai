import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import {
  reservationDurationTopUpKey,
  settleReservationAtDuration,
} from '@api/collections/credits/services/reservation-duration-settlement';
import { UnsettleableReservationException } from '@api/exceptions/business-logic.exception';
import { photoAnimationSnapshot } from '@api/helpers/utils/credits/avatar-duration-quote.fixture';
import { ActivitySource, CreditReservationStatus } from '@genfeedai/contracts';
import { MEDIA_GENERATION_LATE_SETTLEMENT_MAX_OVERDRAFT_CREDITS } from '@genfeedai/contracts/constants';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it } from 'vitest';

// $0.0385/s at 3.33x: a 12 s hold is 154 credits, 8 s costs 103. 20 s is $0.77,
// past the $0.50 taper knee: $1.665 + $0.27 x 2.0 = 221 credits.
const HELD = 154;

interface ReservationRow {
  amount: number;
  id: string;
  metadata: Record<string, unknown> | null;
  organizationId: string;
  settledAmount: number | null;
  status: CreditReservationStatus;
  workloadId: string;
  workloadType: string;
}

type LedgerEntry =
  | {
      amount: number;
      kind: 'settle';
      metadata?: Record<string, unknown>;
      target: string;
    }
  | {
      amount: number;
      description: string;
      kind: 'top-up';
      options: Record<string, unknown>;
      organizationId: string;
      source: ActivitySource;
      userId: string;
    };

function reservation(overrides: Partial<ReservationRow> = {}): ReservationRow {
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
    organizationId: 'org-1',
    status: CreditReservationStatus.RESERVED,
    workloadId: 'remix-run-op-scene-video-1',
    workloadType: 'brand-remix-scene',
    ...overrides,
  } as ReservationRow;
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
  let reservations: ReservationRow[];
  let ledger: LedgerEntry[];
  let loggedErrors: Array<{ context: unknown; message: string }>;
  let credits: CreditsUtilsService;
  let deps: { credits: CreditsUtilsService };

  beforeEach(() => {
    reservations = [reservation()];
    ledger = [];
    loggedErrors = [];

    const fake = {
      deductCreditsFromOrganization: async (
        organizationId: string,
        userId: string,
        amount: number,
        description: string,
        source: ActivitySource,
        options: Record<string, unknown>,
      ) => {
        ledger.push({
          amount,
          description,
          kind: 'top-up',
          options,
          organizationId,
          source,
          userId,
        });
      },
      findReservationForWorkload: async (where: {
        organizationId: string;
        workloadId: string;
        workloadType: string;
      }) =>
        reservations.find(
          (row) =>
            row.organizationId === where.organizationId &&
            row.workloadId === where.workloadId &&
            row.workloadType === where.workloadType,
        ) ?? null,
      settleReservation: async (request: {
        actualAmount: number;
        idempotencyKey?: string;
        metadata?: Record<string, unknown>;
        reservationId?: string;
      }) => {
        const row = reservations.find(
          (candidate) => candidate.id === request.reservationId,
        );
        if (row && row.status !== CreditReservationStatus.RESERVED) {
          throw new UnsettleableReservationException(row.status);
        }
        if (row) {
          row.status = CreditReservationStatus.SETTLED;
          row.settledAmount = request.actualAmount;
        }
        ledger.push({
          amount: request.actualAmount,
          kind: 'settle',
          ...(request.metadata ? { metadata: request.metadata } : {}),
          target: request.reservationId ?? `key:${request.idempotencyKey}`,
        });
      },
    };
    credits = fake as unknown as CreditsUtilsService;
    deps = { credits };
  });

  it('settles a shorter clip below the hold so the rest is refunded', async () => {
    await expect(
      settleReservationAtDuration(deps, { ...input, actualSeconds: 8 }),
    ).resolves.toEqual({ settledCredits: 103, topUpCredits: 0 });

    expect(ledger).toEqual([
      {
        amount: 103,
        kind: 'settle',
        metadata: {
          durationSettlement: {
            actualCredits: 103,
            actualSeconds: 8,
            estimatedSeconds: 12,
            heldCredits: HELD,
          },
        },
        target: 'reservation-1',
      },
    ]);
    expect(reservations[0]).toMatchObject({
      settledAmount: 103,
      status: CreditReservationStatus.SETTLED,
    });
  });

  it('settles the whole hold, then tops up a longer clip under one key', async () => {
    await expect(
      settleReservationAtDuration(deps, { ...input, actualSeconds: 20 }),
    ).resolves.toEqual({ settledCredits: HELD, topUpCredits: 67 });

    expect(ledger).toEqual([
      expect.objectContaining({
        amount: HELD,
        kind: 'settle',
        target: 'reservation-1',
      }),
      {
        amount: 67,
        description: 'Remix video (duration top-up)',
        kind: 'top-up',
        options: {
          brandId: 'brand-1',
          idempotencyKey: reservationDurationTopUpKey('reservation-1'),
          maxOverdraftCredits:
            MEDIA_GENERATION_LATE_SETTLEMENT_MAX_OVERDRAFT_CREDITS,
          metadata: { durationTopUpOfReservationId: 'reservation-1' },
        },
        organizationId: 'org-1',
        source: ActivitySource.VIDEO_GENERATION,
        userId: 'user-1',
      },
    ]);
  });

  it('caps the overrun at twice the hold and reports the excess', async () => {
    const logger = {
      error: (message: string, context: unknown) => {
        loggedErrors.push({ context, message });
      },
      warn: () => {},
    };

    // 60 s costs 529 credits; the render may charge at most 2 x 154 = 308.
    await expect(
      settleReservationAtDuration(
        { credits, logger: logger as unknown as LoggerService },
        { ...input, actualSeconds: 60 },
      ),
    ).resolves.toEqual({ settledCredits: HELD, topUpCredits: HELD });

    expect(ledger.map((entry) => [entry.kind, entry.amount])).toEqual([
      ['settle', HELD],
      ['top-up', HELD],
    ]);
    expect(loggedErrors).toEqual([
      {
        context: expect.objectContaining({ forgoneCredits: 221 }),
        message: expect.stringContaining('per-render charge cap'),
      },
    ]);
  });

  it('keeps the amount a retry already settled instead of re-pricing it', async () => {
    reservations = [
      reservation({
        settledAmount: 103,
        status: CreditReservationStatus.SETTLED,
      }),
    ];

    // The retry reports a different length; the settled hold still wins.
    await expect(
      settleReservationAtDuration(deps, { ...input, actualSeconds: 20 }),
    ).resolves.toEqual({ settledCredits: 103, topUpCredits: 0 });
    expect(ledger).toEqual([]);
  });

  it('replays the overrun of a hold that settled whole under the same key', async () => {
    reservations = [
      reservation({
        settledAmount: HELD,
        status: CreditReservationStatus.SETTLED,
      }),
    ];

    await expect(
      settleReservationAtDuration(deps, { ...input, actualSeconds: 20 }),
    ).resolves.toEqual({ settledCredits: HELD, topUpCredits: 67 });

    expect(ledger).toEqual([
      expect.objectContaining({
        amount: 67,
        kind: 'top-up',
        options: expect.objectContaining({
          idempotencyKey: reservationDurationTopUpKey('reservation-1'),
        }),
      }),
    ]);
  });

  it('settles at the estimate, never zero, without a measured length', async () => {
    await expect(settleReservationAtDuration(deps, input)).resolves.toEqual({
      settledCredits: HELD,
      topUpCredits: 0,
    });
    expect(ledger).toEqual([
      expect.objectContaining({ amount: HELD, kind: 'settle' }),
    ]);
  });

  it('settles a hold without a per-second quote at the accepted amount', async () => {
    reservations = [reservation({ metadata: null })];

    await expect(
      settleReservationAtDuration(deps, { ...input, actualSeconds: 20 }),
    ).resolves.toEqual({ settledCredits: HELD, topUpCredits: 0 });
    expect(ledger).toEqual([
      { amount: HELD, kind: 'settle', target: 'reservation-1' },
    ]);
  });

  it('settles by the workload key when no hold is found', async () => {
    reservations = [reservation({ organizationId: 'org-2' })];

    await expect(
      settleReservationAtDuration(deps, { ...input, actualSeconds: 20 }),
    ).resolves.toEqual({ settledCredits: HELD, topUpCredits: 0 });
    expect(ledger).toEqual([
      {
        amount: HELD,
        kind: 'settle',
        target: `key:${input.workloadId}`,
      },
    ]);
    expect(reservations[0]?.status).toBe(CreditReservationStatus.RESERVED);
  });

  it('charges no overrun for a hold that was already released', async () => {
    reservations = [reservation({ status: CreditReservationStatus.RELEASED })];

    await expect(
      settleReservationAtDuration(deps, { ...input, actualSeconds: 20 }),
    ).rejects.toBeInstanceOf(UnsettleableReservationException);
    expect(ledger).toEqual([]);
  });
});
