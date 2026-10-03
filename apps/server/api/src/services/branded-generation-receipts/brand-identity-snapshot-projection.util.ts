import { FONT_UPLOAD_MAX_BYTES } from '@api/collections/brands/utils/brand-font-upload.util';
import {
  hashBrandGenerationRulesReviewV1,
  hashBrandIdentitySnapshotV1,
} from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import {
  brandGenerationRulesV1Schema,
  brandIdentitySnapshotV1Schema,
} from '@genfeedai/contracts/api-types/contracts';
import { learningContractIdSchema } from '@genfeedai/contracts/api-types/contracts/content-learning-generation.contract';
import type { BrandIdentitySnapshotV1 } from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import {
  type Asset,
  type BrandOsRevision,
  BrandOsRevisionStatus,
} from '@genfeedai/prisma';
import { assertSafeObjectKey } from '@genfeedai/storage';
import { ConflictException } from '@nestjs/common';
import { z } from 'zod';

const savedContent = z
  .object({
    brandId: learningContractIdSchema,
    organizationId: learningContractIdSchema,
    fields: z.record(
      z.string(),
      z.object({ currentValue: z.unknown().optional() }).passthrough(),
    ),
    generationRules: brandGenerationRulesV1Schema,
  })
  .passthrough();
export function projectApprovedBrandIdentitySnapshot(
  revision: BrandOsRevision,
  resolvedAt: string,
): BrandIdentitySnapshotV1 {
  try {
    if (
      revision.status !== BrandOsRevisionStatus.APPROVED ||
      revision.isDeleted ||
      !learningContractIdSchema.safeParse(revision.approvedById).success ||
      !(revision.approvedAt instanceof Date) ||
      !Number.isFinite(revision.approvedAt.getTime())
    )
      throw new Error('Invalid approval');
    const content = savedContent.parse(revision.content);
    if (
      content.brandId !== revision.brandId ||
      content.organizationId !== revision.organizationId ||
      hashBrandGenerationRulesReviewV1(content.generationRules) !==
        revision.generationRulesReviewHash
    )
      throw new Error('Invalid reviewed identity');
    const value = (key: string) => content.fields[key]?.currentValue;
    const snapshot = {
      schemaVersion: 1 as const,
      organizationId: revision.organizationId,
      brandId: revision.brandId,
      revisionId: revision.id,
      revisionVersion: revision.version,
      approval: 'approved' as const,
      resolvedAt,
      identity: {
        name: value('label'),
        ...(value('description') === undefined
          ? {}
          : { description: value('description') }),
      },
      voice: {
        ...(value('voiceTone') === undefined
          ? {}
          : { tone: value('voiceTone') }),
        ...(value('voiceStyle') === undefined
          ? {}
          : { style: value('voiceStyle') }),
        audience:
          value('voiceAudience') === undefined ? [] : value('voiceAudience'),
        values: value('voiceValues') === undefined ? [] : value('voiceValues'),
        messagingPillars:
          value('voiceMessagingPillars') === undefined
            ? []
            : value('voiceMessagingPillars'),
        avoid:
          value('voiceDoNotSoundLike') === undefined
            ? []
            : value('voiceDoNotSoundLike'),
        ...(value('voiceSampleOutput') === undefined
          ? {}
          : { sample: value('voiceSampleOutput') }),
        ...(value('promptGuidelines') === undefined
          ? {}
          : { guidelines: value('promptGuidelines') }),
      },
      generationRules: content.generationRules,
      diagnostics: [],
    };
    // Validate canonical bounds and types before hashing; never stringify/filter saved values.
    const parsed = brandIdentitySnapshotV1Schema.parse({
      ...snapshot,
      contentHash: `sha256:${'0'.repeat(64)}`,
    });
    return { ...parsed, contentHash: hashBrandIdentitySnapshotV1(parsed) };
  } catch {
    throw new ConflictException('brand_identity_integrity_failed');
  }
}

export function assertBrandIdentityAssetsAvailable(
  snapshot: BrandIdentitySnapshotV1,
  assets: Asset[],
): void {
  for (const reference of snapshot.generationRules.assets) {
    const asset = assets.find((row) => row.id === reference.assetId);
    const category =
      reference.role === 'logo'
        ? 'LOGO'
        : reference.role === 'banner'
          ? 'BANNER'
          : reference.role === 'font'
            ? 'FONT'
            : 'REFERENCE';
    if (
      !asset ||
      asset.isDeleted ||
      asset.parentType !== 'BRAND' ||
      asset.parentOrgId !== snapshot.organizationId ||
      asset.parentBrandId !== snapshot.brandId ||
      asset.category !== category ||
      (reference.role === 'product' && asset.referenceCategory !== 'PRODUCT') ||
      (reference.role === 'style' && asset.referenceCategory !== 'STYLE') ||
      !reference.contentHash ||
      !reference.mimeType ||
      !asset.sha256 ||
      !/^[a-f0-9]{64}$/.test(asset.sha256) ||
      reference.contentHash !== `sha256:${asset.sha256}` ||
      reference.mimeType !== asset.mimeType ||
      !Number.isInteger(asset.sizeBytes) ||
      (asset.sizeBytes ?? 0) <= 0
    )
      throw new ConflictException('brand_identity_asset_unavailable');
    if (reference.role === 'font') {
      try {
        if (
          asset.mimeType !== 'font/woff2' ||
          (asset.sizeBytes ?? 0) < 48 ||
          (asset.sizeBytes ?? 0) > FONT_UPLOAD_MAX_BYTES ||
          !asset.cloudObjectKey ||
          (asset.displayName !== null &&
            (!asset.displayName || asset.displayName.length > 256)) ||
          (asset.originalFileName !== null &&
            (!asset.originalFileName ||
              Array.from(asset.originalFileName).length > 256))
        )
          throw new Error('Unavailable font');
        assertSafeObjectKey(
          asset.cloudObjectKey,
          () => new Error('Unavailable font'),
        );
      } catch {
        throw new ConflictException('brand_identity_asset_unavailable');
      }
    }
  }
}
