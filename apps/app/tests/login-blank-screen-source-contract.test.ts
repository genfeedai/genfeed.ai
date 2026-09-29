import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readAppSource(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('post-login loading source contracts', () => {
  it('keeps an App Router error boundary on the workspace segment', () => {
    const source = readAppSource(
      'app/(protected)/[orgSlug]/[brandSlug]/workspace/error.tsx',
    );

    expect(source).toContain('ErrorFallback');
    expect(source).toContain('resetErrorBoundary={reset}');
    expect(source).toContain('Something went wrong');
  });
});
