import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import AnalyticsAccounts from './analytics-accounts';

const requestState = vi.hoisted(() => ({
  accounts: [] as Array<Record<string, unknown>>,
  listError: false,
}));
const scopeState = vi.hoisted(() => ({
  brandId: 'brand-1' as string | undefined,
  pageScope: 'brand' as 'brand' | 'org',
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

vi.mock('@contexts/analytics/analytics-context', async () => {
  const { useEffect } = await import('react');
  return {
    useAnalyticsContext: () => ({
      dateRange: {},
      filters: {},
      refreshTrigger: 0,
      triggerRefresh: vi.fn(),
    }),
    useAnalyticsToolbar: (node: ReactNode) => {
      useEffect(() => {
        mocks.setToolbarNode(node);
      }, [node]);
    },
  };
});

vi.mock('@ui/analytics/analytics-filter-menu/AnalyticsFilterMenu', () => ({
  default: ({
    facets,
  }: {
    facets: Array<{
      label: string;
      onChange: (value: string) => void;
      options: Array<{ label: string; value: string }>;
    }>;
  }) => (
    <div>
      {facets.map((facet) => (
        <div key={facet.label} role="group" aria-label={facet.label}>
          {facet.options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => facet.onChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  ),
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
    brandId: scopeState.brandId,
    isReady: true,
    organizationId: 'org-1',
    pageScope: scopeState.pageScope,
  }),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ brands: [] }),
}));

// The router is stable across renders in Next; a fresh object per render would
// change the fetch callback and refetch forever.
const router = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/acme/moonrise/analytics/accounts',
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams('page=1'),
}));

vi.mock('@ui/navigation/pagination/auto-pagination/AutoPagination', () => ({
  default: () => <nav aria-label="pagination" />,
}));

describe('AnalyticsAccounts', () => {
  const scrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'scrollIntoView',
  );

  beforeAll(() => {
    // Radix focuses real Select options; jsdom does not implement scrolling.
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
      writable: true,
    });
  });

  afterAll(() => {
    if (scrollIntoViewDescriptor) {
      Object.defineProperty(
        HTMLElement.prototype,
        'scrollIntoView',
        scrollIntoViewDescriptor,
      );
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
    requestState.accounts = [];
    requestState.listError = false;
    scopeState.brandId = 'brand-1';
    scopeState.pageScope = 'brand';
  });

  function account(overrides: Record<string, unknown> = {}) {
    return {
      evaluation: null,
      identity: {
        brandId: 'brand-2',
        brandLabel: 'Moonrise',
        credentialId: 'credential-1',
        externalAvatar: null,
        externalHandle: 'acme',
        externalName: 'Acme Social',
        isConnected: true,
        label: 'Acme Social',
        platform: 'instagram',
      },
      metrics: [],
      publishedPosts: 3,
      ...overrides,
    };
  }

  it('scopes the account list to the selected brand and hides the redundant Brand column', async () => {
    requestState.accounts = [account()];

    render(<AnalyticsAccounts />);

    await screen.findByText('Acme Social');
    expect(mocks.getAccountAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: 'brand-1', organizationId: 'org-1' }),
    );
    expect(mocks.getFleetEvaluationPolicy).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: 'brand-1' }),
    );
    expect(
      screen.queryByRole('columnheader', { name: 'Brand' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Moonrise')).not.toBeInTheDocument();
  });

  it('lists every brand and shows the Brand column on the org route', async () => {
    scopeState.brandId = undefined;
    scopeState.pageScope = 'org';
    requestState.accounts = [account()];

    render(<AnalyticsAccounts />);

    await screen.findByText('Moonrise');
    expect(
      screen.getByRole('columnheader', { name: 'Brand' }),
    ).toBeInTheDocument();
    expect(mocks.getAccountAnalytics.mock.calls[0][0]).toEqual(
      expect.objectContaining({ brandId: undefined, organizationId: 'org-1' }),
    );
  });

  it('pages server-side and renders the shared pagination', async () => {
    requestState.accounts = [account()];

    render(<AnalyticsAccounts />);

    await screen.findByText('Acme Social');
    expect(mocks.getAccountAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({ limit: ITEMS_PER_PAGE, page: 1 }),
    );
    expect(
      screen.getByRole('navigation', { name: 'pagination' }),
    ).toBeInTheDocument();
  });

  it('shows health as a badge and a dash for unavailable metrics', async () => {
    requestState.accounts = [
      account({
        evaluation: { evidence: {}, state: 'healthy' },
      }),
    ];

    render(<AnalyticsAccounts />);

    expect(await screen.findByText('Healthy')).toBeInTheDocument();
    expect(screen.queryByText('Unavailable')).not.toBeInTheDocument();
    expect(screen.getAllByText('-').length).toBeGreaterThan(0);
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
    expect(screen.getByRole('group', { name: 'Rank by' })).toBeInTheDocument();
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
    await user.click(
      within(screen.getByRole('group', { name: 'Rank by' })).getByRole(
        'button',
        {
          name: 'Posts',
        },
      ),
    );
    await waitFor(() =>
      expect(
        screen.getAllByRole('button', { name: 'About Posts' }),
      ).toHaveLength(2),
    );
    expect(screen.queryByRole('button', { name: 'About Views' })).toBeNull();
    toolbar.rerender(latestToolbar());
    await user.click(
      within(screen.getByRole('group', { name: 'Rank by' })).getByRole(
        'button',
        {
          name: 'Followers',
        },
      ),
    );
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
