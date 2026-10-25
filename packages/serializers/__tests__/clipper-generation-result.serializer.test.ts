import { serializeClipperGenerationResult } from '@serializers/server/content/clipper-generation-result.serializer';
import { describe, expect, it } from 'vitest';

describe('serializeClipperGenerationResult', () => {
  it('preserves the generation result and omits an unselected reference', () => {
    const output = serializeClipperGenerationResult({
      clipCount: 1,
      clipperResultIds: ['clipper-result-1'],
      status: 'generating',
    });

    expect(output).toEqual({
      clipCount: 1,
      clipperResultIds: ['clipper-result-1'],
      status: 'generating',
    });
    expect('reference' in output).toBe(false);
  });

  it('includes the stable redacted reference application when selected', () => {
    const reference = {
      provenance: {
        application: {
          mode: 'avatar',
          nativeField: 'photo_url',
          provider: 'heygen',
          state: 'applied',
        },
        schemaVersion: 1,
        source: {
          assetId: 'asset-frame-1',
          candidateId: 'frame-1',
          mimeType: 'image/jpeg',
          storageKey: 'ingredients/images/org-1/frame-1.jpg',
          timestampSeconds: 12.5,
        },
      },
      state: 'applied',
    } as const;

    const output = serializeClipperGenerationResult({
      clipCount: 1,
      clipperResultIds: ['clipper-result-1'],
      reference,
      status: 'generating',
    });

    expect(output.reference).toEqual(reference);
    expect(JSON.stringify(output)).not.toMatch(
      /https?:\/\/|credential|signature|providerResponse/i,
    );
  });
});
