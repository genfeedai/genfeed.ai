import { useBrand } from '@contexts/user/brand-context/brand-context';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsOrganizationPage from './content';
import '@testing-library/jest-dom/vitest';

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: vi.fn(() => ({
    isReady: true,
    organizationId: 'org-123',
    selectedBrand: null,
  })),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: vi.fn(() => ({
    orgHref: (path: string) => `/test-org/~${path}`,
  })),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => vi.fn()),
}));

vi.mock('@hooks/data/organization/use-organization/use-organization', () => ({
  useOrganization: vi.fn(() => ({
    settings: {
      isAdvancedMode: false,
      isDarkroomNsfwVisible: false,
    },
    updateSettings: vi.fn(),
  })),
}));

vi.mock('./organization-identity-defaults-card', () => ({
  default: () => <div>Organization Identity Defaults</div>,
}));

vi.mock('./organization-generation-defaults-card', () => ({
  default: () => <div>Organization Generation Defaults</div>,
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(() => ({
    data: null,
    isLoading: false,
    refetch: vi.fn(),
  })),
  useQueryClient: vi.fn(() => ({
    setQueryData: vi.fn(),
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

describe('SettingsOrganizationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useBrand).mockReturnValue({
      isReady: true,
      organizationId: 'org-123',
      selectedBrand: null,
    } as ReturnType<typeof useBrand>);
  });

  it('should render without crashing', () => {
    const { container } = render(<SettingsOrganizationPage />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('always shows Start agent CTA and hides fleet NSFW when fleet is not connected', () => {
    render(<SettingsOrganizationPage />);

    expect(screen.getByRole('link', { name: /start agent/i })).toHaveAttribute(
      'href',
      '/test-org/~/agent/new',
    );
    expect(screen.queryByText(/Reveal fleet NSFW/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(/Fleet is not connected|Select a brand/i),
    ).toBeInTheDocument();
  });

  it('shows fleet NSFW control when the brand has fleet connected', () => {
    vi.mocked(useBrand).mockReturnValue({
      isReady: true,
      organizationId: 'org-123',
      selectedBrand: {
        id: 'brand-1',
        isDarkroomEnabled: true,
        label: 'Default Brand',
      },
    } as ReturnType<typeof useBrand>);

    render(<SettingsOrganizationPage />);

    expect(screen.getByText(/Reveal fleet NSFW assets/i)).toBeInTheDocument();
    expect(screen.getByText(/^Fleet$/i)).toBeInTheDocument();
  });
});
