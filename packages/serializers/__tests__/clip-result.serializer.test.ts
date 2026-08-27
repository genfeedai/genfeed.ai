import { ClipResultSerializer } from '@serializers/server/content/clip-result.serializer';
import { describe, expect, it } from 'vitest';

/**
 * Guards the raw-cut data contract added in #1239 (epic #1234): the `mode`
 * discriminator serializes when present and is simply absent — never a spurious
 * null — for legacy/avatar records that predate the column.
 */
describe('ClipResultSerializer — raw-cut contract', () => {
  type SerializedResource = {
    data: { id: string; type: string; attributes: Record<string, unknown> };
  };

  it('exposes mode alongside the raw-cut source + output fields when present', () => {
    const output = ClipResultSerializer.serialize({
      captionSrt: '1\n00:00:00,000 --> 00:00:05,000\nHello',
      captionedVideoUrl: 'https://cdn.genfeed.ai/clip-captioned.mp4',
      duration: 30,
      endTime: 45,
      framing: {
        aspectRatio: '9:16',
        height: 1920,
        strategy: 'contain-blur',
        subjectSafety: 'full-source-visible',
        version: 1,
        width: 1080,
      },
      id: 'ckclipresult00000000000001',
      mode: 'raw-cut',
      mediaValidation: {
        checkedAt: '2026-08-27T10:00:00.000Z',
        decodeOk: true,
        durationSeconds: 30,
        expectedDurationSeconds: 30,
        hasAudio: true,
        height: 1920,
        issues: [],
        status: 'passed',
        videoCodec: 'h264',
        width: 1080,
      },
      startTime: 15,
      videoS3Key: 'orgs/org-1/clips/clip-1.mp4',
      videoUrl: 'https://cdn.genfeed.ai/clip.mp4',
    }) as SerializedResource;

    expect(output.data.type).toBe('clip-result');
    expect(output.data.attributes).toMatchObject({
      captionSrt: '1\n00:00:00,000 --> 00:00:05,000\nHello',
      captionedVideoUrl: 'https://cdn.genfeed.ai/clip-captioned.mp4',
      duration: 30,
      endTime: 45,
      mode: 'raw-cut',
      framing: expect.objectContaining({
        strategy: 'contain-blur',
        subjectSafety: 'full-source-visible',
      }),
      mediaValidation: expect.objectContaining({
        decodeOk: true,
        status: 'passed',
      }),
      startTime: 15,
      videoS3Key: 'orgs/org-1/clips/clip-1.mp4',
      videoUrl: 'https://cdn.genfeed.ai/clip.mp4',
    });
  });

  it('omits mode from attributes for legacy records that never carried it', () => {
    const output = ClipResultSerializer.serialize({
      id: 'ckclipresult00000000000002',
      status: 'completed',
      videoUrl: 'https://cdn.genfeed.ai/legacy-avatar.mp4',
    }) as SerializedResource;

    expect(output.data.attributes.videoUrl).toBe(
      'https://cdn.genfeed.ai/legacy-avatar.mp4',
    );
    expect('mode' in output.data.attributes).toBe(false);
  });

  it('exposes only stable selected-reference provenance', () => {
    const output = ClipResultSerializer.serialize({
      id: 'ckclipresult00000000000003',
      referenceProvenance: {
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
          storageKey: 'ingredients/images/org-1/frame-1.jpg',
          timestampSeconds: 12.5,
        },
      },
    }) as SerializedResource;

    expect(output.data.attributes.referenceProvenance).toEqual({
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
        storageKey: 'ingredients/images/org-1/frame-1.jpg',
        timestampSeconds: 12.5,
      },
    });
    expect(
      JSON.stringify(output.data.attributes.referenceProvenance),
    ).not.toMatch(/https?:\/\/|apiKey|providerResponse/);
  });

  it('exposes the immutable run references attached to the clip brief', () => {
    const generationBrief = {
      constraints: [],
      fidelityMode: 'guided',
      intent: {
        objective: 'Show the product in use',
        requestedText: [],
        subjects: [],
      },
      mediaKind: 'video',
      output: { durationSeconds: 8 },
      provenance: [{ field: 'references.product-1', source: 'reference' }],
      references: [
        {
          assetId: 'product-1',
          description: 'Ceramic mug in glacier blue',
          role: 'product',
        },
      ],
      version: 1,
    };
    const output = ClipResultSerializer.serialize({
      generationBrief,
      id: 'ckclipresult00000000000005',
    }) as SerializedResource;

    expect(output.data.attributes.generationBrief).toEqual(generationBrief);
  });

  it('exposes the canonical Library ingredient link without signed media secrets', () => {
    const output = ClipResultSerializer.serialize({
      id: 'ckclipresult00000000000004',
      ingredientId: 'ckingredient00000000000001',
      libraryLinkError: null,
      libraryLinkStatus: 'linked',
    }) as SerializedResource;

    expect(output.data.attributes).toMatchObject({
      ingredientId: 'ckingredient00000000000001',
      libraryLinkStatus: 'linked',
    });
    expect(output.data.attributes.libraryLinkError).toBeNull();
  });
});
