import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BRAND_RASTER_SPECS,
  currentColorMarkSvg,
  extractMarkPath,
  loadCanonicalSvg,
  renderBrandRaster,
  svgWithFill,
} from './render-brand-icons';

const REPO_ROOT = path.resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '../..',
);

describe('renderBrandIcons', () => {
  it('recolors the canonical mark without rewriting the path', () => {
    const source = loadCanonicalSvg(REPO_ROOT);
    const recolored = svgWithFill(source, '#ffffff');

    expect(extractMarkPath(recolored)).toBe(extractMarkPath(source));
    expect(recolored).toContain('fill="#ffffff"');
    expect(recolored).not.toContain('fill="#000000"');
  });

  it('emits a currentColor IDE SVG from the same outline', () => {
    const source = loadCanonicalSvg(REPO_ROOT);
    const ide = currentColorMarkSvg(source);

    expect(extractMarkPath(ide)).toBe(extractMarkPath(source));
    expect(ide).toContain('fill="currentColor"');
  });

  it('rasterizes the app icon as a white G on opaque black', async () => {
    const source = loadCanonicalSvg(REPO_ROOT);
    const png = await renderBrandRaster(source, 'mobileAppIcon');
    const spec = BRAND_RASTER_SPECS.mobileAppIcon;

    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
    expect(spec.canvas).toBe(1024);
    expect(spec.fill).toBe('#ffffff');
    expect(spec.background.alpha).toBe(1);
  });
});
