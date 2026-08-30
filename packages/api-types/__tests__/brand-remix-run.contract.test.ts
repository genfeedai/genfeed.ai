import {
  brandRemixExecutionSchema,
  brandRemixOutputSchema,
  brandRemixReadinessSchema,
  brandRemixRunViewSchema,
  createBrandRemixRunSchema,
  pausedMetaCampaignDraftSchema,
  reviseBrandRemixRunSchema,
} from '@api-types/contracts/brand-remix-run.contract';
import { describe, expect, test } from 'vitest';

const imageBrief = {
  fidelityMode: 'guided',
  intent: {
    objective: 'Create an original product-led TikTok visual.',
    subjects: ['Reusable bottle'],
    visualDirection: 'Fast, tactile, creator-shot reveal',
  },
  mediaKind: 'image',
  output: { aspectRatio: '9:16' },
  provenance: [
    { field: 'intent.objective', source: 'performance' },
    { field: 'intent.visualDirection', source: 'brand' },
  ],
  references: [{ assetId: 'ingredient_product_1', role: 'product' }],
  version: 1,
} as const;

describe('brand remix run contract', () => {
  test('models grouped copy variants without inventing a second run contract', () => {
    expect(brandRemixOutputSchema.parse({ count: 3, kind: 'copy' })).toEqual({
      count: 3,
      kind: 'copy',
    });

    expect(
      brandRemixExecutionSchema.parse({
        actualCount: 1,
        generationBrief: {
          ...imageBrief,
          mediaKind: 'text',
          output: {},
          references: [],
        },
        partialReason: '2 outputs were rejected as too similar to the source.',
        requestedCount: 3,
        variants: [
          {
            assetIds: [],
            content: 'A distinct, brand-owned TikTok caption.',
            id: 'variant_copy_1',
            recipeRevision: 2,
            status: 'ready',
          },
        ],
      }),
    ).toMatchObject({
      actualCount: 1,
      partialReason: expect.any(String),
      variants: [
        expect.objectContaining({
          content: 'A distinct, brand-owned TikTok caption.',
        }),
      ],
    });
  });

  test('requires complete immutable lineage for a paused Meta draft', () => {
    const draft = pausedMetaCampaignDraftSchema.parse({
      adAccountId: 'act_123',
      adId: 'ad_1',
      adSetId: 'adset_1',
      campaignId: 'campaign_1',
      credentialId: 'credential_1',
      ingredientId: 'ingredient_1',
      postId: 'post_1',
      recipeRevision: 2,
      recipeVersion: 1,
      replayed: false,
      status: 'PAUSED',
      variantId: 'variant_1',
      workflowExecutionId: 'workflow_execution_1',
      workflowId: 'workflow_1',
    });

    expect(draft.status).toBe('PAUSED');
    expect(draft).toMatchObject({
      ingredientId: 'ingredient_1',
      postId: 'post_1',
      variantId: 'variant_1',
    });
  });

  test('accepts a versioned TikTok trend run with durable semantic references', () => {
    const run = brandRemixRunViewSchema.parse({
      brand: {
        contextMode: 'brand',
        id: 'brand_1',
        name: 'Acme',
      },
      brandId: 'brand_1',
      contract: 'brand-remix-run',
      createdAt: '2026-08-20T10:00:00.000Z',
      draft: {
        fidelityMode: 'guided',
        identity: {},
        intent: {
          hook: 'Reveal the unexpected use before naming the product.',
          objective: 'Create an original product-led TikTok visual.',
          pacing: 'Fast opening, proof, then CTA.',
        },
        output: {
          aspectRatio: '9:16',
          count: 3,
          kind: 'image',
        },
        references: [
          {
            assetId: 'ingredient_product_1',
            role: 'product',
            source: 'explicit',
          },
        ],
        reviewRequired: true,
        target: { kind: 'organic', platform: 'tiktok' },
      },
      execution: {
        actualCount: 0,
        generationBrief: imageBrief,
        requestedCount: 3,
        variants: [],
      },
      id: 'run_1',
      phase: 'prefilled',
      readiness: { issues: [], state: 'ready' },
      recipeVersion: 1,
      revision: 1,
      sourceSnapshot: {
        capturedAt: '2026-08-20T09:55:00.000Z',
        evidence: ['High completion rate'],
        metrics: { engagementRate: 0.08, views: 12_000 },
        pattern: {
          hook: 'Reveal the unexpected use before naming the product.',
          pacing: 'Fast opening, proof, then CTA.',
        },
        platform: 'tiktok',
        selector: {
          kind: 'trend_reference',
          sourceReferenceId: 'trend_ref_1',
          trendId: 'trend_1',
        },
        sourceId: 'trend_ref_1',
        title: 'Unexpected product use reveal',
      },
      status: 'pending',
      updatedAt: '2026-08-20T10:00:00.000Z',
      version: 1,
    });

    expect(run.source).toBeUndefined();
    expect(run.sourceSnapshot.selector.kind).toBe('trend_reference');
    expect(run.draft.references[0]).toEqual({
      assetId: 'ingredient_product_1',
      role: 'product',
      source: 'explicit',
    });
    expect(JSON.stringify(run.draft.references)).not.toMatch(/https?:\/\//);
    expect(run).toMatchObject({
      contract: 'brand-remix-run',
      status: 'pending',
      version: 1,
    });
  });

  test('accepts connected, public, and saved-ad selectors without client creative', () => {
    expect(
      createBrandRemixRunSchema.parse({
        source: {
          adAccountId: 'act_123',
          adId: 'ad_456',
          credentialId: 'credential_1',
          kind: 'connected_ad',
          platform: 'meta',
        },
      }).source,
    ).toEqual({
      adAccountId: 'act_123',
      adId: 'ad_456',
      credentialId: 'credential_1',
      kind: 'connected_ad',
      platform: 'meta',
    });

    expect(
      createBrandRemixRunSchema.parse({
        source: {
          adPerformanceId: 'ad_performance_1',
          kind: 'public_ad',
        },
      }).source.kind,
    ).toBe('public_ad');

    expect(
      createBrandRemixRunSchema.parse({
        source: { kind: 'saved_ad', savedAdId: 'saved_ad_1' },
      }).source,
    ).toEqual({ kind: 'saved_ad', savedAdId: 'saved_ad_1' });
  });

  test('rejects client-supplied source prose, metrics, URLs, and provider identities', () => {
    const result = createBrandRemixRunSchema.safeParse({
      source: {
        caption: 'Copy this winning caption.',
        kind: 'trend_reference',
        metrics: { views: 999_999 },
        sourceReferenceId: 'trend_ref_1',
        sourceUrl: 'https://untrusted.example/source',
        trendId: 'trend_1',
      },
    });

    expect(result.success).toBe(false);

    expect(
      reviseBrandRemixRunSchema.safeParse({
        edits: {
          identity: {
            avatarUrl: 'https://signed.example/avatar?token=secret',
            providerVoiceId: 'external-voice-id',
          },
        },
        expectedRevision: 1,
      }).success,
    ).toBe(false);

    expect(
      reviseBrandRemixRunSchema.safeParse({
        edits: {
          references: [
            {
              assetId: 'https://signed.example/reference?token=secret',
              role: 'product',
            },
          ],
        },
        expectedRevision: 1,
      }).success,
    ).toBe(false);

    expect(
      reviseBrandRemixRunSchema.safeParse({
        edits: {
          references: [
            {
              assetId: 'ingredient_product_1',
              role: 'product',
              source: 'brand_default',
            },
          ],
        },
        expectedRevision: 1,
      }).success,
    ).toBe(false);

    expect(
      reviseBrandRemixRunSchema.safeParse({
        edits: {
          references: [
            {
              assetId: 'ingredient_product_1',
              description: 'Approved product packshot',
              role: 'product',
            },
          ],
        },
        expectedRevision: 1,
      }).success,
    ).toBe(true);
  });

  test('rejects transient URLs from persisted execution briefs', () => {
    expect(
      brandRemixExecutionSchema.safeParse({
        actualCount: 0,
        generationBrief: {
          ...imageBrief,
          references: [
            {
              assetId: 'https://signed.example/reference?token=secret',
              role: 'product',
            },
          ],
        },
        requestedCount: 3,
        variants: [],
      }).success,
    ).toBe(false);
  });

  test('rejects an unversioned view or non-canonical run status', () => {
    expect(
      brandRemixRunViewSchema.safeParse({
        brand: {
          contextMode: 'brand',
          id: 'brand_1',
          name: 'Acme',
        },
        brandId: 'brand_1',
        createdAt: '2026-08-20T10:00:00.000Z',
        draft: {
          fidelityMode: 'guided',
          identity: {},
          intent: { objective: 'Create an original visual.' },
          output: { aspectRatio: '9:16', count: 3, kind: 'image' },
          references: [],
          reviewRequired: true,
          target: { kind: 'organic', platform: 'tiktok' },
        },
        id: 'run_1',
        phase: 'prefilled',
        readiness: { issues: [], state: 'ready' },
        recipeVersion: 1,
        revision: 1,
        source: 'hosted',
        sourceSnapshot: {
          capturedAt: '2026-08-20T09:55:00.000Z',
          evidence: [],
          metrics: {},
          pattern: {},
          platform: 'tiktok',
          selector: {
            kind: 'trend_reference',
            sourceReferenceId: 'trend_ref_1',
            trendId: 'trend_1',
          },
          sourceId: 'trend_ref_1',
          title: 'Product reveal',
        },
        status: 'PENDING',
        updatedAt: '2026-08-20T10:00:00.000Z',
      }).success,
    ).toBe(false);
  });

  test('bounds output counts and requires paired avatar identity', () => {
    const base = {
      edits: {
        output: {
          aspectRatio: '9:16',
          count: 3,
          kind: 'avatar',
        },
      },
      expectedRevision: 1,
    };

    expect(
      reviseBrandRemixRunSchema.safeParse({
        ...base,
        edits: {
          ...base.edits,
          identity: {
            avatarAssetId: 'avatar_1',
            speechVoiceId: 'voice_1',
          },
        },
      }).success,
    ).toBe(true);

    expect(
      reviseBrandRemixRunSchema.safeParse({
        ...base,
        edits: {
          ...base.edits,
          identity: { avatarAssetId: 'avatar_1' },
        },
      }).success,
    ).toBe(false);

    expect(
      reviseBrandRemixRunSchema.safeParse({
        edits: { output: { count: 9 } },
        expectedRevision: 1,
      }).success,
    ).toBe(false);
  });

  test('accepts an actionable blocked state for unsupported strict fidelity', () => {
    expect(
      brandRemixReadinessSchema.parse({
        issues: [
          {
            code: 'unsupported_fidelity',
            field: 'fidelityMode',
            message:
              'Strict fidelity is not supported by the selected generation path. Use Guided fidelity instead.',
            severity: 'blocked',
          },
        ],
        state: 'blocked',
      }),
    ).toMatchObject({
      issues: [{ code: 'unsupported_fidelity' }],
      state: 'blocked',
    });
  });
});
