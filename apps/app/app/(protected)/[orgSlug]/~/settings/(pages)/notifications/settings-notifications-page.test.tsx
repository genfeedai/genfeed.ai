import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsNotificationsPage from './settings-notifications-page';
import '@testing-library/jest-dom/vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');

  return { useTranslations: translateFromCatalog };
});

const mocks = vi.hoisted(() => ({
  errorNotification: vi.fn(),
  mutateUser: vi.fn(),
  patchSettings: vi.fn(),
  findWorkflowEmailPreference: vi.fn(),
  getUsersService: vi.fn(),
  patchWorkflowEmailPreference: vi.fn(),
}));

vi.mock('@hooks/auth/use-auth-user/use-auth-user', () => ({
  useAuthUser: vi.fn(() => ({
    isLoaded: true,
    isSignedIn: true,
    user: { id: 'user-123' },
  })),
}));

vi.mock('@contexts/user/user-context/user-context', () => ({
  useCurrentUser: vi.fn(() => ({
    currentUser: {
      id: 'db-user-123',
      settings: {
        isVideoNotificationsEmail: true,
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

describe('SettingsNotificationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('renders email notification preferences from the catalog', () => {
    render(<SettingsNotificationsPage />);

    expect(screen.getByText('Email Notifications')).toBeInTheDocument();
    expect(screen.getByText('Workflow Emails')).toBeInTheDocument();
    expect(screen.getByText('Video Emails')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Send an email when a video generation completes or fails.',
      ),
    ).toBeInTheDocument();
  });

  it('persists the video email preference through shared settings', async () => {
    const user = userEvent.setup();
    render(<SettingsNotificationsPage />);

    const toggle = screen.getByRole('switch', { name: 'Video Emails' });
    expect(toggle).toBeChecked();
    await user.click(toggle);

    await waitFor(() => {
      expect(mocks.patchSettings).toHaveBeenCalledWith({
        isVideoNotificationsEmail: false,
      });
    });
  });

  it('loads and persists the durable workflow email preference', async () => {
    const user = userEvent.setup();
    mocks.findWorkflowEmailPreference.mockResolvedValue({ isEnabled: true });
    render(<SettingsNotificationsPage />);

    const toggle = await screen.findByRole('switch', {
      name: 'Workflow Emails',
    });
    await waitFor(() => expect(toggle).toBeChecked());
    await user.click(toggle);

    await waitFor(() => {
      expect(mocks.patchWorkflowEmailPreference).toHaveBeenCalledWith(false);
    });
    expect(mocks.patchSettings).not.toHaveBeenCalledWith(
      expect.objectContaining({
        isWorkflowNotificationsEmail: expect.anything(),
      }),
    );
  });

  it('aborts the workflow preference load when the page unmounts', async () => {
    const { unmount } = render(<SettingsNotificationsPage />);

    await waitFor(() => {
      expect(mocks.findWorkflowEmailPreference).toHaveBeenCalledWith(
        expect.any(AbortSignal),
      );
    });
    const signal = mocks.findWorkflowEmailPreference.mock.calls[0]?.[0];
    expect(signal?.aborted).toBe(false);

    unmount();

    expect(signal?.aborted).toBe(true);
  });

  it('keeps an unknown workflow preference disabled and supports retry', async () => {
    const user = userEvent.setup();
    mocks.findWorkflowEmailPreference.mockRejectedValueOnce(
      new Error('load failed'),
    );
    render(<SettingsNotificationsPage />);

    const toggle = await screen.findByRole('switch', {
      name: 'Workflow Emails',
    });
    expect(
      await screen.findByText('Workflow email preference could not be loaded.'),
    ).toBeInTheDocument();
    expect(toggle).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(toggle).toBeEnabled());
    expect(mocks.findWorkflowEmailPreference).toHaveBeenCalledTimes(2);
  });
});
