import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import LogoutPage from './content';
import '@testing-library/jest-dom/vitest';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  signOut: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@genfeedai/auth-client', () => ({
  signOut: mocks.signOut,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mocks.push,
  }),
}));

describe('LogoutPage', () => {
  it('calls signOut and redirects to login', async () => {
    render(<LogoutPage />);

    await waitFor(() => {
      expect(mocks.signOut).toHaveBeenCalledOnce();
    });
    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith('/login');
    });
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
