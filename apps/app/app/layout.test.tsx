import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const appProvidersSpy = vi.fn();

vi.mock('@styles/globals.scss', () => ({}));

vi.mock('@genfeedai/fonts', () => ({
  fontVariables: 'font-vars',
}));

vi.mock('@helpers/media/metadata/metadata.helper', () => ({
  metadata: {
    description: 'Genfeed description',
    name: 'Genfeed',
  },
}));

vi.mock('@helpers/ui/theme/theme.helper', () => ({
  resolveRequestTheme: vi.fn().mockResolvedValue('dark'),
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    GA_ID: 'ga-test',
  },
}));

vi.mock('@ui/providers/AppProviders', () => ({
  default: ({
    children,
    ...props
  }: {
    children: ReactNode;
    clerkProps?: Record<string, unknown>;
    googleAnalyticsId?: string;
    initialTheme: string;
  }) => {
    appProvidersSpy(props);
    return <div data-testid="app-providers">{children}</div>;
  },
}));

vi.mock('@ui/shell/AppHtmlDocument', () => ({
  default: ({ children }: { children: ReactNode }) => (
    <div data-testid="app-html-document">{children}</div>
  ),
}));

vi.mock('@ui/shell/metadata', () => ({
  createAppMetadata: vi.fn(() => ({})),
  createPwaMetadata: vi.fn(() => ({
    metadata: {},
    viewport: {},
  })),
}));

describe('app root layout', () => {
  it('boots the app with a single root AppProviders wrapper', async () => {
    const { default: RootLayout } = await import('./layout');

    render(
      await RootLayout({
        children: <div>App child</div>,
      } as never),
    );

    expect(screen.getByText('App child')).toBeInTheDocument();
    expect(appProvidersSpy).toHaveBeenCalledTimes(1);
    expect(appProvidersSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkProps: {
          signInFallbackRedirectUrl: '/',
          signInForceRedirectUrl: '/',
          signInUrl: '/login',
          signUpUrl: '/sign-up',
        },
        googleAnalyticsId: 'ga-test',
        initialTheme: 'dark',
      }),
    );
  });
});
