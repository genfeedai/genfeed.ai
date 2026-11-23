// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AuthPageFallback from './AuthPageFallback';
import '@testing-library/jest-dom/vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@app/(public)/auth-showcase-aside', () => ({
  default: () => <div data-testid="auth-showcase" />,
}));

vi.mock('@genfeedai/hooks/ui/use-theme-logo/use-theme-logo', () => ({
  useThemeLogo: () => null,
}));

describe('AuthPageFallback', () => {
  it('shows the page heading and description before the form is read', () => {
    render(<AuthPageFallback variant="login" />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'authFallback.login.title',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('authFallback.login.description'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('puts the showcase beside the sign-in and sign-up pages only', () => {
    const { rerender } = render(<AuthPageFallback variant="sign-up" />);
    expect(screen.getByTestId('auth-showcase')).toBeInTheDocument();

    rerender(<AuthPageFallback variant="forgot" />);
    expect(screen.queryByTestId('auth-showcase')).not.toBeInTheDocument();
  });
});
