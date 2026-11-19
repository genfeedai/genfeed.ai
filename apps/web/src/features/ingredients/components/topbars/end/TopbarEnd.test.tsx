import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TopbarEnd from '@/features/ingredients/components/topbars/end/TopbarEnd';

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

vi.mock('@genfeedai/hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ orgHref: (href: string) => `/acme/~${href}` }),
}));

vi.mock('@/components/topbars/credits-bar/AccountCredits', () => ({
  default: () => null,
}));

describe('TopbarEnd', () => {
  it('opens personal settings without exposing the signed-in name or email', () => {
    render(<TopbarEnd />);

    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Open account menu' }),
    );

    const menu = screen.getByRole('menu');
    expect(
      within(menu).getByRole('menuitem', { name: 'Personal' }),
    ).toBeVisible();
    expect(menu).not.toHaveTextContent('Test User');
    expect(menu).not.toHaveTextContent('test@example.com');
  });
});
