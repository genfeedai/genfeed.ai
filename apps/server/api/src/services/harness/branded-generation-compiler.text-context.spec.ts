import { compileBrandSnapshotContext } from '@api/services/harness/branded-generation-compiler';
import type { BrandIdentitySnapshotV1 } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';

const hash = `sha256:${'a'.repeat(64)}`;

function brandWithLookAndAssets(): BrandIdentitySnapshotV1 {
  return {
    schemaVersion: 1,
    organizationId: 'org',
    brandId: 'brand',
    revisionId: 'revision-a',
    revisionVersion: 1,
    approval: 'approved',
    resolvedAt: '2026-11-25T00:00:00.000Z',
    contentHash: hash,
    identity: { name: 'Acme' },
    voice: {
      audience: ['Founders'],
      avoid: [],
      guidelines: 'Write in short lines.',
      messagingPillars: [],
      values: [],
    },
    visualDirection:
      'Reinterpret classic paintings in oil. Monochrome, the mark hidden in the scene.',
    generationRules: {
      schemaVersion: 1,
      evidence: [
        {
          contentHash: hash,
          id: 'e',
          label: 'Owner',
          sourceId: 'source',
          sourceType: 'manual',
          sourceVersion: 2,
        },
      ],
      facts: [
        {
          evidenceIds: ['e'],
          id: 'fact',
          kind: 'statement',
          match: 'literal',
          predicate: 'name',
          required: true,
          subject: 'Product',
          value: 'Acme',
        },
      ],
      mandatory: [],
      avoid: [],
      palette: [
        {
          color: '#AABBCC',
          evidenceIds: ['e'],
          id: 'palette',
          required: true,
          usage: 'Background',
        },
      ],
      typography: [],
      assets: [
        {
          assetId: 'logo-asset-id',
          contentHash: hash,
          evidenceIds: ['e'],
          id: 'logo',
          mimeType: 'image/png',
          required: true,
          role: 'logo',
        },
      ],
      examples: [],
    },
    diagnostics: [],
  };
}

describe('text generation context for a brand with a visual look', () => {
  it('keeps the facts and the writing guidance, and leaves out everything only a design uses', () => {
    const { text } = compileBrandSnapshotContext(
      brandWithLookAndAssets(),
      [],
      undefined,
      'text',
    );

    expect(text).toContain('## Required Brand Facts');
    expect(text).toContain('Write in short lines.');
    expect(text).not.toContain('classic paintings');
    expect(text).not.toContain('Monochrome');
    expect(text).not.toContain('#AABBCC');
    expect(text).not.toContain('Assets');
    expect(text).not.toContain('logo-asset-id');
  });

  it.each(['image', 'carousel', 'video'] as const)(
    'still gives %s generation the asset rules',
    (format) => {
      const { text } = compileBrandSnapshotContext(
        brandWithLookAndAssets(),
        [],
        undefined,
        format,
      );

      expect(text).toContain('## Required Brand Assets');
      expect(text).toContain('logo-asset-id');
    },
  );
});
