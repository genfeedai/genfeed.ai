import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The display `Skeleton` calls `formatDimension` from this module while it
 * renders, and Server Components render that wrapper directly. A client
 * directive here turns the helper into a client reference, so the call throws
 * ("Attempted to call formatDimension() from the server").
 */
describe('Skeleton primitive stays server-renderable', () => {
  const source = readFileSync(join(__dirname, 'skeleton.tsx'), 'utf8');

  it('is not a client module', () => {
    expect(source).not.toMatch(/^['"]use client['"]/m);
  });

  it('calls no React hook', () => {
    expect(source).not.toMatch(/\buse[A-Z]\w*\(/);
  });
});
