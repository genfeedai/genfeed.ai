import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsProfilePage from './settings-profile-page';
import '@testing-library/jest-dom/vitest';

// Resolve against the real catalog so these assertions stay on the copy a user
// reads without requiring a NextIntlClientProvider in this focused unit suite.
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../../tests/next-intl.stub'
  );

  return { useTranslations: translateFromCatalog };
});

const mocks = vi.hoisted(() => ({
  currentTheme: 'dark',
  errorNotification: vi.fn(),
  mutateUser: vi.fn(),
  patchSettings: vi.fn(),
  findWorkflowEmailPreference: vi.fn(),
  getUsersService: vi.fn(),
  patchWorkflowEmailPreference: vi.fn(),
  setTheme: vi.fn(),
}));

vi.mock('@hooks/auth/use-auth-user/use-auth-user', () => ({
  useAuthUser: vi.fn(() => ({
    isLoaded: true,
    isSignedIn: true,
    user: {
      firstName: 'Test',
      fullName: 'Test User',
      id: 'user-123',
      imageUrl: null,
      lastName: 'User',
      primaryEmailAddress: { emailAddress: 'test@example.com' },
      publicMetadata: {},
      reload: vi.fn(),
      updatedAt: null,
    },
  })),
}));

vi.mock('@contexts/user/user-context/user-context', () => ({
  useCurrentUser: vi.fn(() => ({
    currentUser: {
      id: 'db-user-123',
      settings: {
        isAdvancedMode: true,
        isVideoNotificationsEmail: true,
        theme: 'dark',
      },
    },
    mutateUser: mocks.mutateUser,
  })),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => mocks.getUsersService),
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(() => ({
      error: mocks.errorNotification,
      success: vi.fn(),
    })),
  },
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ setTheme: mocks.setTheme, theme: mocks.currentTheme }),
}));

describe('SettingsProfilePage', () => {
  beforeAll(() => {
    Element.prototype.hasPointerCapture = vi.fn();
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentTheme = 'dark';
    mocks.patchSettings.mockResolvedValue(undefined);
    mocks.getUsersService.mockResolvedValue({
      findWorkflowEmailNotificationPreference:
        mocks.findWorkflowEmailPreference,
      patchMeSettings: mocks.patchSettings,
      patchWorkflowEmailNotificationPreference:
        mocks.patchWorkflowEmailPreference,
    });
    mocks.findWorkflowEmailPreference.mockResolvedValue({ isEnabled: false });
    mocks.patchWorkflowEmailPreference.mockImplementation(
      async (isEnabled: boolean) => ({ isEnabled }),
    );
  });

  it('should render without crashing', () => {
    const { container } = render(<SettingsProfilePage />);
    expect(container.firstChild).toBeInTheDocument();
    expect(screen.getByText('Language')).toBeInTheDocument();
    expect(screen.queryByText('Email Notifications')).not.toBeInTheDocument();
  });

  it('offers a language picker for the app interface', () => {
    render(<SettingsProfilePage />);

    expect(screen.getByText('Language')).toBeInTheDocument();
    expect(screen.getByTestId('personal-locale-trigger')).toBeInTheDocument();
  });

  it('offers System, Light, and Dark appearance preferences', async () => {
    const user = userEvent.setup();
    render(<SettingsProfilePage />);

    expect(screen.getByText('Appearance')).toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: 'Appearance' }));

    expect(
      await screen.findByRole('option', { name: 'System' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Light' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Dark' })).toBeInTheDocument();
  });

  it('applies and persists an appearance choice immediately', async () => {
    const user = userEvent.setup();
    render(<SettingsProfilePage />);

    await user.click(screen.getByRole('combobox', { name: 'Appearance' }));
    await user.click(await screen.findByRole('option', { name: 'Light' }));

    expect(mocks.setTheme).toHaveBeenCalledWith('light');
    await waitFor(() => {
      expect(mocks.patchSettings).toHaveBeenCalledWith({ theme: 'light' });
    });
    expect(
      mocks.setTheme.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    ).toBeLessThan(
      mocks.patchSettings.mock.invocationCallOrder[0] ??
        Number.NEGATIVE_INFINITY,
    );
    expect(mocks.mutateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({ theme: 'light' }),
      }),
    );
  });

  it('rolls back the appearance and reports a failed save', async () => {
    const user = userEvent.setup();
    mocks.patchSettings.mockRejectedValue(new Error('save failed'));
    render(<SettingsProfilePage />);

    await user.click(screen.getByRole('combobox', { name: 'Appearance' }));
    await user.click(await screen.findByRole('option', { name: 'Light' }));

    await waitFor(() => {
      expect(mocks.setTheme).toHaveBeenLastCalledWith('dark');
      expect(mocks.errorNotification).toHaveBeenCalledWith(
        'Failed to save your appearance preference.',
      );
    });
  });
});
