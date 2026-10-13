import {
  assertBrandFontBytes,
  BRAND_FONT_MAX_BYTES,
  BrandFontFileError,
  type BrandFontMimeType,
  isBrandFontFace,
  isBrandFontMimeType,
  isBrandFontSize,
} from '@api/services/brand-render-evidence/brand-render-font-file.util';
import { BrandIdentitySnapshotService } from '@api/services/branded-generation-receipts/brand-identity-snapshot.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { AssetCategory, AssetParent } from '@genfeedai/contracts';
import { VISUAL_CODE_LIMITS } from '@genfeedai/contracts/constants';
import type {
  IVisualSandboxAsset,
  IVisualSandboxFontFace,
} from '@genfeedai/contracts/interfaces';
import { assertSafeObjectKey, createStorageProvider } from '@genfeedai/storage';
import { LoggerService } from '@libs/logger/logger.service';
import {
  ConflictException,
  HttpException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';

/** Unauthorised, forbidden and not found: the caller may not see this brand. */
const ACCESS_FAILURE_STATUSES = new Set([401, 403, 404]);

/** The brand has no approved identity to take fonts from; not an error to render. */
const IDENTITY_UNAVAILABLE_CODES = new Set([
  'brand_identity_unavailable',
  'brand_identity_integrity_failed',
  'brand_identity_asset_unavailable',
]);

const FONT_READ_TIMEOUT_MS = 15_000;

export interface BrandFontScope {
  organizationId: string;
  brandId: string;
  /** The actor whose access to the brand is checked. */
  userId: string;
}

/** One font file the approved Brand OS revision names, with the faces to declare. */
export interface ApprovedBrandFont {
  /** The brand asset ID; it is also the staged asset ID the renderer sees. */
  assetId: string;
  /** `sha256:` plus the digest the revision approved. */
  contentHash: string;
  mimeType: BrandFontMimeType;
  faces: IVisualSandboxFontFace[];
}

export interface StagedBrandFonts {
  assets: IVisualSandboxAsset[];
  /** Decoded size of every staged file together. */
  totalBytes: number;
}

function unavailable(): UnprocessableEntityException {
  return new UnprocessableEntityException('visual_brand_font_unavailable');
}

/**
 * Stages the fonts of a brand's approved Brand OS revision for the visual-code
 * renderer. Only files the revision names, that belong to the same organization
 * and brand, are read; their bytes are checked against the approved hash before
 * they leave the API, so the renderer can never be handed a different file under
 * an approved ID.
 */
@Injectable()
export class BrandRenderFontStagingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly snapshots: BrandIdentitySnapshotService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * The fonts the approved revision lets a composition use by family name: a font
   * file with at least one typography rule that owns it. A file no rule names has
   * no family to declare, so it is not staged.
   */
  async approvedFonts(scope: BrandFontScope): Promise<ApprovedBrandFont[]> {
    const snapshot = await this.resolveSnapshot(scope);
    if (snapshot === null) return [];
    if (
      snapshot.organizationId !== scope.organizationId ||
      snapshot.brandId !== scope.brandId
    )
      throw unavailable();
    const { assets, typography } = snapshot.generationRules;
    const byAsset = new Map<string, ApprovedBrandFont>();
    for (const reference of assets) {
      if (reference.role !== 'font') continue;
      const faces = typography
        .filter(
          (rule) =>
            rule.availability === 'owned_asset' &&
            rule.fontAssetReferenceId === reference.id,
        )
        .map(
          (rule): IVisualSandboxFontFace => ({
            family: rule.family,
            weight: rule.weight,
            style: rule.style,
          }),
        )
        .filter(isBrandFontFace);
      if (faces.length === 0) continue;
      if (!reference.contentHash || !isBrandFontMimeType(reference.mimeType))
        throw unavailable();
      const known = byAsset.get(reference.assetId);
      if (known && known.contentHash !== reference.contentHash)
        throw unavailable();
      const merged = [...(known?.faces ?? []), ...faces].filter(
        (face, index, all) =>
          all.findIndex(
            (other) =>
              other.family === face.family &&
              other.weight === face.weight &&
              other.style === face.style,
          ) === index,
      );
      byAsset.set(reference.assetId, {
        assetId: reference.assetId,
        contentHash: reference.contentHash,
        mimeType: reference.mimeType,
        faces: merged.slice(0, 8),
      });
    }
    const approved = [...byAsset.values()].sort((a, b) =>
      a.assetId.localeCompare(b.assetId),
    );
    if (approved.length > VISUAL_CODE_LIMITS.brandFonts)
      this.logger.warn('Brand has more approved fonts than a render stages', {
        brandId: scope.brandId,
        organizationId: scope.organizationId,
        approved: approved.length,
      });
    return approved.slice(0, VISUAL_CODE_LIMITS.brandFonts);
  }

  /** Reads and verifies the approved font files, ready for the renderer. */
  async stage(scope: BrandFontScope): Promise<StagedBrandFonts> {
    const approved = await this.approvedFonts(scope);
    if (approved.length === 0) return { assets: [], totalBytes: 0 };
    const rows = await this.prisma.asset.findMany({
      where: {
        id: { in: approved.map((font) => font.assetId) },
        parentType: AssetParent.BRAND,
        parentOrgId: scope.organizationId,
        parentBrandId: scope.brandId,
        category: AssetCategory.FONT,
        isDeleted: false,
      },
      take: approved.length,
    });
    const storage = createStorageProvider();
    const assets: IVisualSandboxAsset[] = [];
    let totalBytes = 0;
    for (const font of approved) {
      const row = rows.find((candidate) => candidate.id === font.assetId);
      if (
        !row ||
        row.mimeType !== font.mimeType ||
        !row.sha256 ||
        `sha256:${row.sha256}` !== font.contentHash ||
        !isBrandFontSize(row.sizeBytes) ||
        !row.cloudObjectKey
      )
        throw unavailable();
      const key = row.cloudObjectKey;
      this.assertSafeKey(key);
      let bytes: Buffer;
      try {
        bytes = await storage.readBytes(key, {
          maxBytes: BRAND_FONT_MAX_BYTES,
          timeoutMs: FONT_READ_TIMEOUT_MS,
        });
        assertBrandFontBytes(bytes, {
          mimeType: row.mimeType,
          sizeBytes: row.sizeBytes,
          sha256: row.sha256,
        });
      } catch (error) {
        if (error instanceof BrandFontFileError)
          throw new UnprocessableEntityException(error.code);
        throw unavailable();
      }
      totalBytes += bytes.length;
      assets.push({
        id: font.assetId,
        mime: font.mimeType,
        bytes: bytes.toString('base64'),
        faces: font.faces,
      });
    }
    return { assets, totalBytes };
  }

  private assertSafeKey(key: string): void {
    try {
      assertSafeObjectKey(key, () => new Error('unsafe_key'));
    } catch {
      throw unavailable();
    }
  }

  private async resolveSnapshot(scope: BrandFontScope) {
    try {
      return await this.snapshots.preview({
        actorId: scope.userId,
        organizationId: scope.organizationId,
        brandId: scope.brandId,
      });
    } catch (error) {
      // An access failure must keep failing; a brand without an approved
      // identity simply renders without brand fonts.
      if (
        error instanceof HttpException &&
        ACCESS_FAILURE_STATUSES.has(error.getStatus())
      )
        throw error;
      const isKnown =
        error instanceof ConflictException &&
        IDENTITY_UNAVAILABLE_CODES.has(error.message);
      if (!isKnown)
        this.logger.warn('Brand snapshot lookup failed for font staging', {
          brandId: scope.brandId,
          organizationId: scope.organizationId,
          reason: error instanceof Error ? error.name : 'unknown',
        });
      return null;
    }
  }
}
