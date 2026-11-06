import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { TurboProjectCreditsService } from '@api/collections/turbo-projects/services/turbo-project-credits.service';
import { UnsettleableReservationException } from '@api/exceptions/business-logic.exception';
import { photoAnimationSnapshot } from '@api/helpers/utils/credits/avatar-duration-quote.fixture';
import { ActivitySource, CreditReservationStatus } from '@genfeedai/contracts';
import type { ITurboProjectItemDispatch } from '@genfeedai/contracts/interfaces';
import { ConflictException } from '@nestjs/common';

const dispatch: ITurboProjectItemDispatch = {
  attempt: 1,
  billingMode: 'platform',
  credits: 8,
  key: 'turbo-project-item:item-1:dispatch:1',
  model: 'heygen-avatar',
  state: 'queued',
};

interface Reservation {
  amount: number;
  id: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
  organizationId: string;
  settledAmount: number | null;
  status: CreditReservationStatus;
  workloadId: string;
  workloadType: string;
}

interface ReservationLookup {
  idempotencyKey?: string;
  organizationId: string;
  reservationId?: string;
}

// The organization's credit ledger: holds keyed by idempotency key, and the
// direct charges made outside a hold.
function createLedger() {
  const ledger = {
    charges: [] as { amount: number; organizationId: string }[],
    reservations: new Map<string, Reservation>(),
  };
  const find = ({
    idempotencyKey,
    organizationId,
    reservationId,
  }: ReservationLookup) =>
    [...ledger.reservations.values()].find(
      (reservation) =>
        reservation.organizationId === organizationId &&
        (reservationId
          ? reservation.id === reservationId
          : reservation.idempotencyKey === idempotencyKey),
    );

  const credits = {
    deductCreditsFromOrganization: async (
      organizationId: string,
      _actorUserId: string,
      amount: number,
    ) => {
      ledger.charges.push({ amount, organizationId });
    },
    findReservationForWorkload: async (lookup: {
      organizationId: string;
      workloadId: string;
      workloadType: string;
    }) =>
      [...ledger.reservations.values()].find(
        (reservation) =>
          reservation.organizationId === lookup.organizationId &&
          reservation.workloadId === lookup.workloadId &&
          reservation.workloadType === lookup.workloadType,
      ) ?? null,
    releaseReservation: async (lookup: ReservationLookup) => {
      const reservation = find(lookup);
      if (reservation) {
        reservation.status = CreditReservationStatus.RELEASED;
      }
    },
    reserveCredits: async (input: {
      amount: number;
      idempotencyKey: string;
      metadata?: Record<string, unknown>;
      organizationId: string;
      workloadId: string;
      workloadType: string;
    }) => {
      const existing = find(input);
      if (existing) {
        return existing;
      }
      const reservation: Reservation = {
        amount: input.amount,
        id: `reservation-${ledger.reservations.size + 1}`,
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata,
        organizationId: input.organizationId,
        settledAmount: null,
        status: CreditReservationStatus.RESERVED,
        workloadId: input.workloadId,
        workloadType: input.workloadType,
      };
      ledger.reservations.set(reservation.id, reservation);
      return reservation;
    },
    settleReservation: async (
      input: ReservationLookup & { actualAmount: number },
    ) => {
      const reservation = find(input);
      if (!reservation) {
        throw new Error('Reservation not found');
      }
      if (reservation.status !== CreditReservationStatus.RESERVED) {
        throw new UnsettleableReservationException(reservation.status);
      }
      reservation.status = CreditReservationStatus.SETTLED;
      reservation.settledAmount = input.actualAmount;
    },
  };
  return {
    ledger,
    service: new TurboProjectCreditsService(
      credits as unknown as CreditsUtilsService,
    ),
  };
}

const settleInput = {
  actorUserId: 'user-1',
  description: 'Turbo idea video generation',
  organizationId: 'org-1',
  source: ActivitySource.VIDEO_GENERATION,
};

describe('TurboProjectCreditsService', () => {
  it('holds a paid line under its dispatch key', async () => {
    const { ledger, service } = createLedger();

    const reservationId = await service.reserve({
      actorUserId: 'user-1',
      dispatch,
      organizationId: 'org-1',
    });

    expect(ledger.reservations.get(String(reservationId))).toMatchObject({
      amount: 8,
      idempotencyKey: dispatch.key,
      status: CreditReservationStatus.RESERVED,
      workloadType: 'turbo-project-idea',
    });
  });

  it('reuses the hold when the same dispatch is reserved again', async () => {
    const { ledger, service } = createLedger();
    const reserve = () =>
      service.reserve({
        actorUserId: 'user-1',
        dispatch,
        organizationId: 'org-1',
      });

    const first = await reserve();

    await expect(reserve()).resolves.toBe(first);
    expect(ledger.reservations.size).toBe(1);
  });

  it('never reuses a refunded hold', async () => {
    const { service } = createLedger();
    const reservationId = await service.reserve({
      actorUserId: 'user-1',
      dispatch,
      organizationId: 'org-1',
    });
    await service.release({
      dispatch: { ...dispatch, reservationId },
      organizationId: 'org-1',
    });

    await expect(
      service.reserve({
        actorUserId: 'user-1',
        dispatch,
        organizationId: 'org-1',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('never touches platform credits for a BYOK line', async () => {
    const { ledger, service } = createLedger();
    const byok = { ...dispatch, billingMode: 'byok' as const, credits: 0 };

    await expect(
      service.reserve({
        actorUserId: 'user-1',
        dispatch: byok,
        organizationId: 'org-1',
      }),
    ).resolves.toBeUndefined();
    await expect(
      service.settle({ ...settleInput, dispatch: byok }),
    ).resolves.toEqual({ settledCredits: 0, state: 'settled' });
    await service.release({ dispatch: byok, organizationId: 'org-1' });

    expect(ledger.reservations.size).toBe(0);
    expect(ledger.charges).toEqual([]);
  });

  it('charges exactly the accepted line on settlement', async () => {
    const { ledger, service } = createLedger();
    const reservationId = await service.reserve({
      actorUserId: 'user-1',
      dispatch,
      organizationId: 'org-1',
    });

    await expect(
      service.settle({
        ...settleInput,
        dispatch: { ...dispatch, reservationId, state: 'reserved' },
      }),
    ).resolves.toEqual({ settledCredits: 8, state: 'settled' });
    expect(ledger.reservations.get(String(reservationId))).toMatchObject({
      settledAmount: 8,
      status: CreditReservationStatus.SETTLED,
    });
  });

  it('reports an expired hold as released instead of charging', async () => {
    const { ledger, service } = createLedger();
    const reservationId = String(
      await service.reserve({
        actorUserId: 'user-1',
        dispatch,
        organizationId: 'org-1',
      }),
    );
    const reservation = ledger.reservations.get(reservationId) as Reservation;
    reservation.status = CreditReservationStatus.EXPIRED;

    await expect(
      service.settle({
        ...settleInput,
        dispatch: { ...dispatch, reservationId },
      }),
    ).resolves.toEqual({ state: 'released' });
    expect(reservation.settledAmount).toBeNull();
  });

  it('releases a failed line by its reservation', async () => {
    const { ledger, service } = createLedger();
    const reservationId = await service.reserve({
      actorUserId: 'user-1',
      dispatch,
      organizationId: 'org-1',
    });

    await service.release({
      dispatch: { ...dispatch, reservationId },
      organizationId: 'org-1',
    });

    expect(ledger.reservations.get(String(reservationId))?.status).toBe(
      CreditReservationStatus.RELEASED,
    );
  });

  describe('per-second avatar lines (#6933)', () => {
    // $0.0385/s at 3.33x: a 12 s clip holds 154 credits, 8 s costs 103.
    const durationQuote = {
      estimatedSeconds: 12,
      snapshot: photoAnimationSnapshot(12),
    };
    const avatarDispatch: ITurboProjectItemDispatch = {
      ...dispatch,
      credits: 154,
      model: 'heygen/avatar',
      state: 'queued',
    };

    it('keeps the frozen quote on the avatar hold', async () => {
      const { ledger, service } = createLedger();

      const reservationId = await service.reserve({
        actorUserId: 'user-1',
        dispatch: avatarDispatch,
        durationQuote,
        organizationId: 'org-1',
      });

      expect(ledger.reservations.get(String(reservationId))).toMatchObject({
        amount: 154,
        metadata: { avatarDurationQuote: durationQuote },
      });
    });

    it('settles an avatar line to the measured clip length', async () => {
      const { ledger, service } = createLedger();
      const reservationId = await service.reserve({
        actorUserId: 'user-1',
        dispatch: avatarDispatch,
        durationQuote,
        organizationId: 'org-1',
      });

      await expect(
        service.settle({
          ...settleInput,
          clip: { durationSeconds: 8 },
          description: 'Turbo idea avatar generation',
          dispatch: { ...avatarDispatch, reservationId, state: 'reserved' },
        }),
      ).resolves.toEqual({ settledCredits: 103, state: 'settled' });
      expect(ledger.reservations.get(String(reservationId))).toMatchObject({
        settledAmount: 103,
        status: CreditReservationStatus.SETTLED,
      });
      expect(ledger.charges).toEqual([]);
    });
  });
});
