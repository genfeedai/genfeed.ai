import { FileInputType, ReferenceImageCategory } from '@genfeedai/enums';
import type {
  BrandKitAssetRole,
  IBrandKitAssetImportCandidate,
  IBrandKitAssetImportRequest,
  IBrandKitAssetImportResponse,
  IBrandKitAssetImportResult,
  IBrandKitDiagnostic,
  IBrandKitResolvedAsset,
  IBrandKitResolvedAssets,
} from '@genfeedai/interfaces';
import { Prisma } from '@genfeedai/prisma';
import { scopedWhere } from '@genfeedai/server';
import { ConfigService } from '@libs/config/config.service';
import { Injectable } from '@nestjs/common';
import {
  ASSET_UPLOAD_TYPE_BY_ROLE,
  BRAND_KIT_RESOLVED_REFERENCE_LIMIT,
  BRAND_KIT_ROLE_BY_PRISMA_CATEGORY,
  PRISMA_ASSET_CATEGORY_BY_ROLE,
} from '@server/collections/brands/constants/brand-kit-assets.constant';
import type { BrandDocument } from '@server/collections/brands/schemas/brand.schema';
import {
  CACHE_PATTERNS,
  CACHE_TAGS,
  SCOPED_CACHE_TAGS,
} from '@server/common/constants/cache-patterns.constants';
import { CacheInvalidationService } from '@server/common/services/cache-invalidation.service';
import { NotFoundException } from '@server/exceptions/not-found.exception';
import { assertUrlNotPrivate } from '@server/helpers/utils/ssrf/ssrf.util';
import { FilesClientService } from '@server/services/files-microservice/client/files-client.service';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';

const BRAND_KIT_IMPORT_MAX_BYTES = 50 * 1024 * 1024;
const BRAND_KIT_ALLOWED_MIME_TYPES = new Set([
  'image/gif',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);
const BRAND_KIT_ALLOWED_EXTENSIONS = new Set([
  '.gif',
  '.jpeg',
  '.jpg',
  '.png',
  '.webp',
]);

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
  mimeType: true,
  parentBrandId: true,
  referenceCategory: true,
} satisfies Prisma.AssetSelect;
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
  'category' | 'referenceCategory'
> & {
  referenceCategory: ReferenceImageCategory | null;
};
type BrandKitAssetRankedRow = BrandKitAssetFields & {
  category: string;
};
type BrandKitAssetBrandFinder = (
  criteria: Record<string, unknown>,
) => Promise<BrandDocument | null>;

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
   * Each brand resolves at most one logo, one banner and the configured
   * reference limit, so a noisy asset history cannot inflate the authenticated
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
        ranked."mimeType",
        ranked."parentBrandId",
        ranked."referenceCategory"::text AS "referenceCategory"
      FROM (
        SELECT
          categorized."id",
          categorized."category",
          categorized."cloudObjectKey",
          categorized."displayName",
          categorized."mimeType",
          categorized."parentBrandId",
          categorized."referenceCategory",
          ROW_NUMBER() OVER (
            PARTITION BY categorized."parentBrandId", categorized."category"
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
            AND asset."parentBrandId" = ANY(${uniqueBrandIds}::text[])
            AND asset."category" = ANY(${rankedCategories}::"AssetCategory"[])
        ) AS categorized
      ) AS ranked
      WHERE ranked."roleRank" <= CASE
        WHEN ranked."category" = ${referenceCategory}
          THEN ${BRAND_KIT_RESOLVED_REFERENCE_LIMIT}::int
        ELSE 1
      END
      ORDER BY ranked."parentBrandId" ASC, ranked."roleRank" ASC
    `;

    for (const row of rows) {
      const kit = row.parentBrandId
        ? resolved.get(row.parentBrandId)
        : undefined;
      const role = BRAND_KIT_ROLE_BY_PRISMA_CATEGORY.get(row.category);

      if (!kit || !role) {
        continue;
      }

      if (role === 'reference') {
        kit.references.push(this.toResolvedBrandKitAsset(row, role));
        continue;
      }

      kit[role] = this.toResolvedBrandKitAsset(row, role);
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
    const organizationScopes = [...brandIdsByOrganization.entries()]
      .filter(
        ([organizationId, brandIds]) =>
          organizationId.length > 0 && brandIds.length > 0,
      )
      .map(([organizationId, brandIds]) => ({
        parentBrandId: { in: [...brandIds] },
        parentOrgId: organizationId,
      }));

    if (organizationScopes.length === 0) {
      return new Map();
    }

    const assets = await this.prisma.asset.findMany({
      orderBy: { updatedAt: 'desc' },
      select: { cloudObjectKey: true, id: true, parentBrandId: true },
      where: {
        category: PRISMA_ASSET_CATEGORY_BY_ROLE.logo,
        isDeleted: false,
        OR: organizationScopes,
        parentType: 'BRAND' as Prisma.AssetCreateInput['parentType'],
      },
    });

    const logoUrlsByBrandId = new Map<string, string>();
    for (const asset of assets) {
      if (!asset.parentBrandId || logoUrlsByBrandId.has(asset.parentBrandId)) {
        continue;
      }

      logoUrlsByBrandId.set(
        asset.parentBrandId,
        this.buildBrandAssetCdnUrl(asset.id, 'logo', asset.cloudObjectKey),
      );
    }

    return logoUrlsByBrandId;
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
        displayName: candidate.label,
        mimeType: validation.mimeType,
        origin: sourceUrl,
        originalFileName: this.readFileName(validation.url),
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
          url: sourceUrl,
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

    return {
      diagnostics,
      mimeType: normalizedMimeType,
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
    const cdnBase = this.configService.cdnUrl.replace(/\/+$/, '');

    return `${cdnBase}/${objectKey.replace(/^\/+/, '')}`;
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
      url: this.buildBrandAssetCdnUrl(asset.id, role, asset.cloudObjectKey),
    };
  }

  private readExtension(url: URL): string {
    const pathname = url.pathname.toLowerCase();
    const extensionStart = pathname.lastIndexOf('.');
    return extensionStart >= 0 ? pathname.slice(extensionStart) : '';
  }

  private readFileName(url: URL): string | undefined {
    const filename = url.pathname.split('/').filter(Boolean).at(-1);
    return filename ? decodeURIComponent(filename).slice(0, 180) : undefined;
  }
}
