import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

function getSource(relPath: string): string {
  return readFileSync(path.resolve(currentDir, '..', relPath), 'utf8');
}

describe('App Routes Export Components', () => {
  it('keeps the native splash visible until the stored theme is ready', () => {
    const source = getSource('app/_layout.tsx');

    expect(source).toContain('SplashScreen.preventAutoHideAsync()');
    expect(source).toContain('SplashScreen.hideAsync()');
  });
});
