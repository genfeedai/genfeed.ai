import { TaskCountersService } from '@api/collections/task-counters/services/task-counters.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type MockTaskCounterDelegate = {
  create: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
};

describe('TaskCountersService', () => {
  const organizationId = 'org-1';

  let taskCounter: MockTaskCounterDelegate;
  let logger: { error: ReturnType<typeof vi.fn> };
  let service: TaskCountersService;

  beforeEach(() => {
    taskCounter = {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    };
    logger = { error: vi.fn() };
    service = new TaskCountersService(
      { taskCounter } as unknown as PrismaService,
      logger as unknown as LoggerService,
    );
  });

  describe('getNextNumber', () => {
    it('issues a single atomic upsert keyed on the unique organizationId', async () => {
      taskCounter.upsert.mockResolvedValue({ counter: 1, organizationId });

      const result = await service.getNextNumber(organizationId);

      expect(result).toBe(1);
      expect(taskCounter.upsert).toHaveBeenCalledTimes(1);
      expect(taskCounter.upsert).toHaveBeenCalledWith({
        create: { counter: 1, organizationId },
        update: { counter: { increment: 1 } },
        where: { organizationId },
      });
    });

    it('never falls back to a read-then-create race', async () => {
      taskCounter.upsert.mockResolvedValue({ counter: 1, organizationId });

      await service.getNextNumber(organizationId);

      expect(taskCounter.findFirst).not.toHaveBeenCalled();
      expect(taskCounter.create).not.toHaveBeenCalled();
      expect(taskCounter.update).not.toHaveBeenCalled();
    });

    it('returns the incremented counter on repeated calls', async () => {
      let counter = 0;
      taskCounter.upsert.mockImplementation(async () => {
        counter += 1;
        return { counter, organizationId };
      });

      await expect(service.getNextNumber(organizationId)).resolves.toBe(1);
      await expect(service.getNextNumber(organizationId)).resolves.toBe(2);
      await expect(service.getNextNumber(organizationId)).resolves.toBe(3);
      expect(taskCounter.upsert).toHaveBeenCalledTimes(3);
    });

    it('serves concurrent callers for the same org distinct numbers', async () => {
      let counter = 0;
      taskCounter.upsert.mockImplementation(async () => {
        counter += 1;
        return { counter, organizationId };
      });

      const numbers = await Promise.all([
        service.getNextNumber(organizationId),
        service.getNextNumber(organizationId),
        service.getNextNumber(organizationId),
      ]);

      expect(new Set(numbers).size).toBe(3);
      expect(taskCounter.create).not.toHaveBeenCalled();
    });

    it('throws and logs when the upsert yields no record', async () => {
      taskCounter.upsert.mockResolvedValue(null);

      await expect(service.getNextNumber(organizationId)).rejects.toThrow(
        'Failed to generate next task number',
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to get next task number',
        { organizationId },
      );
    });
  });
});
