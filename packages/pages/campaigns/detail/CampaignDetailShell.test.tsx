import { ContentCampaignStatus } from '@genfeedai/contracts';
import CampaignDetailShell from '@pages/campaigns/detail/CampaignDetailShell';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

const mockUseCampaign = vi.fn();

vi.mock('@hooks/data/campaigns/use-campaign', () => ({
  useCampaign: () => mockUseCampaign(),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme/demo${path}` }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => vi.fn(),
}));

vi.mock('@providers/global-modals/global-modals.provider', () => ({
  useConfirmModal: () => ({ openConfirm: vi.fn() }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: vi.fn(),
      success: vi.fn(),
    }),
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@pages/campaigns/detail/CampaignUnavailableState', () => ({
  default: () => <div data-testid="campaign-unavailable">unavailable</div>,
}));

vi.mock('@ui/layout/container/Container', () => ({
  default: ({
    children,
    headerTabs,
    label,
    right,
  }: {
    children: ReactNode;
    headerTabs?: { items?: Array<{ href: string; label: string }> };
    label: string;
    right?: ReactNode;
  }) => (
    <section>
      <h1>{label}</h1>
      {headerTabs?.items?.map((tab) => (
        <a href={tab.href} key={tab.href}>
          {tab.label}
        </a>
      ))}
      {right}
      {children}
    </section>
  ),
}));

vi.mock('@ui/display/badge/Badge', () => ({
  default: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock('@ui/feedback/LoadingState', () => ({
  default: () => <div>loading</div>,
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    asChild,
    children,
    label,
    onClick,
  }: {
    asChild?: boolean;
    children?: ReactNode;
    label?: string;
    onClick?: () => void;
  }) =>
    asChild ? (
      children
    ) : (
      <button onClick={onClick} type="button">
        {label}
        {children}
      </button>
    ),
}));

describe('CampaignDetailShell', () => {
  beforeEach(() => {
    mockUseCampaign.mockReturnValue({
      campaign: {
        brandId: 'brand-1',
        id: 'cmp-1',
        name: 'Autumn Reveal',
        status: ContentCampaignStatus.DRAFT,
      },
      isLoading: false,
      isUnavailable: false,
      refetch: vi.fn(),
    });
  });

  it('renders overview, content, calendar, and performance destinations', () => {
    render(
      <CampaignDetailShell campaignId="cmp-1" section="overview">
        <div>overview body</div>
      </CampaignDetailShell>,
    );

    expect(screen.getByText('Autumn Reveal')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'tabs.overview' })).toHaveAttribute(
      'href',
      '/acme/demo/publishing/campaigns/cmp-1',
    );
    expect(screen.getByRole('link', { name: 'tabs.content' })).toHaveAttribute(
      'href',
      '/acme/demo/publishing/campaigns/cmp-1/content',
    );
    expect(screen.getByRole('link', { name: 'tabs.calendar' })).toHaveAttribute(
      'href',
      '/acme/demo/publishing/campaigns/cmp-1/calendar',
    );
    expect(
      screen.getByRole('link', { name: 'tabs.performance' }),
    ).toHaveAttribute(
      'href',
      '/acme/demo/publishing/campaigns/cmp-1/performance',
    );
    expect(screen.getByRole('link', { name: 'tabs.ads' })).toHaveAttribute(
      'href',
      '/acme/demo/publishing/campaigns/cmp-1/ads',
    );
    expect(screen.getByText('overview body')).toBeInTheDocument();
  });

  it('shows generate and start on a draft campaign', () => {
    render(<CampaignDetailShell campaignId="cmp-1" section="overview" />);

    expect(
      screen.getByRole('button', { name: 'generate' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'start' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'pause' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'complete' }),
    ).not.toBeInTheDocument();
  });

  it('shows pause and complete on an active campaign', () => {
    mockUseCampaign.mockReturnValue({
      campaign: {
        brandId: 'brand-1',
        id: 'cmp-1',
        name: 'Autumn Reveal',
        status: ContentCampaignStatus.ACTIVE,
      },
      isLoading: false,
      isUnavailable: false,
      refetch: vi.fn(),
    });

    render(<CampaignDetailShell campaignId="cmp-1" section="overview" />);

    expect(
      screen.getByRole('button', { name: 'generate' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'pause' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'complete' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'start' }),
    ).not.toBeInTheDocument();
  });

  it('hides lifecycle controls on an archived campaign', () => {
    mockUseCampaign.mockReturnValue({
      campaign: {
        brandId: 'brand-1',
        id: 'cmp-1',
        name: 'Autumn Reveal',
        status: ContentCampaignStatus.ARCHIVED,
      },
      isLoading: false,
      isUnavailable: false,
      refetch: vi.fn(),
    });

    render(<CampaignDetailShell campaignId="cmp-1" section="overview" />);

    expect(screen.getByRole('button', { name: 'restore' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'generate' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'start' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'archive' }),
    ).not.toBeInTheDocument();
  });

  it('shows the canonical unavailable state without campaign details', () => {
    mockUseCampaign.mockReturnValue({
      campaign: null,
      isLoading: false,
      isUnavailable: true,
      refetch: vi.fn(),
    });

    render(<CampaignDetailShell campaignId="missing" section="overview" />);

    expect(screen.getByTestId('campaign-unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Autumn Reveal')).not.toBeInTheDocument();
  });
});
