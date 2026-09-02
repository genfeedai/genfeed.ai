import type { ServerLogger, ServerPrisma } from '@api/server.dependencies';
import { AdOptimizationAuditLogsService } from './ad-optimization-audit-logs.service';

describe('AdOptimizationAuditLogsService', () => {
  const create = vi.fn();
  const findMany = vi.fn();
  const logger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } satisfies ServerLogger;
  const prisma = {
    adOptimizationAuditLog: { create, findMany },
  } as unknown as Pick<ServerPrisma, 'adOptimizationAuditLog'>;
  const service = new AdOptimizationAuditLogsService(prisma, logger);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('persists the tenant id alongside the JSON payload', async () => {
      const row = { id: 'log-1' };
      create.mockResolvedValue(row);

      const result = await service.create({
        data: { action: 'PAUSE_AD', runId: 'run-9' },
        organizationId: 'org-1',
      });

      expect(result).toBe(row);
      expect(create).toHaveBeenCalledWith({
        data: {
          data: { action: 'PAUSE_AD', runId: 'run-9' },
          organizationId: 'org-1',
        },
      });
      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('created audit log for run run-9'),
      );
    });

    it('logs and rethrows persistence failures', async () => {
      const dbError = new Error('insert failed');
      create.mockRejectedValue(dbError);

      await expect(
        service.create({ data: { runId: 'run-9' }, organizationId: 'org-1' }),
      ).rejects.toThrowError(dbError);

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('failed'),
        dbError,
      );
    });
  });

  describe('findByOrganization', () => {
    it('scopes the query to the tenant and excludes tombstones', async () => {
      findMany.mockResolvedValue([]);

      await service.findByOrganization('org-1');

      expect(findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 50,
        where: { isDeleted: false, organizationId: 'org-1' },
      });
    });

    it('applies explicit pagination parameters', async () => {
      findMany.mockResolvedValue([{ id: 'log-1' }]);

      const rows = await service.findByOrganization('org-1', {
        limit: 10,
        offset: 20,
      });

      expect(rows).toEqual([{ id: 'log-1' }]);
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });

    it('refuses to run without a tenant id', async () => {
      await expect(service.findByOrganization('')).rejects.toThrowError(
        'scopedWhere: organizationId is required',
      );
      expect(findMany).not.toHaveBeenCalled();
    });
  });
});
