import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { ModelsService } from '@api/collections/models/services/models.service';
import { LiveSessionCreditsService } from '@api/collections/videos/services/live-session-credits.service';
import {
  BusinessLogicException,
  UnsettleableReservationException,
} from '@api/exceptions/business-logic.exception';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  LiveSessionStatus,
  LiveSessionTerminateReason,
} from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { IReserveCreditsInput } from '@genfeedai/contracts/interfaces/billing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';

type Row = Record<string, unknown>;

interface Hold {
  amount: number;
  expiresAt?: Date;
  id: string;
  organizationId: string;
  settledAmount?: number;
  status: 'EXPIRED' | 'RELEASED' | 'RESERVED' | 'SETTLED';
  workloadType?: string;
}

const DIRECTOR = MODEL_KEYS.FAL_MINIMAX_H3_MAX_DIRECTOR;
const START = new Date('2026-09-18T12:00:00.000Z');
const CEILING = new Date('2026-09-18T12:15:00.000Z');
const directorPricing = {
  cost: 400,
  costPerUnit: 27,
  minCost: 400,
  pricingType: 'per-second',
  provider: 'fal',
  providerCostUsd: 0.08,
};
const user = {
  brandId: 'brand-1',
  id: 'user-1',
  organizationId: 'org-1',
  userId: 'user-1',
} as unknown as AuthenticatedUser;
const owner = {
  organizationId: 'org-1',
  sessionId: 'session-1',
  userId: 'user-1',
};

const at = (seconds: number) => new Date(START.getTime() + seconds * 1000);
const deferredRequest = () => ({
  creditsConfig: { deferred: true, description: 'Live session' },
  user,
});

describe('LiveSessionCreditsService', () => {
  // The organization's wallet, its live session rows, and the model's price.
  let balance: number;
  let holds: Hold[];
  let sessions: Row[];
  let modelPricing: Row;
  let isSessionWriteDown: boolean;
  // Another workload holds credits between the balance check and the reservation.
  let racingHold: number;
  let service: LiveSessionCreditsService;

  const available = () =>
    balance -
    holds
      .filter((hold) => hold.status === 'RESERVED')
      .reduce((sum, hold) => sum + hold.amount, 0);
  const holdOf = (id: string) => holds.find((hold) => hold.id === id);
  const sessionOf = (id: string) => sessions.find((row) => row.id === id);
  const matches = (row: Row, where: Row) =>
    Object.entries(where).every(([key, value]) => row[key] === value);
  const seedOpenSession = (id: string, hold: Partial<Hold> = {}) => {
    const reservationId = `reservation-${id}`;
    holds.push({
      amount: 24_300,
      id: reservationId,
      organizationId: 'org-1',
      status: 'RESERVED',
      workloadType: 'live-session',
      ...hold,
    });
    sessions.push({
      brandId: 'brand-1',
      ceilingEndsAt: CEILING,
      ceilingSeconds: 900,
      elapsedSeconds: null,
      id,
      isByokBypass: false,
      isDeleted: false,
      modelKey: DIRECTOR,
      organizationId: 'org-1',
      reservationId,
      reservedCredits: 24_300,
      resolution: '768P',
      settledCredits: null,
      startedAt: START,
      status: LiveSessionStatus.OPEN,
      terminateReason: null,
      terminatedAt: null,
      userId: 'user-1',
    });
  };
  const open = (fields: Row = {}, request = deferredRequest()) =>
    service.openSession({
      dto: {
        ceilingSeconds: 900,
        model: DIRECTOR,
        resolution: '768P',
        ...fields,
      },
      now: START,
      request,
      user,
    });

  beforeEach(() => {
    balance = 100_000;
    holds = [];
    sessions = [];
    modelPricing = directorPricing;
    isSessionWriteDown = false;
    racingHold = 0;

    const prisma = {
      liveSession: {
        create: async ({ data }: { data: Row }) => {
          if (isSessionWriteDown) throw new Error('session write failed');
          const row = {
            ...data,
            id: `session-${sessions.length + 1}`,
            isByokBypass: false,
            isDeleted: false,
          };
          sessions.push(row);
          return row;
        },
        findFirst: async ({ where }: { where: Row }) =>
          sessions.find((row) => matches(row, where)) ?? null,
        findMany: async ({
          where,
        }: {
          where: { ceilingEndsAt: { lte: Date } };
        }) =>
          sessions.filter(
            (row) =>
              row.status === LiveSessionStatus.OPEN &&
              row.isDeleted === false &&
              (row.ceilingEndsAt as Date) <= where.ceilingEndsAt.lte,
          ),
        update: async ({ data, where }: { data: Row; where: Row }) =>
          Object.assign(
            sessions.find((row) => matches(row, where)) as Row,
            data,
          ),
      },
    };
    // The wallet enforces what the real reservation ledger does: a hold settles
    // once, never above its amount, and not after it expired or was released.
    const credits = {
      checkOrganizationCreditsAvailable: async (_org: string, amount: number) =>
        available() >= amount,
      getOrganizationCreditsBalance: async () => available(),
      releaseReservation: async ({
        reservationId,
      }: {
        reservationId: string;
      }) => {
        Object.assign(holdOf(reservationId) ?? {}, { status: 'RELEASED' });
      },
      reserveCredits: async (input: IReserveCreditsInput) => {
        if (racingHold > 0) {
          holds.push({
            amount: racingHold,
            id: 'racing-hold',
            organizationId: input.organizationId,
            status: 'RESERVED',
            workloadType: 'video',
          });
        }
        if (available() < input.amount) {
          throw new BusinessLogicException(
            'Insufficient credits',
            { available: available(), required: input.amount },
            'INSUFFICIENT_CREDITS',
          );
        }
        const hold: Hold = {
          amount: input.amount,
          expiresAt: input.expiresAt,
          id: `reservation-${holds.length + 1}`,
          organizationId: input.organizationId,
          status: 'RESERVED',
          workloadType: input.workloadType,
        };
        holds.push(hold);
        return hold;
      },
      settleReservation: async (input: {
        actualAmount: number;
        reservationId: string;
      }) => {
        const hold = holdOf(input.reservationId) as Hold;
        if (hold.status === 'EXPIRED' || hold.status === 'RELEASED') {
          throw new UnsettleableReservationException(hold.status);
        }
        if (
          hold.status === 'SETTLED' &&
          hold.settledAmount !== input.actualAmount
        ) {
          throw new BusinessLogicException(
            'Settlement amount does not match the completed reservation',
            {},
            'SETTLEMENT_AMOUNT_MISMATCH',
          );
        }
        if (input.actualAmount > hold.amount) {
          throw new BusinessLogicException(
            'Settlement amount exceeds the reserved amount',
            {},
            'SETTLEMENT_EXCEEDS_RESERVATION',
          );
        }
        Object.assign(hold, {
          settledAmount: input.actualAmount,
          status: 'SETTLED',
        });
        balance -= input.actualAmount;
      },
    };
    service = new LiveSessionCreditsService(
      prisma as unknown as PrismaService,
      credits as unknown as CreditsUtilsService,
      { findOne: async () => modelPricing } as unknown as ModelsService,
    );
  });

  describe('openSession', () => {
    it('reserves the ceiling until it ends, then persists the session on that hold', async () => {
      const request = deferredRequest();

      const session = await open({}, request);

      expect(holds).toEqual([
        {
          amount: 24_300,
          expiresAt: CEILING,
          id: 'reservation-1',
          organizationId: 'org-1',
          status: 'RESERVED',
          workloadType: 'live-session',
        },
      ]);
      expect(session).toMatchObject({
        ceilingEndsAt: CEILING,
        ceilingSeconds: 900,
        reservationId: 'reservation-1',
        reservedCredits: 24_300,
        status: LiveSessionStatus.OPEN,
      });
      expect(request.creditsConfig).toMatchObject({
        deferred: true,
        reservationId: 'reservation-1',
      });
    });

    // #5294 no backend call ever establishes the live streaming session with a
    // provider, so there is nowhere to thread an org's BYOK key: this route
    // always reserves and charges credits, even for a provider that would
    // resolve a BYOK bypass elsewhere (e.g. Replicate).
    it('always reserves credits, even for a Replicate-provider model', async () => {
      modelPricing = { ...directorPricing, provider: 'replicate' };
      const request = deferredRequest();

      const session = await open({}, request);

      expect(holds.map(({ amount }) => amount)).toEqual([24_300]);
      expect(session.isByokBypass).toBe(false);
      expect(request.creditsConfig).not.toHaveProperty('isByokBypass');
    });

    it.each([
      ['768P', 24_300],
      ['1080P', 48_600],
    ])(
      'reserves the %s ceiling at its resolution price',
      async (resolution, amount) => {
        await open({ resolution });

        expect(holds.map((hold) => hold.amount)).toEqual([amount]);
      },
    );

    it.each([
      ['the balance cannot cover the ceiling', 24_299, 0],
      [
        'another hold takes the balance before the reservation',
        100_000,
        90_000,
      ],
    ])('refuses to open with 402 when %s', async (_case, credits, raced) => {
      balance = credits;
      racingHold = raced;

      const error = await open().catch((caught: HttpException) => caught);

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(
        HttpStatus.PAYMENT_REQUIRED,
      );
      expect(
        holds.filter(({ workloadType }) => workloadType === 'live-session'),
      ).toEqual([]);
      expect(sessions).toEqual([]);
    });

    it('releases the hold when the session row cannot be written', async () => {
      isSessionWriteDown = true;

      await expect(open()).rejects.toThrow('session write failed');
      expect(holds.map(({ status }) => status)).toEqual(['RELEASED']);
      expect(available()).toBe(balance);
    });
  });

  describe('terminateSession', () => {
    it('settles the elapsed time and returns the unused ceiling to the balance', async () => {
      seedOpenSession('session-1');

      const session = await service.terminateSession({
        ...owner,
        now: at(10),
        reason: LiveSessionTerminateReason.USER,
      });

      expect(holdOf('reservation-session-1')).toMatchObject({
        settledAmount: 400,
        status: 'SETTLED',
      });
      expect(balance).toBe(99_600);
      expect(session).toMatchObject({
        elapsedSeconds: 10,
        settledCredits: 400,
        status: LiveSessionStatus.TERMINATED,
        terminateReason: LiveSessionTerminateReason.USER,
        terminatedAt: at(10),
      });
    });

    it('terminates at the declared ceiling and bills the reserved quantity', async () => {
      seedOpenSession('session-1');

      const session = await service.terminateSession({
        ...owner,
        now: CEILING,
      });

      expect(holdOf('reservation-session-1')?.settledAmount).toBe(24_300);
      expect(session).toMatchObject({
        elapsedSeconds: 900,
        terminateReason: LiveSessionTerminateReason.CEILING,
      });
    });

    it('returns a terminated session unchanged on a repeated stop', async () => {
      seedOpenSession('session-1');
      await service.terminateSession({ ...owner, now: at(10) });

      const again = await service.terminateSession({ ...owner, now: at(60) });

      expect(again).toMatchObject({ elapsedSeconds: 10, settledCredits: 400 });
      expect(balance).toBe(99_600);
    });

    it.each([
      ['expired', { status: 'EXPIRED' as const }],
      ['was released', { status: 'RELEASED' as const }],
      [
        'was already settled for another amount',
        { settledAmount: 24_300, status: 'SETTLED' as const },
      ],
    ])('still terminates when the hold %s', async (_case, hold) => {
      seedOpenSession('session-1', hold);

      await expect(
        service.terminateSession({ ...owner, now: at(10) }),
      ).resolves.toMatchObject({
        settledCredits: 400,
        status: LiveSessionStatus.TERMINATED,
      });
    });

    it('rethrows a settlement failure that leaves the hold chargeable', async () => {
      seedOpenSession('session-1', { amount: 399 });

      await expect(
        service.terminateSession({ ...owner, now: at(10) }),
      ).rejects.toBeInstanceOf(BusinessLogicException);
      expect(sessionOf('session-1')?.status).toBe(LiveSessionStatus.OPEN);
      expect(holdOf('reservation-session-1')?.status).toBe('RESERVED');
    });

    it.each([
      ['another user', { userId: 'user-2' }],
      ['another organization', { organizationId: 'org-2' }],
    ])('does not let %s stop the session', async (_case, fields) => {
      seedOpenSession('session-1');

      await expect(
        service.terminateSession({ ...owner, ...fields, now: at(10) }),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
      expect(sessionOf('session-1')?.status).toBe(LiveSessionStatus.OPEN);
    });
  });

  describe('getSession', () => {
    it('auto-terminates an open session once the ceiling has elapsed', async () => {
      seedOpenSession('session-1');

      const session = await service.getSession({ ...owner, now: at(960) });

      expect(session).toMatchObject({
        elapsedSeconds: 900,
        status: LiveSessionStatus.TERMINATED,
        terminateReason: LiveSessionTerminateReason.CEILING,
      });
      expect(holdOf('reservation-session-1')?.status).toBe('SETTLED');
    });

    it('returns an open session before its ceiling untouched', async () => {
      seedOpenSession('session-1');

      const session = await service.getSession({ ...owner, now: at(10) });

      expect(session.status).toBe(LiveSessionStatus.OPEN);
      expect(holdOf('reservation-session-1')?.status).toBe('RESERVED');
    });
  });

  describe('terminateDue', () => {
    it('finishes the ceiling sweep when a due session has a released hold', async () => {
      seedOpenSession('session-1', { status: 'RELEASED' });
      seedOpenSession('session-2');

      await expect(service.terminateDue(at(960))).resolves.toBe(2);
      expect(sessions.map(({ status }) => status)).toEqual([
        LiveSessionStatus.TERMINATED,
        LiveSessionStatus.TERMINATED,
      ]);
      expect(holdOf('reservation-session-2')?.settledAmount).toBe(24_300);
    });
  });
});
