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
  it('locks the marketing site to dark without reading the product theme store', () => {
    const { container } = render(
      <AppProviders includeLazyModalErrorDebug={false} includeToaster={false}>
        <div>Website child</div>
      </AppProviders>,
    );

    expect(screen.getByText('Website child')).toBeInTheDocument();
    expect(
      container.querySelector('#genfeed-theme-storage-bootstrap'),
    ).toBeNull();
    expect(themeProviderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultTheme: 'dark',
        enableSystem: false,
        forcedTheme: 'dark',
        storageKey: 'genfeed-website-theme',
      }),
    );
  });

  it('keeps notifications on the dark studio canvas', () => {
    render(
      <AppProviders includeLazyModalErrorDebug={false}>
        <div>Notifications</div>
      </AppProviders>,
    );

    expect(screen.getByTestId('toaster')).toHaveAttribute('data-theme', 'dark');
  });
});
