import type { Metadata } from 'next';
import { Head } from 'nextra/components';
import { getPageMap } from 'nextra/page-map';
import { Footer, Layout, Navbar } from 'nextra-theme-docs';
import 'nextra-theme-docs/style.css';
import {
  docsContentMetaRegistry,
  docsMdxComponentRegistry,
} from '../content/meta-registry';
import '../styles/globals.css';
import {
  DOCS_DEFAULT_TITLE,
  DOCS_DESCRIPTION,
  DOCS_ORIGIN,
  DOCS_SITE_NAME,
  DOCS_SOCIAL_CARD_URL,
  DOCS_TITLE_TEMPLATE,
} from './seo';

function normalizeStoredTheme() {
  try {
    const storedTheme = window.localStorage.getItem('theme');

    if (
      storedTheme !== null &&
      storedTheme !== 'system' &&
      storedTheme !== 'light' &&
      storedTheme !== 'dark'
    ) {
      window.localStorage.setItem('theme', 'system');
    }
  } catch {
    // Nextra will fall back to System when storage is unavailable.
  }

  const darkMediaQuery = '(prefers-color-scheme: dark)';
  const nativeMatchMedia =
    typeof window.matchMedia === 'function'
      ? window.matchMedia.bind(window)
      : null;
  const wrapMediaQueryList = (result: MediaQueryList) =>
    ({
      addEventListener: result.addEventListener?.bind(result),
      addListener: (listener) => {
        if (listener) result.addEventListener?.('change', listener);
      },
      dispatchEvent: result.dispatchEvent?.bind(result),
      get matches() {
        return result.matches;
      },
      media: result.media,
      onchange: result.onchange,
      removeEventListener: result.removeEventListener?.bind(result),
      removeListener: (listener) => {
        if (listener) result.removeEventListener?.('change', listener);
      },
    }) as MediaQueryList;
  const createFallbackList = (query: string, matches: boolean) =>
    ({
      addEventListener: () => undefined,
      addListener: () => undefined,
      dispatchEvent: () => false,
      matches,
      media: query,
      onchange: null,
      removeEventListener: () => undefined,
      removeListener: () => undefined,
    }) as MediaQueryList;

  try {
    if (nativeMatchMedia) {
      const mediaQuery = nativeMatchMedia(darkMediaQuery);

      if (
        typeof mediaQuery.addListener === 'function' &&
        typeof mediaQuery.removeListener === 'function'
      ) {
        return;
      }
    }
  } catch {
    // Install a scoped shim below.
  }

  const fallbackMatchMedia = (query: string) => {
    if (nativeMatchMedia) {
      try {
        return wrapMediaQueryList(nativeMatchMedia(query));
      } catch {
        // Fall through to the theme-only stub.
      }
    }

    if (query !== darkMediaQuery) {
      return createFallbackList(query, false);
    }

    // Deterministic fallback until the host can report a color scheme.
    return createFallbackList(query, true);
  };

  try {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: fallbackMatchMedia,
      writable: true,
    });
  } catch {
    try {
      window.matchMedia = fallbackMatchMedia;
    } catch {
      // A non-configurable host API cannot be repaired here.
    }
  }
}

export const DOCS_THEME_STORAGE_BOOTSTRAP_SOURCE = `(${normalizeStoredTheme.toString()})()`;

export const metadata: Metadata = {
  description: DOCS_DESCRIPTION,
  icons: { icon: '/favicon.ico' },
  metadataBase: new URL(DOCS_ORIGIN),
  openGraph: {
    description: DOCS_DESCRIPTION,
    images: [DOCS_SOCIAL_CARD_URL],
    siteName: DOCS_SITE_NAME,
    title: DOCS_DEFAULT_TITLE,
    type: 'website',
    url: DOCS_ORIGIN,
  },
  title: { default: DOCS_DEFAULT_TITLE, template: DOCS_TITLE_TEMPLATE },
  twitter: {
    card: 'summary_large_image',
    description: DOCS_DESCRIPTION,
    images: [DOCS_SOCIAL_CARD_URL],
    title: DOCS_DEFAULT_TITLE,
  },
};

const navbar = (
  <Navbar
    logo={
      <span style={{ alignItems: 'center', display: 'flex' }}>
        <span
          aria-hidden="true"
          className="dark:invert"
          style={{
            backgroundImage:
              'url(https://cdn.genfeed.ai/assets/branding/logo.svg)',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            backgroundSize: 'contain',
            display: 'inline-block',
            height: 24,
            width: 24,
          }}
        />
        <span style={{ fontWeight: 600, marginLeft: '.5em' }}>Genfeed.ai</span>
      </span>
    }
    projectLink="https://github.com/genfeedai"
    chatLink="https://discord.gg/TmfHg42xVb"
  >
    <a
      href="https://genfeed.ai"
      target="_blank"
      rel="noopener noreferrer"
      style={{
        fontSize: '0.875rem',
        fontWeight: 500,
        padding: '0.5rem 1rem',
      }}
    >
      Back to Genfeed.ai
    </a>
  </Navbar>
);

const footer = (
  <Footer>
    © 2026{' '}
    <a href="https://genfeed.ai" target="_blank" rel="noopener noreferrer">
      Genfeed
    </a>
    . All rights reserved.
  </Footer>
);

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  void docsContentMetaRegistry;
  void docsMdxComponentRegistry;

  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <Head>
        <script
          id="genfeed-theme-storage-bootstrap"
          suppressHydrationWarning
          // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted bootstrap sanitizes storage before Nextra's next-themes script executes
          dangerouslySetInnerHTML={{
            __html: DOCS_THEME_STORAGE_BOOTSTRAP_SOURCE,
          }}
        />
      </Head>
      <body>
        <Layout
          darkMode
          navbar={navbar}
          footer={footer}
          nextThemes={{
            attribute: 'class',
            defaultTheme: 'system',
            disableTransitionOnChange: true,
            storageKey: 'theme',
          }}
          pageMap={await getPageMap()}
          docsRepositoryBase="https://github.com/genfeedai/genfeed.ai/tree/master/apps/docs"
          sidebar={{ defaultMenuCollapseLevel: 1, toggleButton: true }}
          themeSwitch={{ dark: 'Dark', light: 'Light', system: 'System' }}
          toc={{ backToTop: true }}
        >
          {children}
        </Layout>
      </body>
    </html>
  );
}
