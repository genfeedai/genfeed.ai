vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { ContentSchedulesService } from '@api/collections/content-schedules/services/content-schedules.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';

type Row = {
  id: string;
  organizationId: string;
  brandId: string;
  isDeleted: boolean;
  timezone?: string;
};

/**
 * Coverage for the `findOrThrow` adoption (DRY/slop audit §2.J) in
 * content-schedules: `removeForBrand` now routes its org+brand-scoped
 * "fetch or 404" through the shared helper, while `markScheduleRan` is an
 * optional lookup that must keep returning silently instead of throwing.
 */
describe('ContentSchedulesService — findOrThrow tenant scoping', () => {
  function buildService(rows: Row[]): {
    service: ContentSchedulesService;
    delegate: {
      findFirst: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  } {
    const matches = (where: Record<string, unknown>, row: Row): boolean =>
      (where.id === undefined || where.id === row.id) &&
      (where.organizationId === undefined ||
        where.organizationId === row.organizationId) &&
      (where.brandId === undefined || where.brandId === row.brandId) &&
      (where.isDeleted === undefined || where.isDeleted === row.isDeleted);

    const delegate = {
      findFirst: vi.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(rows.find((row) => matches(where, row)) ?? null),
      ),
      update: vi.fn(
        ({ where, data }: { where: { id: string }; data: unknown }) =>
          Promise.resolve({
            ...rows.find((row) => row.id === where.id),
            ...(data as Record<string, unknown>),
          }),
      ),
    };

    // No ModuleRef supplied → workflow sync/disable short-circuit to no-ops.
    const service = new ContentSchedulesService(
      { contentSchedule: delegate } as unknown as PrismaService,
      {
        debug: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as unknown as LoggerService,
    );

    return { delegate, service };
  }

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('removeForBrand: authorized access soft-deletes the schedule', async () => {
    const { service, delegate } = buildService([
      {
        brandId: 'brand-1',
        id: 'sched-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    ]);

    await service.removeForBrand('org-1', 'brand-1', 'sched-1');

    expect(delegate.findFirst).toHaveBeenCalledWith({
      where: {
        brandId: 'brand-1',
        id: 'sched-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
    expect(delegate.update).toHaveBeenCalledWith({
      data: { isDeleted: true },
      where: { id: 'sched-1' },
    });
  });

  it('removeForBrand: wrong-organization access 404s and never writes', async () => {
    const { service, delegate } = buildService([
      {
        brandId: 'brand-1',
        id: 'sched-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    ]);

    await expect(
      service.removeForBrand('org-2', 'brand-1', 'sched-1'),
    ).rejects.toThrow(NotFoundException);
    expect(delegate.update).not.toHaveBeenCalled();
  });

  it('removeForBrand: foreign-brand access 404s (brand scoping preserved)', async () => {
    const { service, delegate } = buildService([
      {
        brandId: 'brand-1',
        id: 'sched-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    ]);

    await expect(
      service.removeForBrand('org-1', 'brand-2', 'sched-1'),
    ).rejects.toThrow(NotFoundException);
    expect(delegate.update).not.toHaveBeenCalled();
  });

  it('removeForBrand: soft-deleted rows 404', async () => {
    const { service } = buildService([
      {
        brandId: 'brand-1',
        id: 'sched-1',
        isDeleted: true,
        organizationId: 'org-1',
      },
    ]);

    await expect(
      service.removeForBrand('org-1', 'brand-1', 'sched-1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('removeForBrand: preserves the canonical JSON:API 404 shape', async () => {
    const { service } = buildService([]);

    try {
      await service.removeForBrand('org-1', 'brand-1', 'missing');
      throw new Error('expected NotFoundException');
    } catch (error) {
      expect(error).toBeInstanceOf(NotFoundException);
      const exception = error as NotFoundException;
      expect(exception.getStatus()).toBe(404);
      expect(exception.getResponse()).toEqual({
        detail: "ContentSchedule with identifier 'missing' not found",
        source: { parameter: 'missing' },
        title: 'Resource Not Found',
      });
    }
  });

  it('markScheduleRan: optional lookup stays optional — missing row returns silently', async () => {
    const { service, delegate } = buildService([]);
    const next = new Date('2026-07-11T00:00:00.000Z');
    const last = new Date('2026-07-10T00:00:00.000Z');

    await expect(
      service.markScheduleRan('missing', 'org-1', next, last),
    ).resolves.toBeUndefined();
    expect(delegate.update).not.toHaveBeenCalled();
  });

  it('markScheduleRan: present row stamps lastRunAt/nextRunAt', async () => {
    const { service, delegate } = buildService([
      {
        brandId: 'brand-1',
        id: 'sched-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    ]);
    const next = new Date('2026-07-11T00:00:00.000Z');
    const last = new Date('2026-07-10T00:00:00.000Z');

    await service.markScheduleRan('sched-1', 'org-1', next, last);

    expect(delegate.update).toHaveBeenCalledWith({
      data: { lastRunAt: last, nextRunAt: next },
      where: { id: 'sched-1' },
    });
  });
});
