import { render, screen } from '@testing-library/react';
import TopbarEnd from '@ui/topbars/end/TopbarEnd';
import { describe, expect, it, vi } from 'vitest';

const userDropdownSpy = vi.fn();

vi.mock('@genfeedai/auth-client/react', () => ({
  UserButton: () => <div data-testid="topbar-user-button" />,
  useAuth: () => ({
    isSignedIn: true,
  }),
  useUser: () => ({
    user: {
      fullName: 'Test User',
      id: 'user_test',
      primaryEmailAddress: { emailAddress: 'test@example.com' },
    },
  }),
}));

vi.mock('@genfeedai/hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({
    getToken: vi.fn().mockResolvedValue('mock-token'),
    isLoaded: true,
    isSignedIn: true,
    orgId: 'org_test123',
    sessionId: 'sess_test123',
    userId: 'user_test',
  }),
}));

vi.mock('@genfeedai/hooks/auth/use-auth-user/use-auth-user', () => ({
  useAuthUser: () => ({
    isLoaded: true,
    isSignedIn: true,
    user: {
      firstName: 'Test',
      fullName: 'Test User',
      id: 'user_test',
      imageUrl: null,
      lastName: 'User',
      primaryEmailAddress: { emailAddress: 'test@example.com' },
      publicMetadata: {},
      reload: vi.fn(),
      updatedAt: null,
    },
  }),
}));

vi.mock('@ui/menus/user-dropdown/UserDropdown', () => ({
  default: (props: Record<string, unknown>) => {
    userDropdownSpy(props);
    return (
      <>
        <div data-testid="topbar-user-button" />
        <div data-testid="topbar-user-settings" />
      </>
    );
  },
}));

describe('TopbarEnd', () => {
  it('renders user settings beside the signed-in user control', () => {
    render(<TopbarEnd />);

    expect(screen.getByTestId('topbar-user-settings')).toBeInTheDocument();
    expect(screen.getByTestId('topbar-user-button')).toBeInTheDocument();
    expect(userDropdownSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        settingsScope: 'user',
        side: 'bottom',
        userEmail: 'test@example.com',
        userName: 'Test User',
      }),
    );
  });
});
