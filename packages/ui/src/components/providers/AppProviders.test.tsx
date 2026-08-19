import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import AppProviders from './AppProviders';

vi.mock('@ui/providers/ThemeCookieSync', () => ({
  default: () => null,
}));

vi.mock('next-themes', () => ({
  ThemeProvider: ({
    children,
    defaultTheme,
    enableSystem,
  }: {
    children: ReactNode;
    defaultTheme: string;
    enableSystem: boolean;
  }) => (
    <div
      data-testid="theme-provider"
      data-default-theme={defaultTheme}
      data-enable-system={String(enableSystem)}
    >
      {children}
    </div>
  ),
  useTheme: () => ({ theme: 'dark' }),
}));

vi.mock('sonner', () => ({
  Toaster: ({ theme }: { theme: string }) => (
    <div data-testid="toaster" data-theme={theme} />
  ),
}));

describe('AppProviders', () => {
  it('renders children through the shared provider stack', () => {
    render(
      <AppProviders
        initialTheme="dark"
        includeLazyModalErrorDebug={false}
        includeToaster={false}
      >
        <div>Child content</div>
      </AppProviders>,
    );

    expect(screen.getByText('Child content')).toBeInTheDocument();
  });

  it('passes the configured theme through without requiring auth config', () => {
    render(
      <AppProviders
        initialTheme="light"
        enableSystem
        includeLazyModalErrorDebug={false}
        includeToaster={false}
      >
        <div>Light child</div>
      </AppProviders>,
    );

    expect(screen.getByText('Light child')).toBeInTheDocument();
  });

  it('enables System by default and preserves a System preference', () => {
    render(
      <AppProviders
        initialTheme="system"
        includeLazyModalErrorDebug={false}
        includeToaster={false}
      >
        <div>System child</div>
      </AppProviders>,
    );

    expect(screen.getByTestId('theme-provider')).toHaveAttribute(
      'data-default-theme',
      'system',
    );
    expect(screen.getByTestId('theme-provider')).toHaveAttribute(
      'data-enable-system',
      'true',
    );
  });

  it('themes notifications with the active preference', () => {
    render(
      <AppProviders
        initialTheme="system"
        includeLazyModalErrorDebug={false}
      >
        <div>Notifications</div>
      </AppProviders>,
    );

    expect(screen.getByTestId('toaster')).toHaveAttribute('data-theme', 'dark');
  });
});
