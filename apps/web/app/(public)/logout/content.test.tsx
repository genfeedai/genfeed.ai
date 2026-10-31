import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LogoutPage from './content';
import '@testing-library/jest-dom/vitest';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  resetAnalytics: vi.fn(),
  signOut: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@genfeedai/auth-client', () => ({
  signOut: mocks.signOut,
}));

vi.mock('@/lib/analytics', () => ({
  resetAnalytics: mocks.resetAnalytics,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({
    push: mocks.push,
  }),
}));

describe('LogoutPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signOut.mockResolvedValue(undefined);
  });

  it('calls signOut and redirects to login', async () => {
    render(<LogoutPage />);

    await waitFor(() => {
      expect(mocks.signOut).toHaveBeenCalledOnce();
    });
    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith('/login');
    });
    expect(mocks.resetAnalytics).toHaveBeenCalledOnce();
    expect(mocks.resetAnalytics.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.signOut.mock.invocationCallOrder[0] as number,
    );
  });

  it('clears analytics identity even when signOut fails', async () => {
    mocks.signOut.mockRejectedValueOnce(new Error('API unavailable'));

    render(<LogoutPage />);

    await waitFor(() => {
      expect(mocks.resetAnalytics).toHaveBeenCalledOnce();
    });
    expect(mocks.push).toHaveBeenCalledWith('/login');
  });

  it('should render without crashing', () => {
    const { container } = render(<LogoutPage />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders the signing out message', () => {
    render(<LogoutPage />);
    expect(screen.getByText(/Signing out/)).toBeInTheDocument();
  });
});
