import {
  getTenantContext,
  runWithTenantContext,
} from '@libs/prisma/tenant-context';

vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import {
  type BrandRelocationActingUser,
  type BrandRelocationService,
  EMPTY_RELOCATION_SUMMARY,
} from '@api/collections/brands/services/brand-relocation.service';
import { BrandRelocationJobsService } from '@api/collections/brands/services/brand-relocation-jobs.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BrandRelocationStatus } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import { ForbiddenException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

interface Activity {
  brandId: string | null;
  organizationId: string;
  tenant: string | undefined;
}

const ID = 'operation-1';
const actor = { isSuperAdmin: false, userId: 'user-1' };
const toDestination = { organizationId: 'destination' };
const SUMMARY = { ...EMPTY_RELOCATION_SUMMARY, workflowsMoved: 1 };

// Prisma filters as Postgres applies them to these rows.
const matches = (row: Row, where: Where): boolean =>
  Object.entries(where).every(([key, condition]) => {
    if (condition && typeof condition === 'object' && 'in' in condition) {
      return (condition.in as unknown[]).includes(row[key]);
    }
    if (condition && typeof condition === 'object' && 'lt' in condition) {
      return (row[key] as Date) < (condition.lt as Date);
    }
    return row[key] === condition;
  });

describe('durable brand relocation jobs', () => {
  let brand: Row;
  let receipts: Row[];
  let jobs: Map<string, string>;
  let brokerMode: 'up' | 'drops-reply' | 'silent';
  let moveFailure: 'none' | 'rolled-back' | 'after-commit';
  let racingReceipt: Row | undefined;
  let activities: Activity[];
  let service: BrandRelocationJobsService;

  const receipt = (fields: Row = {}): Row => ({
    brandId: 'brand-1',
    createdAt: new Date(Date.now() - 60_000),
    destinationOrganizationId: 'destination',
    error: null,
    id: ID,
    isDeleted: false,
    organizationId: 'source',
    payload: { actor, updates: toDestination },
    status: BrandRelocationStatus.PROCESSING,
    summary: null,
    userId: actor.userId,
    ...fields,
  });
  const stored = (id = ID) => receipts.find((row) => row.id === id);

  beforeEach(() => {
    brand = {
      id: 'brand-1',
      isDeleted: false,
      organizationId: 'source',
      userId: 'owner',
    };
    receipts = [];
    jobs = new Map();
    brokerMode = 'up';
    moveFailure = 'none';
    racingReceipt = undefined;
    activities = [];

    const find = ({ where }: { where: Where }) => {
      const row = receipts.find((candidate) => matches(candidate, where));
      return row ? { ...row } : null;
    };
    const prisma = {
      brand: {
        findFirst: async ({ where }: { where: Where }) =>
          matches(brand, where) ? { ...brand } : null,
      },
      brandRelocation: {
        create: async ({ data }: { data: Row }) => {
          // A concurrent request with the same id commits first.
          if (racingReceipt) receipts.push(racingReceipt);
          if (stored(String(data.id))) {
            throw Object.assign(new Error('Unique constraint'), {
              code: 'P2002',
            });
          }
          const row = receipt({ ...data, createdAt: new Date() });
          receipts.push(row);
          return { ...row };
        },
        findFirst: async (args: { where: Where }) => find(args),
        findFirstOrThrow: async (args: { where: Where }) => {
          const row = find(args);
          if (!row) throw new Error('No BrandRelocation found');
          return row;
        },
        findMany: async ({ where }: { where: Where }) =>
          receipts.filter((row) => matches(row, where)),
        updateMany: async ({ data, where }: { data: Row; where: Where }) => {
          const changed = receipts.filter((row) => matches(row, where));
          for (const row of changed) Object.assign(row, data);
          return { count: changed.length };
        },
      },
      organization: {
        findFirst: async ({ where }: { where: Where }) =>
          ['source', 'destination'].includes(String(where.id))
            ? { id: where.id }
            : null,
      },
    };
    const queue = {
      add: (_name: string, _data: unknown, { jobId }: { jobId: string }) => {
        if (brokerMode === 'silent') return new Promise(() => undefined);
        jobs.set(jobId, jobs.get(jobId) ?? 'waiting');
        if (brokerMode === 'drops-reply') {
          return Promise.reject(new Error('connection closed after enqueue'));
        }
        return Promise.resolve({ id: jobId });
      },
      getJob: async (id: string) => {
        const state = jobs.get(id);
        return state ? { getState: async () => state } : null;
      },
    };
    // Only user-1 may move brands between these organizations. A move runs
    // in one transaction that flips the brand and completes its receipt.
    const relocation = {
      assertCanRelocate: async (who: BrandRelocationActingUser) => {
        if (who.userId !== actor.userId) {
          throw new ForbiddenException('Not allowed to move this brand');
        }
      },
      relocateToOrganization: async (
        _brandId: string,
        updates: { organizationId: string },
        _who: BrandRelocationActingUser,
        _options: unknown,
        operationId: string,
      ) => {
        if (moveFailure === 'rolled-back') {
          throw new Error('transaction rolled back');
        }
        brand.organizationId = updates.organizationId;
        Object.assign(stored(operationId) ?? {}, {
          status: BrandRelocationStatus.DONE,
          summary: SUMMARY,
        });
        if (moveFailure === 'after-commit') {
          throw new Error('cache refresh failed after commit');
        }
        return { summary: SUMMARY };
      },
    };
    const recorder = {
      record: async (activity: Activity) => {
        activities.push({
          brandId: activity.brandId,
          organizationId: activity.organizationId,
          tenant: getTenantContext()?.organizationId,
        });
      },
    };

    service = new BrandRelocationJobsService(
      prisma as unknown as PrismaService,
      queue as unknown as Queue,
      relocation as unknown as BrandRelocationService,
      recorder as unknown as ActivityRecorderService,
      {
        error: () => undefined,
        warn: () => undefined,
      } as unknown as LoggerService,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('enqueue', () => {
    it('returns a processing receipt and leaves the move to the worker', async () => {
      await expect(
        service.enqueue('brand-1', ID, toDestination, actor),
      ).resolves.toMatchObject({ status: BrandRelocationStatus.PROCESSING });

      expect(brand.organizationId).toBe('source');
      expect(stored()?.status).toBe(BrandRelocationStatus.PROCESSING);
      expect([...jobs]).toEqual([[ID, 'waiting']]);
    });

    it('refuses a user who may not move the brand', async () => {
      await expect(
        service.enqueue('brand-1', ID, toDestination, {
          ...actor,
          userId: 'other-user',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(receipts).toEqual([]);
      expect(jobs.size).toBe(0);
    });

    it('reuses a completed receipt when a concurrent enqueue wins the race', async () => {
      racingReceipt = receipt({ status: BrandRelocationStatus.DONE });

      await expect(
        service.enqueue('brand-1', ID, toDestination, actor),
      ).resolves.toMatchObject({ status: BrandRelocationStatus.DONE });
      expect(receipts).toHaveLength(1);
      expect(jobs.size).toBe(0);
    });

    it('keeps an ambiguously dispatched move processing and offers it again on the next poll', async () => {
      brokerMode = 'drops-reply';

      await expect(
        service.enqueue('brand-1', ID, toDestination, actor),
      ).resolves.toMatchObject({ status: BrandRelocationStatus.PROCESSING });
      jobs.clear();
      brokerMode = 'up';

      await service.get('brand-1', ID, actor);

      expect([...jobs]).toEqual([[ID, 'waiting']]);
    });

    it('returns processing promptly when the queue never acknowledges', async () => {
      vi.useFakeTimers();
      brokerMode = 'silent';

      const result = service.enqueue('brand-1', ID, toDestination, actor);
      await vi.advanceTimersByTimeAsync(1000);

      await expect(result).resolves.toMatchObject({
        status: BrandRelocationStatus.PROCESSING,
      });
    });
  });

  describe('process', () => {
    beforeEach(() => {
      receipts.push(receipt());
    });

    it('moves the brand and records the activity in each tenant', async () => {
      await runWithTenantContext({ organizationId: 'source' }, () =>
        service.process(ID, true),
      );

      expect(brand.organizationId).toBe('destination');
      expect(stored()).toMatchObject({
        status: BrandRelocationStatus.DONE,
        summary: SUMMARY,
      });
      expect(activities).toEqual([
        {
          brandId: 'brand-1',
          organizationId: 'destination',
          tenant: 'destination',
        },
        { brandId: null, organizationId: 'source', tenant: 'source' },
      ]);
    });

    it('completes a queued duplicate when the brand already reached its destination', async () => {
      brand.organizationId = 'destination';

      await service.process(ID, true);

      expect(stored()).toMatchObject({
        status: BrandRelocationStatus.DONE,
        summary: EMPTY_RELOCATION_SUMMARY,
      });
      expect(activities).toEqual([]);
    });

    it('never marks a committed move failed after a post-commit error', async () => {
      moveFailure = 'after-commit';

      await service.process(ID, true);

      expect(brand.organizationId).toBe('destination');
      expect(stored()?.status).toBe(BrandRelocationStatus.DONE);
    });

    it('marks rolled-back work failed on the final attempt', async () => {
      moveFailure = 'rolled-back';

      await service.process(ID, true);

      expect(brand.organizationId).toBe('source');
      expect(stored()).toMatchObject({
        error:
          'The move could not complete and was rolled back. Please try again.',
        status: BrandRelocationStatus.FAILED,
      });
    });

    it('leaves rolled-back work processing for the next attempt', async () => {
      moveFailure = 'rolled-back';

      await expect(service.process(ID, false)).rejects.toThrow(
        'transaction rolled back',
      );
      expect(stored()?.status).toBe(BrandRelocationStatus.PROCESSING);
    });

    it('fails a move whose brand left the source organization', async () => {
      brand.organizationId = 'elsewhere';

      await service.process(ID, false);

      expect(stored()).toMatchObject({
        error: 'The brand no longer belongs to the source organization',
        status: BrandRelocationStatus.FAILED,
      });
    });
  });

  describe('get', () => {
    it('marks a move failed once its background job failed', async () => {
      receipts.push(receipt());
      jobs.set(ID, 'failed');

      await expect(service.get('brand-1', ID, actor)).resolves.toMatchObject({
        error:
          'The background move stopped before committing. Please try again.',
        status: BrandRelocationStatus.FAILED,
      });
    });

    it("does not reveal another initiator's receipt", async () => {
      receipts.push(receipt());

      await expect(
        service.get('brand-1', ID, { ...actor, userId: 'other-user' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('recover', () => {
    it('re-offers stale unqueued receipts and fails those whose job failed', async () => {
      receipts.push(
        receipt({ id: 'unqueued' }),
        receipt({ id: 'recent', createdAt: new Date() }),
        receipt({ id: 'crashed' }),
        receipt({ id: 'finished', status: BrandRelocationStatus.DONE }),
      );
      jobs.set('crashed', 'failed');

      await service.recover();

      expect([...jobs]).toEqual([
        ['crashed', 'failed'],
        ['unqueued', 'waiting'],
      ]);
      expect(receipts.map(({ id, status }) => [id, status])).toEqual([
        ['unqueued', BrandRelocationStatus.PROCESSING],
        ['recent', BrandRelocationStatus.PROCESSING],
        ['crashed', BrandRelocationStatus.FAILED],
        ['finished', BrandRelocationStatus.DONE],
      ]);
    });
  });
});
