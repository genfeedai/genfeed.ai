import { describe, expect, it } from 'vitest';
import {
  mediaContentWarningValues,
  mediaPerceptionArtefactsRequestSchema,
  mediaPerceptionRecordSchema,
  mediaSceneDescriptionSchema,
} from './media-perception.contract';

const DESCRIPTION = {
  brandElements: [],
  contentWarnings: ['alcohol'],
  hasPeople: false,
  hasSuspectedMinors: false,
  setting: 'bar',
  subjects: ['cocktail'],
  summary: 'A cocktail on a bar counter.',
  textOnScreen: '',
};

describe('media perception contract', () => {
  it('accepts a complete scene description', () => {
    expect(mediaSceneDescriptionSchema.parse(DESCRIPTION)).toEqual(DESCRIPTION);
  });

  it('rejects prose, unknown warnings and extra keys', () => {
    expect(mediaSceneDescriptionSchema.safeParse('a cocktail').success).toBe(
      false,
    );
    expect(
      mediaSceneDescriptionSchema.safeParse({
        ...DESCRIPTION,
        contentWarnings: ['spooky'],
      }).success,
    ).toBe(false);
    expect(
      mediaSceneDescriptionSchema.safeParse({ ...DESCRIPTION, score: 9 })
        .success,
    ).toBe(false);
  });

  it('keeps content warnings a closed, sorted vocabulary', () => {
    expect([...mediaContentWarningValues].sort()).toEqual([
      ...mediaContentWarningValues,
    ]);
  });

  it('bounds the frame count a caller may request', () => {
    const request = {
      assetHash: 'c'.repeat(64),
      frameCount: 6,
      kind: 'video',
      organizationId: 'org-1',
      url: 'https://cdn.example.com/a.mp4',
    };
    expect(
      mediaPerceptionArtefactsRequestSchema.safeParse(request).success,
    ).toBe(true);
    expect(
      mediaPerceptionArtefactsRequestSchema.safeParse({
        ...request,
        frameCount: 25,
      }).success,
    ).toBe(false);
    expect(
      mediaPerceptionArtefactsRequestSchema.safeParse({
        ...request,
        assetHash: 'not-a-hash',
      }).success,
    ).toBe(false);
  });

  it('parses a partial record with a pending description', () => {
    const result = mediaPerceptionRecordSchema.safeParse({
      assetHash: 'd'.repeat(64),
      description: null,
      descriptionModel: null,
      descriptionStatus: 'pending',
      diagnostics: [
        {
          artefact: 'description',
          code: 'vision_model_unavailable',
          message: 'The vision model was unavailable; will retry.',
        },
      ],
      durationSeconds: 8,
      frames: [],
      framesStatus: 'ready',
      kind: 'video',
      ocr: [],
      ocrStatus: 'ready',
      schemaVersion: 1,
      transcript: { durationSeconds: 8, language: 'en', text: 'hello' },
      transcriptStatus: 'ready',
    });
    expect(result.success).toBe(true);
  });
});
