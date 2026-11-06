import { TaskCountersService } from '@api/collections/task-counters/services/task-counters.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { describe, expect, it } from 'vitest';

type CounterRow = { counter: number; organizationId: string };

/**
 * An in-memory task_counters table that only offers Prisma's atomic upsert:
 * a read-then-create fallback has no delegate method to call.
 */
function buildService(options: { isUpsertEmpty?: boolean } = {}) {
  const counters: CounterRow[] = [];
  const errors: { context: unknown; message: string }[] = [];
  const unsupported = async () => {
    throw new Error('task counters must be issued by one atomic upsert');
  };
  const taskCounter = {
    create: unsupported,
    findFirst: unsupported,
    update: unsupported,
    upsert: async (args: {
      create: CounterRow;
      update: { counter: { increment: number } };
      where: { organizationId: string };
    }) => {
      if (options.isUpsertEmpty) return null;
      const row = counters.find(
        (item) => item.organizationId === args.where.organizationId,
      );
      if (row) {
        row.counter += args.update.counter.increment;
        return { ...row };
      }
      counters.push({ ...args.create });
      return { ...args.create };
    },
  };
  const service = new TaskCountersService(
    { taskCounter } as unknown as PrismaService,
    {
      error: (message: string, context: unknown) =>
        errors.push({ context, message }),
    } as unknown as LoggerService,
  );
  return { counters, errors, service };
}

describe('TaskCountersService', () => {
  describe('getNextNumber', () => {
    it('starts a new organization at 1 and stores its counter', async () => {
      const { counters, service } = buildService();

      await expect(service.getNextNumber('org-1')).resolves.toBe(1);
      expect(counters).toEqual([{ counter: 1, organizationId: 'org-1' }]);
    });

    it('returns the incremented counter on repeated calls', async () => {
      const { service } = buildService();

      await expect(service.getNextNumber('org-1')).resolves.toBe(1);
      await expect(service.getNextNumber('org-1')).resolves.toBe(2);
      await expect(service.getNextNumber('org-1')).resolves.toBe(3);
    });

    it('serves concurrent first-ever callers for the same org distinct numbers', async () => {
      const { counters, service } = buildService();

      const numbers = await Promise.all([
        service.getNextNumber('org-1'),
        service.getNextNumber('org-1'),
        service.getNextNumber('org-1'),
      ]);

      expect([...numbers].sort()).toEqual([1, 2, 3]);
      expect(counters).toEqual([{ counter: 3, organizationId: 'org-1' }]);
    });

    it('keeps each organization on its own sequence', async () => {
      const { service } = buildService();

      await service.getNextNumber('org-1');
      await service.getNextNumber('org-1');

      await expect(service.getNextNumber('org-2')).resolves.toBe(1);
    });

    it('throws and logs when the upsert yields no record', async () => {
      const { errors, service } = buildService({ isUpsertEmpty: true });

      await expect(service.getNextNumber('org-1')).rejects.toThrow(
        'Failed to generate next task number',
      );
      expect(errors).toEqual([
        {
          context: { organizationId: 'org-1' },
          message: 'Failed to get next task number',
        },
      ]);
    });
  });
});
