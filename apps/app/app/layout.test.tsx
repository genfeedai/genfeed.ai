import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import type { CreateAppMetadataOptions } from '@ui/shell/metadata';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const appProvidersSpy = vi.fn();
const htmlDocumentSpy = vi.fn();
const headersMock = vi.fn(async () => new Headers());
const runtimeConfigSpy = vi.fn();

vi.mock('./styles.css', () => ({}));

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

// The pseudo-locale stands in for "not the default", so a hardcoded 'en'
// anywhere in the layout would fail the lang assertion below.
vi.mock('@helpers/ui/locale/locale.helper', () => ({
  resolveRequestLocale: vi.fn().mockResolvedValue('en-XA'),
}));

vi.mock('next/headers', () => ({
  headers: headersMock,
}));

// The real provider reads request-scoped config from i18n/request.ts, which
// has no request to bind to under vitest.
vi.mock('next-intl', () => ({
  NextIntlClientProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid="next-intl-provider">{children}</div>
  ),
}));

vi.mock('@ui/providers/AppProviders', () => ({
  default: ({
    children,
    ...props
  }: {
    children: ReactNode;
    initialTheme: string;
    storageKey?: string;
  }) => {
    appProvidersSpy(props);
    return <div data-testid="app-providers">{children}</div>;
  },
}));

vi.mock('@ui/shell/AppHtmlDocument', () => ({
  default: ({ children, ...props }: { children: ReactNode; lang?: string }) => {
    htmlDocumentSpy(props);
    return <div data-testid="app-html-document">{children}</div>;
  },
}));

vi.mock('@/components/runtime/RuntimeConfigScript', () => ({
  default: ({ source }: { source: string }) => {
    runtimeConfigSpy(source);
    return null;
  },
}));

vi.mock('@/components/analytics/AnalyticsAnonymousSessionSync', () => ({
  default: () => <div data-testid="analytics-anonymous-session-sync" />,
}));

vi.mock('@ui/shell/metadata', () => ({
  // Passing the overrides straight through lets the assertions below read the
  // real exported `metadata`. `clearMocks: true` wipes call history between
  // tests, and the layout module is only evaluated once, so inspecting spy
  // arguments would silently pass on an empty call list.
  createAppMetadata: vi.fn((options: CreateAppMetadataOptions) => ({
    ...options.overrides,
  })),
  createPwaMetadata: vi.fn(() => ({
    metadata: {},
    viewport: {},
  })),
}));

describe('app root layout', () => {
  const originalDesktopShellEnv = process.env.NEXT_PUBLIC_DESKTOP_SHELL;

  beforeEach(() => {
    appProvidersSpy.mockClear();
    htmlDocumentSpy.mockClear();
    runtimeConfigSpy.mockClear();
    headersMock.mockResolvedValue(new Headers());
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
    expect(screen.getByTestId('analytics-anonymous-session-sync')).toBeTruthy();
    expect(appProvidersSpy).toHaveBeenCalledTimes(1);
    expect(appProvidersSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        initialTheme: 'dark',
        storageKey: 'theme',
      }),
    );
  });

  it('sets the document language from the resolved request locale', async () => {
    const { default: RootLayout } = await import('./layout');

    render(
      await RootLayout({
        children: <div>App child</div>,
      } as never),
    );

    expect(htmlDocumentSpy).toHaveBeenCalledWith(
      expect.objectContaining({ lang: 'en-XA' }),
    );
  });

  it('wraps the tree in the next-intl provider', async () => {
    const { default: RootLayout } = await import('./layout');

    render(
      await RootLayout({
        children: <div>App child</div>,
      } as never),
    );

    expect(screen.getByTestId('next-intl-provider')).toBeTruthy();
  });

  it('marks the whole studio noindex, nofollow in the root metadata', async () => {
    const { metadata } = await import('./layout');

    expect(metadata.robots).toEqual({
      follow: false,
      index: false,
    });
  });

  it('activates the desktop surface from the Electron version header', async () => {
    headersMock.mockResolvedValue(
      new Headers({ 'x-genfeed-desktop-version': '0.1.0' }),
    );
    const { default: RootLayout } = await import('./layout');

    render(
      await RootLayout({
        children: <div>Desktop child</div>,
      } as never),
    );

    expect(htmlDocumentSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        bodyClassName: 'gf-app gf-desktop-shell gf-studio-app',
      }),
    );
    expect(runtimeConfigSpy).toHaveBeenCalledWith(
      expect.stringContaining('"clientSurface":"desktop"'),
    );
  });
});
