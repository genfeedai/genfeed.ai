import { render, screen } from '@testing-library/react';
import AuthActionSurface from '@ui/layouts/auth/AuthActionSurface';
import { describe, expect, it } from 'vitest';

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
});
