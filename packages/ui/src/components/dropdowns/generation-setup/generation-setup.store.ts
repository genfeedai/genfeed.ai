/**
 * Shared Unified Generation Setup store. One scope-keyed map backs both the
 * Studio composer and the agent composer so a single `GenerationSetupPopover`
 * can serve either surface — the caller only supplies a scope key and a set
 * of field defaults (this package stays product-agnostic and never imports
 * Studio's default-settings util).
 *
 * Provenance model: `sources[key]` is unset while the agent owns a field, and
 * becomes `'user'` or `'preset'` once something more specific has decided it.
 * `applyRecommendation` only ever writes fields the agent still owns, and a
 * pinned `presetId` freezes recomposition entirely until the caller clears it.
 *
 * Pattern-matched against the retired agent-preferred-model.store (scope-keyed
 * map, standalone read/write wrappers, adopt-new-scope helper — superseded by
 * this store) and apps/app/src/store/brand-interview-draft.store.ts (zustand
 * `persist`, scope map, `partialize`).
 */
import type {
  GenerationSetup,
  GenerationSetupFieldKey,
  GenerationSetupRecommendation,
  GenerationSetupValues,
} from '@genfeedai/contracts/interfaces/studio/generation-setup.interface';
import type { StudioGenerateType } from '@genfeedai/contracts/interfaces/studio/studio-generate.interface';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Studio scope key: one setup per generate type, e.g. `studio:image`. */
export function buildStudioGenerationSetupScope(
  type: StudioGenerateType,
): string {
  return `studio:${type}`;
}

const NEW_AGENT_THREAD_SCOPE = '__new__';

/**
 * Agent scope key: one setup per thread + generation type. A thread that has
 * not been created yet uses the `__new__` placeholder, mirroring
 * `resolveGenerationScopeKey` in agent-preferred-model.store.ts.
 */
export function buildAgentGenerationSetupScope(
  threadId: string | null | undefined,
  generationType: StudioGenerateType,
): string {
  const thread = threadId?.trim() || NEW_AGENT_THREAD_SCOPE;
  return `agent:${thread}:${generationType}`;
}

function createEmptyGenerationSetup(
  defaults: GenerationSetupValues,
): GenerationSetup {
  return {
    sources: {},
    values: { ...defaults },
  };
}

function getOrCreateSetup(
  setupByScope: Record<string, GenerationSetup>,
  scope: string,
  defaults: GenerationSetupValues,
): GenerationSetup {
  return setupByScope[scope] ?? createEmptyGenerationSetup(defaults);
}

export interface GenerationSetupState {
  /** Persisted. */
  setupByScope: Record<string, GenerationSetup>;
  /**
   * Runtime-only "why" copy for the fields the agent currently owns. Never
   * persisted — a stale reason surviving a reload with no fresh
   * recommendation behind it would be misleading.
   */
  reasonsByScope: Record<
    string,
    Partial<Record<GenerationSetupFieldKey, string>>
  >;

  setField: <K extends GenerationSetupFieldKey>(
    scope: string,
    key: K,
    value: GenerationSetupValues[K],
    defaults: GenerationSetupValues,
  ) => void;
  applyRecommendation: (
    scope: string,
    recommendation: GenerationSetupRecommendation,
    defaults: GenerationSetupValues,
  ) => void;
  applyPreset: (
    scope: string,
    presetId: string,
    values: Partial<GenerationSetupValues>,
    defaults: GenerationSetupValues,
  ) => void;
  resetField: (
    scope: string,
    key: GenerationSetupFieldKey,
    defaults: GenerationSetupValues,
  ) => void;
  resetAll: (scope: string, defaults: GenerationSetupValues) => void;
  clearPreset: (scope: string) => void;
}

export const GENERATION_SETUP_STORAGE_KEY = 'genfeed-generation-setup';
export const GENERATION_SETUP_STORE_VERSION = 1;

export const useGenerationSetupStore = create<GenerationSetupState>()(
  persist(
    (set, get) => ({
      reasonsByScope: {},
      setupByScope: {},

      setField: (scope, key, value, defaults) => {
        const current = getOrCreateSetup(get().setupByScope, scope, defaults);
        const hadPreset = Boolean(current.presetId);
        // A field the operator hand-picks is sticky and, if a preset is
        // pinned, diverges the setup from that preset — the pin is released
        // so subsequent edits are plain user edits, not a half-applied preset.
        const next: GenerationSetup = {
          presetId: hadPreset ? undefined : current.presetId,
          sources: { ...current.sources, [key]: 'user' },
          values: { ...current.values, [key]: value },
        };

        set({
          setupByScope: { ...get().setupByScope, [scope]: next },
        });
      },

      applyRecommendation: (scope, recommendation, defaults) => {
        const current = getOrCreateSetup(get().setupByScope, scope, defaults);

        // A pinned preset freezes recomposition entirely — the agent does not
        // get to partially rewrite a setup the operator explicitly saved.
        if (current.presetId) {
          return;
        }

        const nextValues = { ...current.values };
        const nextSources = { ...current.sources };
        const nextReasons: Partial<Record<GenerationSetupFieldKey, string>> =
          {};
        let didChange = false;

        for (const key of Object.keys(
          recommendation.values,
        ) as GenerationSetupFieldKey[]) {
          const source = current.sources[key];
          if (source === 'user' || source === 'preset') {
            continue;
          }

          const value = recommendation.values[key];
          if (value === undefined) {
            continue;
          }

          (nextValues as Record<GenerationSetupFieldKey, unknown>)[key] = value;
          nextSources[key] = 'agent';
          const reason = recommendation.reasons[key];
          if (reason) {
            nextReasons[key] = reason;
          }
          didChange = true;
        }

        if (!didChange) {
          return;
        }

        set({
          reasonsByScope: { ...get().reasonsByScope, [scope]: nextReasons },
          setupByScope: {
            ...get().setupByScope,
            [scope]: { ...current, sources: nextSources, values: nextValues },
          },
        });
      },

      applyPreset: (scope, presetId, values, defaults) => {
        const current = getOrCreateSetup(get().setupByScope, scope, defaults);
        const nextValues = { ...current.values, ...values };
        const nextSources = { ...current.sources };

        for (const key of Object.keys(values) as GenerationSetupFieldKey[]) {
          nextSources[key] = 'preset';
        }

        set({
          setupByScope: {
            ...get().setupByScope,
            [scope]: {
              presetId,
              sources: nextSources,
              values: nextValues,
            },
          },
        });
      },

      resetField: (scope, key, defaults) => {
        const current = getOrCreateSetup(get().setupByScope, scope, defaults);
        if (!(key in current.sources) && !current.presetId) {
          return;
        }

        const nextSources = { ...current.sources };
        delete nextSources[key];

        set({
          setupByScope: {
            ...get().setupByScope,
            // Resetting one field breaks a pinned preset's "every field
            // matches" invariant, so the pin is released too.
            [scope]: {
              presetId: undefined,
              sources: nextSources,
              values: current.values,
            },
          },
        });
      },

      resetAll: (scope, defaults) => {
        const current = getOrCreateSetup(get().setupByScope, scope, defaults);

        set({
          reasonsByScope: { ...get().reasonsByScope, [scope]: {} },
          setupByScope: {
            ...get().setupByScope,
            [scope]: {
              presetId: undefined,
              sources: {},
              values: current.values,
            },
          },
        });
      },

      clearPreset: (scope) => {
        const current = get().setupByScope[scope];
        if (!current?.presetId) {
          return;
        }

        set({
          setupByScope: {
            ...get().setupByScope,
            [scope]: { ...current, presetId: undefined },
          },
        });
      },
    }),
    {
      name: GENERATION_SETUP_STORAGE_KEY,
      partialize: (state) => ({ setupByScope: state.setupByScope }),
      version: GENERATION_SETUP_STORE_VERSION,
    },
  ),
);

/**
 * Reads a scope's setup, falling back to an agent-owned setup seeded from
 * `defaults` when the scope has never been written. Does not create the
 * scope entry — pure read.
 */
export function getGenerationSetup(
  scope: string,
  defaults: GenerationSetupValues,
): GenerationSetup {
  return getOrCreateSetup(
    useGenerationSetupStore.getState().setupByScope,
    scope,
    defaults,
  );
}

/** Runtime-only "why" reasons for the fields the agent currently owns. */
export function getGenerationSetupReasons(
  scope: string,
): Partial<Record<GenerationSetupFieldKey, string>> {
  return useGenerationSetupStore.getState().reasonsByScope[scope] ?? {};
}

export function setGenerationSetupField<K extends GenerationSetupFieldKey>(
  scope: string,
  key: K,
  value: GenerationSetupValues[K],
  defaults: GenerationSetupValues,
): void {
  useGenerationSetupStore.getState().setField(scope, key, value, defaults);
}

export function applyGenerationSetupRecommendation(
  scope: string,
  recommendation: GenerationSetupRecommendation,
  defaults: GenerationSetupValues,
): void {
  useGenerationSetupStore
    .getState()
    .applyRecommendation(scope, recommendation, defaults);
}

export function applyGenerationSetupPreset(
  scope: string,
  presetId: string,
  values: Partial<GenerationSetupValues>,
  defaults: GenerationSetupValues,
): void {
  useGenerationSetupStore
    .getState()
    .applyPreset(scope, presetId, values, defaults);
}

export function resetGenerationSetupField(
  scope: string,
  key: GenerationSetupFieldKey,
  defaults: GenerationSetupValues,
): void {
  useGenerationSetupStore.getState().resetField(scope, key, defaults);
}

export function resetGenerationSetupAll(
  scope: string,
  defaults: GenerationSetupValues,
): void {
  useGenerationSetupStore.getState().resetAll(scope, defaults);
}

export function clearGenerationSetupPreset(scope: string): void {
  useGenerationSetupStore.getState().clearPreset(scope);
}

/**
 * `/agent/new` writes its setup under the `__new__` scope for every
 * generation type. Once the URL catches up to the created thread, copy those
 * setups once so the operator's in-flight picks survive — mirrors
 * `adoptNewThreadGenerationPrefs` in agent-preferred-model.store.ts.
 */
export function adoptNewScopeSetup(fromScope: string, toScope: string): void {
  if (!fromScope || !toScope || fromScope === toScope) {
    return;
  }

  const setupByScope = useGenerationSetupStore.getState().setupByScope;
  const source = setupByScope[fromScope];
  if (!source || setupByScope[toScope]) {
    return;
  }

  useGenerationSetupStore.setState({
    setupByScope: { ...setupByScope, [toScope]: { ...source } },
  });
}
