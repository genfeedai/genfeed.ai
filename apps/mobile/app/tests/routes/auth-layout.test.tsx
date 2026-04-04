import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockUsePendingApprovalCount } = vi.hoisted(() => ({
  mockUsePendingApprovalCount: vi.fn(),
}));

vi.mock('@/hooks/use-approvals', () => ({
  usePendingApprovalCount: mockUsePendingApprovalCount,
}));

import { useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import ProtectedLayout from '@/app/(protected)/_layout';
import Index from '@/app/index';

describe('Auth route behavior', () => {
  beforeEach(() => {
    mockUsePendingApprovalCount.mockReturnValue({
      count: 0,
      isLoading: false,
    });
  });

  it('redirects signed-out users from the index route to login', () => {
    vi.mocked(useAuth).mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
    } as unknown as ReturnType<typeof useAuth>);

    render(<Index />);

    expect(screen.getByTestId('redirect').getAttribute('data-href')).toBe(
      '/login',
    );
  });

  it('redirects signed-in users from the index route to content', () => {
    vi.mocked(useAuth).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    } as unknown as ReturnType<typeof useAuth>);

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

    vi.mocked(useAuth).mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
      signOut: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>);
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

    vi.mocked(useAuth).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      signOut,
    } as unknown as ReturnType<typeof useAuth>);
    vi.mocked(useRouter).mockReturnValue({
      back: vi.fn(),
      push: vi.fn(),
      replace: vi.fn(),
    } as unknown as ReturnType<typeof useRouter>);
    mockUsePendingApprovalCount.mockReturnValue({
      count: 132,
      isLoading: false,
    });

    render(<ProtectedLayout />);

    expect(screen.getByTestId('tab-screen-content')).toBeTruthy();
    expect(screen.getByTestId('tab-screen-analytics')).toBeTruthy();
    expect(screen.getByTestId('tab-screen-approvals')).toBeTruthy();
    expect(screen.getByText('99+')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
