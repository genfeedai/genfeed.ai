import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRouter } from 'expo-router';
import { describe, expect, it, vi } from 'vitest';
import ProtectedLayout from '@/app/(protected)/_layout';
import Index from '@/app/index';
import { useMobileAuth } from '@/contexts/auth-context';

describe('Auth route behavior', () => {
  it('redirects signed-out users from the index route to login', () => {
    vi.mocked(useMobileAuth).mockReturnValue({
      getToken: vi.fn(),
      isLoaded: true,
      isSignedIn: false,
      refreshSession: vi.fn(),
      signInWithEmail: vi.fn(),
      signOut: vi.fn(),
      user: null,
    } as unknown as ReturnType<typeof useMobileAuth>);

    render(<Index />);

    expect(screen.getByTestId('redirect').getAttribute('data-href')).toBe(
      '/login',
    );
  });

  it('redirects signed-in users from the index route to content', () => {
    vi.mocked(useMobileAuth).mockReturnValue({
      getToken: vi.fn(),
      isLoaded: true,
      isSignedIn: true,
      refreshSession: vi.fn(),
      signInWithEmail: vi.fn(),
      signOut: vi.fn(),
      user: {
        email: 'qa@genfeed.ai',
        id: 'user_123',
        image: null,
        name: null,
        organizationId: null,
      },
    } as unknown as ReturnType<typeof useMobileAuth>);

    render(<Index />);

    expect(screen.getByTestId('redirect').getAttribute('data-href')).toBe(
      '/content',
    );
  });

  it('redirects signed-out users away from protected routes', async () => {
    const router = {
      back: vi.fn(),
      push: vi.fn(),
      replace: vi.fn(),
    };

    vi.mocked(useMobileAuth).mockReturnValue({
      getToken: vi.fn(),
      isLoaded: true,
      isSignedIn: false,
      refreshSession: vi.fn(),
      signInWithEmail: vi.fn(),
      signOut: vi.fn(),
      user: null,
    } as unknown as ReturnType<typeof useMobileAuth>);
    vi.mocked(useRouter).mockReturnValue(
      router as unknown as ReturnType<typeof useRouter>,
    );

    const { container } = render(<ProtectedLayout />);

    expect(container.firstChild).toBeNull();

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/login');
    });
  });

  it('renders the protected tabs and sign-out action for signed-in users', () => {
    const signOut = vi.fn();

    vi.mocked(useMobileAuth).mockReturnValue({
      getToken: vi.fn(),
      isLoaded: true,
      isSignedIn: true,
      refreshSession: vi.fn(),
      signInWithEmail: vi.fn(),
      signOut,
      user: {
        email: 'qa@genfeed.ai',
        id: 'user_123',
        image: null,
        name: null,
        organizationId: null,
      },
    } as unknown as ReturnType<typeof useMobileAuth>);
    vi.mocked(useRouter).mockReturnValue({
      back: vi.fn(),
      push: vi.fn(),
      replace: vi.fn(),
    } as unknown as ReturnType<typeof useRouter>);

    render(<ProtectedLayout />);

    expect(screen.getByTestId('tab-screen-content')).toBeTruthy();
    expect(screen.getByTestId('tab-screen-analytics')).toBeTruthy();
    expect(screen.getByTestId('tab-screen-settings')).toBeTruthy();
    expect(screen.queryByTestId('tab-screen-approvals')).toBeNull();
    expect(screen.queryByTestId('tab-screen-ideas')).toBeNull();
    expect(screen.queryByText('99+')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
