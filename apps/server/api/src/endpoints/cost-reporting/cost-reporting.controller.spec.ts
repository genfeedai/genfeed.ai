import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import { CostReportingController } from '@api/endpoints/cost-reporting/cost-reporting.controller';
import type { CostReportingService } from '@api/endpoints/cost-reporting/cost-reporting.service';
import type { Response } from 'express';

type Entry = Record<string, unknown> & {
  brandId: string;
  organizationId: string;
};

function entry(organizationId: string, brandId: string, model: string): Entry {
  return {
    brandId,
    brandLabel: `${brandId} label`,
    category: 'image',
    createdAt: '2026-09-02T10:00:00.000Z',
    creditsUsed: 12,
    entryType: 'credit',
    isByok: false,
    model,
    organizationId,
    provider: 'fal',
    providerCostMicros: 41000,
    providerCostUsd: 0.041,
    referenceId: `ref-${model}`,
  };
}

/** Cost entries of several organizations, filtered as the service scopes them. */
function buildController() {
  const entries = [
    entry('org-from-user', 'brand-1', 'fal/flux-user'),
    entry('org-from-context', 'brand-2', 'fal/flux-context'),
    entry('org-from-context', 'brand-3', 'fal/flux-other-brand'),
    entry('org-elsewhere', 'brand-9', 'fal/flux-elsewhere'),
  ];
  const service = {
    getExportEntries: async (
      organizationId: string,
      query: { brandId?: string },
    ) =>
      entries.filter(
        (row) =>
          row.organizationId === organizationId &&
          (!query.brandId || row.brandId === query.brandId),
      ),
    getSummary: async (organizationId: string) => ({
      id: `summary-${organizationId}`,
      totalCredits: 12,
    }),
  };
  return new CostReportingController(
    service as unknown as CostReportingService,
  );
}

/** An express response that keeps the headers it was given and the body it sent. */
function recordingResponse() {
  const sent: { body?: string; headers: Map<string, string> } = {
    headers: new Map(),
  };
  const response = {
    send: (body: string) => {
      sent.body = body;
    },
    setHeader: (name: string, value: string) => {
      sent.headers.set(name, value);
    },
  } as unknown as Response;
  return { response, sent };
}

describe('CostReportingController', () => {
  const user = {
    brandId: 'brand-1',
    id: 'user-1',
    organizationId: 'org-from-user',
    userId: 'user-1',
  } satisfies AuthenticatedUser;

  it('uses the request organization context for summaries', async () => {
    const request = {
      context: { organizationId: 'org-from-context' },
      originalUrl: '/costs/summary',
    } as RequestWithContext;

    const result = await buildController().getSummary(request, user, {
      from: '2026-08-01',
      to: '2026-08-26',
    });

    expect(result).toMatchObject({
      data: { id: 'summary-org-from-context' },
    });
  });

  it('returns a capped CSV attachment for the authenticated organization', async () => {
    const { response, sent } = recordingResponse();

    await buildController().exportCsv(
      { originalUrl: '/costs/export' } as RequestWithContext,
      user,
      {},
      response,
    );

    expect(sent.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(sent.headers.get('X-Cost-Export-Limit')).toBe('10000');
    expect(sent.headers.get('Content-Disposition')).toContain(
      'generation-costs-',
    );
    expect(sent.body?.split('\n')).toEqual([
      expect.stringContaining('created_at,entry_type'),
      expect.stringContaining('fal/flux-user'),
    ]);
  });

  it('scopes the customer export and sends only credit fields', async () => {
    const { response, sent } = recordingResponse();

    await buildController().exportUsageCsv(
      {
        context: { organizationId: 'org-from-context' },
        originalUrl: '/costs/usage/export',
      } as RequestWithContext,
      user,
      { brandId: 'brand-2', from: '2026-09-01', to: '2026-09-08' },
      response,
    );

    expect(sent.headers.get('X-Cost-Export-Limit')).toBe('10000');
    expect(sent.body).toBe(
      [
        'created_at,entry_type,brand,model,credits_used',
        '2026-09-02T10:00:00.000Z,credit,brand-2 label,flux-context,12',
      ].join('\n'),
    );
  });
});
