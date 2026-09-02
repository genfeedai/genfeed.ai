import type {
  GenerationSetupRecommendation,
  GenerationSetupValues,
} from '@genfeedai/contracts/interfaces/studio/generation-setup.interface';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  adoptNewScopeSetup,
  applyGenerationSetupPreset,
  applyGenerationSetupRecommendation,
  buildAgentGenerationSetupScope,
  buildStudioGenerationSetupScope,
  clearGenerationSetupPreset,
  GENERATION_SETUP_STORAGE_KEY,
  GENERATION_SETUP_STORE_VERSION,
  getGenerationSetup,
  getGenerationSetupReasons,
  resetGenerationSetupAll,
  resetGenerationSetupField,
  setGenerationSetupField,
  useGenerationSetupStore,
} from './generation-setup.store';

const DEFAULTS: GenerationSetupValues = {
  aspectRatio: '1:1',
  brandingMode: 'off',
  isPromptEnhanceEnabled: true,
  modelKey: '',
  outputs: 1,
  prioritize: 'balanced' as GenerationSetupValues['prioritize'],
  type: 'image',
};

const SCOPE = 'studio:image';

function readPersisted(): {
  state?: { setupByScope?: unknown };
  version?: number;
} | null {
  const raw = window.localStorage.getItem(GENERATION_SETUP_STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

describe('generation-setup.store', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useGenerationSetupStore.setState({
      reasonsByScope: {},
      setupByScope: {},
    });
  });

  describe('scope key builders', () => {
    it('builds a studio scope from the generate type', () => {
      expect(buildStudioGenerationSetupScope('image')).toBe('studio:image');
      expect(buildStudioGenerationSetupScope('video')).toBe('studio:video');
    });

    it('builds an agent scope from thread id + generation type', () => {
      expect(buildAgentGenerationSetupScope('thread-1', 'video')).toBe(
        'agent:thread-1:video',
      );
    });

    it('falls back to the __new__ placeholder when no thread id exists yet', () => {
      expect(buildAgentGenerationSetupScope(undefined, 'image')).toBe(
        'agent:__new__:image',
      );
      expect(buildAgentGenerationSetupScope(null, 'image')).toBe(
        'agent:__new__:image',
      );
      expect(buildAgentGenerationSetupScope('   ', 'image')).toBe(
        'agent:__new__:image',
      );
    });
  });

  describe('getGenerationSetup', () => {
    it('seeds an agent-owned setup from defaults for an unknown scope', () => {
      const setup = getGenerationSetup(SCOPE, DEFAULTS);

      expect(setup.values).toEqual(DEFAULTS);
      expect(setup.sources).toEqual({});
      expect(setup.presetId).toBeUndefined();
    });

    it('does not create a store entry as a side effect of reading', () => {
      getGenerationSetup(SCOPE, DEFAULTS);

      expect(
        useGenerationSetupStore.getState().setupByScope[SCOPE],
      ).toBeUndefined();
    });
  });

  describe('setField', () => {
    it('marks the field user-owned and stores the value', () => {
      setGenerationSetupField(SCOPE, 'aspectRatio', '16:9', DEFAULTS);

      const setup = getGenerationSetup(SCOPE, DEFAULTS);
      expect(setup.values.aspectRatio).toBe('16:9');
      expect(setup.sources.aspectRatio).toBe('user');
    });

    it('clears a pinned preset on divergence, even when the value is unchanged', () => {
      applyGenerationSetupPreset(
        SCOPE,
        'preset-1',
        { aspectRatio: '16:9', outputs: 4 },
        DEFAULTS,
      );

      setGenerationSetupField(SCOPE, 'aspectRatio', '16:9', DEFAULTS);

      const setup = getGenerationSetup(SCOPE, DEFAULTS);
      expect(setup.presetId).toBeUndefined();
      expect(setup.sources.aspectRatio).toBe('user');
      // The other preset-sourced field is untouched by the unrelated edit.
      expect(setup.sources.outputs).toBe('preset');
    });

    it('never touches other fields', () => {
      setGenerationSetupField(SCOPE, 'outputs', 4, DEFAULTS);

      const setup = getGenerationSetup(SCOPE, DEFAULTS);
      expect(setup.sources.aspectRatio).toBeUndefined();
      expect(setup.values.aspectRatio).toBe(DEFAULTS.aspectRatio);
    });
  });

  describe('applyRecommendation', () => {
    function recommendation(
      values: Partial<GenerationSetupValues>,
      reasons: Partial<Record<keyof GenerationSetupValues, string>> = {},
    ): GenerationSetupRecommendation {
      return { reasons, values };
    }

    it('writes agent-owned fields and records a reason', () => {
      applyGenerationSetupRecommendation(
        SCOPE,
        recommendation(
          { aspectRatio: '9:16' },
          { aspectRatio: 'Matches your "story" prompt' },
        ),
        DEFAULTS,
      );

      const setup = getGenerationSetup(SCOPE, DEFAULTS);
      expect(setup.values.aspectRatio).toBe('9:16');
      expect(setup.sources.aspectRatio).toBe('agent');
      expect(getGenerationSetupReasons(SCOPE).aspectRatio).toBe(
        'Matches your "story" prompt',
      );
    });

    it('never overwrites a user-sourced field', () => {
      setGenerationSetupField(SCOPE, 'aspectRatio', '1:1', DEFAULTS);

      applyGenerationSetupRecommendation(
        SCOPE,
        recommendation(
          { aspectRatio: '9:16' },
          { aspectRatio: 'Matches your "story" prompt' },
        ),
        DEFAULTS,
      );

      const setup = getGenerationSetup(SCOPE, DEFAULTS);
      expect(setup.values.aspectRatio).toBe('1:1');
      expect(setup.sources.aspectRatio).toBe('user');
      expect(getGenerationSetupReasons(SCOPE).aspectRatio).toBeUndefined();
    });

    it('never overwrites a preset-sourced field', () => {
      applyGenerationSetupPreset(
        SCOPE,
        'preset-1',
        { aspectRatio: '1:1' },
        DEFAULTS,
      );

      applyGenerationSetupRecommendation(
        SCOPE,
        recommendation({ aspectRatio: '9:16' }, { aspectRatio: 'reason' }),
        DEFAULTS,
      );

      const setup = getGenerationSetup(SCOPE, DEFAULTS);
      expect(setup.values.aspectRatio).toBe('1:1');
      expect(setup.sources.aspectRatio).toBe('preset');
    });

    it('is a full no-op while a preset is pinned, even for fields the preset never covered', () => {
      applyGenerationSetupPreset(
        SCOPE,
        'preset-1',
        { aspectRatio: '1:1' },
        DEFAULTS,
      );

      applyGenerationSetupRecommendation(
        SCOPE,
        recommendation({ outputs: 4 }, { outputs: 'reason' }),
        DEFAULTS,
      );

      const setup = getGenerationSetup(SCOPE, DEFAULTS);
      expect(setup.presetId).toBe('preset-1');
      expect(setup.values.outputs).toBe(DEFAULTS.outputs);
      expect(setup.sources.outputs).toBeUndefined();
      expect(getGenerationSetupReasons(SCOPE).outputs).toBeUndefined();
    });

    it('replaces stale reasons from a prior recommendation pass instead of merging them', () => {
      applyGenerationSetupRecommendation(
        SCOPE,
        recommendation(
          { aspectRatio: '9:16' },
          { aspectRatio: 'first reason' },
        ),
        DEFAULTS,
      );
      applyGenerationSetupRecommendation(
        SCOPE,
        recommendation({ outputs: 4 }, { outputs: 'second reason' }),
        DEFAULTS,
      );

      expect(getGenerationSetupReasons(SCOPE)).toEqual({
        outputs: 'second reason',
      });
    });

    it('ignores undefined values in the recommendation payload', () => {
      applyGenerationSetupRecommendation(
        SCOPE,
        recommendation({ aspectRatio: undefined }, {}),
        DEFAULTS,
      );

      expect(
        useGenerationSetupStore.getState().setupByScope[SCOPE],
      ).toBeUndefined();
    });
  });

  describe('applyPreset', () => {
    it('pins the preset id and marks every covered field preset-sourced', () => {
      applyGenerationSetupPreset(
        SCOPE,
        'preset-1',
        { aspectRatio: '16:9', outputs: 4 },
        DEFAULTS,
      );

      const setup = getGenerationSetup(SCOPE, DEFAULTS);
      expect(setup.presetId).toBe('preset-1');
      expect(setup.sources.aspectRatio).toBe('preset');
      expect(setup.sources.outputs).toBe('preset');
      expect(setup.values.aspectRatio).toBe('16:9');
      expect(setup.values.outputs).toBe(4);
    });

    it('replaces a previously pinned preset outright', () => {
      applyGenerationSetupPreset(
        SCOPE,
        'preset-1',
        { aspectRatio: '16:9' },
        DEFAULTS,
      );
      applyGenerationSetupPreset(SCOPE, 'preset-2', { outputs: 4 }, DEFAULTS);

      const setup = getGenerationSetup(SCOPE, DEFAULTS);
      expect(setup.presetId).toBe('preset-2');
      // Field ownership from the prior preset persists (values were merged),
      // but the pin id itself only ever names the latest preset applied.
      expect(setup.sources.aspectRatio).toBe('preset');
      expect(setup.sources.outputs).toBe('preset');
    });
  });

  describe('resetField', () => {
    it('returns a single field to agent ownership', () => {
      setGenerationSetupField(SCOPE, 'aspectRatio', '16:9', DEFAULTS);
      setGenerationSetupField(SCOPE, 'outputs', 4, DEFAULTS);

      resetGenerationSetupField(SCOPE, 'aspectRatio', DEFAULTS);

      const setup = getGenerationSetup(SCOPE, DEFAULTS);
      expect(setup.sources.aspectRatio).toBeUndefined();
      expect(setup.sources.outputs).toBe('user');
      // Values are left as-is; the caller re-runs recommendation to refill.
      expect(setup.values.aspectRatio).toBe('16:9');
    });

    it('releases a pinned preset even when resetting an unrelated field', () => {
      applyGenerationSetupPreset(
        SCOPE,
        'preset-1',
        { aspectRatio: '16:9', outputs: 4 },
        DEFAULTS,
      );

      resetGenerationSetupField(SCOPE, 'outputs', DEFAULTS);

      const setup = getGenerationSetup(SCOPE, DEFAULTS);
      expect(setup.presetId).toBeUndefined();
      expect(setup.sources.outputs).toBeUndefined();
      expect(setup.sources.aspectRatio).toBe('preset');
    });

    it('is a no-op for an already agent-owned field with no preset pinned', () => {
      resetGenerationSetupField(SCOPE, 'aspectRatio', DEFAULTS);

      expect(
        useGenerationSetupStore.getState().setupByScope[SCOPE],
      ).toBeUndefined();
    });
  });

  describe('resetAll', () => {
    it('returns every field to agent ownership while preserving the last values', () => {
      setGenerationSetupField(SCOPE, 'aspectRatio', '16:9', DEFAULTS);
      applyGenerationSetupPreset(SCOPE, 'preset-1', { outputs: 4 }, DEFAULTS);
      applyGenerationSetupRecommendation(
        SCOPE,
        { reasons: { modelKey: 'Auto-routes' }, values: { modelKey: '' } },
        DEFAULTS,
      );

      resetGenerationSetupAll(SCOPE, DEFAULTS);

      const setup = getGenerationSetup(SCOPE, DEFAULTS);
      expect(setup.sources).toEqual({});
      expect(setup.presetId).toBeUndefined();
      expect(setup.values.aspectRatio).toBe('16:9');
      expect(setup.values.outputs).toBe(4);
      expect(getGenerationSetupReasons(SCOPE)).toEqual({});
    });
  });

  describe('clearPreset', () => {
    it('drops the pin without touching field sources or values', () => {
      applyGenerationSetupPreset(
        SCOPE,
        'preset-1',
        { aspectRatio: '16:9' },
        DEFAULTS,
      );

      clearGenerationSetupPreset(SCOPE);

      const setup = getGenerationSetup(SCOPE, DEFAULTS);
      expect(setup.presetId).toBeUndefined();
      expect(setup.sources.aspectRatio).toBe('preset');
      expect(setup.values.aspectRatio).toBe('16:9');
    });

    it('is a no-op for a scope with no pinned preset', () => {
      clearGenerationSetupPreset(SCOPE);

      expect(
        useGenerationSetupStore.getState().setupByScope[SCOPE],
      ).toBeUndefined();
    });
  });

  describe('adoptNewScopeSetup', () => {
    const FROM_SCOPE = 'agent:__new__:image';
    const TO_SCOPE = 'agent:thread-1:image';

    it('copies the source scope into the destination exactly once', () => {
      setGenerationSetupField(FROM_SCOPE, 'aspectRatio', '16:9', DEFAULTS);

      adoptNewScopeSetup(FROM_SCOPE, TO_SCOPE);

      expect(getGenerationSetup(TO_SCOPE, DEFAULTS).values.aspectRatio).toBe(
        '16:9',
      );
    });

    it('never overwrites a destination scope that already has an entry', () => {
      setGenerationSetupField(FROM_SCOPE, 'aspectRatio', '16:9', DEFAULTS);
      setGenerationSetupField(TO_SCOPE, 'aspectRatio', '1:1', DEFAULTS);

      adoptNewScopeSetup(FROM_SCOPE, TO_SCOPE);

      expect(getGenerationSetup(TO_SCOPE, DEFAULTS).values.aspectRatio).toBe(
        '1:1',
      );
    });

    it('is a no-op when the source scope has never been written', () => {
      adoptNewScopeSetup(FROM_SCOPE, TO_SCOPE);

      expect(
        useGenerationSetupStore.getState().setupByScope[TO_SCOPE],
      ).toBeUndefined();
    });

    it('is a no-op when the scopes are identical or empty', () => {
      setGenerationSetupField(FROM_SCOPE, 'aspectRatio', '16:9', DEFAULTS);

      adoptNewScopeSetup(FROM_SCOPE, FROM_SCOPE);
      adoptNewScopeSetup('', TO_SCOPE);
      adoptNewScopeSetup(FROM_SCOPE, '');

      expect(
        useGenerationSetupStore.getState().setupByScope[TO_SCOPE],
      ).toBeUndefined();
    });
  });

  describe('persistence', () => {
    it('persists setupByScope only, never the runtime-only reasons', () => {
      applyGenerationSetupRecommendation(
        SCOPE,
        { reasons: { aspectRatio: 'reason' }, values: { aspectRatio: '9:16' } },
        DEFAULTS,
      );

      const persisted = readPersisted();
      expect(persisted?.version).toBe(GENERATION_SETUP_STORE_VERSION);
      expect(persisted?.state?.setupByScope).toBeDefined();
      expect(persisted?.state).not.toHaveProperty('reasonsByScope');
    });
  });
});
