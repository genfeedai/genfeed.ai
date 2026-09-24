import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AgentPerformanceSection from './AgentPerformanceSection';
import AgentWorkSection from './AgentWorkSection';

const mocks = vi.hoisted(() => ({
  posts: vi.fn(),
  reports: vi.fn(),
  snapshot: vi.fn(),
  scope: {
    organizationId: 'org-1',
    brandId: 'brand-1',
    isReady: true,
    pageScope: 'brand',
  },
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => async () =>
    factory('token'),
}));
vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/org/brand${path}` }),
}));
vi.mock('@hooks/navigation/use-collection-scope/use-collection-scope', () => ({
  useCollectionScope: () => mocks.scope,
  isCollectionFetchReady: () => mocks.scope.isReady,
  toBrandListParams: () => ({ brandId: mocks.scope.brandId }),
}));
vi.mock('@services/content/posts.service', () => ({
  PostsService: { getInstance: () => ({ findAll: mocks.posts }) },
}));
vi.mock('@services/automation/agent-strategies.service', () => ({
  AgentStrategiesService: {
    getInstance: () => ({
      listReports: mocks.reports,
      getPerformanceSnapshot: mocks.snapshot,
    }),
  },
}));

const metrics = {
  generatedCount: 2,
  publishedCount: 1,
  creditsSpent: 10,
  impressions: 30,
  clicks: 3,
  visits: null,
  costPerVisit: null,
  ctr: 0.1,
  topHooks: [],
  topTopics: [],
  bestPostingWindows: [],
  bestPlatformFormatPairs: [],
};

function renderSection(element: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    client,
    ...render(element, {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    }),
  };
}

describe('Agent home work sections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.scope.organizationId = 'org-1';
    mocks.scope.brandId = 'brand-1';
    mocks.scope.isReady = true;
    mocks.posts.mockResolvedValue([]);
    mocks.reports.mockResolvedValue([]);
    mocks.snapshot.mockResolvedValue(metrics);
  });

  it('loads only this agent’s brand-scoped posts and shows state and lineage links', async () => {
    mocks.posts.mockResolvedValue([
      {
        id: 'draft-1',
        label: 'Needs review',
        platform: 'instagram',
        targetExecutionState: 'draft',
        workflowExecutionId: 'exec-1',
      },
      {
        id: 'approved-1',
        label: 'Reviewed draft',
        platform: 'linkedin',
        targetExecutionState: 'draft',
        reviewDecision: 'approved',
      },
    ]);
    const { client } = renderSection(<AgentWorkSection agentId="agent-1" />);
    await screen.findByText('Needs review');
    expect(mocks.posts).toHaveBeenCalledWith(
      {
        agentStrategyId: 'agent-1',
        brandId: 'brand-1',
        limit: 50,
        sort: '-createdAt',
      },
      expect.any(AbortSignal),
    );
    expect(
      client.getQueryData(['agent-posts', 'org-1', 'brand-1', 'agent-1']),
    ).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Needs review' })).toHaveAttribute(
      'href',
      '/org/brand/publishing/posts/draft-1',
    );
    expect(
      screen.getByText('instagram · draft · Pending review'),
    ).toBeVisible();
    expect(
      screen.getAllByRole('link', { name: 'Review content' }),
    ).toHaveLength(1);
    expect(
      screen.getByRole('link', { name: 'Execution exec-1' }),
    ).toHaveAttribute('href', '/org/brand/automation/runs/exec-1');
  });

  it('clears old content when organization, brand, and agent change', async () => {
    mocks.posts.mockResolvedValueOnce([
      { id: 'old-post', label: 'Old scope content' },
    ]);
    const { rerender } = renderSection(<AgentWorkSection agentId="agent-1" />);
    await screen.findByText('Old scope content');
    mocks.posts.mockImplementation(() => new Promise(() => {}));
    mocks.scope.organizationId = 'org-2';
    mocks.scope.brandId = 'brand-2';
    rerender(<AgentWorkSection agentId="agent-2" />);
    expect(screen.queryByText('Old scope content')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading agent content',
    );
    await waitFor(() =>
      expect(mocks.posts).toHaveBeenLastCalledWith(
        expect.objectContaining({
          agentStrategyId: 'agent-2',
          brandId: 'brand-2',
        }),
        expect.any(AbortSignal),
      ),
    );
  });

  it('distinguishes a post error from a successful empty result', async () => {
    mocks.posts.mockRejectedValue(new Error('offline'));
    renderSection(<AgentWorkSection agentId="agent-1" />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load agent content.',
    );
    expect(
      screen.queryByText('No content generated by this agent yet.'),
    ).not.toBeInTheDocument();
  });

  it('shows successful empty content separately', async () => {
    renderSection(<AgentWorkSection agentId="agent-1" />);
    expect(
      await screen.findByText('No content generated by this agent yet.'),
    ).toBeVisible();
  });

  it('shows the newest daily report, recommendations, and unavailable attribution without claiming zero visits', async () => {
    mocks.reports.mockResolvedValue([
      {
        ...metrics,
        id: 'old',
        reportType: 'daily',
        periodStart: '2026-09-22',
        periodEnd: '2026-09-23',
        allocationChanges: ['Old recommendation'],
      },
      {
        ...metrics,
        id: 'weekly',
        reportType: 'weekly',
        periodStart: '2026-09-22',
        periodEnd: '2026-09-25',
        allocationChanges: ['Weekly recommendation'],
      },
      {
        ...metrics,
        id: 'new',
        reportType: 'daily',
        periodStart: '2026-09-23',
        periodEnd: '2026-09-24',
        allocationChanges: ['Try more video'],
        summary: 'Created 2 drafts this run; 1 awaits review.',
        metadata: {
          measurementBasis: 'Rolling weekly snapshot captured before this run.',
        },
      },
    ]);
    const { client } = renderSection(
      <AgentPerformanceSection agentId="agent-1" />,
    );
    expect(await screen.findByText('Try more video')).toBeVisible();
    expect(
      screen.getByText('Created 2 drafts this run; 1 awaits review.'),
    ).toBeVisible();
    expect(
      screen.getByText('Rolling weekly snapshot captured before this run.'),
    ).toBeVisible();
    expect(screen.queryByText('Old recommendation')).not.toBeInTheDocument();
    expect(screen.queryByText('Weekly recommendation')).not.toBeInTheDocument();
    expect(
      screen.getByText(
        '30 impressions · 3 clicks · Unavailable visits attributed to this agent.',
      ),
    ).toBeVisible();
    expect(
      client.getQueryData(['agent-performance', 'org-1', 'brand-1', 'agent-1']),
    ).toEqual(metrics);
    expect(
      client.getQueryData(['agent-reports', 'org-1', 'brand-1', 'agent-1']),
    ).toHaveLength(3);
  });

  it('loads reports independently of snapshot failures', async () => {
    mocks.snapshot.mockRejectedValue(new Error('offline'));
    renderSection(<AgentPerformanceSection agentId="agent-1" />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load agent performance.',
    );
    expect(await screen.findByText('No daily report yet.')).toBeVisible();
  });

  it('labels no measured performance and truncated samples', async () => {
    mocks.snapshot.mockResolvedValue({
      ...metrics,
      impressions: 0,
      clicks: 0,
      sampling: {
        truncated: true,
        postsSampled: 50,
        matchedPosts: 70,
        measurementsSampled: 50,
        matchedMeasurements: 80,
      },
    });
    renderSection(<AgentPerformanceSection agentId="agent-1" />);
    expect(
      await screen.findByText('No measured performance yet.'),
    ).toBeVisible();
    expect(
      screen.getByText(
        'Partial sample: 50 of 70 posts and 50 of 80 measurements.',
      ),
    ).toBeVisible();
  });
});
