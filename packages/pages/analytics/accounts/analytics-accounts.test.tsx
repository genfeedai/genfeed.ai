import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AnalyticsAccounts from './analytics-accounts';

const requestState = vi.hoisted(() => ({
  accounts: [] as Array<Record<string, unknown>>,
  listError: false,
}));
const mocks = vi.hoisted(() => ({
  getAccountAnalytics: vi.fn(),
  getFleetEvaluationPolicy: vi.fn(),
  saveFleetEvaluationPolicy: vi.fn(),
  setToolbarNode: vi.fn(),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@contexts/analytics/analytics-context', () => ({
  useAnalyticsContext: () => ({
    dateRange: {},
    filters: {},
    setToolbarNode: mocks.setToolbarNode,
    refreshTrigger: 0,
    triggerRefresh: vi.fn(),
  }),
}));

const getService = async () => ({
  getAccountAnalytics: mocks.getAccountAnalytics.mockImplementation(() =>
    requestState.listError
      ? Promise.reject(new Error('request failed'))
      : Promise.resolve({
          accounts: requestState.accounts,
          limit: 50,
          page: 1,
          total: requestState.accounts.length,
          totalPages: 1,
          unattributedPostCount: 0,
        }),
  ),
  getFleetEvaluationPolicy: mocks.getFleetEvaluationPolicy.mockResolvedValue(
    {},
  ),
  saveFleetEvaluationPolicy: mocks.saveFleetEvaluationPolicy,
});

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => getService,
}));

vi.mock('@hooks/navigation/use-collection-scope/use-collection-scope', () => ({
  isCollectionFetchReady: () => true,
  useCollectionScope: () => ({
    brandId: 'brand-1',
    isReady: true,
    organizationId: 'org-1',
    pageScope: 'org',
  }),
}));

describe('AnalyticsAccounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requestState.accounts = [];
    requestState.listError = false;
  });

  it('renders one empty state without a redundant accounts section', async () => {
    render(<AnalyticsAccounts />);
    expect(
      await screen.findByText('No connected accounts'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Accounts' })).toBeNull();
    expect(screen.queryByLabelText('Search accounts')).toBeNull();
  });

  it('registers account filters in the analytics subbar and scopes requests', async () => {
    requestState.accounts = [
      {
        evaluation: null,
        identity: {
          brandLabel: 'Acme',
          credentialId: 'credential-1',
          label: 'Acme Social',
          platform: 'instagram',
        },
        metrics: [],
        publishedPosts: 0,
      },
    ];

    render(<AnalyticsAccounts />);

    await waitFor(() => {
      expect(mocks.setToolbarNode).toHaveBeenCalledWith(expect.anything());
    });
    expect(mocks.getAccountAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1' }),
    );
    expect(mocks.getFleetEvaluationPolicy).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1' }),
    );
    expect(screen.queryByLabelText('Search accounts')).toBeNull();

    const toolbar = mocks.setToolbarNode.mock.calls
      .map(([node]) => node as ReactNode)
      .find((node) => node !== null);
    render(toolbar);
    expect(screen.getByLabelText('Search accounts')).toBeInTheDocument();
    expect(screen.getByLabelText('Rank by metric')).toBeInTheDocument();
    expect(screen.getByLabelText('Evaluation weeks')).toBeInTheDocument();
  });

  it('renders an error and exits the loading state when requests fail', async () => {
    requestState.listError = true;

    render(<AnalyticsAccounts />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Account analytics could not be loaded.',
    );
    expect(screen.queryByText('No connected accounts')).toBeNull();
  });
  it('keeps Posts metadata and updates the dynamic definition for views/posts/followers', async () => {
    const user = userEvent.setup();
    requestState.accounts = [
      {
        evaluation: null,
        identity: {
          credentialId: 'credential-1',
          label: 'Acme',
          platform: 'instagram',
        },
        metrics: [],
        publishedPosts: 0,
      },
    ];
    render(<AnalyticsAccounts />);
    await screen.findByText('Acme');
    expect(
      screen.getByRole('button', { name: 'About Views' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'About Posts' }),
    ).toBeInTheDocument();
    const latestToolbar = () =>
      mocks.setToolbarNode.mock.calls
        .filter(([node]) => node !== null)
        .at(-1)?.[0] as ReactNode;
    const toolbar = render(latestToolbar());
    act(() => screen.getByRole('combobox', { name: 'Rank by metric' }).focus());
    await user.keyboard('{ArrowDown}');
    await screen.findByRole('option', { name: 'Posts' });
    await user.keyboard('{End}{Enter}');
    await waitFor(() =>
      expect(
        screen.getAllByRole('button', { name: 'About Posts' }),
      ).toHaveLength(2),
    );
    expect(screen.queryByRole('button', { name: 'About Views' })).toBeNull();
    toolbar.rerender(latestToolbar());
    act(() => screen.getByRole('combobox', { name: 'Rank by metric' }).focus());
    await user.keyboard('{ArrowDown}');
    await screen.findByRole('option', { name: 'Followers' });
    await user.keyboard('{Home}{ArrowDown}{Enter}');
    await waitFor(() =>
      expect(
        screen.getAllByRole('button', { name: 'About Posts' }),
      ).toHaveLength(1),
    );
    expect(
      screen.queryByRole('button', { name: 'About Followers' }),
    ).toBeNull();
  });
});
