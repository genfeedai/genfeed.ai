import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import OutreachCampaignsList from '@pages/agents/campaigns/OutreachCampaignsList';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

vi.mock('@ui/navigation/pagination/auto-pagination/AutoPagination', () => ({
  default: () => <nav aria-label="pagination" />,
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

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(() => ({
    data: [],
    isLoading: false,
    refetch: vi.fn(),
  })),
  useQueryClient: vi.fn(() => ({
    setQueryData: vi.fn(),
  })),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../apps/app/tests/next-intl.stub'
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

vi.mock('@providers/global-modals/global-modals.provider', () => ({
  useConfirmModal: vi.fn(() => ({
    openConfirm: vi.fn(),
  })),
}));

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
    mocks.findPageByOrganization.mockResolvedValue([]);
  });

  it('should render without crashing', () => {
    const { container } = render(<OutreachCampaignsList />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('uses outreach sequence copy instead of Campaign', () => {
    render(<OutreachCampaignsList />);

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
    mocks.findPageByOrganization.mockResolvedValue(everyCampaign.slice(15));

    render(<OutreachCampaignsList />);

    expect(await screen.findByText('Sequence 19')).toBeInTheDocument();
    expect(screen.queryByText('Sequence 0')).not.toBeInTheDocument();
    expect(mocks.findPageByOrganization).toHaveBeenCalledWith(
      'org-123',
      { brandId: 'brand-123', limit: ITEMS_PER_PAGE, page: 2 },
      expect.any(AbortSignal),
    );
    expect(
      screen.getByRole('navigation', { name: 'pagination' }),
    ).toBeInTheDocument();
  });
});
