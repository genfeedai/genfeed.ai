import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('app/error.tsx', () => {
  it('marks its fallback for the route smoke suite (#5070)', () => {
    const source = readFileSync(join(process.cwd(), 'app/error.tsx'), 'utf8');
    expect(source).toContain('data-testid="error-boundary-fallback"');
  });
});
