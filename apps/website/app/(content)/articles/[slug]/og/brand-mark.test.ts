// @vitest-environment node
// Reads files off disk, so it runs on the server side of the test config rather
// than under jsdom.

import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const MARK_COMPONENT = new URL('./brand-mark.tsx', import.meta.url);
const CANONICAL_LOGO = new URL(
  '../../../../../../app/public/logo.svg',
  import.meta.url,
);

function extractPath(source: string): string {
  const match = source.match(/<path\s+d="([^"]+)"/);
  if (!match) {
    throw new Error('no <path d="..."> found');
  }
  return match[1];
}

describe('BrandMark', () => {
  it('carries the same outline as the committed logo mirror', async () => {
    const [component, logo] = await Promise.all([
      readFile(MARK_COMPONENT, 'utf8'),
      readFile(CANONICAL_LOGO, 'utf8'),
    ]);

    // The mark is inlined so the card never depends on a network fetch, which
    // means a CDN refresh that updates only `logo.svg` would silently leave the
    // social card on the old outline. This is the tripwire for that.
    expect(extractPath(component)).toBe(extractPath(logo));
  });

  it('takes fill from a prop so the dark card is not stuck with black', async () => {
    const component = await readFile(MARK_COMPONENT, 'utf8');

    expect(component).toContain('fill={fill}');
    expect(component).not.toContain('fill="#000000"');
  });
});
