import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const appProvidersSpy = vi.fn();

vi.mock('@styles/globals.css', () => ({}));

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
    googleAnalyticsId?: string;
    includeSpeedInsights?: boolean;
    includeVercelAnalytics?: boolean;
    initialTheme: string;
    storageKey?: string;
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
  const originalVercelEnv = process.env.VERCEL;

  beforeEach(() => {
    appProvidersSpy.mockClear();
  });

  afterEach(() => {
    if (originalVercelEnv === undefined) {
      delete process.env.VERCEL;
      return;
    }

    process.env.VERCEL = originalVercelEnv;
  });

  it('boots the app with a single root AppProviders wrapper', async () => {
    process.env.VERCEL = '1';
    const { default: RootLayout } = await import('./layout');

    render(
      await RootLayout({
        children: <div>App child</div>,
      } as never),
    );

    expect(screen.getByText('App child')).toBeTruthy();
    expect(appProvidersSpy).toHaveBeenCalledTimes(1);
    expect(appProvidersSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        googleAnalyticsId: 'ga-test',
        includeSpeedInsights: true,
        includeVercelAnalytics: true,
        initialTheme: 'dark',
        storageKey: 'theme',
      }),
    );
  });

  it('does not inject Vercel providers outside the Vercel runtime', async () => {
    delete process.env.VERCEL;
    const { default: RootLayout } = await import('./layout');

    render(
      await RootLayout({
        children: <div>App child</div>,
      } as never),
    );

    expect(appProvidersSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        includeSpeedInsights: false,
        includeVercelAnalytics: false,
      }),
    );
  });
});
