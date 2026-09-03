import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  BRAND_RASTER_FILES,
  BRAND_RASTER_SPECS,
  CANONICAL_LOGO_PATH,
  extractMarkPath,
  FORBIDDEN_MOBILE_FAVICON_ICO,
  FORBIDDEN_PUBLIC_LOADER_FILES,
  IDE_ACTIVITY_BAR_SVG,
  MARK_SOURCE_FILES,
  PWA_ANY_ICON_FILES,
  PWA_MASKABLE_MARK_RATIO,
} from './render-brand-icons';

const REPO_ROOT = path.resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '../..',
);

const MOBILE_RASTER_FILES = [
  BRAND_RASTER_FILES.mobileAppIcon,
  BRAND_RASTER_FILES.mobileAdaptiveIcon,
  BRAND_RASTER_FILES.mobileSplashLight,
  BRAND_RASTER_FILES.mobileSplashDark,
  BRAND_RASTER_FILES.mobileNotification,
  BRAND_RASTER_FILES.mobileFavicon,
] as const;

async function countMintPixels(png: Buffer): Promise<number> {
  const { data, info } = await sharp(png).raw().toBuffer({
    resolveWithObject: true,
  });
  let count = 0;
  for (let index = 0; index < data.length; index += info.channels) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const alpha = info.channels === 4 ? data[index + 3] : 255;
    if (alpha > 128 && green > 140 && green > red + 25 && green > blue + 25) {
      count += 1;
    }
  }
  return count;
}

async function samplePng(
  png: Buffer,
  x: number,
  y: number,
): Promise<readonly [number, number, number, number]> {
  const { data, info } = await sharp(png).raw().toBuffer({
    resolveWithObject: true,
  });
  const index = (y * info.width + x) * info.channels;
  return [
    data[index],
    data[index + 1],
    data[index + 2],
    info.channels === 4 ? data[index + 3] : 255,
  ];
}

describe('committed brand icons', () => {
  it('keeps every inlined mark on the canonical SVG path', () => {
    const canonical = extractMarkPath(
      readFileSync(path.join(REPO_ROOT, CANONICAL_LOGO_PATH), 'utf8'),
    );

    for (const relativePath of MARK_SOURCE_FILES) {
      const source = readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
      expect(extractMarkPath(source), relativePath).toBe(canonical);
    }
  });

  it('does not keep a second public loading.svg next to BrandLoader', () => {
    for (const relativePath of FORBIDDEN_PUBLIC_LOADER_FILES) {
      expect(existsSync(path.join(REPO_ROOT, relativePath)), relativePath).toBe(
        false,
      );
    }
  });

  it('does not ship a leftover mobile favicon.ico next to favicon.png', () => {
    expect(existsSync(path.join(REPO_ROOT, FORBIDDEN_MOBILE_FAVICON_ICO))).toBe(
      false,
    );
  });

  it('uses currentColor on the IDE activity-bar SVG so the workbench can tint it', () => {
    const source = readFileSync(
      path.join(REPO_ROOT, IDE_ACTIVITY_BAR_SVG),
      'utf8',
    );

    expect(source).toContain('fill="currentColor"');
    expect(source).not.toContain('#6366F1');
  });

  it('does not ship the unofficial mint G on mobile store chrome', async () => {
    for (const relativePath of MOBILE_RASTER_FILES) {
      const png = readFileSync(path.join(REPO_ROOT, relativePath));
      expect(await countMintPixels(png), relativePath).toBe(0);
    }
  });

  it('renders the mobile app icon as a white official G on opaque black', async () => {
    const png = readFileSync(
      path.join(REPO_ROOT, BRAND_RASTER_FILES.mobileAppIcon),
    );
    const metadata = await sharp(png).metadata();

    expect(metadata.width).toBe(1024);
    expect(metadata.height).toBe(1024);

    const corner = await samplePng(png, 0, 0);
    const center = await samplePng(png, 512, 512);

    expect(corner[0]).toBeLessThan(20);
    expect(corner[1]).toBeLessThan(20);
    expect(corner[2]).toBeLessThan(20);
    expect(corner[3]).toBe(255);
    expect(center[0]).toBeGreaterThan(240);
    expect(center[1]).toBeGreaterThan(240);
    expect(center[2]).toBeGreaterThan(240);
  });

  it('keeps light splash and adaptive foreground on transparent canvas', async () => {
    const splash = await samplePng(
      readFileSync(path.join(REPO_ROOT, BRAND_RASTER_FILES.mobileSplashLight)),
      0,
      0,
    );
    const adaptive = await samplePng(
      readFileSync(path.join(REPO_ROOT, BRAND_RASTER_FILES.mobileAdaptiveIcon)),
      0,
      0,
    );

    expect(splash[3]).toBe(0);
    expect(adaptive[3]).toBe(0);
  });

  it('keeps PWA maskable marks inside the 80% crop circle', () => {
    expect(PWA_MASKABLE_MARK_RATIO).toBeLessThanOrEqual(0.8);
    expect(BRAND_RASTER_SPECS.pwaMaskable192.markSize).toBe(
      Math.round(192 * PWA_MASKABLE_MARK_RATIO),
    );
    expect(BRAND_RASTER_SPECS.pwaMaskable512.markSize).toBe(
      Math.round(512 * PWA_MASKABLE_MARK_RATIO),
    );
  });

  it('does not reuse the square PWA icons as maskable', async () => {
    const pairs = [
      {
        anyPath: PWA_ANY_ICON_FILES[192],
        maskablePath: BRAND_RASTER_FILES.pwaMaskable192,
        size: 192,
      },
      {
        anyPath: PWA_ANY_ICON_FILES[512],
        maskablePath: BRAND_RASTER_FILES.pwaMaskable512,
        size: 512,
      },
    ] as const;

    for (const pair of pairs) {
      const anyPng = readFileSync(path.join(REPO_ROOT, pair.anyPath));
      const maskablePng = readFileSync(path.join(REPO_ROOT, pair.maskablePath));
      expect(anyPng.equals(maskablePng), pair.maskablePath).toBe(false);

      const metadata = await sharp(maskablePng).metadata();
      expect(metadata.width).toBe(pair.size);
      expect(metadata.height).toBe(pair.size);

      const corner = await samplePng(maskablePng, 2, 2);
      expect(corner[0]).toBeLessThan(20);
      expect(corner[1]).toBeLessThan(20);
      expect(corner[2]).toBeLessThan(20);
      expect(corner[3]).toBe(255);
    }
  });
});
