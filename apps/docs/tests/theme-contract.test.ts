import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyDocumentTheme } from '../app/global-error.theme';
import { DOCS_THEME_STORAGE_BOOTSTRAP_SOURCE } from '../app/layout';

function createDocumentRoot() {
  const classes = new Set<string>();

  return {
    classList: {
      add: (...values: string[]) =>
        values.forEach((value) => {
          classes.add(value);
        }),
      contains: (value: string) => classes.has(value),
      remove: (...values: string[]) =>
        values.forEach((value) => {
          classes.delete(value);
        }),
    },
    style: { colorScheme: '' },
  };
}

describe('docs theme contract', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('exposes explicit System, Light, and Dark Nextra preferences', () => {
    const source = readFileSync(join(process.cwd(), 'app/layout.tsx'), 'utf8');

    expect(source).toContain("defaultTheme: 'system'");
    expect(source).toContain("storageKey: 'theme'");
    expect(source).toContain("system: 'System'");
    expect(source).toContain("light: 'Light'");
    expect(source).toContain("dark: 'Dark'");
  });

  it('normalizes invalid storage before the Nextra theme provider boots', () => {
    const source = readFileSync(join(process.cwd(), 'app/layout.tsx'), 'utf8');
    const values = new Map([['theme', 'sepia']]);
    const localStorage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };

    runInNewContext(DOCS_THEME_STORAGE_BOOTSTRAP_SOURCE, {
      window: { localStorage },
    });

    expect(values.get('theme')).toBe('system');
    expect(source.indexOf('genfeed-theme-storage-bootstrap')).toBeGreaterThan(
      -1,
    );
    expect(source.indexOf('genfeed-theme-storage-bootstrap')).toBeLessThan(
      source.indexOf('<Layout'),
    );
  });

  it.each(['missing', 'throwing'] as const)(
    'keeps Nextra System mode safe when matchMedia is %s',
    (failureMode) => {
      const localStorage = {
        getItem: () => 'system',
        setItem: vi.fn(),
      };
      const windowObject: {
        localStorage: typeof localStorage;
        matchMedia?: (query: string) => MediaQueryList;
      } = {
        localStorage,
        matchMedia:
          failureMode === 'missing'
            ? undefined
            : () => {
                throw new DOMException('Blocked', 'SecurityError');
              },
      };

      runInNewContext(DOCS_THEME_STORAGE_BOOTSTRAP_SOURCE, {
        DOMException,
        TypeError,
        window: windowObject,
      });

      expect(() => {
        const mediaQuery = windowObject.matchMedia?.(
          '(prefers-color-scheme: dark)',
        );
        mediaQuery?.addListener(() => undefined);
        mediaQuery?.removeListener(() => undefined);
      }).not.toThrow();
      expect(
        windowObject.matchMedia?.('(prefers-color-scheme: dark)').matches,
      ).toBe(true);
    },
  );

  it('keeps the root error surface theme-aware', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/global-error.tsx'),
      'utf8',
    );
    const themeSource = readFileSync(
      join(process.cwd(), 'app/global-error.theme.ts'),
      'utf8',
    );

    expect(themeSource).toContain("localStorage.getItem('theme')");
    expect(themeSource).toContain("matchMedia('(prefers-color-scheme: dark)')");
    expect(source).toContain('id="genfeed-theme-document-bootstrap"');
    expect(source).toContain('<head>');
    expect(source).not.toContain("useState<ResolvedTheme>('light')");
    expect(themeSource).toContain("localStorage.setItem('theme', 'system')");
    expect(source).toContain('docs-global-error');
  });

  it('normalizes invalid storage and resolves System', () => {
    const setItem = vi.fn();
    const documentRoot = createDocumentRoot();
    vi.stubGlobal('window', {
      localStorage: { getItem: () => 'sepia', setItem },
      matchMedia: () => ({ matches: true }),
    });
    vi.stubGlobal('document', { documentElement: documentRoot });

    applyDocumentTheme();

    expect(setItem).toHaveBeenCalledWith('theme', 'system');
    expect(documentRoot.classList.contains('dark')).toBe(true);
    expect(documentRoot.style.colorScheme).toBe('dark');
  });

  it('falls back to System when storage access throws', () => {
    const documentRoot = createDocumentRoot();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new DOMException('Blocked', 'SecurityError');
        },
        setItem: vi.fn(),
      },
      matchMedia: () => ({ matches: false }),
    });
    vi.stubGlobal('document', { documentElement: documentRoot });

    expect(() => applyDocumentTheme()).not.toThrow();
    expect(documentRoot.classList.contains('light')).toBe(true);
    expect(documentRoot.style.colorScheme).toBe('light');
  });

  it('uses the deterministic fallback when media matching throws', () => {
    const documentRoot = createDocumentRoot();
    vi.stubGlobal('window', {
      localStorage: { getItem: () => 'system', setItem: vi.fn() },
      matchMedia: () => {
        throw new DOMException('Blocked', 'SecurityError');
      },
    });
    vi.stubGlobal('document', { documentElement: documentRoot });

    expect(() => applyDocumentTheme()).not.toThrow();
    expect(documentRoot.classList.contains('dark')).toBe(true);
    expect(documentRoot.style.colorScheme).toBe('dark');
  });
});
