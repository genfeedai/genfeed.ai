type ResolvedTheme = 'light' | 'dark';
type ThemePreference = 'system' | ResolvedTheme;

export function applyDocumentTheme() {
  let preference: ThemePreference = 'system';

  try {
    const storedTheme = window.localStorage.getItem('theme');

    if (
      storedTheme === 'system' ||
      storedTheme === 'light' ||
      storedTheme === 'dark'
    ) {
      preference = storedTheme;
    } else if (storedTheme !== null) {
      window.localStorage.setItem('theme', 'system');
    }
  } catch {
    // System remains usable when storage is blocked by the browser.
  }

  let systemTheme: ResolvedTheme = 'dark';

  try {
    if (typeof window.matchMedia === 'function') {
      systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    }
  } catch {
    // Keep the deterministic dark fallback without media-query access.
  }

  const resolvedTheme: ResolvedTheme =
    preference === 'system' ? systemTheme : preference;

  document.documentElement.classList.remove('light', 'dark');
  document.documentElement.classList.add(resolvedTheme);
  document.documentElement.style.colorScheme = resolvedTheme;
}
