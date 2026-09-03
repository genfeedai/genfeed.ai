import { readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

export const CANONICAL_LOGO_PATH = 'apps/app/public/logo.svg';

export const OPAQUE_BLACK = { r: 0, g: 0, b: 0, alpha: 1 } as const;
export const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 } as const;

export const MARK_SOURCE_FILES = [
  CANONICAL_LOGO_PATH,
  'apps/app/public/loading.svg',
  'apps/website/public/loading.svg',
  'packages/helpers/src/ui/icons/brands/genfeed-icon.ts',
  'packages/ui/src/components/feedback/brand-loader/BrandLoader.tsx',
  'apps/website/app/(content)/articles/[slug]/og/brand-mark.tsx',
  'apps/desktop/app/src/main/boot-screen.ts',
  'apps/extensions/ide/app/assets/icon.svg',
] as const;

export type BrandRasterId =
  | 'mobileAppIcon'
  | 'mobileAdaptiveIcon'
  | 'mobileSplashLight'
  | 'mobileSplashDark'
  | 'mobileNotification'
  | 'mobileFavicon'
  | 'extensionToolbar';

export type RasterBackground = {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly alpha: number;
};

export type BrandRasterSpec = {
  readonly background: RasterBackground;
  readonly canvas: number;
  readonly fill: string;
  readonly markSize: number;
};

export const BRAND_RASTER_SPECS: Record<BrandRasterId, BrandRasterSpec> = {
  extensionToolbar: {
    background: TRANSPARENT,
    canvas: 500,
    fill: '#000000',
    markSize: 500,
  },
  mobileAdaptiveIcon: {
    background: TRANSPARENT,
    canvas: 1024,
    fill: '#ffffff',
    markSize: 640,
  },
  mobileAppIcon: {
    background: OPAQUE_BLACK,
    canvas: 1024,
    fill: '#ffffff',
    markSize: 768,
  },
  mobileFavicon: {
    background: TRANSPARENT,
    canvas: 48,
    fill: '#000000',
    markSize: 40,
  },
  mobileNotification: {
    background: TRANSPARENT,
    canvas: 96,
    fill: '#ffffff',
    markSize: 72,
  },
  mobileSplashDark: {
    background: TRANSPARENT,
    canvas: 512,
    fill: '#ffffff',
    markSize: 400,
  },
  mobileSplashLight: {
    background: TRANSPARENT,
    canvas: 512,
    fill: '#000000',
    markSize: 400,
  },
};

export const BRAND_RASTER_FILES: Record<BrandRasterId, string> = {
  extensionToolbar: 'apps/extensions/browser/app/assets/icon.png',
  mobileAdaptiveIcon: 'apps/mobile/app/assets/images/adaptive-icon.png',
  mobileAppIcon: 'apps/mobile/app/assets/images/icon.png',
  mobileFavicon: 'apps/mobile/app/assets/images/favicon.png',
  mobileNotification: 'apps/mobile/app/assets/images/notification-icon.png',
  mobileSplashDark: 'apps/mobile/app/assets/images/splash-icon-dark.png',
  mobileSplashLight: 'apps/mobile/app/assets/images/splash-icon.png',
};

export const IDE_ACTIVITY_BAR_SVG = 'apps/extensions/ide/app/assets/icon.svg';

export function extractMarkPath(source: string): string {
  const match = source.match(/M2360 4944[^"']+/);
  if (!match) {
    throw new Error('official Genfeed mark path not found');
  }
  return match[0];
}

export function loadCanonicalSvg(root: string): string {
  return readFileSync(path.join(root, CANONICAL_LOGO_PATH), 'utf8');
}

export function svgWithFill(svg: string, fill: string): string {
  if (!svg.includes('fill="')) {
    throw new Error('canonical SVG is missing a fill');
  }
  return svg.replace(/fill="[^"]+"/, `fill="${fill}"`);
}

export function svgAtSize(svg: string, px: number): string {
  return svg.replace('<svg ', `<svg width="${px}" height="${px}" `);
}

export function currentColorMarkSvg(sourceSvg: string): string {
  return `${svgWithFill(sourceSvg, 'currentColor').trimEnd()}\n`;
}

export async function rasterizeMark(options: {
  background: RasterBackground;
  canvas: number;
  fill: string;
  markSize: number;
  sourceSvg: string;
}): Promise<Buffer> {
  const svg = svgAtSize(
    svgWithFill(options.sourceSvg, options.fill),
    options.markSize,
  );
  const mark = await sharp(Buffer.from(svg)).png().toBuffer();
  return sharp({
    create: {
      background: options.background,
      channels: 4,
      height: options.canvas,
      width: options.canvas,
    },
  })
    .composite([{ gravity: 'centre', input: mark }])
    .png()
    .toBuffer();
}

export async function renderBrandRaster(
  sourceSvg: string,
  id: BrandRasterId,
): Promise<Buffer> {
  const spec = BRAND_RASTER_SPECS[id];
  return rasterizeMark({
    background: spec.background,
    canvas: spec.canvas,
    fill: spec.fill,
    markSize: spec.markSize,
    sourceSvg,
  });
}
