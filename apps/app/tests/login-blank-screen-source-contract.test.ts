import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readAppSource(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('post-login blank screen source contracts', () => {
  it('keeps the protected app Suspense boundary visible while it resolves', () => {
    const source = readAppSource(
      'packages/components/app-protected-layout.tsx',
    );

    expect(source).toContain('LazyLoadingFallback');
    expect(source).toContain(
      'fallback={<LazyLoadingFallback variant="grid" />}',
    );
    expect(source).not.toContain('fallback={null}');
  });

  it('keeps the workspace Suspense boundary visible while it resolves', () => {
    const source = readAppSource(
      'app/(protected)/[orgSlug]/[brandSlug]/workspace/workspace-page.tsx',
    );

    expect(source).toContain('LazyLoadingFallback');
    expect(source).toContain(
      'fallback={<LazyLoadingFallback variant="grid" />}',
    );
    expect(source).not.toContain('fallback={null}');
  });

  it('keeps an App Router error boundary on the workspace segment', () => {
    const source = readAppSource(
      'app/(protected)/[orgSlug]/[brandSlug]/workspace/error.tsx',
    );

    expect(source).toContain('ErrorFallback');
    expect(source).toContain('resetErrorBoundary={reset}');
    expect(source).toContain('Something went wrong');
  });
});
