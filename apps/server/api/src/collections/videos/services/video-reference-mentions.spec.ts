import {
  assertReferenceMentionInvariant,
  resolveVideoReferenceMentionBindings,
} from '@api/collections/videos/services/video-reference-mentions';
import { runVideoGenerationBrief } from '@api/services/generation-brief/run-video-generation-brief';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { GenerationHarnessReceipt } from '@genfeedai/contracts/interfaces/content/generation-harness.interface';
import type { StudioVideoReferenceMentionBindingInput } from '@genfeedai/contracts/interfaces/studio/studio-reference-mention.interface';
import {
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

const input: StudioVideoReferenceMentionBindingInput = {
  model: MODEL_KEYS.REPLICATE_MINIMAX_H3,
  text: 'Use @Image2 behind @Image1, driven by @Video1 and @Audio1.',
  imageReferenceIds: ['person', 'place'],
  videoReferenceIds: ['driver'],
  audioReferenceIds: ['voice'],
};

describe('plain-token H3 reference bindings', () => {
  it('retains every image in the ordered reference array without promoting Image1 to first_frame', () => {
    const references = resolveVideoReferenceMentionBindings(input);
    expect(references).toEqual([
      { assetId: 'person', role: 'subject' },
      { assetId: 'place', role: 'subject' },
    ]);
    const result = runVideoGenerationBrief({
      model: input.model,
      objective: input.text,
      references,
      referenceIds: [...(input.imageReferenceIds ?? [])],
      videoReferenceIds: [...(input.videoReferenceIds ?? [])],
      audioReferenceIds: [...(input.audioReferenceIds ?? [])],
      surface: 'studio',
      width: 1920,
      height: 1080,
    });
    expect(result.dispatch).toMatchObject({
      reference_image_urls: ['person', 'place'],
      reference_video_urls: ['driver'],
      reference_audio_urls: ['voice'],
    });
    expect(result.dispatch).not.toHaveProperty('first_frame_image');
    expect(result.dispatch?.prompt).toMatch(
      /@Image2.*@Image1.*@Video1.*@Audio1/,
    );
  });
  it.each(['@Image3', '@Image0', '@Image01', '@Video2', '@Audio2'])(
    'rejects unmatched %s against raw arrays',
    (token) => {
      expect(() =>
        resolveVideoReferenceMentionBindings({
          ...input,
          text: `Use ${token}`,
        }),
      ).toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            code: 'REFERENCE_MENTION_UNMATCHED',
          }),
        }),
      );
    },
  );
  it.each([
    'imageReferenceIds',
    'videoReferenceIds',
    'audioReferenceIds',
  ] as const)(
    'rejects duplicate %s before deduplication can shift a token',
    (field) => {
      expect(() =>
        resolveVideoReferenceMentionBindings({
          ...input,
          [field]: ['duplicate', 'duplicate'],
        }),
      ).toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            code: 'REFERENCE_MENTION_DUPLICATE',
          }),
        }),
      );
    },
  );
  it('refuses a tenth positional image instead of allowing compiler truncation', () => {
    expect(() =>
      resolveVideoReferenceMentionBindings({
        ...input,
        imageReferenceIds: Array.from(
          { length: 10 },
          (_, index) => `image-${index}`,
        ),
      }),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: 'REFERENCE_MENTION_LIMIT' }),
      }),
    );
  });
  it('refuses dedicated end-frame and unverified model mappings', () => {
    expect(() =>
      resolveVideoReferenceMentionBindings({ ...input, endFrameId: 'end' }),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          code: 'REFERENCE_MENTION_DEDICATED_INPUT',
        }),
      }),
    );
    expect(() =>
      resolveVideoReferenceMentionBindings({
        ...input,
        model: MODEL_KEYS.REPLICATE_GOOGLE_VEO_3,
      }),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          code: 'REFERENCE_MENTION_MODEL_UNSUPPORTED',
        }),
      }),
    );
  });
  it.each(['An ordinary frame-based prompt', 'Use @Video1 and @Audio1'])(
    'preserves ordinary frame interpretation for %s',
    (text) => {
      const references = resolveVideoReferenceMentionBindings({
        ...input,
        text,
      });
      expect(references).toBeUndefined();
      const result = runVideoGenerationBrief({
        model: input.model,
        objective: text,
        references,
        referenceIds: ['person', 'place'],
        surface: 'studio',
        width: 1920,
        height: 1080,
      });
      expect(result.dispatch).toMatchObject({
        first_frame_image: 'person',
        reference_image_urls: ['place'],
      });
    },
  );
});

describe('reference tokens after enhancement', () => {
  it('accepts rewritten prose and reordered mentions while retaining the declared tokens', async () => {
    const enhance = vi
      .fn<
        (
          ...args: unknown[]
        ) => Promise<Pick<GenerationHarnessReceipt, 'enhancedPrompt'>>
      >()
      .mockResolvedValue({
        enhancedPrompt:
          'Play @Audio1 with @Video1, showing @Image1 in front of @Image2.',
      });
    const receipt = await enhance({ harness: true, prompt: input.text });
    expect(enhance).toHaveBeenCalledWith({ harness: true, prompt: input.text });
    expect(() =>
      assertReferenceMentionInvariant({
        originalText: input.text,
        preparedText: receipt.enhancedPrompt,
      }),
    ).not.toThrow();
  });
  it.each([
    ['stripped', 'Use @Image1 with @Video1 and @Audio1.'],
    ['invented', `${input.text} Add @Image3.`],
    ['renumbered', 'Use @Image3 behind @Image1 with @Video1 and @Audio1.'],
  ])(
    'returns a distinct 422 invariant failure for %s tokens',
    async (_label, preparedText) => {
      const enhance = vi
        .fn<
          (
            ...args: unknown[]
          ) => Promise<Pick<GenerationHarnessReceipt, 'enhancedPrompt'>>
        >()
        .mockResolvedValue({ enhancedPrompt: preparedText });
      const receipt = await enhance({ harness: true, prompt: input.text });
      let error: unknown;
      try {
        assertReferenceMentionInvariant({
          originalText: input.text,
          preparedText: receipt.enhancedPrompt,
        });
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(UnprocessableEntityException);
      if (!(error instanceof UnprocessableEntityException))
        throw new Error('Expected reference invariant failure');
      expect(error.getStatus()).toBe(422);
      expect(error.getResponse()).toMatchObject({
        code: 'REFERENCE_MENTION_ENHANCEMENT_CHANGED',
      });
      expect(error).not.toBeInstanceOf(BadRequestException);
      expect(enhance).toHaveBeenCalledWith({
        harness: true,
        prompt: input.text,
      });
    },
  );
  it('keeps explicit raw mode valid and rejects invented tokens in originally ordinary prose', () => {
    expect(() =>
      assertReferenceMentionInvariant({
        originalText: input.text,
        preparedText: input.text,
      }),
    ).not.toThrow();
    expect(() =>
      assertReferenceMentionInvariant({
        originalText: 'An ordinary prompt',
        preparedText: 'An ordinary prompt with @Image1',
      }),
    ).toThrow(UnprocessableEntityException);
  });
  it('does not allow enhancement to silently remove one repeated mention', () => {
    expect(() =>
      assertReferenceMentionInvariant({
        originalText: '@Image1 beside @Image1',
        preparedText: '@Image1',
      }),
    ).toThrow(UnprocessableEntityException);
  });
});
