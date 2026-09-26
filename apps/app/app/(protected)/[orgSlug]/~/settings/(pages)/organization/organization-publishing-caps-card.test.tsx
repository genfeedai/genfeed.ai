import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OrganizationPublishingCapsCard from './organization-publishing-caps-card';

const mocks = vi.hoisted(() => ({
  clearBootstrapCache: vi.fn(),
  getOrganizationsService: vi.fn(),
  loggerError: vi.fn(),
  notificationsError: vi.fn(),
  notificationsSuccess: vi.fn(),
  organizationId: 'org-1',
  patchSettings: vi.fn(),
  refresh: vi.fn(),
  settings: {
    quotaInstagram: 5,
    quotaTiktok: 1,
    quotaTwitter: 5,
    quotaYoutube: 5,
  } as Record<string, unknown>,
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock(
  '@contexts/providers/protected-bootstrap/client-protected-bootstrap',
  () => ({
    clearClientProtectedBootstrapCache: mocks.clearBootstrapCache,
  }),
);

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    organizationId: mocks.organizationId,
  }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getOrganizationsService,
}));

vi.mock('@hooks/data/organization/use-organization/use-organization', () => ({
  useOrganization: () => ({
    refresh: mocks.refresh,
    settings: mocks.settings,
  }),
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: mocks.loggerError,
  },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: mocks.notificationsError,
      success: mocks.notificationsSuccess,
    }),
  },
}));

vi.mock('@ui/card/Card', () => ({
  default: ({ children, label }: { children: ReactNode; label?: string }) => (
    <section>
      {label ? <h2>{label}</h2> : null}
      {children}
    </section>
  ),
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    children,
    isDisabled,
    onClick,
    type = 'button',
  }: {
    children: ReactNode;
    isDisabled?: boolean;
    onClick?: () => void;
    type?: 'button' | 'submit';
  }) => (
    <button type={type} disabled={isDisabled} onClick={onClick}>
      {children}
    </button>
  ),
}));

describe('OrganizationPublishingCapsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.settings = {
      quotaInstagram: 5,
      quotaTiktok: 1,
      quotaTwitter: 5,
      quotaYoutube: 5,
    };
    mocks.patchSettings.mockResolvedValue({});
    mocks.refresh.mockResolvedValue(undefined);
    mocks.getOrganizationsService.mockResolvedValue({
      patchSettings: mocks.patchSettings,
    });
  });

  it('renders a cap field per platform seeded from organization settings', () => {
    render(<OrganizationPublishingCapsCard />);

    expect(screen.getByText('Daily publishing caps')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Max published posts per connected account per UTC day. 0 = no cap.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('X')).toHaveValue(5);
    expect(screen.getByLabelText('Instagram')).toHaveValue(5);
    expect(screen.getByLabelText('YouTube')).toHaveValue(5);
    expect(screen.getByLabelText('TikTok')).toHaveValue(1);
  });

  it('saves every cap as a number and refreshes settings', async () => {
    render(<OrganizationPublishingCapsCard />);

    fireEvent.change(screen.getByLabelText('X'), { target: { value: '48' } });
    fireEvent.change(screen.getByLabelText('TikTok'), {
      target: { value: '0' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Save publishing caps' }),
    );

    await waitFor(() => {
      expect(mocks.patchSettings).toHaveBeenCalledWith('org-1', {
        quotaInstagram: 5,
        quotaTiktok: 0,
        quotaTwitter: 48,
        quotaYoutube: 5,
      });
    });
    expect(mocks.clearBootstrapCache).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(mocks.notificationsSuccess).toHaveBeenCalledWith(
      'Publishing caps saved',
    );
  });

  it('rejects a cap above the maximum without calling the API', async () => {
    render(<OrganizationPublishingCapsCard />);

    fireEvent.change(screen.getByLabelText('X'), {
      target: { value: '1001' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Save publishing caps' }),
    );

    await waitFor(() => {
      expect(mocks.notificationsError).toHaveBeenCalledWith(
        'Each cap must be a whole number between 0 and 1000.',
      );
    });
    expect(mocks.patchSettings).not.toHaveBeenCalled();
  });

  it('rejects an empty cap without calling the API', async () => {
    render(<OrganizationPublishingCapsCard />);

    fireEvent.change(screen.getByLabelText('Instagram'), {
      target: { value: '' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Save publishing caps' }),
    );

    await waitFor(() => {
      expect(mocks.notificationsError).toHaveBeenCalled();
    });
    expect(mocks.patchSettings).not.toHaveBeenCalled();
  });

  it('reports a failed save', async () => {
    mocks.patchSettings.mockRejectedValueOnce(new Error('boom'));
    render(<OrganizationPublishingCapsCard />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Save publishing caps' }),
    );

    await waitFor(() => {
      expect(mocks.notificationsError).toHaveBeenCalledWith(
        'Failed to save publishing caps',
      );
    });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
