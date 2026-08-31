import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('app/(public)/desktop/local/page.tsx', () => {
  it('renders colocated client content without an inert Suspense boundary', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/(public)/desktop/local/page.tsx'),
      'utf8',
    );

    expect(source).toContain('return <LocalDesktopContent />;');
    expect(source).not.toContain('Suspense');
  });
});
