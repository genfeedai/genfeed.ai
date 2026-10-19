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
import type {
  BrandGenerationRulesV1,
  BrandIdentitySnapshotV1,
} from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
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
const provisionalContent = savedContent.extend({
  generationRules: brandGenerationRulesV1Schema.optional(),
});
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
const DRAFT_FIELDS_EVIDENCE_ID = 'draft_fields';

function draftString(
  fields: z.infer<typeof provisionalContent>['fields'],
  key: string,
): string | undefined {
  const value = fields[key]?.currentValue;
  return typeof value === 'string' && value.trim().length > 0
    ? value
    : undefined;
}

/**
 * A draft without saved generation rules (for example a website scan) still
 * has a palette and font in its fields. Those become non-blocking style rules;
 * nothing here ever requires a hard check.
 */
function synthesizeProvisionalRules(
  fields: z.infer<typeof provisionalContent>['fields'],
): BrandGenerationRulesV1 {
  const evidenceIds = [DRAFT_FIELDS_EVIDENCE_ID];
  const palette = (
    [
      ['primaryColor', 'palette_primary', 'Primary'],
      ['secondaryColor', 'palette_secondary', 'Secondary'],
      ['backgroundColor', 'palette_background', 'Background'],
    ] as const
  ).flatMap(([key, id, usage]) => {
    const color = draftString(fields, key);
    return color && HEX_COLOR.test(color)
      ? [
          {
            color: color.toUpperCase(),
            evidenceIds,
            id,
            required: false,
            usage,
          },
        ]
      : [];
  });
  const family = draftString(fields, 'fontFamily');
  return {
    assets: [],
    avoid: [],
    evidence: [
      {
        id: DRAFT_FIELDS_EVIDENCE_ID,
        label: 'Draft brand kit fields',
        sourceType: 'system',
      },
    ],
    examples: [],
    facts: [],
    mandatory: [],
    palette,
    schemaVersion: 1,
    typography: family
      ? [
          {
            availability: 'unknown',
            evidenceIds,
            family: family.slice(0, 512),
            id: 'type_body',
            required: false,
            role: 'body',
            style: 'normal',
            weight: 400,
          },
        ]
      : [],
  };
}

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
    // An approval saved without generation rules (brand-kit scans and imports
    // that predate rules) was never rules-reviewed and carries no review hash.
    // Its approved fields still define the brand, so it gets the same
    // non-blocking style rules a draft does instead of failing integrity.
    const content = (
      revision.generationRulesReviewHash === null
        ? provisionalContent
        : savedContent
    ).parse(revision.content);
    if (
      content.brandId !== revision.brandId ||
      content.organizationId !== revision.organizationId
    )
      throw new Error('Invalid reviewed identity');
    if (content.generationRules === undefined) {
      return buildIdentitySnapshot(
        revision,
        content,
        synthesizeProvisionalRules(content.fields),
        'approved',
        resolvedAt,
      );
    }
    if (
      hashBrandGenerationRulesReviewV1(content.generationRules) !==
      revision.generationRulesReviewHash
    )
      throw new Error('Invalid reviewed identity');
    return buildIdentitySnapshot(
      revision,
      content,
      content.generationRules,
      'approved',
      resolvedAt,
    );
  } catch {
    throw new ConflictException('brand_identity_integrity_failed');
  }
}

function buildIdentitySnapshot(
  revision: BrandOsRevision,
  content: { fields: z.infer<typeof savedContent>['fields'] },
  generationRules: BrandGenerationRulesV1,
  approval: 'approved' | 'provisional',
  resolvedAt: string,
): BrandIdentitySnapshotV1 {
  const value = (key: string) => content.fields[key]?.currentValue;
  const snapshot = {
    schemaVersion: 1 as const,
    organizationId: revision.organizationId,
    brandId: revision.brandId,
    revisionId: revision.id,
    revisionVersion: revision.version,
    approval,
    resolvedAt,
    identity: {
      name: value('label'),
      ...(value('description') === undefined
        ? {}
        : { description: value('description') }),
    },
    voice: {
      ...(value('voiceTone') === undefined ? {} : { tone: value('voiceTone') }),
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
    generationRules,
    diagnostics: [],
  };
  // Validate canonical bounds and types before hashing; never stringify/filter saved values.
  const parsed = brandIdentitySnapshotV1Schema.parse({
    ...snapshot,
    contentHash: `sha256:${'0'.repeat(64)}`,
  });
  return { ...parsed, contentHash: hashBrandIdentitySnapshotV1(parsed) };
}

/**
 * Projects a DRAFT revision for provisional generation. The result is bound to
 * the exact revision id, version and content hash and is never approved: it
 * carries no approval authority and cannot reach a ready or compliant state.
 */
export function projectProvisionalBrandIdentitySnapshot(
  revision: BrandOsRevision,
  resolvedAt: string,
): BrandIdentitySnapshotV1 {
  try {
    if (revision.status !== BrandOsRevisionStatus.DRAFT || revision.isDeleted)
      throw new Error('Invalid draft');
    const content = provisionalContent.parse(revision.content);
    if (
      content.brandId !== revision.brandId ||
      content.organizationId !== revision.organizationId
    )
      throw new Error('Invalid draft scope');
    return buildIdentitySnapshot(
      revision,
      content,
      content.generationRules ?? synthesizeProvisionalRules(content.fields),
      'provisional',
      resolvedAt,
    );
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
