import {
  baseModelKey,
  isFalDestination,
  isGenfeedAiDestination,
  isReplicateDestination,
  isReplicateVersionId,
  isTrainerKey,
  isTrainingKey,
} from '@api/collections/models/utils/model-key.util';
import { MODEL_KEYS } from '@genfeedai/constants';

// Contract tests for the model-routing heuristics that decide which provider a
// given model key resolves to. These are string-prefix/regex heuristics on the
// revenue path — a misclassification silently routes a paying customer's
// generation to the wrong provider API. The suites below pin the real-world
// input space (representative provider keys) plus the ambiguous/malformed edges
// where the heuristics are most likely to drift. Part of #1184.

describe('model-key.util', () => {
  describe('baseModelKey', () => {
    it('strips the :version suffix', () => {
      expect(baseModelKey('owner/model:abc123')).toBe('owner/model');
    });

    it('returns the key unchanged when there is no version suffix', () => {
      expect(baseModelKey('owner/model')).toBe('owner/model');
    });

    it('keeps only the segment before the first colon', () => {
      expect(baseModelKey('owner/model:1.2.3')).toBe('owner/model');
    });

    it('passes through undefined', () => {
      expect(baseModelKey(undefined)).toBeUndefined();
    });

    it('passes through empty string', () => {
      expect(baseModelKey('')).toBe('');
    });
  });

  describe('isFalDestination', () => {
    it('detects fal-ai/ prefixed keys', () => {
      expect(isFalDestination('fal-ai/flux/dev')).toBe(true);
      expect(isFalDestination('fal-ai/kling-video')).toBe(true);
    });

    it('is case-insensitive on the prefix', () => {
      expect(isFalDestination('FAL-AI/Flux')).toBe(true);
    });

    it('rejects lookalike prefixes that are not fal-ai/', () => {
      expect(isFalDestination('fal/flux')).toBe(false);
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
    it('detects genfeed-ai/ self-hosted destinations', () => {
      expect(isGenfeedAiDestination('genfeed-ai/z-image-turbo')).toBe(true);
    });

    it('is case-insensitive on the prefix', () => {
      expect(isGenfeedAiDestination('GENFEED-AI/z-image-turbo')).toBe(true);
    });

    it('does NOT treat the hyphenless genfeedai/ prefix as a genfeed-ai destination', () => {
      // 'genfeedai/' (training namespace) is distinct from 'genfeed-ai/'
      // (self-hosted destination); the hyphen is load-bearing.
      expect(isGenfeedAiDestination('genfeedai/owner/model')).toBe(false);
    });

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

    it('preserves uppercase owner/model keys as Replicate', () => {
      expect(isReplicateDestination('Google/Imagen-4')).toBe(true);
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

    it('rejects dotted owner segments (owner stays dot-free by design)', () => {
      expect(isReplicateDestination('my.org/model')).toBe(false);
    });

    it('rejects malformed keys missing an owner or model segment', () => {
      expect(isReplicateDestination('/model')).toBe(false);
      expect(isReplicateDestination('owner/')).toBe(false);
      expect(isReplicateDestination('owner')).toBe(false);
      expect(isReplicateDestination('')).toBe(false);
    });

    it('rejects a bare hex version id (no owner/model shape)', () => {
      expect(
        isReplicateDestination(
          'f463fbfc97389e10a2f443a8a84b6953b1058eafbf0c9af4d84457ff07cb04db',
        ),
      ).toBe(false);
    });

    it('rejects non-string inputs', () => {
      expect(isReplicateDestination(undefined)).toBe(false);
      expect(isReplicateDestination(null as unknown as string)).toBe(false);
    });
  });

  describe('isReplicateVersionId', () => {
    it('detects a full 64-char hex version id', () => {
      expect(
        isReplicateVersionId(
          'f463fbfc97389e10a2f443a8a84b6953b1058eafbf0c9af4d84457ff07cb04db',
        ),
      ).toBe(true);
    });

    it('is case-insensitive on hex digits', () => {
      expect(isReplicateVersionId('A'.repeat(40))).toBe(true);
    });

    it('accepts exactly 25 hex chars (lower boundary)', () => {
      expect(isReplicateVersionId('a'.repeat(25))).toBe(true);
    });

    it('rejects 24 hex chars (just below boundary)', () => {
      expect(isReplicateVersionId('a'.repeat(24))).toBe(false);
    });

    it('rejects long strings containing non-hex characters', () => {
      expect(isReplicateVersionId('g'.repeat(30))).toBe(false);
      expect(isReplicateVersionId(`${'a'.repeat(30)}-z`)).toBe(false);
    });

    it('rejects owner/model keys that merely look long', () => {
      expect(isReplicateVersionId('black-forest-labs/flux-schnell')).toBe(
        false,
      );
    });

    it('rejects non-string and empty inputs', () => {
      expect(isReplicateVersionId(undefined)).toBe(false);
      expect(isReplicateVersionId('')).toBe(false);
    });
  });

  describe('isTrainingKey', () => {
    it('returns true for the new genfeed-ai/owner/model format', () => {
      expect(isTrainingKey('genfeed-ai/663a1b/6721cf')).toBe(true);
    });

    it('returns true for the legacy genfeedai/owner/model format', () => {
      expect(isTrainingKey('genfeedai/663a1b/6721cf')).toBe(true);
    });

    it('is case-insensitive on the namespace prefix', () => {
      expect(isTrainingKey('GENFEED-AI/663a1b/6721cf')).toBe(true);
      expect(isTrainingKey('GenfeedAI/663a1b/6721cf')).toBe(true);
    });

    it('returns false for a base genfeed-ai model with only 2 segments', () => {
      expect(isTrainingKey('genfeed-ai/flux-dev')).toBe(false);
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

    it('matches the trainer key even with a :version suffix', () => {
      expect(
        isTrainerKey(
          'replicate/fast-flux-trainer:f463fbfc97389e10a2f443a8a84b6953b1058eafbf0c9af4d84457ff07cb04db',
        ),
      ).toBe(true);
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
