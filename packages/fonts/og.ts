import { readFile } from 'node:fs/promises';

/**
 * Satoshi for satori-rendered images (OG cards and the like).
 *
 * `next/font/local` is a build-time transform for the browser and cannot serve
 * a font to satori, which needs the raw bytes at render time — and it will not
 * take the woff2 files `fonts.ts` uses, since satori reads only TTF/OTF/WOFF.
 * The OTFs alongside them are lossless conversions of exactly those woff2s —
 * Satoshi is CFF-flavoured, so decompressing yields OpenType rather than
 * TrueType outlines — meaning a card and the page it links to render the same
 * typeface, from the same outlines.
 *
 * Kept out of `fonts.ts` so importing this never drags `next/font/local` into a
 * route handler.
 */

/** Weights the card actually renders: body, label, headline. */
const WEIGHTS = [
  { file: 'Satoshi-Regular.otf', weight: 400 },
  { file: 'Satoshi-Medium.otf', weight: 500 },
  { file: 'Satoshi-Bold.otf', weight: 700 },
] as const;

export interface SatoriFont {
  data: Buffer;
  name: string;
  style: 'normal';
  weight: 400 | 500 | 700;
}

let cached: Promise<SatoriFont[]> | undefined;

async function readFonts(): Promise<SatoriFont[]> {
  return await Promise.all(
    WEIGHTS.map(async ({ file, weight }) => ({
      // `new URL(..., import.meta.url)` rather than a cwd-relative path: it is
      // the form Next traces, so the bytes are bundled into the deployed
      // function instead of going missing outside local dev.
      data: Buffer.from(
        await readFile(new URL(`./files/${file}`, import.meta.url)),
      ),
      name: 'Satoshi',
      style: 'normal' as const,
      weight,
    })),
  );
}

/**
 * Memoised per process — the files never change, and a social card should not
 * pay three disk reads on every render.
 */
export async function loadSatoshiSatoriFonts(): Promise<SatoriFont[]> {
  cached ??= readFonts();

  return await cached;
}
