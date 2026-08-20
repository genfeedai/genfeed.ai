// @vitest-environment node
// The loader resolves its files through `import.meta.url`, which Vite rewrites
// to a dev-server `/@fs/` URL under the default jsdom (client) transform. This
// is route-handler code that only ever runs on the server, so test it there.

import { loadSatoshiSatoriFonts } from '@genfeedai/fonts/og';
import { describe, expect, it } from 'vitest';

/**
 * Lives with the card rather than with the font package because this guards the
 * card's contract: the three TTFs are committed binaries, and if one goes
 * missing or gets re-saved as woff2, satori silently falls back to a system
 * face and every article ships in the wrong typeface. The website suite is the
 * one that runs on a route change, so the guard sits where it will fire.
 */
describe('loadSatoshiSatoriFonts', () => {
  it('loads the three weights the card renders', async () => {
    const fonts = await loadSatoshiSatoriFonts();

    expect(fonts.map((font) => font.weight)).toEqual([400, 500, 700]);
    expect(fonts.every((font) => font.name === 'Satoshi')).toBe(true);
  });

  it('reads real sfnt bytes rather than woff2 satori cannot parse', async () => {
    const fonts = await loadSatoshiSatoriFonts();

    for (const font of fonts) {
      // Satoshi is CFF-flavoured, so a decompressed file is stamped "OTTO".
      // The tag that must never appear is "wOF2" — satori cannot parse woff2,
      // and would quietly fall back to a system face if one slipped in.
      expect(font.data.subarray(0, 4).toString('latin1')).toBe('OTTO');
      expect(font.data.byteLength).toBeGreaterThan(10_000);
    }
  });

  it('reads the files once and reuses them across renders', async () => {
    const [first, second] = await Promise.all([
      loadSatoshiSatoriFonts(),
      loadSatoshiSatoriFonts(),
    ]);

    expect(second).toBe(first);
  });
});
