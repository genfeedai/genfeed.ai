import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Server Components on the website render `Button` directly. A hook call in it
 * fails their static export ("Attempted to call … from the server"), so
 * anything stateful belongs in a client child such as HoverAnimatedIconSlot.
 */
describe('Button stays server-renderable', () => {
  const source = readFileSync(join(__dirname, 'button.tsx'), 'utf8');

  it('is not a client module', () => {
    expect(source).not.toMatch(/^['"]use client['"]/m);
  });

  it('calls no React hook', () => {
    expect(source).not.toMatch(/\buse[A-Z]\w*\(/);
  });
});
