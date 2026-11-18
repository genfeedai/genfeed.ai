import {
  SVG_LOGO_MAX_BYTES,
  sanitizeSvgLogo,
} from '@api/collections/assets/utils/svg-logo-sanitizer.util';
import type { IBrandLogoDownload } from '@api/collections/brands/interfaces/brand-logo-download.interface';
import type { BrandFontActor } from '@api/collections/brands/services/brand-font-assets.service';
import { BrandKitAssetsService } from '@api/collections/brands/services/brand-kit-assets.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  AssetCategory,
  AssetParent,
  type BrandKitSlot,
} from '@genfeedai/contracts';
import { BRAND_KIT_BUNDLE_IMAGE_MAX_BYTES } from '@genfeedai/contracts/api-types/contracts/brand-kit-bundle.contract';
import type { BrandLogoDownloadFormat } from '@genfeedai/contracts/constants';
import { assertSafeObjectKey, createStorageProvider } from '@genfeedai/storage';
import { Traced } from '@libs/tracing/traced';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import sharp, { type OutputInfo, type Sharp } from 'sharp';

const READ_TIMEOUT_MS = 15_000;
const RENDER_TIMEOUT_SECONDS = 20;
/** Refuse images larger than a 10,000 × 10,000 canvas before decoding them. */
const IMAGE_MAX_PIXELS = 100_000_000;
/** sharp reads an SVG's nominal size at 72 dpi. */
const SVG_BASE_DENSITY = 72;
const SVG_MAX_DENSITY = 100_000;
const NON_SLUG_PATTERN = /[^a-z0-9]+/g;
const EDGE_DASHES_PATTERN = /^-+|-+$/g;

type RenderedImage = { data: Buffer; info: OutputInfo };

const CONTENT_TYPES: Readonly<Record<BrandLogoDownloadFormat, string>> = {
  png: 'image/png',
  svg: 'image/svg+xml',
  webp: 'image/webp',
};

function toSlug(value: string, fallback: string): string {
  return (
    value
      .toLowerCase()
      .replace(NON_SLUG_PATTERN, '-')
      .replace(EDGE_DASHES_PATTERN, '') || fallback
  );
}

/**
 * One brand logo variant downloaded as PNG, WEBP or SVG (#9706). A logo kept
 * as an SVG renders each raster size from the vector, so a large export stays
 * sharp; a raster logo is resized down from its stored image and never
 * enlarged. The SVG is sanitized again on the way out.
 */
@Traced()
@Injectable()
export class BrandLogoDownloadService {
  private readonly storage = createStorageProvider();

  constructor(
    private readonly prisma: PrismaService,
    private readonly brandKitAssets: BrandKitAssetsService,
  ) {}

  async download(
    actor: BrandFontActor,
    slot: BrandKitSlot,
    format: BrandLogoDownloadFormat,
    size: number,
  ): Promise<IBrandLogoDownload> {
    const [brand, kit] = await Promise.all([
      this.prisma.brand.findFirst({
        select: { slug: true },
        where: {
          id: actor.brandId,
          isDeleted: false,
          organizationId: actor.organizationId,
        },
      }),
      this.brandKitAssets.resolveBrandKitAssets(
        actor.brandId,
        actor.organizationId,
      ),
    ]);
    const logo = kit.logos?.find((asset) => asset.slot === slot);
    if (!brand || !logo) throw new NotFoundException('Logo', slot);

    const row = await this.prisma.asset.findFirst({
      select: { cloudObjectKey: true, id: true, vectorObjectKey: true },
      where: {
        category: AssetCategory.LOGO,
        id: logo.id,
        isDeleted: false,
        parentBrandId: actor.brandId,
        parentOrgId: actor.organizationId,
        parentType: AssetParent.BRAND,
      },
    });
    if (!row) throw new NotFoundException('Logo', slot);

    const vector = row.vectorObjectKey
      ? sanitizeSvgLogo(
          await this.read(row.vectorObjectKey, SVG_LOGO_MAX_BYTES),
        )
      : undefined;
    const baseName = `${toSlug(brand.slug, 'brand')}-${toSlug(slot, 'logo')}`;

    if (format === 'svg') {
      if (!vector) throw new NotFoundException('Logo vector', slot);
      return {
        bytes: vector,
        contentType: CONTENT_TYPES.svg,
        fileName: `${baseName}.svg`,
      };
    }

    const rendered = vector
      ? await this.renderVector(vector, size, format)
      : await this.renderRaster(
          await this.read(
            row.cloudObjectKey?.trim() || `logos/${row.id}`,
            BRAND_KIT_BUNDLE_IMAGE_MAX_BYTES,
          ),
          size,
          format,
        );
    // A raster logo is never enlarged, so the name carries the real size.
    const longestSide = Math.max(rendered.info.width, rendered.info.height);
    return {
      bytes: rendered.data,
      contentType: CONTENT_TYPES[format],
      fileName: `${baseName}-${longestSide}.${format}`,
    };
  }

  private async read(key: string, maxBytes: number): Promise<Buffer> {
    try {
      assertSafeObjectKey(key, () => new Error('brand_logo_key_unsafe'));
      return await this.storage.readBytes(key, {
        maxBytes,
        timeoutMs: READ_TIMEOUT_MS,
      });
    } catch {
      throw new ServiceUnavailableException('brand_logo_unavailable');
    }
  }

  /** Render the vector so its longest side is exactly `size` pixels. */
  private async renderVector(
    vector: Buffer,
    size: number,
    format: Exclude<BrandLogoDownloadFormat, 'svg'>,
  ): Promise<RenderedImage> {
    try {
      const { height, width } = await sharp(vector).metadata();
      const longestSide = Math.max(width ?? 0, height ?? 0) || size;
      const density = Math.min(
        SVG_MAX_DENSITY,
        Math.max(1, (SVG_BASE_DENSITY * size) / longestSide),
      );
      return await this.encode(
        sharp(vector, { density, limitInputPixels: IMAGE_MAX_PIXELS }).resize({
          fit: 'inside',
          height: size,
          width: size,
        }),
        format,
      );
    } catch {
      throw new ServiceUnavailableException('brand_logo_render_failed');
    }
  }

  /** Resize a stored raster down to `size`; a smaller image keeps its size. */
  private async renderRaster(
    bytes: Buffer,
    size: number,
    format: Exclude<BrandLogoDownloadFormat, 'svg'>,
  ): Promise<RenderedImage> {
    try {
      return await this.encode(
        sharp(bytes, { limitInputPixels: IMAGE_MAX_PIXELS }).resize({
          fit: 'inside',
          height: size,
          width: size,
          withoutEnlargement: true,
        }),
        format,
      );
    } catch {
      throw new ServiceUnavailableException('brand_logo_render_failed');
    }
  }

  private encode(
    image: Sharp,
    format: Exclude<BrandLogoDownloadFormat, 'svg'>,
  ): Promise<RenderedImage> {
    const encoded =
      format === 'webp'
        ? image.webp({ quality: 90 })
        : image.png({ compressionLevel: 9 });
    return encoded
      .timeout({ seconds: RENDER_TIMEOUT_SECONDS })
      .toBuffer({ resolveWithObject: true });
  }
}
