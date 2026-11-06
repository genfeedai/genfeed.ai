import type { ServerLogger, ServerPrisma } from '@api/server.dependencies';
import { AdOptimizationAuditLogsService } from './ad-optimization-audit-logs.service';

type Row = Record<string, unknown>;

/**
 * In-memory ad_optimization_audit_logs with Prisma's ordering and paging, and
 * a logger that records what it was told.
 */
function buildService(options: { insertError?: Error; rows?: Row[] } = {}) {
  const rows = options.rows ?? [];
  const logs: { level: string; message: string }[] = [];
  const prisma = {
    adOptimizationAuditLog: {
      create: async ({ data }: { data: Row }) => {
        if (options.insertError) throw options.insertError;
        const row = {
          createdAt: new Date(rows.length + 1),
          id: `log-${rows.length + 1}`,
          isDeleted: false,
          ...data,
        };
        rows.push(row);
        return row;
      },
      findMany: async (args: {
        orderBy: { createdAt: 'desc' };
        skip: number;
        take: number;
        where: Row;
      }) =>
        rows
          .filter((row) =>
            Object.entries(args.where).every(
              ([key, value]) => row[key] === value,
            ),
          )
          .sort((a, b) => Number(b.createdAt) - Number(a.createdAt))
          .slice(args.skip, args.skip + args.take),
    },
  } as unknown as Pick<ServerPrisma, 'adOptimizationAuditLog'>;
  const logger = {
    error: (message: string) => logs.push({ level: 'error', message }),
    log: (message: string) => logs.push({ level: 'log', message }),
    warn: (message: string) => logs.push({ level: 'warn', message }),
  } satisfies ServerLogger;
  return {
    logs,
    rows,
    service: new AdOptimizationAuditLogsService(prisma, logger),
  };
}

function auditRow(id: string, organizationId: string, createdAt: number): Row {
  return {
    createdAt: new Date(createdAt),
    data: { runId: id },
    id,
    isDeleted: false,
    organizationId,
  };
}

describe('AdOptimizationAuditLogsService', () => {
  describe('create', () => {
    it('persists the tenant id alongside the JSON payload', async () => {
      const { logs, rows, service } = buildService();

      const result = await service.create({
        data: { action: 'PAUSE_AD', runId: 'run-9' },
        organizationId: 'org-1',
      });

      expect(rows).toEqual([
        expect.objectContaining({
          data: { action: 'PAUSE_AD', runId: 'run-9' },
          organizationId: 'org-1',
        }),
      ]);
      expect(result).toEqual(rows[0]);
      expect(logs).toEqual([
        {
          level: 'log',
          message: expect.stringContaining('created audit log for run run-9'),
        },
      ]);
    });

    it('logs and rethrows persistence failures', async () => {
      const dbError = new Error('insert failed');
      const { logs, rows, service } = buildService({ insertError: dbError });

      await expect(
        service.create({ data: { runId: 'run-9' }, organizationId: 'org-1' }),
      ).rejects.toThrowError(dbError);

      expect(rows).toEqual([]);
      expect(logs).toEqual([
        { level: 'error', message: expect.stringContaining('failed') },
      ]);
    });
  });

  describe('findByOrganization', () => {
    it('returns the tenant’s live logs newest first', async () => {
      const { service } = buildService({
        rows: [
          auditRow('old', 'org-1', 1),
          auditRow('other-org', 'org-2', 2),
          { ...auditRow('deleted', 'org-1', 3), isDeleted: true },
          auditRow('new', 'org-1', 4),
        ],
      });

      const rows = await service.findByOrganization('org-1');

      expect(rows.map((row) => row.id)).toEqual(['new', 'old']);
    });

    it('applies explicit pagination parameters', async () => {
      const { service } = buildService({
        rows: [
          auditRow('first', 'org-1', 1),
          auditRow('second', 'org-1', 2),
          auditRow('third', 'org-1', 3),
        ],
      });

      const rows = await service.findByOrganization('org-1', {
        limit: 1,
        offset: 1,
      });

      expect(rows.map((row) => row.id)).toEqual(['second']);
    });

    it('refuses to run without a tenant id', async () => {
      const { service } = buildService({ rows: [auditRow('a', 'org-1', 1)] });

      await expect(service.findByOrganization('')).rejects.toThrowError(
        'scopedWhere: organizationId is required',
      );
    });
  });
});
