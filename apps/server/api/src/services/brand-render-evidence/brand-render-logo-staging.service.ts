import { createHash } from 'node:crypto';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { AssetCategory, AssetParent } from '@genfeedai/contracts';
import type { IVisualSandboxAsset } from '@genfeedai/contracts/interfaces';
import type { BrandIdentitySnapshotV1 } from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import { assertSafeObjectKey, createStorageProvider } from '@genfeedai/storage';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { Injectable, UnprocessableEntityException } from '@nestjs/common';

/** The renderer sandbox takes PNG and JPEG images; an SVG or WebP logo is left out. */
const LOGO_MIME_TYPES = ['image/png', 'image/jpeg'] as const;
type BrandLogoMimeType = (typeof LOGO_MIME_TYPES)[number];

const LOGO_MIN_BYTES = 24;
const LOGO_MAX_BYTES = 8 * 1024 * 1024;
const LOGO_READ_TIMEOUT_MS = 15_000;

export interface BrandLogoScope {
  organizationId: string;
  brandId: string;
}

/** One logo the approved Brand OS revision names that a render can stage. */
export interface ApprovedBrandLogo {
  /** The brand asset ID; it is also the staged asset ID the renderer sees. */
  assetId: string;
  mimeType: BrandLogoMimeType;
  isRequired: boolean;
  /** `sha256:` plus the digest the revision approved, when it recorded one. */
  contentHash?: string;
}

export interface StagedBrandLogos {
  assets: IVisualSandboxAsset[];
  /** Decoded size of every staged file together. */
  totalBytes: number;
}

function isLogoMimeType(value: unknown): value is BrandLogoMimeType {
  return (
    typeof value === 'string' &&
    (LOGO_MIME_TYPES as readonly string[]).includes(value)
  );
}

function isLogoSize(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= LOGO_MIN_BYTES &&
    value <= LOGO_MAX_BYTES
  );
}

function hasSignature(bytes: Buffer, mime: BrandLogoMimeType): boolean {
  if (mime === 'image/png')
    return (
      bytes.length >= LOGO_MIN_BYTES &&
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    );
  return (
    bytes.length > 4 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes.at(-2) === 255 &&
    bytes.at(-1) === 217
  );
}

function isSafeKey(key: string): boolean {
  try {
    assertSafeObjectKey(key, () => new Error('unsafe_key'));
    return true;
  } catch {
    return false;
  }
}

function unavailable(): UnprocessableEntityException {
  return new UnprocessableEntityException('visual_brand_logo_unavailable');
}

/**
 * Stages the logos of a brand's approved Brand OS revision for the visual-code
 * renderer, so a composition can load the real logo with
 * `staticFile("assets/<assetId>")`. Only files the revision names, that belong
 * to the same organization and brand, are read; a logo that cannot be staged is
 * left out and reported as not staged, so the model never draws a substitute.
 */
@Traced()
@Injectable()
export class BrandRenderLogoStagingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * The logos that apply to video and can be staged, required ones first, at
   * most `limit` of them. The same call decides what the authoring model is told
   * is staged and what the renderer receives, so the two cannot disagree.
   */
  async approvedLogos(
    scope: BrandLogoScope,
    snapshot: BrandIdentitySnapshotV1,
    limit: number,
    reservedAssetIds: readonly string[] = [],
  ): Promise<ApprovedBrandLogo[]> {
    if (
      limit <= 0 ||
      snapshot.organizationId !== scope.organizationId ||
      snapshot.brandId !== scope.brandId
    )
      return [];
    const references = new Map<string, ApprovedBrandLogo>();
    for (const reference of snapshot.generationRules.assets) {
      if (
        reference.role !== 'logo' ||
        !isLogoMimeType(reference.mimeType) ||
        (reference.appliesToMediaKinds !== undefined &&
          !reference.appliesToMediaKinds.includes('video')) ||
        reservedAssetIds.includes(reference.assetId)
      )
        continue;
      const known = references.get(reference.assetId);
      references.set(reference.assetId, {
        assetId: reference.assetId,
        mimeType: reference.mimeType,
        isRequired: reference.required || known?.isRequired === true,
        ...(reference.contentHash
          ? { contentHash: reference.contentHash }
          : {}),
      });
    }
    if (references.size === 0) return [];
    const rows = await this.prisma.asset.findMany({
      where: {
        id: { in: [...references.keys()] },
        parentType: AssetParent.BRAND,
        parentOrgId: scope.organizationId,
        parentBrandId: scope.brandId,
        category: AssetCategory.LOGO,
        isDeleted: false,
      },
      take: references.size,
    });
    const approved = [...references.values()]
      .filter((logo) => {
        const row = rows.find((candidate) => candidate.id === logo.assetId);
        const isStageable =
          row !== undefined &&
          row.mimeType === logo.mimeType &&
          isLogoSize(row.sizeBytes) &&
          typeof row.cloudObjectKey === 'string' &&
          isSafeKey(row.cloudObjectKey) &&
          (!logo.contentHash || `sha256:${row.sha256}` === logo.contentHash);
        if (!isStageable)
          this.logger.warn('Brand logo cannot be staged for a render', {
            assetId: logo.assetId,
            brandId: scope.brandId,
            organizationId: scope.organizationId,
          });
        return isStageable;
      })
      .sort(
        (a, b) =>
          Number(b.isRequired) - Number(a.isRequired) ||
          a.assetId.localeCompare(b.assetId),
      );
    return approved.slice(0, limit);
  }

  /** Reads and verifies the approved logo files, ready for the renderer. */
  async stage(
    scope: BrandLogoScope,
    logos: readonly ApprovedBrandLogo[],
  ): Promise<StagedBrandLogos> {
    if (logos.length === 0) return { assets: [], totalBytes: 0 };
    const rows = await this.prisma.asset.findMany({
      where: {
        id: { in: logos.map((logo) => logo.assetId) },
        parentType: AssetParent.BRAND,
        parentOrgId: scope.organizationId,
        parentBrandId: scope.brandId,
        category: AssetCategory.LOGO,
        isDeleted: false,
      },
      take: logos.length,
    });
    const storage = createStorageProvider();
    const assets: IVisualSandboxAsset[] = [];
    let totalBytes = 0;
    for (const logo of logos) {
      const row = rows.find((candidate) => candidate.id === logo.assetId);
      if (!row?.cloudObjectKey || row.mimeType !== logo.mimeType)
        throw unavailable();
      let bytes: Buffer;
      try {
        bytes = await storage.readBytes(row.cloudObjectKey, {
          maxBytes: LOGO_MAX_BYTES,
          timeoutMs: LOGO_READ_TIMEOUT_MS,
        });
      } catch {
        throw unavailable();
      }
      const digest = createHash('sha256').update(bytes).digest('hex');
      if (
        !isLogoSize(bytes.length) ||
        !hasSignature(bytes, logo.mimeType) ||
        (row.sha256 && row.sha256 !== digest) ||
        (logo.contentHash && logo.contentHash !== `sha256:${digest}`)
      )
        throw unavailable();
      totalBytes += bytes.length;
      assets.push({
        id: logo.assetId,
        mime: logo.mimeType,
        bytes: bytes.toString('base64'),
      });
    }
    return { assets, totalBytes };
  }
}
