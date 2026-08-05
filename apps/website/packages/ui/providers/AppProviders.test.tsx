import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import AppProviders from './AppProviders';

vi.mock('@genfeedai/auth-client/react', () => ({
  BetterAuthProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock('@genfeedai/auth-client/themes', () => ({
  dark: {},
}));

vi.mock('@ui/providers/ThemeCookieSync', () => ({
  default: () => null,
}));

vi.mock('next-themes', () => ({
  ThemeProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useTheme: () => ({ resolvedTheme: 'dark' }),
}));

describe('website AppProviders', () => {
  it('renders children through the theme and auth providers', () => {
    render(
      <AppProviders
        initialTheme="dark"
        includeLazyModalErrorDebug={false}
        includeToaster={false}
      >
        <div>Website child</div>
      </AppProviders>,
    );

    expect(screen.getByText('Website child')).toBeInTheDocument();
  });
});
