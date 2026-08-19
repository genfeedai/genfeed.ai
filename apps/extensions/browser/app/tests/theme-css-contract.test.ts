import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

function readSource(relativePath: string): string {
  return readFileSync(path.join(appRoot, relativePath), 'utf8');
}

describe('browser extension theme CSS contract', () => {
  it('emits semantic utilities through the production Tailwind pipeline', () => {
    const temporaryDirectory = mkdtempSync(
      path.join(tmpdir(), 'genfeed-extension-tailwind-'),
    );
    const outputPath = path.join(temporaryDirectory, 'theme.css');
    const buildScript = path.resolve(
      appRoot,
      '../../../..',
      'scripts/ui/build-extension-theme-css.ts',
    );

    try {
      execFileSync('bun', [buildScript, '--output', outputPath], {
        cwd: appRoot,
      });

      const compiledStyles = readFileSync(outputPath, 'utf8');
      for (const selector of [
        '.bg-background',
        '.text-foreground',
        '.border-border',
        '.bg-elevated',
        '.z-50',
        String.raw`.focus\:bg-hover`,
        String.raw`.hover\:bg-hover`,
      ]) {
        expect(compiledStyles).toContain(selector);
      }
      expect(compiledStyles).not.toContain('@theme');
      expect(compiledStyles).not.toContain('@source');
      expect(compiledStyles).toContain(
        String.raw`.dark\:bg-background:where([data-theme=dark],[data-theme=dark] *)`,
      );
      expect(compiledStyles).not.toMatch(
        /@media \(prefers-color-scheme:dark\)\{\.dark\\:/,
      );
    } finally {
      rmSync(temporaryDirectory, { force: true, recursive: true });
    }
  });

  it('registers shared semantic variables as Tailwind v4 color utilities', () => {
    const styles = readSource('src/tailwind.css');
    const runtimeStyles = readSource('src/style.css');

    expect(styles).toContain('@theme inline');
    expect(styles).toContain('@custom-variant dark');
    expect(runtimeStyles).toContain('@custom-variant dark');
    expect(runtimeStyles).toContain(
      '@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *))',
    );
    expect(styles).toContain(
      '@source "../../../../../packages/ui/src/primitives"',
    );
    expect(styles).toContain(
      '@source "../../../../../packages/ui/node_modules/@shipshitdev/ui/dist"',
    );
    expect(styles).toContain('--color-background: hsl(var(--background))');
    expect(styles).toContain('--color-foreground: hsl(var(--foreground))');
    expect(styles).toContain('--color-muted: hsl(var(--muted))');
    expect(styles).toContain('--color-border: hsl(var(--border))');
    expect(styles).toContain(
      '--color-primary-foreground: hsl(var(--primary-foreground))',
    );
  });

  it.each(['popup.html', 'sidepanel.html'])(
    'conceals %s until the stored preference bootstrap resolves',
    (documentPath) => {
      const documentSource = readSource(documentPath);

      expect(documentSource).toContain('html:not([data-theme])');
      expect(documentSource).toContain('visibility: hidden');
      expect(documentSource).toContain('src/theme/theme-prepaint.ts');
    },
  );

  it('keeps System CSS safe when JavaScript is unavailable', () => {
    const themeStyles = readSource('src/styles/theme.css');

    expect(themeStyles).toContain('@media (prefers-color-scheme: dark)');
    expect(themeStyles).toContain(':root:not([data-theme])');
  });

  it('keeps ordinary extension chrome on semantic colors', () => {
    expect(readSource('src/components/settings/AutoFillToggle.tsx')).toContain(
      'bg-primary-foreground',
    );
    expect(readSource('src/components/ui/ButtonSpinner.tsx')).toContain(
      'text-primary-foreground',
    );
    expect(readSource('src/components/ui/EmptyState.tsx')).not.toContain(
      'zinc-',
    );
    expect(readSource('src/components/pages/IdeasPage.tsx')).not.toContain(
      'zinc-',
    );
    expect(readSource('src/components/ui/Icons.tsx')).not.toContain('zinc-');
  });
});
