/**
 * Rasterize OS/store chrome from the canonical mark at
 * `apps/app/public/logo.svg` (byte-identical to CDN
 * `/assets/branding/logo.svg`). Runtime UI keeps reading the CDN; these files
 * exist because App Store, Play, Chromium, and VS Code read icons from the
 * binary, not the network.
 *
 * Usage: bun run scripts/brand/generate-icons.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BRAND_RASTER_FILES,
  type BrandRasterId,
  currentColorMarkSvg,
  IDE_ACTIVITY_BAR_SVG,
  loadCanonicalSvg,
  renderBrandRaster,
} from './render-brand-icons';

const REPO_ROOT = path.resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '../..',
);

export async function generateBrandIcons(root: string): Promise<string[]> {
  const sourceSvg = loadCanonicalSvg(root);
  const written: string[] = [];

  for (const id of Object.keys(BRAND_RASTER_FILES) as BrandRasterId[]) {
    const relativePath = BRAND_RASTER_FILES[id];
    const absolutePath = path.join(root, relativePath);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, await renderBrandRaster(sourceSvg, id));
    written.push(relativePath);
  }

  const idePath = path.join(root, IDE_ACTIVITY_BAR_SVG);
  mkdirSync(path.dirname(idePath), { recursive: true });
  writeFileSync(idePath, currentColorMarkSvg(sourceSvg));
  written.push(IDE_ACTIVITY_BAR_SVG);

  return written;
}

if (import.meta.main) {
  const written = await generateBrandIcons(REPO_ROOT);
  for (const relativePath of written) {
    console.log(relativePath);
  }
}
