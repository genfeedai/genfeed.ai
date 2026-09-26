import { ContentCampaignStatus } from '@genfeedai/contracts';
import CampaignDetailShell from '@pages/campaigns/detail/CampaignDetailShell';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
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

vi.mock('next/navigation', () => ({
  usePathname: () => '/acme/demo/publishing/campaigns/cmp-1',
  useRouter: () => ({
    back: vi.fn(),
    prefetch: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children?: ReactNode;
    href: string;
  }) => (
    <a {...props} href={href}>
      {children}
    </a>
  ),
}));

vi.mock('@pages/campaigns/detail/CampaignUnavailableState', () => ({
  default: () => <div data-testid="campaign-unavailable">unavailable</div>,
}));

/**
 * Regression coverage for the general bug an independent review found in
 * PR #5221: Container inferred its layout ("classic" vs `SectionTopbar`
 * module chrome) from whichever of `right`/`tabs`/`headerTabs` happened to
 * be truthy on a given render. This shell's loading branch passed none of
 * those, while its loaded branch always passes `headerTabs` — so the page
 * flipped from the classic layout to module chrome the moment data
 * resolved, reflowing the page. `moduleChrome` on both branches (see
 * CampaignDetailShell.tsx) fixes this by declaring the chrome mode once
 * instead of inferring it per render. Unlike the other tests in this
 * directory, Container/SectionTopbar/Tabs are NOT mocked here — the point
 * is to observe the real chrome decision across a loading → loaded
 * transition.
 */
describe('CampaignDetailShell chrome stability', () => {
  it('keeps module-local chrome mounted through loading and loaded states', () => {
    mockUseCampaign.mockReturnValue({
      campaign: null,
      isLoading: true,
      isUnavailable: false,
      refetch: vi.fn(),
    });

    const { rerender } = render(
      <CampaignDetailShell campaignId="cmp-1" section="overview" />,
    );

    expect(screen.getByTestId('container')).toHaveAttribute(
      'data-module-chrome',
      'section-topbar',
    );

    mockUseCampaign.mockReturnValue({
      campaign: {
        brandId: 'brand-1',
        id: 'cmp-1',
        name: 'Autumn Reveal',
        objective: null,
        status: ContentCampaignStatus.DRAFT,
      },
      isLoading: false,
      isUnavailable: false,
      refetch: vi.fn(),
    });

    rerender(<CampaignDetailShell campaignId="cmp-1" section="overview" />);

    // Still module chrome — not flipped to the classic layout and back.
    expect(screen.getByTestId('container')).toHaveAttribute(
      'data-module-chrome',
      'section-topbar',
    );
    expect(screen.getByText('Autumn Reveal')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'tabs.overview' }),
    ).toBeInTheDocument();
  });
});
