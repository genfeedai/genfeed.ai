import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import LogoutPage from './content';
import '@testing-library/jest-dom';

vi.mock('@clerk/nextjs', () => ({
  SignOutButton: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="clerk-signout">{children}</div>
  ),
}));

vi.mock('@ui/layouts/auth/AuthFormLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="auth-form-layout">{children}</div>
  ),
}));

describe('LogoutPage', () => {
  it('should render without crashing', () => {
    const { container } = render(<LogoutPage />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should render AuthFormLayout wrapper', () => {
    render(<LogoutPage />);
    expect(screen.getByTestId('auth-form-layout')).toBeInTheDocument();
  });

  it('should render SignOutButton', () => {
    render(<LogoutPage />);
    expect(screen.getByTestId('clerk-signout')).toBeInTheDocument();
  });
});
