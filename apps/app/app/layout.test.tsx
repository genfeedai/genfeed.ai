import '@testing-library/jest-dom/vitest';
import * as authConfig from '@genfeedai/auth-client/server';
import { render, screen } from '@testing-library/react';
import type { CreateAppMetadataOptions } from '@ui/shell/metadata';
import type { ReactElement, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRuntimeAuthConfigSource } from '@/lib/runtime-config/runtime-config-source';

const appProvidersSpy = vi.fn();
const htmlDocumentSpy = vi.fn();
const headersMock = vi.fn(async () => new Headers());
const runtimeConfigSpy = vi.fn();
const intlProviderSpy = vi.fn();
const insertHTML = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useServerInsertedHTML: insertHTML,
}));
vi.mock('next/server', () => ({ connection: vi.fn(async () => undefined) }));

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

vi.mock('@helpers/ui/locale/locale.helper', () => ({ DEFAULT_LOCALE: 'en' }));

vi.mock('next/headers', () => ({
  headers: headersMock,
  cookies: vi.fn(() => {
    throw new Error('Root layout must not read cookies');
  }),
}));

vi.mock('next-intl', () => ({
  NextIntlClientProvider: () => {
    throw new Error('Root layout must use the client catalog boundary');
  },
}));

vi.mock('../i18n/AppIntlProvider', () => ({
  default: ({ children, ...props }: { children: ReactNode }) => {
    intlProviderSpy(props);
    return <div data-testid="next-intl-provider">{children}</div>;
  },
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
  default: ({
    children,
    ...props
  }: {
    children: ReactNode;
    head?: ReactNode;
    lang?: string;
  }) => {
    htmlDocumentSpy(props);
    return (
      <div data-testid="app-html-document">
        {props.head}
        {children}
      </div>
    );
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
    vi.stubEnv('GENFEED_RUNTIME_CONFIG_ENDPOINT', undefined);
    appProvidersSpy.mockClear();
    htmlDocumentSpy.mockClear();
    runtimeConfigSpy.mockClear();
    intlProviderSpy.mockClear();
    headersMock.mockResolvedValue(new Headers());
    delete process.env.NEXT_PUBLIC_DESKTOP_SHELL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    if (originalDesktopShellEnv === undefined) {
      delete process.env.NEXT_PUBLIC_DESKTOP_SHELL;
      return;
    }

    process.env.NEXT_PUBLIC_DESKTOP_SHELL = originalDesktopShellEnv;
  });

  it.each([
    { flag: undefined, runtimeFirst: true },
    { flag: undefined, runtimeFirst: false },
    { flag: '1', runtimeFirst: true },
    { flag: '1', runtimeFirst: false },
  ])(
    'preserves runtime auth and bootstrap fields (flag=$flag, runtimeFirst=$runtimeFirst)',
    async ({ flag, runtimeFirst }) => {
      vi.stubEnv('GENFEED_RUNTIME_CONFIG_ENDPOINT', flag);
      vi.stubEnv('NEXT_PUBLIC_API_ENDPOINT', '/v1');
      vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', '0');
      vi.stubEnv('BETTER_AUTH_ENABLED', 'true');
      vi.stubEnv('NEXT_PUBLIC_BETTER_AUTH_ENABLED', 'false');
      vi.spyOn(authConfig, 'isBetterAuthEnabled').mockReturnValue(false);
      const { default: RootLayout } = await import('./layout');
      const { default: RuntimeConfigScript } = await vi.importActual<
        typeof import('@/components/runtime/RuntimeConfigScript')
      >('@/components/runtime/RuntimeConfigScript');

      render(RootLayout({ children: <div>App child</div> } as never));
      const inlineSource = runtimeConfigSpy.mock.calls[0][0] as string;
      if (flag === '1') {
        expect(inlineSource).not.toContain('betterAuthEnabled');
      } else {
        expect(inlineSource).toContain('"betterAuthEnabled":false');
      }

      let bootstrapSource = '';
      insertHTML.mockImplementation(
        (
          insert: () => ReactElement<{
            dangerouslySetInnerHTML: { __html: string };
          }> | null,
        ) => {
          bootstrapSource =
            insert()?.props.dangerouslySetInnerHTML.__html ?? '';
        },
      );
      render(<RuntimeConfigScript source={inlineSource} />);
      expect(bootstrapSource).not.toBe('');
      const runtimeSource = createRuntimeAuthConfigSource(true);
      expect(runtimeSource).toContain('"betterAuthEnabled":true');
      const fakeGlobal = {
        __GENFEED_RUNTIME_CONFIG__: {},
        document: {
          body: { classList: { add: vi.fn() } },
          addEventListener: vi.fn(),
        },
        window: {},
      };
      const scripts = runtimeFirst
        ? [runtimeSource, bootstrapSource]
        : [bootstrapSource, runtimeSource];
      for (const source of scripts) {
        new Function(
          'globalThis',
          `const { window, document } = globalThis;\n${source}`,
        )(fakeGlobal);
      }
      expect(fakeGlobal.__GENFEED_RUNTIME_CONFIG__).toEqual({
        apiEndpoint: '/v1',
        betterAuthEnabled: true,
        clientSurface: 'web',
      });
    },
  );

  it.each(['1', '0', 'true', '', undefined])(
    'renders the blocking runtime override only for flag 1 (flag=%s)',
    async (flag) => {
      vi.stubEnv('GENFEED_RUNTIME_CONFIG_ENDPOINT', flag);
      const { default: RootLayout } = await import('./layout');
      const { container } = render(
        RootLayout({ children: <div>App child</div> } as never),
      );
      const script = container.querySelector(
        'script[src="/runtime-config.js"]',
      );

      expect(runtimeConfigSpy).toHaveBeenCalledTimes(1);
      if (flag === '1') {
        expect(script).not.toBeNull();
        expect(script).not.toHaveAttribute('async');
        expect(script).not.toHaveAttribute('defer');
        expect(htmlDocumentSpy).toHaveBeenCalledWith(
          expect.objectContaining({ head: expect.anything() }),
        );
      } else {
        expect(script).toBeNull();
      }
    },
  );

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
        initialTheme: 'system',
        storageKey: 'theme',
      }),
    );
  });

  it('sets the static document language', async () => {
    const { default: RootLayout } = await import('./layout');

    render(
      await RootLayout({
        children: <div>App child</div>,
      } as never),
    );

    expect(htmlDocumentSpy).toHaveBeenCalledWith(
      expect.objectContaining({ lang: 'en' }),
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
    expect(intlProviderSpy).toHaveBeenCalledWith({
      locale: 'en',
      timeZone: Intl.DateTimeFormat('en').resolvedOptions().timeZone,
    });
  });

  it('marks the whole studio noindex, nofollow in the root metadata', async () => {
    const { metadata } = await import('./layout');

    expect(metadata.robots).toEqual({
      follow: false,
      index: false,
    });
  });

  it('keeps the document request-free even with a desktop header', async () => {
    headersMock.mockResolvedValue(
      new Headers({ 'x-genfeed-desktop-version': '0.1.0' }),
    );
    const { default: RootLayout } = await import('./layout');
    const result = RootLayout({ children: <div>Desktop child</div> } as never);
    expect(result).not.toBeInstanceOf(Promise);
    render(result);
    expect(headersMock).not.toHaveBeenCalled();
    expect(htmlDocumentSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        bodyClassName: 'gf-app gf-studio-app',
        initialTheme: 'system',
        lang: 'en',
      }),
    );
  });
});
