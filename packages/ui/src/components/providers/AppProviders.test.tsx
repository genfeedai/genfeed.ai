import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import AppProviders from './AppProviders';

vi.mock('@ui/providers/ThemeCookieSync', () => ({
  default: () => null,
}));

vi.mock('next-themes', () => ({
  ThemeProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
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
});
