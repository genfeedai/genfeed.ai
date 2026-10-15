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

import type { BrandRelocationService } from '@api/collections/brands/services/brand-relocation.service';
import { BrandRelocationJobsService } from '@api/collections/brands/services/brand-relocation-jobs.service';
import type { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BrandRelocationStatus } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import { ForbiddenException } from '@nestjs/common';
import type { Queue } from 'bullmq';

const actor = { isSuperAdmin: false, userId: 'user-1' };
const operation = {
  id: 'operation-1',
  brandId: 'brand-1',
  organizationId: 'source',
  destinationOrganizationId: 'destination',
  userId: actor.userId,
  status: BrandRelocationStatus.PROCESSING,
  isDeleted: false,
  payload: { actor, updates: { organizationId: 'destination' } },
  summary: null,
};

function setup() {
  const prisma = {
    brand: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'brand-1',
        userId: 'owner',
        organizationId: 'source',
      }),
    },
    brandRelocation: {
      create: vi.fn().mockResolvedValue(operation),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const queue = {
    add: vi.fn().mockResolvedValue({ id: operation.id }),
    getJob: vi.fn().mockResolvedValue(null),
  };
  const relocation = {
    assertCanRelocate: vi.fn(),
    authorizeRelocation: vi
      .fn()
      .mockResolvedValue({ organizationId: 'source' }),
    relocateToOrganization: vi.fn(),
  };
  const recorder = { record: vi.fn() };
  const logger = { error: vi.fn(), warn: vi.fn() };
  const service = new BrandRelocationJobsService(
    prisma as unknown as PrismaService,
    queue as unknown as Queue,
    relocation as unknown as BrandRelocationService,
    recorder as unknown as ActivityRecorderService,
    logger as unknown as LoggerService,
  );
  return { service, prisma, queue, relocation, recorder };
}

describe('durable brand relocation jobs', () => {
  it('returns processing without running the migration on the request', async () => {
    const { service, relocation, queue } = setup();
    const result = await service.enqueue(
      'brand-1',
      operation.id,
      { organizationId: 'destination' },
      actor,
    );
    expect(result.status).toBe(BrandRelocationStatus.PROCESSING);
    expect(relocation.authorizeRelocation).toHaveBeenCalledWith(
      'brand-1',
      'destination',
      actor,
    );
    expect(relocation.relocateToOrganization).not.toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalledWith(
      'relocate',
      { operationId: operation.id },
      expect.objectContaining({ jobId: operation.id }),
    );
  });

  it('keeps an ambiguously dispatched move processing so polling can recover it', async () => {
    const { service, queue } = setup();
    queue.add.mockRejectedValue(new Error('connection closed after enqueue'));
    await expect(
      service.enqueue(
        'brand-1',
        operation.id,
        { organizationId: 'destination' },
        actor,
      ),
    ).resolves.toMatchObject({ status: BrandRelocationStatus.PROCESSING });
  });

  it('never marks a committed move failed after a post-commit error', async () => {
    const { service, prisma, relocation } = setup();
    prisma.brandRelocation.findFirst
      .mockResolvedValueOnce(operation)
      .mockResolvedValue({ ...operation, status: BrandRelocationStatus.DONE });
    relocation.relocateToOrganization.mockRejectedValue(
      new Error('cache refresh failed after commit'),
    );
    await service.process(operation.id, true);
    expect(prisma.brandRelocation.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: BrandRelocationStatus.FAILED }),
      }),
    );
  });

  it('only finalizes rolled-back work with a processing compare-and-set', async () => {
    const { service, prisma, relocation } = setup();
    prisma.brandRelocation.findFirst.mockResolvedValue(operation);
    relocation.relocateToOrganization.mockRejectedValue(
      new Error('transaction rolled back'),
    );
    await service.process(operation.id, true);
    expect(prisma.brandRelocation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: operation.id,
          status: BrandRelocationStatus.PROCESSING,
        }),
        data: expect.objectContaining({ status: BrandRelocationStatus.FAILED }),
      }),
    );
  });

  it('recovers an unqueued receipt without depending on an open browser', async () => {
    const { service, prisma, queue } = setup();
    prisma.brandRelocation.findMany.mockResolvedValue([operation]);
    await service.recover();
    expect(queue.add).toHaveBeenCalledWith(
      'relocate',
      { operationId: operation.id },
      expect.objectContaining({ jobId: operation.id }),
    );
  });

  it('returns processing promptly when queue acknowledgement is unavailable', async () => {
    vi.useFakeTimers();
    try {
      const { service, queue } = setup();
      queue.add.mockImplementation(() => new Promise(() => {}));
      const result = service.enqueue(
        'brand-1',
        operation.id,
        { organizationId: 'destination' },
        actor,
      );
      await vi.advanceTimersByTimeAsync(1000);
      await expect(result).resolves.toMatchObject({
        status: BrandRelocationStatus.PROCESSING,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('records each activity inside its own tenant under a source request context', async () => {
    const { service, prisma, relocation, recorder } = setup();
    const contexts: Array<string | undefined> = [];
    prisma.brandRelocation.findFirst.mockResolvedValue(operation);
    relocation.relocateToOrganization.mockResolvedValue({
      summary: { workflowsMoved: 1 },
    });
    recorder.record.mockImplementation(async () => {
      contexts.push(getTenantContext()?.organizationId);
    });
    await runWithTenantContext({ organizationId: 'source' }, () =>
      service.process(operation.id, true),
    );
    expect(contexts).toEqual(['destination', 'source']);
    expect(recorder.record).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        organizationId: 'destination',
        brandId: 'brand-1',
      }),
    );
    expect(recorder.record).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ organizationId: 'source', brandId: null }),
    );
  });

  it("does not reveal another initiator's receipt", async () => {
    const { service, prisma } = setup();
    prisma.brandRelocation.findFirst.mockResolvedValue(operation);
    await expect(
      service.get('brand-1', operation.id, { ...actor, userId: 'other-user' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
