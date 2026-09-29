import {
  getFalEndpointFromModelKey,
  getProviderModelKey,
  isFalDestination,
  isGenfeedAiDestination,
  isModelMetadataString,
  isReplicateDestination,
  isReplicateVersionId,
  isTrainerKey,
  isTrainingKey,
} from '@api/collections/models/utils/model-key.util';
import { ModelProvider } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { BadRequestException } from '@nestjs/common';

// Contract tests for the model-routing heuristics that decide which provider a
// given model key resolves to. These are string-prefix/regex heuristics on the
// revenue path — a misclassification silently routes a paying customer's
// generation to the wrong provider API. The suites below pin the real-world
// input space (representative provider keys) plus the ambiguous/malformed edges
// where the heuristics are most likely to drift. Part of #1184.

describe('model-key.util', () => {
  describe('isFalDestination', () => {
    it('detects fal-ai/ prefixed keys', () => {
      expect(isFalDestination('fal-ai/flux/dev')).toBe(true);
      expect(isFalDestination('fal-ai/kling-video')).toBe(true);
    });

    it('detects collision-safe fal/ selection keys', () => {
      expect(isFalDestination('fal/google/nano-banana-2-lite')).toBe(true);
      expect(isFalDestination('fal/minimax/h3/text-to-video')).toBe(true);
    });

    it('uses an explicit provider for partner endpoints', () => {
      expect(
        isFalDestination('google/nano-banana-2-lite', ModelProvider.FAL),
      ).toBe(true);
      expect(
        isFalDestination('google/nano-banana-2-lite', ModelProvider.REPLICATE),
      ).toBe(false);
    });

    it('rejects lookalike prefixes that are not Fal selection keys', () => {
      expect(isFalDestination('fal-ai-studio/flux')).toBe(false);
      expect(isFalDestination('myfal-ai/flux')).toBe(false);
    });

    it('rejects non-string and empty inputs', () => {
      expect(isFalDestination(undefined)).toBe(false);
      expect(isFalDestination('')).toBe(false);
      expect(isFalDestination(null as unknown as string)).toBe(false);
    });
  });

  describe('isGenfeedAiDestination', () => {
    it('rejects non-string and empty inputs', () => {
      expect(isGenfeedAiDestination(undefined)).toBe(false);
      expect(isGenfeedAiDestination('')).toBe(false);
    });
  });

  describe('isReplicateDestination', () => {
    it('treats owner/model keys as Replicate', () => {
      expect(isReplicateDestination('google/imagen-4')).toBe(true);
      expect(isReplicateDestination('black-forest-labs/flux-schnell')).toBe(
        true,
      );
    });

    it('treats dot-versioned owner/model keys as Replicate', () => {
      expect(isReplicateDestination('bytedance/seedream-4.5')).toBe(true);
      expect(isReplicateDestination('bytedance/seedance-2.0')).toBe(true);
    });

    it('treats owner/model:version keys as Replicate', () => {
      expect(isReplicateDestination('owner/model:1.2.3')).toBe(true);
      expect(
        isReplicateDestination(
          'stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b',
        ),
      ).toBe(true);
    });

    it('uses an explicit provider to resolve owner/model collisions', () => {
      const endpoint = 'google/nano-banana-2-lite';

      expect(isReplicateDestination(endpoint, ModelProvider.FAL)).toBe(false);
      expect(isReplicateDestination(endpoint, ModelProvider.REPLICATE)).toBe(
        true,
      );
    });

    it('excludes fal-ai destinations even when dot-versioned', () => {
      expect(isReplicateDestination('fal-ai/veo3.1')).toBe(false);
      expect(isReplicateDestination('fal-ai/seedance-2.0')).toBe(false);
    });

    it('excludes genfeed-ai self-hosted destinations (any case)', () => {
      expect(isReplicateDestination('genfeed-ai/z-image-turbo')).toBe(false);
      expect(isReplicateDestination('GENFEED-AI/z-image-turbo')).toBe(false);
    });

    it('rejects three-segment training keys (extra slash breaks owner/model)', () => {
      expect(isReplicateDestination('genfeedai/663a1b/6721cf')).toBe(false);
      expect(isReplicateDestination('owner/model/extra')).toBe(false);
    });

    it('rejects malformed keys missing an owner or model segment', () => {
      expect(isReplicateDestination('/model')).toBe(false);
      expect(isReplicateDestination('owner/')).toBe(false);
      expect(isReplicateDestination('owner')).toBe(false);
      expect(isReplicateDestination('')).toBe(false);
    });

    it('rejects non-string inputs', () => {
      expect(isReplicateDestination(undefined)).toBe(false);
      expect(isReplicateDestination(null as unknown as string)).toBe(false);
    });
  });

  describe('getProviderModelKey', () => {
    it('preserves existing Fal and Replicate model keys', () => {
      expect(getProviderModelKey(ModelProvider.FAL, 'fal-ai/flux/dev')).toBe(
        'fal-ai/flux/dev',
      );
      expect(
        getProviderModelKey(
          ModelProvider.REPLICATE,
          'google/nano-banana-2-lite',
        ),
      ).toBe('google/nano-banana-2-lite');
    });

    it('qualifies Fal partner endpoints without changing their endpoint', () => {
      expect(
        getProviderModelKey(ModelProvider.FAL, 'google/nano-banana-2-lite'),
      ).toBe('fal/google/nano-banana-2-lite');
      expect(
        getProviderModelKey(ModelProvider.FAL, 'minimax/h3/text-to-video'),
      ).toBe('fal/minimax/h3/text-to-video');
    });
  });

  describe('getFalEndpointFromModelKey', () => {
    it('matches the fal/ namespace case-insensitively for valid keys', () => {
      expect(getFalEndpointFromModelKey('FAL/google/nano-banana-2-lite')).toBe(
        'google/nano-banana-2-lite',
      );
      expect(getFalEndpointFromModelKey('Fal-AI/flux/dev')).toBe(
        'Fal-AI/flux/dev',
      );
    });

    // #4733: a registry row with missing or malformed endpoint metadata used
    // to reach `toLowerCase` and throw a TypeError in production.
    it.each([
      ['undefined', undefined],
      ['null', null],
      ['a number', 42],
      ['an object', { endpoint: 'fal/google/nano-banana-2-lite' }],
      ['an empty string', ''],
      ['whitespace', '   '],
    ])('rejects %s with a 400 instead of a TypeError', (_label, value) => {
      let caught: unknown;
      try {
        getFalEndpointFromModelKey(value as unknown as string);
      } catch (error: unknown) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(BadRequestException);
      expect(caught).not.toBeInstanceOf(TypeError);
      expect((caught as BadRequestException).getResponse()).toEqual({
        detail: 'Model endpoint must be a non-empty string',
        title: 'Model endpoint unavailable',
      });
    });
  });

  describe('isModelMetadataString', () => {
    it('accepts non-empty strings regardless of case', () => {
      expect(isModelMetadataString('meta/musicgen')).toBe(true);
      expect(isModelMetadataString('FAL/elevenlabs/music')).toBe(true);
    });

    it.each([
      ['undefined', undefined],
      ['null', null],
      ['a number', 42],
      ['a boolean', true],
      ['an object', { label: 'MusicGen' }],
      ['an array', ['meta/musicgen']],
      ['an empty string', ''],
      ['whitespace', ' \t\n'],
    ])('rejects %s', (_label, value) => {
      expect(isModelMetadataString(value)).toBe(false);
    });
  });

  describe('isReplicateVersionId', () => {
    it('rejects long strings containing non-hex characters', () => {
      expect(isReplicateVersionId('g'.repeat(30))).toBe(false);
      expect(isReplicateVersionId(`${'a'.repeat(30)}-z`)).toBe(false);
    });

    it('rejects non-string and empty inputs', () => {
      expect(isReplicateVersionId(undefined)).toBe(false);
      expect(isReplicateVersionId('')).toBe(false);
    });
  });

  describe('isTrainingKey', () => {
    it('is case-insensitive on the namespace prefix', () => {
      expect(isTrainingKey('GENFEED-AI/663a1b/6721cf')).toBe(true);
      expect(isTrainingKey('GenfeedAI/663a1b/6721cf')).toBe(true);
    });

    it('returns false when there are more than 3 segments', () => {
      expect(isTrainingKey('genfeed-ai/663a1b/6721cf/extra')).toBe(false);
    });

    it('returns false for non-genfeed model keys', () => {
      expect(isTrainingKey('google/imagen-4')).toBe(false);
      expect(isTrainingKey('fal-ai/flux/dev')).toBe(false);
    });

    it('returns false for null, undefined, and empty string', () => {
      expect(isTrainingKey(null)).toBe(false);
      expect(isTrainingKey(undefined)).toBe(false);
      expect(isTrainingKey('')).toBe(false);
    });

    it('returns false for non-string inputs', () => {
      expect(isTrainingKey(42)).toBe(false);
      expect(isTrainingKey({})).toBe(false);
    });
  });

  describe('isTrainerKey', () => {
    it('matches the configured fast-flux trainer base key', () => {
      expect(isTrainerKey(MODEL_KEYS.REPLICATE_FAST_FLUX_TRAINER)).toBe(true);
      expect(isTrainerKey('replicate/fast-flux-trainer')).toBe(true);
    });

    it('rejects other replicate models', () => {
      expect(isTrainerKey('replicate/other-model')).toBe(false);
      expect(isTrainerKey('google/imagen-4')).toBe(false);
    });

    it('rejects undefined and empty string', () => {
      expect(isTrainerKey(undefined)).toBe(false);
      expect(isTrainerKey('')).toBe(false);
    });
  });

  // Regression guard: a model key must resolve to exactly one provider
  // destination. If a heuristic starts over-matching (e.g. a fal key leaks
  // into the Replicate branch), one of these assertions fails before the
  // misroute can reach production.
  describe('routing is mutually exclusive', () => {
    const cases: Array<{
      key: string;
      fal: boolean;
      genfeedAi: boolean;
      replicate: boolean;
    }> = [
      { fal: true, genfeedAi: false, key: 'fal-ai/flux/dev', replicate: false },
      {
        fal: true,
        genfeedAi: false,
        key: 'fal/google/nano-banana-2-lite',
        replicate: false,
      },
      {
        fal: false,
        genfeedAi: true,
        key: 'genfeed-ai/z-image-turbo',
        replicate: false,
      },
      {
        fal: false,
        genfeedAi: false,
        key: 'google/imagen-4',
        replicate: true,
      },
      {
        fal: false,
        genfeedAi: false,
        key: 'bytedance/seedream-4.5',
        replicate: true,
      },
    ];

    for (const { key, fal, genfeedAi, replicate } of cases) {
      it(`routes ${key} to exactly one destination`, () => {
        expect(isFalDestination(key)).toBe(fal);
        expect(isGenfeedAiDestination(key)).toBe(genfeedAi);
        expect(isReplicateDestination(key)).toBe(replicate);

        const destinations = [
          isFalDestination(key),
          isGenfeedAiDestination(key),
          isReplicateDestination(key),
        ].filter(Boolean);
        expect(destinations).toHaveLength(1);
      });
    }
  });
});
