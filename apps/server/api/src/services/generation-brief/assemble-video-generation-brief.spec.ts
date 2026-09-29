import { assembleVideoGenerationBrief } from '@api/services/generation-brief/assemble-video-generation-brief';
import { resolveVideoGenerationFidelityMode } from '@api/services/generation-brief/resolve-video-generation-fidelity-mode';
import { describe, expect, it } from 'vitest';

describe('assembleVideoGenerationBrief', () => {
  it('normalizes an unbranded video request into a versioned brief', () => {
    const brief = assembleVideoGenerationBrief({
      durationSeconds: 5,
      fidelityMode: resolveVideoGenerationFidelityMode({}),
      height: 1080,
      objective: 'a drone shot flying over a canyon at sunrise',
      width: 1920,
    });

    expect(brief).toMatchObject({
      fidelityMode: 'off',
      intent: { objective: 'a drone shot flying over a canyon at sunrise' },
      mediaKind: 'video',
      output: {
        aspectRatio: '16:9',
        durationSeconds: 5,
        height: 1080,
        width: 1920,
      },
      version: 1,
    });
    expect(brief.references).toEqual([]);
  });

  it('maps the first reference to first_frame and an end frame to last_frame without signed URLs', () => {
    const brief = assembleVideoGenerationBrief({
      cinematography: 'slow dolly-in, shallow depth of field',
      fidelityMode: 'guided',
      endFrameId: 'asset_end_456',
      motion: 'gentle parallax',
      objective: 'Bring the new bottle to life in a studio spin',
      referenceIds: ['asset_product_123', 'asset_logo_789'],
      visualDirection: 'Clean editorial product cinematography',
      visualDirectionSource: 'brand',
    });

    expect(brief.references).toEqual([
      { assetId: 'asset_product_123', role: 'first_frame' },
      { assetId: 'asset_logo_789', role: 'subject' },
      { assetId: 'asset_end_456', role: 'last_frame' },
    ]);
    for (const reference of brief.references) {
      expect(reference).not.toHaveProperty('url');
    }
    expect(brief.provenance).toContainEqual({
      field: 'intent.visualDirection',
      source: 'brand',
    });
    expect(brief.provenance).toContainEqual({
      field: 'references.last_frame',
      source: 'user',
    });
  });

  it('carries brandContext into the intent with brand provenance when present (#4676)', () => {
    const brief = assembleVideoGenerationBrief({
      brandContext: 'Warm, confident, editorial voice.',
      fidelityMode: 'off',
      objective: 'Continue the scene',
    });

    expect(brief.intent.brandContext).toBe('Warm, confident, editorial voice.');
    expect(brief.provenance).toContainEqual({
      field: 'intent.brandContext',
      source: 'brand',
    });
  });

  it('omits brandContext entirely when not passed, regardless of fidelity mode', () => {
    const brief = assembleVideoGenerationBrief({
      avoid: ['logo overlay'],
      fidelityMode: 'guided',
      objective: 'Continue the scene',
    });

    expect(brief.intent.brandContext).toBeUndefined();
    expect(brief.provenance).not.toContainEqual(
      expect.objectContaining({ field: 'intent.brandContext' }),
    );
  });
});
