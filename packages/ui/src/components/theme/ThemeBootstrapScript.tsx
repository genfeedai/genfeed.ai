import {
  DEFAULT_RESOLVED_THEME,
  DEFAULT_THEME,
  THEME_PREFERENCES,
  THEME_STORAGE_KEY,
} from '@genfeedai/contracts/constants';
import type { AppProvidersProps } from '@genfeedai/props/providers/app-providers.props';

type ThemeStorageBootstrapScriptProps = Pick<
  AppProvidersProps,
  'nonce' | 'storageKey'
>;

function normalizeThemeStorage(
  storageKey: string,
  defaultTheme: string,
  defaultResolvedTheme: string,
  validThemes: readonly string[],
) {
  try {
    const storedTheme = window.localStorage.getItem(storageKey);

    if (storedTheme !== null && !validThemes.includes(storedTheme)) {
      window.localStorage.setItem(storageKey, defaultTheme);
    }
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }

  const darkMediaQuery = '(prefers-color-scheme: dark)';
  const installMatchMedia = (matchMedia: typeof window.matchMedia) => {
    try {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: matchMedia,
        writable: true,
      });
    } catch {
      try {
        window.matchMedia = matchMedia;
      } catch {
        // A non-configurable host API cannot be repaired here.
      }
    }
  };
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

  const nativeMatchMedia =
    typeof window.matchMedia === 'function'
      ? window.matchMedia.bind(window)
      : null;

  const resolveMediaQuery = (query: string) => {
    if (nativeMatchMedia) {
      try {
        return wrapMediaQueryList(nativeMatchMedia(query));
      } catch {
        // Fall through to the theme-only stub below.
      }
    }

    if (query !== darkMediaQuery) {
      return createFallbackList(query, false);
    }

    return createFallbackList(query, defaultResolvedTheme === 'dark');
  };

  try {
    if (!nativeMatchMedia) {
      throw new TypeError('matchMedia is unavailable');
    }

    const probe = nativeMatchMedia(darkMediaQuery);

    if (
      typeof probe.addListener === 'function' &&
      typeof probe.removeListener === 'function'
    ) {
      return;
    }
  } catch {
    // Install a scoped shim: wrap native lists when they exist, and stub only
    // the color-scheme query when they do not.
  }

  installMatchMedia(resolveMediaQuery);
}

function bootstrapThemeDocument(
  storageKey: string,
  defaultTheme: string,
  defaultResolvedTheme: string,
  validThemes: readonly string[],
) {
  let preference = defaultTheme;

  try {
    const storedTheme = window.localStorage.getItem(storageKey);

    if (storedTheme !== null && validThemes.includes(storedTheme)) {
      preference = storedTheme;
    } else if (storedTheme !== null) {
      window.localStorage.setItem(storageKey, defaultTheme);
    }
  } catch {
    // Keep System as the resilient fallback when storage is inaccessible.
  }

  let systemTheme = defaultResolvedTheme;

  try {
    if (typeof window.matchMedia === 'function') {
      systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    }
  } catch {
    // Keep the deterministic fallback when media matching is unavailable.
  }
  const resolvedTheme = preference === 'system' ? systemTheme : preference;
  const root = document.documentElement;

  root.setAttribute('data-theme', resolvedTheme);
  root.style.colorScheme = resolvedTheme;
}

function createBootstrapSource(
  bootstrap: { toString(): string },
  args: readonly unknown[],
) {
  const serializedArgs = JSON.stringify(args).replaceAll('<', '\\u003c');

  return `(${bootstrap.toString()})(${serializedArgs.slice(1, -1)})`;
}

export function ThemeStorageBootstrapScript({
  nonce,
  storageKey = THEME_STORAGE_KEY,
}: ThemeStorageBootstrapScriptProps) {
  const source = createBootstrapSource(normalizeThemeStorage, [
    storageKey,
    DEFAULT_THEME,
    DEFAULT_RESOLVED_THEME,
    THEME_PREFERENCES,
  ]);

  return (
    <script
      id="genfeed-theme-storage-bootstrap"
      nonce={nonce}
      suppressHydrationWarning
      // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted static bootstrap required before next-themes executes
      dangerouslySetInnerHTML={{ __html: source }}
    />
  );
}

export function ThemeDocumentBootstrapScript() {
  const source = createBootstrapSource(bootstrapThemeDocument, [
    THEME_STORAGE_KEY,
    DEFAULT_THEME,
    DEFAULT_RESOLVED_THEME,
    THEME_PREFERENCES,
  ]);

  return (
    <script
      id="genfeed-theme-document-bootstrap"
      suppressHydrationWarning
      // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted static bootstrap applies the root error theme before paint
      dangerouslySetInnerHTML={{ __html: source }}
    />
  );
}
