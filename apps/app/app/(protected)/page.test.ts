import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('ProtectedRootPage', () => {
  it('renders the protected root resolver entrypoint', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/(protected)/page.tsx'),
      'utf8',
    );

    expect(source).toContain('ProtectedRootResolver');
    expect(source).toContain('return <ProtectedRootResolver />');
  });
});
