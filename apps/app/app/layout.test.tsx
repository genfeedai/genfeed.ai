import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const appProvidersSpy = vi.fn();

const environmentServiceMock = vi.hoisted(() => ({
  GA_ID: 'ga-test',
}));

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
  EnvironmentService: environmentServiceMock,
}));

vi.mock('@ui/providers/AppProviders', () => ({
  default: ({
    children,
    ...props
  }: {
    children: ReactNode;
    googleAnalyticsId?: string;
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
  const originalDesktopShellEnv = process.env.NEXT_PUBLIC_DESKTOP_SHELL;

  beforeEach(() => {
    appProvidersSpy.mockClear();
    delete process.env.NEXT_PUBLIC_DESKTOP_SHELL;
  });

  afterEach(() => {
    if (originalDesktopShellEnv === undefined) {
      delete process.env.NEXT_PUBLIC_DESKTOP_SHELL;
      return;
    }

    process.env.NEXT_PUBLIC_DESKTOP_SHELL = originalDesktopShellEnv;
  });

  it('boots the app with a single root AppProviders wrapper', async () => {
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
        initialTheme: 'dark',
        storageKey: 'theme',
      }),
    );
  });
});
