import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import AppProviders from './AppProviders';

const themeProviderMock = vi.fn();

vi.mock('@genfeedai/auth-client/react', () => ({
  BetterAuthProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock('@genfeedai/auth-client/themes', () => ({
  dark: {},
}));

vi.mock('@ui/components/providers/ThemeCookieSync', () => ({
  default: () => null,
}));

vi.mock('next-themes', () => ({
  ThemeProvider: ({ children, ...props }: { children: ReactNode }) => {
    themeProviderMock(props);
    return <>{children}</>;
  },
  useTheme: () => ({ resolvedTheme: 'dark', theme: 'light' }),
}));

vi.mock('sonner', () => ({
  Toaster: ({ theme }: { theme: string }) => (
    <div data-testid="toaster" data-theme={theme} />
  ),
}));

describe('website AppProviders', () => {
  it('renders children through the theme and auth providers', () => {
    const { container } = render(
      <AppProviders
        initialTheme="dark"
        includeLazyModalErrorDebug={false}
        includeToaster={false}
      >
        <div>Website child</div>
      </AppProviders>,
    );

    expect(screen.getByText('Website child')).toBeInTheDocument();
    const bootstrap = container.querySelector(
      '#genfeed-theme-storage-bootstrap',
    );
    expect(bootstrap).not.toBeNull();
    expect(
      bootstrap?.compareDocumentPosition(screen.getByText('Website child')),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(themeProviderMock).toHaveBeenCalledWith(
      expect.objectContaining({ enableSystem: true }),
    );
  });

  it('themes notifications with the active preference', () => {
    render(
      <AppProviders initialTheme="system" includeLazyModalErrorDebug={false}>
        <div>Notifications</div>
      </AppProviders>,
    );

    expect(screen.getByTestId('toaster')).toHaveAttribute(
      'data-theme',
      'light',
    );
  });
});
