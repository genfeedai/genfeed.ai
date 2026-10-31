import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AuthActionSurface from '@/components/layouts/auth/AuthActionSurface';

describe('AuthActionSurface', () => {
  it('renders only host-provided actions', () => {
    render(
      <AuthActionSurface
        actions={<span>Host action</span>}
        description="Choose a supported sign-in method"
        title="Welcome back"
      />,
    );

    expect(screen.getByText('Host action')).toBeInTheDocument();
    expect(
      screen.queryByText('Continue without an account'),
    ).not.toBeInTheDocument();
  });

  it('allows a host layout to render the heading beside its logo', () => {
    render(
      <AuthActionSurface actions={<span>Host action</span>} hideHeading />,
    );

    expect(
      screen.queryByRole('heading', { name: 'Welcome back' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Host action')).toBeInTheDocument();
  });
});
