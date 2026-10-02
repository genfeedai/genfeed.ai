import {
  assertBrandIdentityAssetsAvailable,
  projectApprovedBrandIdentitySnapshot,
} from '@api/services/branded-generation-receipts/brand-identity-snapshot-projection.util';
import { hashBrandGenerationRulesReviewV1 } from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import type { BrandGenerationRulesV1 } from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import {
  type Asset,
  type BrandOsRevision,
  BrandOsRevisionStatus,
  toPrismaJson,
} from '@genfeedai/prisma';
import { describe, expect, it } from 'vitest';

const time = '2026-10-02T00:00:00.000Z';
const hash = `sha256:${'a'.repeat(64)}`;
function rules(): BrandGenerationRulesV1 {
  return {
    schemaVersion: 1,
    evidence: [
      {
        id: 'manual',
        sourceType: 'manual',
        label: 'Reviewed',
        excerpt: '  café\n東京  ',
      },
    ],
    facts: [],
    palette: [],
    typography: [
      {
        id: 'font-rule',
        role: 'heading',
        family: '  Café Sans  ',
        weight: 400,
        style: 'normal',
        availability: 'owned_asset',
        required: true,
        fontAssetReferenceId: 'font-ref',
        evidenceIds: ['manual'],
        appliesToMediaKinds: ['image', 'video'],
      },
    ],
    mandatory: [
      {
        id: 'exact',
        text: '  Exact\n東京  ',
        match: 'literal',
        required: true,
        evidenceIds: ['manual'],
        appliesToMediaKinds: ['text', 'image'],
      },
    ],
    avoid: [],
    examples: [],
    assets: [
      {
        id: 'font-ref',
        assetId: 'font',
        role: 'font',
        contentHash: hash,
        mimeType: 'font/woff2',
        required: true,
        evidenceIds: ['manual'],
      },
    ],
    approvedLiterals: [
      {
        id: 'literal:copy',
        text: '  Café  ',
        kind: 'approved_copy',
        evidenceIds: ['manual'],
      },
    ],
  };
}
function revision(fields: Record<string, unknown> = {}): BrandOsRevision {
  const generationRules = rules();
  return {
    id: 'revision',
    brandId: 'brand',
    organizationId: 'org',
    version: 1,
    status: BrandOsRevisionStatus.APPROVED,
    content: toPrismaJson({
      brandId: 'brand',
      organizationId: 'org',
      fields: {
        label: { currentValue: '  Café 東京  ', proposedValue: 'WRONG' },
        voiceTone: { currentValue: '  Warm\nprecise  ' },
        voiceAudience: { currentValue: ['  Authors  ', '東京'] },
        promptGuidelines: { currentValue: '  exact  ' },
        ...fields,
      },
      generationRules,
    }),
    generationRulesReviewHash:
      hashBrandGenerationRulesReviewV1(generationRules),
    exportSchemaVersion: '1',
    sourcePreviewTokenHash: null,
    approvedById: 'approver',
    approvedAt: new Date(time),
    createdAt: new Date(time),
    updatedAt: new Date(time),
    isDeleted: false,
  };
}
function font(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'font',
    userId: 'actor',
    parentType: 'BRAND',
    parentOrgId: 'org',
    parentBrandId: 'brand',
    parentIngredientId: null,
    parentArticleId: null,
    category: 'FONT',
    referenceCategory: null,
    externalId: null,
    localAssetId: null,
    cloudObjectKey: 'brands/brand/font.woff2',
    sha256: 'a'.repeat(64),
    sizeBytes: 48,
    mimeType: 'font/woff2',
    kind: null,
    origin: null,
    residency: null,
    uploadPolicy: null,
    originalFileName: 'Café.woff2',
    displayName: 'Café',
    isDeleted: false,
    createdAt: new Date(time),
    updatedAt: new Date(time),
    ...overrides,
  };
}
describe('strict saved approved identity projection', () => {
  it('maps every saved current field and omits optional proposed-only fields instead of inventing scalar defaults', () => {
    const result = projectApprovedBrandIdentitySnapshot(
      revision({
        description: { currentValue: 'Saved description' },
        voiceStyle: { currentValue: 'Saved style' },
        voiceValues: { currentValue: ['Saved values'] },
        voiceMessagingPillars: { currentValue: ['Saved pillars'] },
        voiceDoNotSoundLike: { currentValue: ['Saved avoid'] },
        voiceSampleOutput: { currentValue: 'Saved sample' },
      }),
      time,
    );
    expect(result.identity.description).toBe('Saved description');
    expect(result.voice).toMatchObject({
      style: 'Saved style',
      values: ['Saved values'],
      messagingPillars: ['Saved pillars'],
      avoid: ['Saved avoid'],
      sample: 'Saved sample',
    });
    const absent = projectApprovedBrandIdentitySnapshot(
      revision({
        description: { proposedValue: 'Wrong' },
        voiceStyle: { proposedValue: 'Wrong' },
        voiceSampleOutput: { proposedValue: 'Wrong' },
      }),
      time,
    );
    expect(absent.identity).not.toHaveProperty('description');
    expect(absent.voice).not.toHaveProperty('style');
    expect(absent.voice).not.toHaveProperty('sample');
  });
  it('preserves exact current authored Unicode, whitespace, literals, evidence, media and neutral font availability without mutating input', () => {
    const row = revision();
    const before = structuredClone(row);
    const result = projectApprovedBrandIdentitySnapshot(row, time);
    expect(result.identity).toEqual({ name: '  Café 東京  ' });
    expect(result.voice).toEqual({
      tone: '  Warm\nprecise  ',
      audience: ['  Authors  ', '東京'],
      values: [],
      messagingPillars: [],
      avoid: [],
      guidelines: '  exact  ',
    });
    expect(result.generationRules).toEqual(rules());
    expect(result.diagnostics).toEqual([]);
    expect(row).toEqual(before);
    expect(JSON.stringify(result)).not.toContain('WRONG');
    expect(result.identity).not.toHaveProperty('positioning');
  });
  it('hashes deterministically across resolution timestamps without normalizing authored bytes', () => {
    const first = projectApprovedBrandIdentitySnapshot(revision(), time);
    const later = projectApprovedBrandIdentitySnapshot(
      revision(),
      '2026-10-03T00:00:00.000Z',
    );
    expect(later.contentHash).toBe(first.contentHash);
    expect(later.resolvedAt).not.toBe(first.resolvedAt);
    expect(
      projectApprovedBrandIdentitySnapshot(
        revision({ label: { currentValue: 'Café 東京' } }),
        time,
      ).contentHash,
    ).not.toBe(first.contentHash);
  });
  it.each([
    { label: { proposedValue: 'Mutable fallback' } },
    { description: { currentValue: null } },
    { voiceTone: { currentValue: 3 } },
    { voiceAudience: { currentValue: 'all' } },
    { voiceValues: { currentValue: ['valid', 7] } },
    { voiceMessagingPillars: { currentValue: null } },
    { voiceDoNotSoundLike: { currentValue: [false] } },
    { voiceSampleOutput: { currentValue: {} } },
    { promptGuidelines: { currentValue: [] } },
    { label: null },
  ])(
    'rejects malformed present saved fields with no filtering/stringifying/proposed fallback %j',
    (fields) => {
      expect(() =>
        projectApprovedBrandIdentitySnapshot(revision(fields), time),
      ).toThrow('brand_identity_integrity_failed');
    },
  );
  it.each([
    { approvedById: null },
    { approvedById: 'bad\u0080id' },
    { approvedAt: null },
    { approvedAt: new Date('invalid') },
    { generationRulesReviewHash: null },
    { generationRulesReviewHash: `sha256:${'b'.repeat(64)}` },
    { status: BrandOsRevisionStatus.DRAFT },
    { isDeleted: true },
    { content: toPrismaJson({ fields: {} }) },
  ])('rejects missing approval or reviewed integrity %j', (patch) => {
    expect(() =>
      projectApprovedBrandIdentitySnapshot({ ...revision(), ...patch }, time),
    ).toThrow('brand_identity_integrity_failed');
  });
  it('accepts admitted font metadata without asserting rendering or changing the reviewed availability', () => {
    const snapshot = projectApprovedBrandIdentitySnapshot(revision(), time);
    expect(() =>
      assertBrandIdentityAssetsAvailable(snapshot, [font()]),
    ).not.toThrow();
    expect(snapshot.generationRules.typography[0].availability).toBe(
      'owned_asset',
    );
    expect(snapshot.diagnostics).toEqual([]);
  });
  it.each([
    { parentType: 'ORGANIZATION' as const },
    { parentOrgId: 'foreign' },
    { parentBrandId: 'foreign' },
    { isDeleted: true },
    { category: 'LOGO' as const },
    { sha256: null },
    { sha256: 'b'.repeat(64) },
    { sha256: 'A'.repeat(64) },
    { mimeType: null },
    { mimeType: 'font/ttf' },
    { sizeBytes: null },
    { sizeBytes: 47 },
    { sizeBytes: 4194305 },
    { cloudObjectKey: '../private' },
    { cloudObjectKey: null },
    { displayName: '' },
    { originalFileName: 'x'.repeat(257) },
  ])(
    'fails closed on unavailable or foreign font bytes/admission metadata %j',
    (patch) => {
      expect(() =>
        assertBrandIdentityAssetsAvailable(
          projectApprovedBrandIdentitySnapshot(revision(), time),
          [font(patch)],
        ),
      ).toThrow('brand_identity_asset_unavailable');
    },
  );
  it('does not invent approved byte evidence from current asset metadata or accept missing rows', () => {
    const snapshot = projectApprovedBrandIdentitySnapshot(revision(), time);
    expect(() => assertBrandIdentityAssetsAvailable(snapshot, [])).toThrow(
      'brand_identity_asset_unavailable',
    );
    delete snapshot.generationRules.assets[0].contentHash;
    expect(() =>
      assertBrandIdentityAssetsAvailable(snapshot, [font()]),
    ).toThrow('brand_identity_asset_unavailable');
  });
  it.each([
    ['logo', 'LOGO', null],
    ['banner', 'BANNER', null],
    ['product', 'REFERENCE', 'PRODUCT'],
    ['style', 'REFERENCE', 'STYLE'],
  ] as const)(
    'enforces scoped category and reference role for %s assets',
    (role, category, referenceCategory) => {
      const snapshot = projectApprovedBrandIdentitySnapshot(revision(), time);
      snapshot.generationRules.assets = [
        {
          id: 'ref',
          assetId: 'asset',
          role,
          contentHash: hash,
          mimeType: 'image/png',
          required: true,
          evidenceIds: ['manual'],
        },
      ];
      const asset = font({
        id: 'asset',
        category,
        referenceCategory,
        mimeType: 'image/png',
        cloudObjectKey: null,
      });
      expect(() =>
        assertBrandIdentityAssetsAvailable(snapshot, [asset]),
      ).not.toThrow();
      expect(() =>
        assertBrandIdentityAssetsAvailable(snapshot, [
          { ...asset, category: 'FONT' },
        ]),
      ).toThrow('brand_identity_asset_unavailable');
      if (role === 'product' || role === 'style')
        expect(() =>
          assertBrandIdentityAssetsAvailable(snapshot, [
            { ...asset, referenceCategory: null },
          ]),
        ).toThrow('brand_identity_asset_unavailable');
    },
  );
});
