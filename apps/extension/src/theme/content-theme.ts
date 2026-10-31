import {
  DEFAULT_THEME,
  resolveThemePreference,
  type ThemePreference,
} from '@genfeedai/contracts/constants';
import { hostPaletteProperties, readHostPalette } from '~theme/host-palette';
import {
  EXTENSION_SETTINGS_STORAGE_KEY,
  readStoredTheme,
} from '~theme/theme-storage';
import { logger } from '~utils/logger.util';

const CONTENT_THEME_MEDIA_QUERY = '(prefers-color-scheme: dark)';
/** Marks every Genfeed shadow host so the content theme can find and restyle it. */
export const GENFEED_HOST_ATTRIBUTE = 'data-genfeed-host';
const CONTENT_THEME_SELECTOR = `[${GENFEED_HOST_ATTRIBUTE}]`;

let currentPreference: ThemePreference = DEFAULT_THEME;
let systemPrefersDark = false;

const HOST_PALETTE_PROPERTIES = Object.keys(
  hostPaletteProperties({ background: '', isDark: false, text: '' }),
);

/**
 * A Genfeed surface injected into a page takes that page's own colours, so on X
 * it matches Default, Dim or Lights out. The extension's Light/Dark setting
 * styles the extension's own popup and side panel, and only applies here when
 * the page paints no background to read.
 */
function resolvedContentTheme(): {
  palette: ReturnType<typeof readHostPalette>;
  theme: 'light' | 'dark';
} {
  const palette = readHostPalette();
  if (palette) {
    return { palette, theme: palette.isDark ? 'dark' : 'light' };
  }
  return {
    palette: null,
    theme: resolveThemePreference(
      currentPreference,
      systemPrefersDark ? 'dark' : 'light',
    ),
  };
}

export function applyContentThemeToElement(element: HTMLElement): void {
  const { palette, theme } = resolvedContentTheme();
  element.dataset.genfeedTheme = theme;
  element.style.colorScheme = theme;
  if (palette) {
    for (const [name, value] of Object.entries(
      hostPaletteProperties(palette),
    )) {
      element.style.setProperty(name, value);
    }
  } else {
    for (const name of HOST_PALETTE_PROPERTIES) {
      element.style.removeProperty(name);
    }
  }
}

function applyContentTheme(
  preference: ThemePreference,
  prefersDark: boolean,
): void {
  currentPreference = preference;
  systemPrefersDark = prefersDark;

  for (const element of document.querySelectorAll<HTMLElement>(
    CONTENT_THEME_SELECTOR,
  )) {
    applyContentThemeToElement(element);
  }
}

export function watchContentTheme(): () => void {
  const mediaQuery = window.matchMedia(CONTENT_THEME_MEDIA_QUERY);
  let disposed = false;
  let storageRevision = 0;

  applyContentTheme(currentPreference, mediaQuery.matches);

  const handleSystemThemeChange = (): void => {
    applyContentTheme(currentPreference, mediaQuery.matches);
  };
  const handleStorageChange = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ): void => {
    if (areaName !== 'local') {
      return;
    }

    const settingsChange = changes[EXTENSION_SETTINGS_STORAGE_KEY];
    if (settingsChange) {
      storageRevision += 1;
      applyContentTheme(
        readStoredTheme(settingsChange.newValue),
        mediaQuery.matches,
      );
    }
  };

  mediaQuery.addEventListener('change', handleSystemThemeChange);
  chrome.storage.onChanged.addListener(handleStorageChange);

  // The page switches its own theme by changing a style or class on <html> or
  // <body>, with no event, so watch those two elements.
  const hostObserver = new MutationObserver(handleSystemThemeChange);
  const hostOptions: MutationObserverInit = {
    attributeFilter: ['class', 'data-theme', 'style'],
    attributes: true,
  };
  hostObserver.observe(document.documentElement, hostOptions);
  if (document.body) {
    hostObserver.observe(document.body, hostOptions);
  }

  const hydrationRevision = storageRevision;
  void chrome.storage.local
    .get(EXTENSION_SETTINGS_STORAGE_KEY)
    .then((result) => {
      if (!disposed && storageRevision === hydrationRevision) {
        applyContentTheme(
          readStoredTheme(result[EXTENSION_SETTINGS_STORAGE_KEY]),
          mediaQuery.matches,
        );
      }
    })
    .catch((error: unknown) => {
      logger.error('Failed to load content-script theme', error);
    });

  return () => {
    disposed = true;
    hostObserver.disconnect();
    mediaQuery.removeEventListener('change', handleSystemThemeChange);
    chrome.storage.onChanged.removeListener(handleStorageChange);
  };
}
