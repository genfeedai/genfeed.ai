import {
  BrandKitApplySerializer,
  BrandKitAssetImportSerializer,
  BrandKitSerializer,
} from '@serializers/server/organizations/brand-kit.serializer';
import { describe, expect, it } from 'vitest';

describe('Brand Kit JSON:API contract', () => {
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
});
