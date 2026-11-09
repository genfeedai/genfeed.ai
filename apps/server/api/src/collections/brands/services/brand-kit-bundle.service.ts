import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import type {
  BrandKitBundleDownload,
  UnpackedBrandKitBundle,
} from '@api/collections/brands/interfaces/brand-kit-bundle.interface';
import {
  type BrandFontActor,
  BrandFontAssetsService,
} from '@api/collections/brands/services/brand-font-assets.service';
import { BrandKitAssetsService } from '@api/collections/brands/services/brand-kit-assets.service';
import {
  packBrandKitBundle,
  unpackBrandKitBundle,
} from '@api/collections/brands/utils/brand-kit-bundle.util';
import { toPersistedFontFamily } from '@api/collections/brands/utils/persisted-font-family';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import {
  readBrandFontRoleFamilies,
  toSlotImages,
} from '@api/services/agent-context-assembly/brand-context-fields.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { AssetParent, type BrandKitSlot } from '@genfeedai/contracts';
import {
  BRAND_KIT_BUNDLE_FORMAT,
  BRAND_KIT_BUNDLE_IMAGE_MAX_BYTES,
  BRAND_KIT_BUNDLE_IMAGE_TYPES,
  BRAND_KIT_BUNDLE_MAX_FONTS,
  BRAND_KIT_BUNDLE_VERSION,
  type BrandKitBundleFontRole,
  type BrandKitBundleImageType,
  type BrandKitBundleManifest,
} from '@genfeedai/contracts/api-types/contracts/brand-kit-bundle.contract';
import {
  BRAND_FONT_ROLES,
  type BrandFontRoleAssignment,
  type BrandFontRoles,
  brandFontRolesSchema,
  readBrandFontRoles,
  readBrandPalette,
} from '@genfeedai/contracts/api-types/contracts/brand-kit-style.contract';
import type {
  IBrandKitImportResult,
  IBrandKitImportSkip,
  IBrandKitResolvedAsset,
  IBrandKitView,
} from '@genfeedai/contracts/interfaces';
import { type Prisma, toPrismaJson } from '@genfeedai/prisma';
import { assertSafeObjectKey, createStorageProvider } from '@genfeedai/storage';
import { Traced } from '@libs/tracing/traced';
import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';

const READ_TIMEOUT_MS = 15_000;
/** Refuse images larger than a 10,000 × 10,000 canvas before decoding them. */
const IMAGE_MAX_PIXELS = 100_000_000;
const NON_SLUG_PATTERN = /[^a-z0-9]+/g;
const EDGE_DASHES_PATTERN = /^-+|-+$/g;

const IMAGE_TYPE_BY_SHARP_FORMAT: Readonly<
  Record<string, BrandKitBundleImageType>
> = {
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

const BRAND_STYLE_SELECT = {
  backgroundColor: true,
  colorPalette: true,
  fontFamily: true,
  fontRoles: true,
  label: true,
  primaryColor: true,
  secondaryColor: true,
  slug: true,
} as const satisfies Prisma.BrandSelect;

type BrandStyleRow = Prisma.BrandGetPayload<{
  select: typeof BRAND_STYLE_SELECT;
}>;

/**
 * The brand kit as a whole (#9710): read in one call, downloaded as one ZIP
 * and imported into another brand. Callers check brand access first; the
 * font calls check it again on their own.
 */
@Traced()
@Injectable()
export class BrandKitBundleService {
  private readonly storage = createStorageProvider();
  private readonly logger = new Logger(BrandKitBundleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly brandKitAssets: BrandKitAssetsService,
    private readonly fonts: BrandFontAssetsService,
  ) {}

  async view(actor: BrandFontActor): Promise<IBrandKitView> {
    const [brand, kit, fonts] = await Promise.all([
      this.findBrand(actor),
      this.brandKitAssets.resolveBrandKitAssets(
        actor.brandId,
        actor.organizationId,
      ),
      this.fonts.list(actor, { limit: BRAND_KIT_BUNDLE_MAX_FONTS }),
    ]);
    return {
      banners: toSlotImages(kit.banners),
      brandId: actor.brandId,
      colors: {
        background: brand.backgroundColor,
        primary: brand.primaryColor,
        secondary: brand.secondaryColor,
      },
      fontFamily: brand.fontFamily,
      fontRoles: readBrandFontRoleFamilies(brand.fontRoles),
      fonts: fonts.docs.map((font) => ({
        contentHash: `sha256:${font.sha256}`,
        fontAssetId: font.id,
        name: font.displayName ?? font.originalFileName ?? font.id,
      })),
      label: brand.label,
      logos: toSlotImages(kit.logos),
      palette: readBrandPalette(brand.colorPalette),
    };
  }

  /**
   * The kit as a ZIP: `manifest.json` plus each logo variant, platform image
   * and brand font. A file that cannot be read is left out of both the ZIP and
   * the manifest, so the manifest only ever names files the ZIP holds.
   */
  async exportBundle(actor: BrandFontActor): Promise<BrandKitBundleDownload> {
    const [brand, kit, fonts] = await Promise.all([
      this.findBrand(actor),
      this.brandKitAssets.resolveBrandKitAssets(
        actor.brandId,
        actor.organizationId,
      ),
      this.fonts.list(actor, { limit: BRAND_KIT_BUNDLE_MAX_FONTS }),
    ]);
    const files = new Map<string, Buffer>();
    const logos = await this.exportImages(actor, 'logos', kit.logos, files);
    const banners = await this.exportImages(
      actor,
      'banners',
      kit.banners,
      files,
    );

    const fontFiles: BrandKitBundleManifest['fonts'] = [];
    const fontFileByAssetId = new Map<string, string>();
    for (const font of fonts.docs) {
      try {
        const bytes = await this.fonts.readFile(actor, font.id);
        const file = `fonts/font-${fontFiles.length + 1}.woff2`;
        files.set(file, bytes);
        fontFiles.push({
          file,
          name: font.displayName ?? font.originalFileName ?? file,
        });
        fontFileByAssetId.set(font.id, file);
      } catch {
        this.logger.warn(`brand_kit_export_font_skipped ${font.id}`);
      }
    }

    const manifest: BrandKitBundleManifest = {
      banners,
      brand: { label: brand.label },
      colors: {
        background: brand.backgroundColor,
        primary: brand.primaryColor,
        secondary: brand.secondaryColor,
      },
      exportedAt: new Date().toISOString(),
      fontFamily: toPersistedFontFamily(brand.fontFamily),
      fontRoles: this.exportFontRoles(brand.fontRoles, fontFileByAssetId),
      fonts: fontFiles,
      format: BRAND_KIT_BUNDLE_FORMAT,
      logos,
      palette: readBrandPalette(brand.colorPalette),
      version: BRAND_KIT_BUNDLE_VERSION,
    };
    const slug =
      brand.slug
        .toLowerCase()
        .replace(NON_SLUG_PATTERN, '-')
        .replace(EDGE_DASHES_PATTERN, '') || 'brand';
    return {
      bytes: packBrandKitBundle(manifest, files),
      fileName: `${slug}-brand-kit.zip`,
    };
  }

  /**
   * Write an exported kit into this brand. Each logo variant and platform
   * image the kit holds replaces that slot; slots the kit leaves out keep
   * their image. Fonts are added, reusing a font the brand already has with
   * the same bytes. Colors, the palette and font roles are replaced when the
   * kit carries them. A file that fails is reported and the rest still import.
   */
  async importBundle(
    actor: BrandFontActor,
    zip: Buffer,
  ): Promise<IBrandKitImportResult> {
    const bundle = unpackBrandKitBundle(zip);
    await this.findBrand(actor);
    const skipped: IBrandKitImportSkip[] = [];

    const logos = await this.importImages(actor, 'logo', bundle, skipped);
    const banners = await this.importImages(actor, 'banner', bundle, skipped);
    const fontByFile = await this.importFonts(actor, bundle, skipped);

    const { manifest } = bundle;
    const fontRoles = this.importFontRoles(manifest.fontRoles, fontByFile);
    const hasColors = Object.values(manifest.colors).some(Boolean);
    const hasPalette = manifest.palette.length > 0;
    const hasFontRoles = Object.keys(fontRoles).length > 0;
    const data: Prisma.BrandUpdateManyMutationInput = {
      ...(manifest.colors.primary
        ? { primaryColor: manifest.colors.primary }
        : {}),
      ...(manifest.colors.secondary
        ? { secondaryColor: manifest.colors.secondary }
        : {}),
      ...(manifest.colors.background
        ? { backgroundColor: manifest.colors.background }
        : {}),
      ...(manifest.fontFamily ? { fontFamily: manifest.fontFamily } : {}),
      ...(hasPalette ? { colorPalette: toPrismaJson(manifest.palette) } : {}),
      ...(hasFontRoles ? { fontRoles: toPrismaJson(fontRoles) } : {}),
    };
    if (Object.keys(data).length > 0) {
      // sql-risk-audit: ignore bulk-write-tenant-review -- organizationId, isDeleted:false and the unique brand id bound the write to the one brand the caller was authorized for.
      await this.prisma.brand.updateMany({
        data,
        where: {
          id: actor.brandId,
          isDeleted: false,
          organizationId: actor.organizationId,
        },
      });
    }
    await this.brandKitAssets.invalidateBrandAssetCaches(
      actor.brandId,
      actor.organizationId,
    );

    return {
      banners,
      fontCount: fontByFile.size,
      hasColors,
      hasFontRoles,
      hasPalette,
      logos,
      skipped,
    };
  }

  private async findBrand(actor: BrandFontActor): Promise<BrandStyleRow> {
    const brand = await this.prisma.brand.findFirst({
      select: BRAND_STYLE_SELECT,
      where: {
        id: actor.brandId,
        isDeleted: false,
        organizationId: actor.organizationId,
      },
    });
    if (!brand) throw new NotFoundException('Brand', actor.brandId);
    return brand;
  }

  private async exportImages(
    actor: BrandFontActor,
    folder: 'logos' | 'banners',
    assets: readonly IBrandKitResolvedAsset[] | undefined,
    files: Map<string, Buffer>,
  ): Promise<BrandKitBundleManifest['logos']> {
    const slotted = (assets ?? []).filter(
      (asset): asset is IBrandKitResolvedAsset & { slot: BrandKitSlot } =>
        Boolean(asset.slot),
    );
    if (slotted.length === 0) return [];
    const rows = await this.prisma.asset.findMany({
      select: { cloudObjectKey: true, id: true },
      where: {
        id: { in: slotted.map((asset) => asset.id) },
        isDeleted: false,
        parentBrandId: actor.brandId,
        parentOrgId: actor.organizationId,
        parentType: AssetParent.BRAND,
      },
    });
    const keyById = new Map(
      rows.map((row) => [
        row.id,
        row.cloudObjectKey?.trim() || `${folder}/${row.id}`,
      ]),
    );
    const entries: BrandKitBundleManifest['logos'] = [];
    for (const asset of slotted) {
      const key = keyById.get(asset.id);
      if (!key) continue;
      try {
        assertSafeObjectKey(key, () => new Error('brand_kit_key_unsafe'));
        const bytes = await this.storage.readBytes(key, {
          maxBytes: BRAND_KIT_BUNDLE_IMAGE_MAX_BYTES,
          timeoutMs: READ_TIMEOUT_MS,
        });
        const mimeType = await this.detectImageType(bytes);
        if (!mimeType) throw new Error('brand_kit_image_unsupported');
        const file = `${folder}/${asset.slot.toLowerCase()}.${BRAND_KIT_BUNDLE_IMAGE_TYPES[mimeType]}`;
        files.set(file, bytes);
        entries.push({ file, mimeType, slot: asset.slot });
      } catch {
        this.logger.warn(`brand_kit_export_image_skipped ${asset.id}`);
      }
    }
    return entries;
  }

  private exportFontRoles(
    stored: unknown,
    fileByAssetId: ReadonlyMap<string, string>,
  ): BrandKitBundleManifest['fontRoles'] {
    const roles = readBrandFontRoles(stored);
    const exported: BrandKitBundleManifest['fontRoles'] = {};
    for (const role of BRAND_FONT_ROLES) {
      const assignment = roles[role];
      if (!assignment) continue;
      if (assignment.source === 'preset') {
        exported[role] = assignment;
        continue;
      }
      const file = fileByAssetId.get(assignment.assetId);
      if (!file) continue;
      exported[role] = {
        family: assignment.family,
        file,
        source: 'upload',
        style: assignment.style,
        weight: assignment.weight,
      };
    }
    return exported;
  }

  private async importImages(
    actor: BrandFontActor,
    role: 'logo' | 'banner',
    bundle: UnpackedBrandKitBundle,
    skipped: IBrandKitImportSkip[],
  ): Promise<BrandKitSlot[]> {
    const entries =
      role === 'logo' ? bundle.manifest.logos : bundle.manifest.banners;
    const imported: BrandKitSlot[] = [];
    for (const entry of entries) {
      const bytes = bundle.files.get(entry.file);
      if (!bytes) {
        skipped.push({ file: entry.file, reason: 'missing_file' });
        continue;
      }
      const mimeType = await this.detectImageType(bytes);
      if (!mimeType) {
        skipped.push({ file: entry.file, reason: 'unsupported_image' });
        continue;
      }
      try {
        await this.brandKitAssets.replaceSlotImage({
          brandId: actor.brandId,
          bytes,
          mimeType,
          organizationId: actor.organizationId,
          origin: 'brand-kit:import',
          role,
          slot: entry.slot,
          userId: actor.actorId,
        });
        imported.push(entry.slot);
      } catch {
        skipped.push({ file: entry.file, reason: 'upload_failed' });
      }
    }
    return imported;
  }

  /** Each kit font file mapped to the brand font that now holds its bytes. */
  private async importFonts(
    actor: BrandFontActor,
    bundle: UnpackedBrandKitBundle,
    skipped: IBrandKitImportSkip[],
  ): Promise<Map<string, { assetId: string; sha256: string }>> {
    const imported = new Map<string, { assetId: string; sha256: string }>();
    if (bundle.manifest.fonts.length === 0) return imported;
    const existing = await this.fonts.list(actor, {
      limit: BRAND_KIT_BUNDLE_MAX_FONTS,
    });
    for (const font of bundle.manifest.fonts) {
      const bytes = bundle.files.get(font.file);
      if (!bytes) {
        skipped.push({ file: font.file, reason: 'missing_file' });
        continue;
      }
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      const same = existing.docs.find((current) => current.sha256 === sha256);
      if (same) {
        imported.set(font.file, { assetId: same.id, sha256 });
        continue;
      }
      try {
        const { asset } = await this.fonts.upload(actor, {
          displayName: font.name,
          file: toUploadedFont(font.file, bytes),
          requestId: randomUUID(),
        });
        imported.set(font.file, { assetId: asset.id, sha256 });
      } catch {
        skipped.push({ file: font.file, reason: 'invalid_font' });
      }
    }
    return imported;
  }

  private importFontRoles(
    roles: BrandKitBundleManifest['fontRoles'],
    fontByFile: ReadonlyMap<string, { assetId: string; sha256: string }>,
  ): BrandFontRoles {
    const resolved: BrandFontRoles = {};
    for (const role of BRAND_FONT_ROLES) {
      const assignment = toRoleAssignment(roles[role], fontByFile);
      if (assignment) resolved[role] = assignment;
    }
    const parsed = brandFontRolesSchema.safeParse(resolved);
    return parsed.success ? parsed.data : {};
  }

  private async detectImageType(
    bytes: Buffer,
  ): Promise<BrandKitBundleImageType | undefined> {
    try {
      const { format } = await sharp(bytes, {
        limitInputPixels: IMAGE_MAX_PIXELS,
      }).metadata();
      return format ? IMAGE_TYPE_BY_SHARP_FORMAT[format] : undefined;
    } catch {
      return undefined;
    }
  }
}

function toRoleAssignment(
  role: BrandKitBundleFontRole | undefined,
  fontByFile: ReadonlyMap<string, { assetId: string; sha256: string }>,
): BrandFontRoleAssignment | undefined {
  if (!role) return undefined;
  if (role.source === 'preset') return role;
  const font = fontByFile.get(role.file);
  if (!font) return undefined;
  return {
    assetId: font.assetId,
    contentHash: `sha256:${font.sha256}`,
    family: role.family,
    source: 'upload',
    style: role.style,
    weight: role.weight,
  };
}

/** A kit font in the shape the brand font upload takes from a request. */
function toUploadedFont(path: string, bytes: Buffer): Express.Multer.File {
  return {
    buffer: bytes,
    destination: '',
    encoding: '7bit',
    fieldname: 'file',
    filename: '',
    mimetype: 'font/woff2',
    originalname: path.slice(path.lastIndexOf('/') + 1),
    path: '',
    size: bytes.length,
    stream: Readable.from(bytes),
  };
}
