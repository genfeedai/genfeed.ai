import {
  BrandKitApplySerializer,
  BrandKitAssetImportSerializer,
  BrandKitSerializer,
  BrandOsDraftHandoffSerializer,
  BrandOsPreviewSerializer,
} from '@serializers/server/organizations/brand-kit.serializer';
import { describe, expect, it } from 'vitest';

describe('Brand Kit JSON:API contract', () => {
  const previewDraft = {
    assetCandidates: [],
    brandId: 'preview_synthetic',
    diagnostics: [],
    evidence: [],
    fields: {},
    id: 'preview_synthetic',
    readiness: {
      diagnostics: [],
      missingFields: ['description'],
      requiredFields: ['description'],
      score: 0,
      status: 'missing',
    },
    sourceType: 'manual',
    status: 'missing',
  } as const;

  it('serializes the anonymous handoff without leaking storage or tenant metadata', () => {
    const output = BrandOsPreviewSerializer.serialize({
      draft: previewDraft,
      expiresAt: '2026-08-26T12:30:00.000Z',
      id: 'preview_synthetic',
      organizationId: 'must-not-leak',
      previewToken: 'opaque-token',
      redisKey: 'must-not-leak',
      tokenHash: 'must-not-leak',
    });

    expect(output).toEqual({
      data: {
        attributes: {
          draft: previewDraft,
          expiresAt: '2026-08-26T12:30:00.000Z',
          previewToken: 'opaque-token',
        },
        id: 'preview_synthetic',
        type: 'brand-os-preview',
      },
    });
  });

  it('serializes the tenant-bound handoff without exposing its bearer token', () => {
    const output = BrandOsDraftHandoffSerializer.serialize({
      draft: { ...previewDraft, brandId: 'brand-1', id: 'brand-1' },
      expiresAt: '2026-08-26T12:30:00.000Z',
      id: 'brand-1',
      previewToken: 'must-not-leak',
      status: 'claimed',
      tokenHash: 'must-not-leak',
    });

    expect(output).toEqual({
      data: {
        attributes: {
          draft: { ...previewDraft, brandId: 'brand-1', id: 'brand-1' },
          expiresAt: '2026-08-26T12:30:00.000Z',
          status: 'claimed',
        },
        id: 'brand-1',
        type: 'brand-os-draft-handoff',
      },
    });
  });

  it('serializes the canonical review projection without promoting owner references to relationships', () => {
    const output = BrandKitSerializer.serialize({
      assetCandidates: [
        {
          candidateId: 'logo-candidate',
          role: 'logo',
          sourceType: 'website',
          sourceUrl: 'https://acme.test/logo.png',
        },
      ],
      brandId: 'brand-1',
      diagnostics: [],
      evidence: [
        {
          label: 'Website crawl',
          sourceType: 'website',
          url: 'https://acme.test',
        },
      ],
      fields: {
        logo: {
          applyActionDefault: 'preserve',
          currentValue: {
            id: 'asset-1',
            role: 'logo',
            sourceType: 'current_brand',
          },
          diagnostics: [],
          evidence: [],
          group: 'assets',
          key: 'logo',
          label: 'Logo',
          ownerPath: 'brand.logo',
        },
        voiceTone: {
          applyActionDefault: 'preserve',
          currentValue: 'direct',
          diagnostics: [],
          evidence: [],
          group: 'voice',
          key: 'voiceTone',
          label: 'Voice tone',
          ownerPath: 'brand.agentConfig.voice.tone',
          proposedValue: 'confident',
        },
      },
      id: 'brand-1',
      organizationId: 'org-1',
      readiness: {
        diagnostics: [],
        missingFields: [],
        requiredFields: ['voiceTone', 'logo'],
        score: 100,
        status: 'complete',
      },
      sourceType: 'website',
      status: 'ready',
    });

    expect(output).toEqual({
      data: {
        attributes: expect.objectContaining({
          assetCandidates: [
            expect.objectContaining({ candidateId: 'logo-candidate' }),
          ],
          brandId: 'brand-1',
          evidence: [expect.objectContaining({ sourceType: 'website' })],
          fields: expect.objectContaining({
            logo: expect.objectContaining({
              currentValue: expect.objectContaining({ id: 'asset-1' }),
              ownerPath: 'brand.logo',
            }),
            voiceTone: expect.objectContaining({
              applyActionDefault: 'preserve',
              ownerPath: 'brand.agentConfig.voice.tone',
            }),
          }),
          readiness: expect.objectContaining({
            score: 100,
            status: 'complete',
          }),
          status: 'ready',
        }),
        id: 'brand-1',
        type: 'brand-kit',
      },
    });
  });

  it('serializes selective apply state as its own operation outcome', () => {
    const output = BrandKitApplySerializer.serialize({
      appliedFields: ['description'],
      brandId: 'brand-1',
      diagnostics: [],
      id: 'brand-1',
      preservedFields: ['logo'],
      status: 'partial',
    });

    expect(output).toEqual({
      data: {
        attributes: expect.objectContaining({
          appliedFields: ['description'],
          brandId: 'brand-1',
          preservedFields: ['logo'],
          status: 'partial',
        }),
        id: 'brand-1',
        type: 'brand-kit-apply',
      },
    });
  });

  it('serializes asset import references and diagnostics without binary data', () => {
    const output = BrandKitAssetImportSerializer.serialize({
      brandId: 'brand-1',
      diagnostics: [],
      failedCandidateIds: [],
      id: 'brand-1',
      importedAssetIds: ['asset-1'],
      results: [
        {
          assetId: 'asset-1',
          candidateId: 'logo-candidate',
          diagnostics: [],
          role: 'logo',
          status: 'imported',
          url: '/logos/asset-1',
        },
      ],
      skippedCandidateIds: [],
      status: 'accepted',
    });

    expect(output).toEqual({
      data: {
        attributes: expect.objectContaining({
          brandId: 'brand-1',
          importedAssetIds: ['asset-1'],
          results: [
            expect.objectContaining({
              assetId: 'asset-1',
              role: 'logo',
              status: 'imported',
              url: '/logos/asset-1',
            }),
          ],
          status: 'accepted',
        }),
        id: 'brand-1',
        type: 'brand-kit-asset-import',
      },
    });
  });

  it('serializes a persisted reference category in import results', () => {
    const output = BrandKitAssetImportSerializer.serialize({
      brandId: 'brand-1',
      diagnostics: [],
      failedCandidateIds: [],
      id: 'brand-1',
      importedAssetIds: ['asset-reference'],
      results: [
        {
          assetId: 'asset-reference',
          diagnostics: [],
          referenceCategory: 'PRODUCT',
          role: 'reference',
          status: 'imported',
        },
      ],
      skippedCandidateIds: [],
      status: 'accepted',
    });

    expect(output.data.attributes.results).toEqual([
      expect.objectContaining({ referenceCategory: 'PRODUCT' }),
    ]);
  });
});
