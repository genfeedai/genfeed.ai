import { assembleVideoGenerationBrief } from '@api/services/generation-brief/assemble-video-generation-brief';
import { resolveVideoGenerationFidelityMode } from '@api/services/generation-brief/resolve-video-generation-fidelity-mode';
import { describe, expect, it } from 'vitest';

describe('assembleVideoGenerationBrief', () => {
  it('preserves semantic run references across every clip brief', () => {
    const brief = assembleVideoGenerationBrief({
      fidelityMode: 'guided',
      objective: 'Show the product in use',
      references: [
        { assetId: 'character-sheet', role: 'character' },
        {
          assetId: 'product-still',
          description: 'Matte black bottle with gold cap',
          role: 'product',
        },
        { assetId: 'outfit-style', role: 'style' },
      ],
    });

    expect(brief.references).toEqual([
      { assetId: 'character-sheet', role: 'character' },
      {
        assetId: 'product-still',
        description: 'Matte black bottle with gold cap',
        role: 'product',
      },
      { assetId: 'outfit-style', role: 'style' },
    ]);
  });

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

  it('keeps native video references distinct from frame images', () => {
    const brief = assembleVideoGenerationBrief({
      endFrameId: 'end-frame',
      fidelityMode: 'guided',
      objective: 'Continue the scene',
      referenceIds: ['start-frame'],
      videoReferenceIds: ['reference-video'],
    });

    expect(brief.references).toEqual([
      { assetId: 'start-frame', role: 'first_frame' },
      { assetId: 'end-frame', role: 'last_frame' },
      { assetId: 'reference-video', role: 'reference_video' },
    ]);
  });
});
