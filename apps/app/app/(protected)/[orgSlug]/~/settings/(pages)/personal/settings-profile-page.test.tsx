import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsProfilePage from './settings-profile-page';
import '@testing-library/jest-dom/vitest';

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
        isWorkflowNotificationsEmail: false,
      },
    },
    mutateUser: vi.fn(),
  })),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => vi.fn()),
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(() => ({
      error: vi.fn(),
      success: vi.fn(),
    })),
  },
}));

describe('SettingsProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crashing', () => {
    const { container } = render(<SettingsProfilePage />);
    expect(container.firstChild).toBeInTheDocument();
    expect(screen.getByText('Email Notifications')).toBeInTheDocument();
    expect(screen.getByText('Workflow Emails')).toBeInTheDocument();
    expect(screen.getByText('Video Emails')).toBeInTheDocument();
  });
});
