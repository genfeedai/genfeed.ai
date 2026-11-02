import { paginatedResponse } from '@app-tests/paginated-response';
import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OutreachCampaignsList from '@/features/agents/campaigns/OutreachCampaignsList';
import '@testing-library/jest-dom/vitest';

const mocks = vi.hoisted(() => ({
  findAllByOrganization: vi.fn(),
  findPageByOrganization: vi.fn(),
  page: null as string | null,
}));

vi.mock('./OutreachCampaignsTable', () => ({
  default: ({
    campaigns,
  }: {
    campaigns: Array<{ id: string; label: string }>;
  }) => (
    <ul>
      {campaigns.map((campaign) => (
        <li key={campaign.id}>{campaign.label}</li>
      ))}
    </ul>
  ),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: vi.fn(() => ({
    brandId: 'brand-123',
    isReady: true,
    organizationId: 'org-123',
  })),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => async () => ({
    findAllByOrganization: mocks.findAllByOrganization,
    findPageByOrganization: mocks.findPageByOrganization,
  })),
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../tests/next-intl.stub'
  );

  return { useTranslations: translateFromCatalog };
});

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => path }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: vi.fn(() => ({
    push: vi.fn(),
  })),
  useSearchParams: vi.fn(() => ({
    get: (key: string) => (key === 'page' ? mocks.page : null),
  })),
}));

vi.mock(
  '@genfeedai/contexts/providers/global-modals/global-modals.hooks',
  () => ({
    useConfirmModal: vi.fn(() => ({
      openConfirm: vi.fn(),
    })),
  }),
);

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(() => ({
      error: vi.fn(),
      success: vi.fn(),
    })),
  },
}));

describe('OutreachCampaignsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.page = null;
    mocks.findAllByOrganization.mockResolvedValue([]);
    mocks.findPageByOrganization.mockResolvedValue(paginatedResponse([]));
  });

  it('should render without crashing', () => {
    const { container } = render(<OutreachCampaignsList />, {
      wrapper: queryClientWrapper(),
    });
    expect(container.firstChild).toBeInTheDocument();
  });

  it('uses outreach sequence copy instead of Campaign', () => {
    render(<OutreachCampaignsList />, { wrapper: queryClientWrapper() });

    expect(screen.getByText('Outreach sequences')).toBeInTheDocument();
    expect(screen.getByText('New sequence')).toBeInTheDocument();
    expect(screen.queryByText(/campaign/i)).not.toBeInTheDocument();
  });

  it('shows the server page in the table while the KPIs cover every sequence', async () => {
    mocks.page = '2';
    const everyCampaign = Array.from({ length: 20 }, (_, index) => ({
      id: `c${index}`,
      label: `Sequence ${index}`,
      status: 'active',
      totalFailed: 0,
      totalReplies: 1,
      totalSuccessful: 1,
      totalTargets: 10,
    }));
    mocks.findAllByOrganization.mockResolvedValue(everyCampaign);
    mocks.findPageByOrganization.mockResolvedValue(
      paginatedResponse(everyCampaign.slice(15), {
        totalDocs: 40,
        totalPages: 3,
      }),
    );

    render(<OutreachCampaignsList />, { wrapper: queryClientWrapper() });

    expect(await screen.findByText('Sequence 19')).toBeInTheDocument();
    expect(screen.queryByText('Sequence 0')).not.toBeInTheDocument();
    expect(mocks.findPageByOrganization).toHaveBeenCalledWith(
      'org-123',
      { brandId: 'brand-123', limit: ITEMS_PER_PAGE, page: 2 },
      expect.any(AbortSignal),
    );
    expect(screen.getByText('40 sequences')).toBeInTheDocument();
    expect(screen.queryByText('200 sequences')).not.toBeInTheDocument();
    expect(
      screen.getByRole('navigation', { name: 'pagination' }),
    ).toBeInTheDocument();
  });

  it('shows the KPIs as skeletons, not zeros, while the first read is in flight', () => {
    mocks.findAllByOrganization.mockReturnValue(new Promise(() => {}));
    mocks.findPageByOrganization.mockReturnValue(new Promise(() => {}));

    render(<OutreachCampaignsList />, { wrapper: queryClientWrapper() });

    expect(
      screen.getByRole('status', { name: 'Loading Success Rate' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('status', { name: 'Loading Active' }),
    ).toBeInTheDocument();
  });

  it('paints the cached sequences and KPIs at once when coming back', async () => {
    const campaign = {
      id: 'c1',
      label: 'Cached sequence',
      status: 'active',
      totalFailed: 0,
      totalReplies: 4,
      totalSuccessful: 3,
      totalTargets: 10,
    };
    mocks.findAllByOrganization.mockResolvedValue([campaign]);
    mocks.findPageByOrganization.mockResolvedValue(
      paginatedResponse([campaign]),
    );
    const client = createTestQueryClient();
    const firstVisit = render(<OutreachCampaignsList />, {
      wrapper: queryClientWrapper(client),
    });
    expect(await screen.findByText('Cached sequence')).toBeInTheDocument();
    firstVisit.unmount();

    mocks.findAllByOrganization.mockReturnValue(new Promise(() => {}));
    mocks.findPageByOrganization.mockReturnValue(new Promise(() => {}));
    render(<OutreachCampaignsList />, { wrapper: queryClientWrapper(client) });

    expect(screen.getByText('Cached sequence')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(
      screen.queryByRole('status', { name: 'Loading Success Rate' }),
    ).not.toBeInTheDocument();
  });
});
