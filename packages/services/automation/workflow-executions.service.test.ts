import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: { apiEndpoint: 'https://api.test/v1' },
}));

vi.mock('@services/core/interceptor.service', () => ({
  getRequestOrganizationHeaders: () => ({}),
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

import { WorkflowExecutionsService } from '@services/automation/workflow-executions.service';

describe('WorkflowExecutionsService.list', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('sends the page and limit and returns pagination with the rows', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [],
          links: { pagination: { limit: 15, page: 2, pages: 6, total: 84 } },
        }),
        { status: 200 },
      ),
    );

    const result = await WorkflowExecutionsService.getInstance(
      'token-page',
    ).list({
      limit: 15,
      page: 2,
      sort: '-createdAt',
    });

    const url = new URL(fetchMock.mock.calls[0]?.[0] as string);
    expect(url.pathname).toBe('/v1/workflow-executions');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      limit: '15',
      page: '2',
      sort: '-createdAt',
    });
    expect(result).toMatchObject({
      items: [],
      page: 2,
      pageSize: 15,
      total: 84,
      totalPages: 6,
    });
  });

  it('returns server totals when no explicit page is requested', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [],
          links: { pagination: { limit: 20, page: 1, pages: 9, total: 170 } },
        }),
        { status: 200 },
      ),
    );

    const result = await WorkflowExecutionsService.getInstance(
      'token-nopage',
    ).list({
      limit: 20,
    });

    expect(result).toMatchObject({ items: [], total: 170, totalPages: 9 });
  });
});
