import { ASSET_ORIGIN_GENERATION_PENDING } from '@api/collections/assets/constants/asset-origin.constant';
import { toBrandKitSlot } from '@api/collections/assets/utils/brand-kit-slot.util';
import {
  ASSET_UPLOAD_TYPE_BY_ROLE,
  BRAND_KIT_RESOLVED_REFERENCE_LIMIT,
  BRAND_KIT_ROLE_BY_PRISMA_CATEGORY,
  PRISMA_ASSET_CATEGORY_BY_ROLE,
} from '@api/collections/brands/constants/brand-kit-assets.constant';
import type { BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import { resolveBrandLogoCdnUrls } from '@api/collections/brands/utils/brand-logo-urls.util';
import { detectRasterImageMimeType } from '@api/collections/brands/utils/raster-image-mime.util';
import {
  CACHE_PATTERNS,
  CACHE_TAGS,
  SCOPED_CACHE_TAGS,
} from '@api/common/constants/cache-patterns.constants';
import { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { assertUrlNotPrivate } from '@api/helpers/utils/ssrf/ssrf.util';
import { scopedWhere } from '@api/index';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  BrandKitSlot,
  FileInputType,
  ReferenceImageCategory,
} from '@genfeedai/contracts';
import {
  BRAND_KIT_LOGO_SLOTS,
  BRAND_KIT_PLATFORM_SLOTS,
  getBrandKitPlatformSlotSpec,
} from '@genfeedai/contracts/constants';
import type {
  BrandKitAssetRole,
  IBrandKitAssetImportCandidate,
  IBrandKitAssetImportRequest,
  IBrandKitAssetImportResponse,
  IBrandKitAssetImportResult,
  IBrandKitDiagnostic,
  IBrandKitPlatformFillResult,
  IBrandKitResolvedAsset,
  IBrandKitResolvedAssets,
} from '@genfeedai/contracts/interfaces';
import { Prisma } from '@genfeedai/prisma';
import { projectSocialAvatarUrls } from '@genfeedai/serializers';
import { ConfigService } from '@libs/config/config.service';
import { signCdnUrl } from '@libs/media/media-url.util';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

const TRAILING_SLASHES_PATTERN = /\/+$/;
const LEADING_SLASHES_PATTERN = /^\/+/;

const BRAND_KIT_IMPORT_MAX_BYTES = 50 * 1024 * 1024;
const BRAND_KIT_ALLOWED_MIME_TYPES = new Set([
  'image/gif',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/svg+xml',
  'image/webp',
]);
const BRAND_KIT_ALLOWED_EXTENSIONS = new Set([
  '.gif',
  '.jpeg',
  '.jpg',
  '.png',
  '.svg',
  '.webp',
]);
/**
 * Sites often publish their logo only as an SVG. The files service rasterizes
 * SVG uploads to PNG, so an imported SVG is stored, and recorded, as a PNG.
 */
const BRAND_KIT_DEFAULT_SLOT_BY_ROLE = {
  banner: BrandKitSlot.BANNER_MASTER,
  logo: BrandKitSlot.LOGO_PRIMARY,
} as const satisfies Record<
  Exclude<BrandKitAssetRole, 'reference'>,
  BrandKitSlot
>;
const SVG_MIME_TYPE = 'image/svg+xml';
const SVG_EXTENSION = '.svg';
const SVG_STORED_MIME_TYPE = 'image/png';
const SVG_STORED_EXTENSION = '.png';

function toReferenceImageCategory(
  value: unknown,
): ReferenceImageCategory | undefined {
  return Object.values(ReferenceImageCategory).find(
    (category) => category === value,
  );
}

/**
 * The columns the resolver reads, kept as a Prisma select so the row type stays
 * tied to the schema even though the batched read goes through `$queryRaw`.
 */
const BRAND_KIT_ASSET_SELECT = {
  category: true,
  cloudObjectKey: true,
  displayName: true,
  id: true,
  kitSlot: true,
  mimeType: true,
  parentBrandId: true,
  referenceCategory: true,
} satisfies Prisma.AssetSelect;

/** Display order of logo variants and platform slots; also the pick order. */
const BRAND_KIT_SLOT_ORDER = new Map<string, number>(
  [...BRAND_KIT_LOGO_SLOTS, ...BRAND_KIT_PLATFORM_SLOTS].map((spec, index) => [
    spec.slot,
    index,
  ]),
);

function compareBrandKitSlots(
  left: IBrandKitResolvedAsset,
  right: IBrandKitResolvedAsset,
): number {
  return (
    (BRAND_KIT_SLOT_ORDER.get(left.slot ?? '') ?? Number.MAX_SAFE_INTEGER) -
    (BRAND_KIT_SLOT_ORDER.get(right.slot ?? '') ?? Number.MAX_SAFE_INTEGER)
  );
}
type BrandKitAssetRecord = Prisma.AssetGetPayload<{
  select: typeof BRAND_KIT_ASSET_SELECT;
}>;
/**
 * The subset `toResolvedBrandKitAsset` actually reads.
 *
 * The batched resolver goes through `$queryRaw`, so its `category` arrives as a
 * plain string rather than the generated `AssetCategory` union. Everything the
 * mapper touches is shared, so it takes the narrower shape and both callers fit.
 */
type BrandKitAssetFields = Omit<
  BrandKitAssetRecord,
  'category' | 'kitSlot' | 'referenceCategory'
> & {
  kitSlot: string | null;
  referenceCategory: ReferenceImageCategory | null;
};
type BrandKitAssetRankedRow = BrandKitAssetFields & {
  category: string;
};
type BrandKitAssetBrandFinder = (
  criteria: Record<string, unknown>,
) => Promise<BrandDocument | null>;

@Traced()
@Injectable()
export class BrandKitAssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheInvalidationService: CacheInvalidationService,
    private readonly filesClientService: FilesClientService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Read a brand's live logo, banner and reference assets back out of storage.
   *
   * The Prisma `Brand` model has no `logo`/`banner`/`references` columns — those
   * were Mongo-era populated relations. The assets are `Asset` rows scoped by
   * `parentType: 'BRAND'` + brand + org, so anything that wants a usable URL
   * (agent prompts, workflow nodes, brand kit readiness) has to come through
   * here. Reading `brand.logo` type-checks against `BrandDocument`'s index
   * signature and is permanently `undefined` at runtime.
   */
  async resolveBrandKitAssets(
    brandId: string,
    organizationId: string,
  ): Promise<IBrandKitResolvedAssets> {
    const resolved = await this.resolveBrandKitAssetsForBrands(
      [brandId],
      organizationId,
    );

    return resolved.get(brandId) ?? { references: [] };
  }

  /**
   * The same bounded read for a whole set of brands, in exactly one query.
   *
   * Each brand resolves at most one logo per variant, one banner per platform
   * slot (both fixed, small sets) and the configured reference limit, so a noisy asset history cannot inflate the authenticated
   * bootstrap response or the query result held in memory. Those per-brand
   * bounds used to cost three queries per brand — a genuine N+1 that Sentry
   * flagged on `GET /v1/auth/bootstrap`, where the whole org's brand list is
   * resolved on every cold bootstrap. A `ROW_NUMBER()` window partitioned by
   * brand and category applies the same per-brand cap server-side, which a
   * plain `parentBrandId IN (...)` read cannot do: a single `take` is a global
   * cap, so one brand with a deep asset history would starve the others.
   *
   * Brands with no assets still get an entry so callers can attach
   * unconditionally.
   */
  async resolveBrandKitAssetsForBrands(
    brandIds: string[],
    organizationId: string,
  ): Promise<Map<string, IBrandKitResolvedAssets>> {
    const uniqueBrandIds = [...new Set(brandIds.filter(Boolean))];
    const resolved = new Map<string, IBrandKitResolvedAssets>(
      uniqueBrandIds.map((brandId) => [brandId, { references: [] }]),
    );

    if (uniqueBrandIds.length === 0) {
      return resolved;
    }

    const referenceCategory = String(PRISMA_ASSET_CATEGORY_BY_ROLE.reference);
    const rankedCategories = [
      String(PRISMA_ASSET_CATEGORY_BY_ROLE.logo),
      String(PRISMA_ASSET_CATEGORY_BY_ROLE.banner),
      referenceCategory,
    ];

    const rows = await this.prisma.$queryRaw<BrandKitAssetRankedRow[]>`
      SELECT
        ranked."id",
        ranked."category",
        ranked."cloudObjectKey",
        ranked."displayName",
        ranked."slotKey" AS "kitSlot",
        ranked."mimeType",
        ranked."parentBrandId",
        ranked."referenceCategory"::text AS "referenceCategory"
      FROM (
        SELECT
          categorized."id",
          categorized."category",
          categorized."cloudObjectKey",
          categorized."displayName",
          categorized."slotKey",
          categorized."mimeType",
          categorized."parentBrandId",
          categorized."referenceCategory",
          categorized."updatedAt",
          ROW_NUMBER() OVER (
            PARTITION BY
              categorized."parentBrandId",
              categorized."category",
              categorized."slotKey"
            ORDER BY
              CASE
                WHEN categorized."category" = 'REFERENCE'
                  AND categorized."categoryRank" = 1
                THEN CASE categorized."referenceCategoryKey"
                  WHEN 'FACE' THEN 0
                  WHEN 'PRODUCT' THEN 1
                  WHEN 'STYLE' THEN 2
                  WHEN 'LOGO' THEN 3
                  ELSE 4
                END
                ELSE 5
              END ASC,
              categorized."updatedAt" DESC,
              categorized."id" ASC
          ) AS "roleRank"
        FROM (
          SELECT
            asset."id",
            asset."category"::text AS "category",
            asset."cloudObjectKey",
            asset."displayName",
            -- One live asset per logo variant or platform slot. A row written
            -- before slots reads as the primary logo or the master banner.
            CASE asset."category"::text
              WHEN 'LOGO'
                THEN COALESCE(asset."kitSlot"::text, 'LOGO_PRIMARY')
              WHEN 'BANNER'
                THEN COALESCE(asset."kitSlot"::text, 'BANNER_MASTER')
              ELSE NULL
            END AS "slotKey",
            asset."mimeType",
            asset."parentBrandId",
            asset."referenceCategory",
            COALESCE(asset."referenceCategory"::text, 'STYLE') AS "referenceCategoryKey",
            asset."updatedAt",
            ROW_NUMBER() OVER (
              PARTITION BY
                asset."parentBrandId",
                asset."category",
                COALESCE(asset."referenceCategory"::text, 'STYLE')
              ORDER BY asset."updatedAt" DESC, asset."id" ASC
            ) AS "categoryRank"
          FROM "assets" AS asset
          WHERE asset."isDeleted" = false
            AND asset."parentType" = 'BRAND'::"AssetParent"
            AND asset."parentOrgId" = ${organizationId}
            AND (
              asset."origin" IS NULL
              OR asset."origin" <> ${ASSET_ORIGIN_GENERATION_PENDING}
            )
            AND asset."parentBrandId" = ANY(${uniqueBrandIds}::text[])
            AND asset."category" = ANY(${rankedCategories}::"AssetCategory"[])
        ) AS categorized
      ) AS ranked
      WHERE ranked."roleRank" <= CASE
        WHEN ranked."category" = ${referenceCategory}
          THEN ${BRAND_KIT_RESOLVED_REFERENCE_LIMIT}::int
        ELSE 1
      END
      ORDER BY
        ranked."parentBrandId" ASC,
        ranked."roleRank" ASC,
        ranked."updatedAt" DESC,
        ranked."id" ASC
    `;

    for (const row of rows) {
      const kit = row.parentBrandId
        ? resolved.get(row.parentBrandId)
        : undefined;
      const role = BRAND_KIT_ROLE_BY_PRISMA_CATEGORY.get(row.category);

      if (!kit || !role) {
        continue;
      }

      const asset = this.toResolvedBrandKitAsset(row, role);
      if (role === 'reference') {
        kit.references.push(asset);
      } else if (role === 'logo') {
        kit.logos = [...(kit.logos ?? []), asset];
      } else {
        kit.banners = [...(kit.banners ?? []), asset];
      }
    }

    for (const kit of resolved.values()) {
      // Rows arrive newest first, so the fallback alias is the newest asset,
      // matching the logo the leaderboards resolve.
      const newestLogo = kit.logos?.[0];
      const newestBanner = kit.banners?.[0];
      kit.logos?.sort(compareBrandKitSlots);
      kit.banners?.sort(compareBrandKitSlots);
      kit.logo =
        kit.logos?.find((asset) => asset.slot === BrandKitSlot.LOGO_PRIMARY) ??
        newestLogo;
      kit.banner =
        kit.banners?.find(
          (asset) => asset.slot === BrandKitSlot.BANNER_MASTER,
        ) ?? newestBanner;
      if (!kit.logo) delete kit.logo;
      if (!kit.banner) delete kit.banner;
    }

    return resolved;
  }

  /**
   * Live logo URLs for many brands at once, keyed by brand id.
   *
   * Callers group brand ids under their owning organization so platform-level
   * leaderboards retain tenant boundaries while resolving the page in one read.
   */
  async resolveBrandLogoUrls(
    brandIdsByOrganization: ReadonlyMap<string, readonly string[]>,
  ): Promise<Map<string, string>> {
    return resolveBrandLogoCdnUrls(
      this.prisma,
      this.configService.cdnUrl,
      brandIdsByOrganization,
    );
  }

  /**
   * Resize the brand's master banner into platform image slots (#9707). Each
   * slot gets its own asset at that platform's size, cropped to cover from the
   * center, and replaces only that slot. A slot that fails is reported and
   * leaves the slot's current image in place.
   */
  async fillPlatformSlotsFromMaster(
    brandId: string,
    organizationId: string,
    userId: string,
    slots: readonly BrandKitSlot[],
  ): Promise<IBrandKitPlatformFillResult[]> {
    const master = await this.prisma.asset.findFirst({
      orderBy: { updatedAt: 'desc' },
      select: { cloudObjectKey: true, id: true, mimeType: true },
      where: {
        category: PRISMA_ASSET_CATEGORY_BY_ROLE.banner,
        isDeleted: false,
        OR: [{ kitSlot: BrandKitSlot.BANNER_MASTER }, { kitSlot: null }],
        parentBrandId: brandId,
        parentOrgId: organizationId,
        parentType: 'BRAND' as Prisma.AssetCreateInput['parentType'],
        // An uploaded banner has no origin; only a pending generation is left out.
        AND: [
          {
            OR: [
              { origin: null },
              { origin: { not: ASSET_ORIGIN_GENERATION_PENDING } },
            ],
          },
        ],
      },
    });
    if (!master) {
      throw new NotFoundException('Master banner', brandId);
    }

    const masterUrl = this.signForFetch(
      this.buildBrandAssetCdnUrl(master.id, 'banner', master.cloudObjectKey),
    );
    const results: IBrandKitPlatformFillResult[] = [];
    for (const slot of new Set(slots)) {
      const spec = getBrandKitPlatformSlotSpec(slot);
      if (!spec || slot === BrandKitSlot.BANNER_MASTER) {
        results.push({ slot, status: 'failed', error: 'not_a_platform_slot' });
        continue;
      }
      let assetId: string | undefined;
      try {
        const resized = await this.filesClientService.resizeImageFromUrl(
          masterUrl,
          { height: spec.height, width: spec.width },
        );
        // The type follows the resized bytes, not the master's stored label.
        const filledMimeType =
          detectRasterImageMimeType(resized) ?? 'image/png';
        // Created as pending so no read picks it before its image is stored.
        const asset = await this.prisma.asset.create({
          data: {
            category: PRISMA_ASSET_CATEGORY_BY_ROLE.banner,
            kitSlot: slot,
            mimeType: filledMimeType,
            origin: ASSET_ORIGIN_GENERATION_PENDING,
            parentBrandId: brandId,
            parentOrgId: organizationId,
            parentType: 'BRAND' as Prisma.AssetCreateInput['parentType'],
            userId,
          },
          select: { id: true },
        });
        assetId = asset.id;
        await this.filesClientService.uploadToS3(
          asset.id,
          ASSET_UPLOAD_TYPE_BY_ROLE.banner,
          {
            contentType: filledMimeType,
            data: resized,
            type: FileInputType.BUFFER,
          },
        );
        await this.prisma.asset.update({
          data: { origin: `brand-kit:master:${master.id}` },
          where: { id: asset.id },
        });
        await this.prisma.asset.updateMany({
          data: { isDeleted: true },
          where: {
            category: PRISMA_ASSET_CATEGORY_BY_ROLE.banner,
            id: { not: asset.id },
            isDeleted: false,
            kitSlot: slot,
            parentBrandId: brandId,
            parentOrgId: organizationId,
            parentType: 'BRAND' as Prisma.AssetCreateInput['parentType'],
          },
        });
        results.push({ assetId: asset.id, slot, status: 'filled' });
      } catch (error: unknown) {
        if (assetId) await this.markImportedAssetDeleted(assetId);
        results.push({
          error: error instanceof Error ? error.message : 'resize_failed',
          slot,
          status: 'failed',
        });
      }
    }

    await this.invalidateBrandAssetCaches(brandId, organizationId);
    return results;
  }

  /** A CDN URL the files service can fetch: signed when media is private. */
  private signForFetch(url: string): string {
    return this.configService.isAuthorizedMediaDeliveryEnabled
      ? signCdnUrl(url, this.configService.mediaUrlConfig)
      : url;
  }

  async importBrandKitAssets(
    brandId: string,
    organizationId: string,
    userId: string,
    dto: IBrandKitAssetImportRequest,
    findBrand: BrandKitAssetBrandFinder,
  ): Promise<IBrandKitAssetImportResponse> {
    const brand = await findBrand(scopedWhere(organizationId, { id: brandId }));

    if (!brand) {
      throw new NotFoundException('Brand', brandId);
    }

    if (dto.assets.length === 0) {
      const diagnostic = this.createBrandKitImportDiagnostic(
        'brand_kit_asset_import_empty',
        'At least one asset candidate is required.',
        'error',
      );

      return {
        brandId,
        diagnostics: [diagnostic],
        failedCandidateIds: [],
        id: brandId,
        importedAssetIds: [],
        results: [],
        skippedCandidateIds: [],
        status: 'blocked',
      };
    }

    const results: IBrandKitAssetImportResult[] = [];
    for (const candidate of dto.assets) {
      results.push(
        await this.importBrandKitAssetCandidate(
          candidate,
          brandId,
          organizationId,
          userId,
        ),
      );
    }

    const importedAssetIds = results
      .filter((result) => result.status === 'imported' && result.assetId)
      .map((result) => String(result.assetId));
    const skippedCandidateIds = results
      .filter((result) => result.status === 'skipped' && result.candidateId)
      .map((result) => String(result.candidateId));
    const failedCandidateIds = results
      .filter((result) => result.status === 'failed' && result.candidateId)
      .map((result) => String(result.candidateId));
    const diagnostics = results.flatMap((result) => result.diagnostics);

    if (importedAssetIds.length > 0) {
      await this.invalidateBrandAssetCaches(brandId, organizationId);
    }

    return {
      brandId,
      diagnostics,
      failedCandidateIds,
      id: brandId,
      importedAssetIds,
      results,
      skippedCandidateIds,
      status:
        importedAssetIds.length === results.length
          ? 'accepted'
          : importedAssetIds.length > 0
            ? 'partial'
            : 'blocked',
    };
  }

  private async importBrandKitAssetCandidate(
    candidate: IBrandKitAssetImportCandidate,
    brandId: string,
    organizationId: string,
    userId: string,
  ): Promise<IBrandKitAssetImportResult> {
    const candidateId = candidate.candidateId;
    const validation = this.validateBrandKitAssetCandidate(candidate);

    if (validation.diagnostics.length > 0) {
      return {
        candidateId,
        diagnostics: validation.diagnostics,
        role: candidate.role,
        status: 'failed',
      };
    }

    const sourceUrl = validation.url.href;
    const category = PRISMA_ASSET_CATEGORY_BY_ROLE[candidate.role];
    const referenceCategory =
      candidate.role === 'reference'
        ? (candidate.referenceCategory ?? ReferenceImageCategory.STYLE)
        : undefined;
    const conflict = await this.resolveBrandKitImportConflict(
      candidate,
      brandId,
      organizationId,
      sourceUrl,
      category,
      referenceCategory,
    );
    if (conflict) {
      return conflict;
    }

    const asset = await this.prisma.asset.create({
      data: {
        category,
        // A scanned logo or banner lands in the default slot: the primary
        // logo or the master banner. Variants are the owner's call.
        ...(candidate.role === 'reference'
          ? {}
          : { kitSlot: BRAND_KIT_DEFAULT_SLOT_BY_ROLE[candidate.role] }),
        displayName: candidate.label,
        mimeType: validation.mimeType,
        origin: sourceUrl,
        originalFileName: this.readStoredFileName(
          validation.url,
          validation.isSvg,
        ),
        parentBrandId: brandId,
        parentOrgId: organizationId,
        parentType: 'BRAND' as Prisma.AssetCreateInput['parentType'],
        referenceCategory,
        residency: 'cloud',
        uploadPolicy: 'brand_kit_import',
        userId,
      } satisfies Prisma.AssetUncheckedCreateInput,
    });

    try {
      const uploadMeta = await this.filesClientService.uploadToS3(
        asset.id,
        ASSET_UPLOAD_TYPE_BY_ROLE[candidate.role],
        {
          type: FileInputType.URL,
          url: this.resolveFetchUrl(sourceUrl),
        },
      );

      if (
        typeof uploadMeta.size === 'number' &&
        uploadMeta.size > BRAND_KIT_IMPORT_MAX_BYTES
      ) {
        await this.markImportedAssetDeleted(asset.id);
        return {
          candidateId,
          diagnostics: [
            this.createBrandKitImportDiagnostic(
              'brand_kit_asset_too_large',
              `Imported asset exceeds the ${BRAND_KIT_IMPORT_MAX_BYTES / (1024 * 1024)}MB brand kit limit.`,
              'error',
            ),
          ],
          role: candidate.role,
          status: 'failed',
        };
      }

      const publicUrl =
        typeof uploadMeta.publicUrl === 'string'
          ? uploadMeta.publicUrl
          : this.buildImportedAssetUrl(asset.id, candidate.role);

      await this.prisma.asset.update({
        where: { id: asset.id },
        data: {
          cloudObjectKey: `${ASSET_UPLOAD_TYPE_BY_ROLE[candidate.role]}/${asset.id}`,
          mimeType: validation.mimeType,
          sizeBytes:
            typeof uploadMeta.size === 'number' ? uploadMeta.size : undefined,
        },
      });

      if (candidate.replaceExisting) {
        await this.softDeleteReplacedBrandAssets(
          brandId,
          organizationId,
          candidate.role,
          asset.id,
        );
      }

      return {
        assetId: asset.id,
        candidateId,
        diagnostics: [],
        referenceCategory,
        role: candidate.role,
        status: 'imported',
        url: publicUrl,
      };
    } catch (error: unknown) {
      await this.markImportedAssetDeleted(asset.id);
      const message =
        error instanceof Error ? error.message : 'Remote asset import failed';
      return {
        candidateId,
        diagnostics: [
          this.createBrandKitImportDiagnostic(
            'brand_kit_asset_import_failed',
            message,
            'error',
          ),
        ],
        role: candidate.role,
        status: 'failed',
      };
    }
  }

  /**
   * The URL the files service downloads from. `sourceUrl` stays the stable
   * identity (stored as `origin`, used for de-duplication); only the fetch is
   * signed, and only for our own mirrored social avatars, which a private CDN
   * rejects unsigned. Other CDN paths are tenant media and are never signed
   * for a caller-supplied URL.
   */
  private resolveFetchUrl(sourceUrl: string): string {
    if (!this.configService.isAuthorizedMediaDeliveryEnabled) return sourceUrl;
    const fetchUrl = projectSocialAvatarUrls(sourceUrl, (url) =>
      signCdnUrl(url, this.configService.mediaUrlConfig),
    );
    if (typeof fetchUrl !== 'string') {
      throw new Error('Could not sign the social avatar URL for import');
    }
    return fetchUrl;
  }

  private async resolveBrandKitImportConflict(
    candidate: IBrandKitAssetImportCandidate,
    brandId: string,
    organizationId: string,
    sourceUrl: string,
    category: Prisma.AssetCreateInput['category'],
    referenceCategory: ReferenceImageCategory | undefined,
  ): Promise<IBrandKitAssetImportResult | null> {
    const candidateId = candidate.candidateId;
    const existing = await this.prisma.asset.findFirst({
      where: {
        category,
        isDeleted: false,
        origin: sourceUrl,
        parentBrandId: brandId,
        parentOrgId: organizationId,
        parentType: 'BRAND' as Prisma.AssetCreateInput['parentType'],
      },
      select: { id: true, referenceCategory: true },
    });

    if (existing) {
      const persistedReferenceCategory =
        candidate.role === 'reference'
          ? (candidate.referenceCategory ??
            toReferenceImageCategory(existing.referenceCategory) ??
            referenceCategory)
          : undefined;
      if (
        candidate.role === 'reference' &&
        existing.referenceCategory !== persistedReferenceCategory
      ) {
        await this.prisma.asset.updateMany({
          data: { referenceCategory: persistedReferenceCategory },
          where: {
            id: existing.id,
            isDeleted: false,
            parentBrandId: brandId,
            parentOrgId: organizationId,
          },
        });
      }
      return {
        assetId: existing.id,
        candidateId,
        diagnostics: [
          this.createBrandKitImportDiagnostic(
            'brand_kit_asset_already_imported',
            `${candidate.role} candidate was already imported.`,
            'info',
          ),
        ],
        referenceCategory: persistedReferenceCategory,
        role: candidate.role,
        status: 'skipped',
        url: this.buildImportedAssetUrl(existing.id, candidate.role),
      };
    }

    const hasExistingPrimary =
      candidate.role !== 'reference'
        ? await this.hasExistingBrandAsset(
            brandId,
            organizationId,
            candidate.role,
          )
        : false;

    if (hasExistingPrimary && !candidate.replaceExisting) {
      return {
        candidateId,
        diagnostics: [
          this.createBrandKitImportDiagnostic(
            'brand_kit_asset_existing_preserved',
            `Existing brand ${candidate.role} was preserved. Set replaceExisting to import this candidate.`,
            'warning',
          ),
        ],
        role: candidate.role,
        status: 'skipped',
      };
    }

    return null;
  }

  private validateBrandKitAssetCandidate(
    candidate: IBrandKitAssetImportCandidate,
  ): {
    diagnostics: IBrandKitDiagnostic[];
    isSvg: boolean;
    mimeType?: string;
    url: URL;
  } {
    const diagnostics: IBrandKitDiagnostic[] = [];
    const rawUrl = candidate.url ?? candidate.sourceUrl;
    let parsedUrl: URL | undefined;

    if (candidate.role !== 'reference' && candidate.referenceCategory) {
      diagnostics.push(
        this.createBrandKitImportDiagnostic(
          'brand_kit_asset_reference_category_requires_reference_role',
          'referenceCategory is only valid for reference assets.',
          'error',
        ),
      );
    }

    if (!rawUrl) {
      diagnostics.push(
        this.createBrandKitImportDiagnostic(
          'brand_kit_asset_missing_url',
          'Asset candidate requires a URL.',
          'error',
        ),
      );
    } else {
      try {
        parsedUrl = new URL(rawUrl);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
          diagnostics.push(
            this.createBrandKitImportDiagnostic(
              'brand_kit_asset_invalid_protocol',
              'Asset candidate URL must use http or https.',
              'error',
            ),
          );
        } else {
          assertUrlNotPrivate(parsedUrl.href);
        }
      } catch (error: unknown) {
        const message =
          error instanceof Error
            ? error.message
            : 'Invalid asset candidate URL';
        diagnostics.push(
          this.createBrandKitImportDiagnostic(
            'brand_kit_asset_invalid_url',
            message,
            'error',
          ),
        );
      }
    }

    const normalizedMimeType = candidate.mimeType?.trim().toLowerCase();
    if (
      normalizedMimeType &&
      !BRAND_KIT_ALLOWED_MIME_TYPES.has(normalizedMimeType)
    ) {
      diagnostics.push(
        this.createBrandKitImportDiagnostic(
          'brand_kit_asset_unsupported_content_type',
          `${normalizedMimeType} is not supported for brand kit assets.`,
          'error',
        ),
      );
    }

    if (!normalizedMimeType && parsedUrl) {
      const extension = this.readExtension(parsedUrl);
      if (!BRAND_KIT_ALLOWED_EXTENSIONS.has(extension)) {
        diagnostics.push(
          this.createBrandKitImportDiagnostic(
            'brand_kit_asset_unknown_content_type',
            'Asset candidate must include a supported image MIME type or file extension.',
            'error',
          ),
        );
      }
    }

    const isSvg =
      normalizedMimeType === SVG_MIME_TYPE ||
      (!normalizedMimeType &&
        parsedUrl !== undefined &&
        this.readExtension(parsedUrl) === SVG_EXTENSION);

    return {
      diagnostics,
      isSvg,
      mimeType: isSvg ? SVG_STORED_MIME_TYPE : normalizedMimeType,
      url: parsedUrl ?? new URL('https://invalid.example'),
    };
  }

  private async hasExistingBrandAsset(
    brandId: string,
    organizationId: string,
    role: Exclude<BrandKitAssetRole, 'reference'>,
  ): Promise<boolean> {
    const existing = await this.prisma.asset.findFirst({
      select: { id: true },
      where: {
        category: PRISMA_ASSET_CATEGORY_BY_ROLE[role],
        isDeleted: false,
        // Only the default slot conflicts: an import never replaces a logo
        // variant or platform image.
        OR: [
          { kitSlot: BRAND_KIT_DEFAULT_SLOT_BY_ROLE[role] },
          { kitSlot: null },
        ],
        parentBrandId: brandId,
        parentOrgId: organizationId,
        parentType: 'BRAND' as Prisma.AssetCreateInput['parentType'],
      },
    });

    return Boolean(existing);
  }

  private async softDeleteReplacedBrandAssets(
    brandId: string,
    organizationId: string,
    role: BrandKitAssetRole,
    keepAssetId: string,
  ): Promise<void> {
    await this.prisma.asset.updateMany({
      where: {
        category: PRISMA_ASSET_CATEGORY_BY_ROLE[role],
        id: { not: keepAssetId },
        isDeleted: false,
        parentBrandId: brandId,
        parentOrgId: organizationId,
        parentType: 'BRAND' as Prisma.AssetCreateInput['parentType'],
        // An import fills the default slot, so it leaves other logo variants
        // and platform images in place.
        ...(role === 'reference'
          ? {}
          : {
              OR: [
                { kitSlot: BRAND_KIT_DEFAULT_SLOT_BY_ROLE[role] },
                { kitSlot: null },
              ],
            }),
      },
      data: { isDeleted: true },
    });
  }

  private async markImportedAssetDeleted(assetId: string): Promise<void> {
    await this.prisma.asset.update({
      where: { id: assetId },
      data: { isDeleted: true },
    });
  }

  private async invalidateBrandAssetCaches(
    brandId: string,
    organizationId: string,
  ): Promise<void> {
    await this.cacheInvalidationService.invalidate(
      CACHE_PATTERNS.BRANDS_SINGLE(brandId),
      CACHE_PATTERNS.BRANDS_LIST(organizationId),
      `brand:${brandId}`,
      `brand-assets:${organizationId}:${brandId}`,
    );
    // The assembled agent context caches the resolved assets, so a freshly
    // imported logo must not wait out the 5-minute TTL before it reaches a
    // prompt. The org-scoped tag covers every brand-ctx variant (per-brand
    // + `selected`), registered at set time by AgentContextAssemblyService.
    await this.cacheInvalidationService.invalidateByTags([
      CACHE_TAGS.BRANDS,
      SCOPED_CACHE_TAGS.BRAND_CONTEXT(organizationId),
      'assets',
      'links',
      'public',
    ]);
  }

  private createBrandKitImportDiagnostic(
    code: string,
    message: string,
    severity: IBrandKitDiagnostic['severity'],
  ): IBrandKitDiagnostic {
    return { code, message, severity };
  }

  private buildImportedAssetUrl(
    assetId: string,
    role: BrandKitAssetRole,
  ): string {
    return `/${ASSET_UPLOAD_TYPE_BY_ROLE[role]}/${assetId}`;
  }

  /**
   * Absolute CDN URL for a stored brand asset.
   *
   * `cloudObjectKey` is the authoritative S3 key when the upload completed;
   * `{uploadType}/{assetId}` is the same shape this service writes and is the
   * fallback for rows created before the key was recorded. Absolute — unlike
   * `buildImportedAssetUrl`'s relative form — because the consumers are LLM
   * prompts and generation nodes that must fetch it without a page origin.
   */
  private buildBrandAssetCdnUrl(
    assetId: string,
    role: BrandKitAssetRole,
    cloudObjectKey?: string | null,
  ): string {
    const objectKey =
      cloudObjectKey?.trim() || `${ASSET_UPLOAD_TYPE_BY_ROLE[role]}/${assetId}`;
    const cdnBase = this.configService.cdnUrl.replace(
      TRAILING_SLASHES_PATTERN,
      '',
    );

    return `${cdnBase}/${objectKey.replace(LEADING_SLASHES_PATTERN, '')}`;
  }

  private toResolvedBrandKitAsset(
    asset: BrandKitAssetFields,
    role: BrandKitAssetRole,
  ): IBrandKitResolvedAsset {
    return {
      id: asset.id,
      label: asset.displayName ?? undefined,
      mimeType: asset.mimeType ?? undefined,
      referenceCategory: asset.referenceCategory ?? undefined,
      role,
      ...(role === 'reference' ? {} : { slot: toBrandKitSlot(asset.kitSlot) }),
      url: this.buildBrandAssetCdnUrl(asset.id, role, asset.cloudObjectKey),
    };
  }

  private readExtension(url: URL): string {
    const pathname = url.pathname.toLowerCase();
    const extensionStart = pathname.lastIndexOf('.');
    return extensionStart >= 0 ? pathname.slice(extensionStart) : '';
  }

  private readStoredFileName(url: URL, isSvg: boolean): string | undefined {
    const filename = this.readFileName(url);
    if (!filename || !isSvg) {
      return filename;
    }
    return filename.toLowerCase().endsWith(SVG_EXTENSION)
      ? `${filename.slice(0, -SVG_EXTENSION.length)}${SVG_STORED_EXTENSION}`
      : filename;
  }

  private readFileName(url: URL): string | undefined {
    const filename = url.pathname.split('/').filter(Boolean).at(-1);
    return filename ? decodeURIComponent(filename).slice(0, 180) : undefined;
  }
}
