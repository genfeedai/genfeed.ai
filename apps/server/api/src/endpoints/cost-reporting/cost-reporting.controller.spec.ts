import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import { CostReportingController } from '@api/endpoints/cost-reporting/cost-reporting.controller';
import { CostReportingService } from '@api/endpoints/cost-reporting/cost-reporting.service';
import type { Response } from 'express';

describe('CostReportingController', () => {
  const costReportingService = {
    getEntries: vi.fn(),
    getExportEntries: vi.fn(),
    getSummary: vi.fn(),
  };
  const controller = new CostReportingController(
    costReportingService as unknown as CostReportingService,
  );
  const user = {
    brandId: 'brand-1',
    id: 'user-1',
    organizationId: 'org-from-user',
    userId: 'user-1',
  } satisfies AuthenticatedUser;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the request organization context for summaries', async () => {
    costReportingService.getSummary.mockResolvedValue({ id: 'summary' });
    const request = {
      context: { organizationId: 'org-from-context' },
      originalUrl: '/costs/summary',
    } as RequestWithContext;

    await controller.getSummary(request, user, {
      from: '2026-08-01',
      to: '2026-08-26',
    });

    expect(costReportingService.getSummary).toHaveBeenCalledWith(
      'org-from-context',
      { from: '2026-08-01', to: '2026-08-26' },
    );
  });

  it('returns a capped CSV attachment for the authenticated organization', async () => {
    costReportingService.getExportEntries.mockResolvedValue([]);
    const headers = new Map<string, string>();
    const response = {
      send: vi.fn(),
      setHeader: vi.fn((name: string, value: string) => {
        headers.set(name, value);
      }),
    } as unknown as Response;

    await controller.exportCsv(
      { originalUrl: '/costs/export' } as RequestWithContext,
      user,
      {},
      response,
    );

    expect(costReportingService.getExportEntries).toHaveBeenCalledWith(
      'org-from-user',
      {},
    );
    expect(headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(headers.get('X-Cost-Export-Limit')).toBe('10000');
    expect(headers.get('Content-Disposition')).toContain('generation-costs-');
    expect(response.send).toHaveBeenCalledWith(
      expect.stringContaining('created_at,entry_type'),
    );
  });
});
