import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import LogoutPage from './content';
import '@testing-library/jest-dom';

const signOut = vi.fn();

vi.mock('@clerk/nextjs', () => ({
  useClerk: () => ({
    signOut,
  }),
}));

describe('LogoutPage', () => {
  it('requests sign-out and redirects back to login', () => {
    render(<LogoutPage />);

    expect(signOut).toHaveBeenCalledWith({ redirectUrl: '/login' });
  });

  it('should render without crashing', () => {
    const { container } = render(<LogoutPage />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders the signing out message', () => {
    render(<LogoutPage />);
    expect(screen.getByText('Signing out...')).toBeInTheDocument();
  });
});
