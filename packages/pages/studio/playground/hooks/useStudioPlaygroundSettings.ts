'use client';

import type { GenerationSetupValues } from '@genfeedai/contracts/interfaces/studio/generation-setup.interface';
import type {
  StudioPlaygroundSettings,
  StudioPlaygroundType,
} from '@pages/studio/playground/types';
import {
  generationSetupValuesToStudioSettingsPatch,
  getDefaultGenerationSetupValues,
  STUDIO_CLEARABLE_SETUP_KEYS,
  STUDIO_RESIDUAL_SETTINGS_KEYS,
  seedGenerationSetupFromLegacyStudioSettings,
  splitStudioSettingsPatch,
  studioSettingsFieldsToGenerationSetupPatch,
} from '@pages/studio/playground/utils/studio-generation-setup-bridge';
import type {
  StudioPlaygroundPersistedState,
  StudioPlaygroundSettingsByType,
} from '@pages/studio/playground/utils/studio-playground-storage';
import {
  getDefaultStudioPlaygroundState,
  readStudioPlaygroundState,
  writeStudioPlaygroundState,
} from '@pages/studio/playground/utils/studio-playground-storage';
import { STUDIO_PLAYGROUND_TYPES } from '@pages/studio/playground/utils/studio-playground-types';
import {
  buildStudioGenerationSetupScope,
  normalizeGenerationSetupValues,
  resetGenerationSetupAll,
  setGenerationSetupField,
  useGenerationSetupStore,
} from '@ui/dropdowns/generation-setup/generation-setup.store';
import { useCallback, useEffect, useMemo, useState } from 'react';

export interface UseStudioPlaygroundSettingsReturn {
  applyTypeSettings: (
    type: StudioPlaygroundType,
    patch: Partial<StudioPlaygroundSettings>,
  ) => void;
  isHydrated: boolean;
  resetSettings: () => void;
  /**
   * Applies a saved draft's setups for every type. Only fields that differ
   * from the current setup are written, so agent-owned defaults stay agent
   * owned.
   */
  restoreSettings: (state: StudioPlaygroundPersistedState) => void;
  settings: StudioPlaygroundSettings;
  /** Every type's effective settings, for the server-side composer draft. */
  settingsByType: StudioPlaygroundSettingsByType;
  setType: (type: StudioPlaygroundType) => void;
  type: StudioPlaygroundType;
  updateSettings: (patch: Partial<StudioPlaygroundSettings>) => void;
}

function applyBridgedPatch(
  scope: string,
  patch: Partial<GenerationSetupValues>,
  defaults: GenerationSetupValues,
): void {
  if (defaults.type === 'music') {
    useGenerationSetupStore.getState().patchMusicFields(scope, patch, defaults);
    return;
  }
  for (const key of Object.keys(patch) as (keyof GenerationSetupValues)[]) {
    const value = patch[key];
    if (value !== undefined) {
      setGenerationSetupField(scope, key, value, defaults);
    }
  }
}

/**
 * Thin adapter over the shared Unified Generation Setup store
 * (`useGenerationSetupStore`). The 15 fields payload builders already know
 * (`aspectRatio`, `modelKey`, `style`, …) live under the `studio:${type}`
 * scope so the same agent-recommendation/preset engine that backs
 * `GenerationSetupPopover` drives Studio; the 7 residual fields with no
 * shared-store equivalent (`avatarPhotoUrl`, `blacklist`, `folder`,
 * `isAudioEnabled`, `speech`, `tags`, `voiceId`) stay local, persisted
 * exactly as before via `studio-playground-storage`. On mount, legacy
 * persisted settings are migrated into the shared store once (idempotent,
 * diff-based — see `seedGenerationSetupFromLegacyStudioSettings`).
 */
export function useStudioPlaygroundSettings(): UseStudioPlaygroundSettingsReturn {
  const [type, setTypeState] = useState<StudioPlaygroundType>(
    () => getDefaultStudioPlaygroundState().type,
  );
  const [residualByType, setResidualByType] =
    useState<StudioPlaygroundSettingsByType>(
      () => getDefaultStudioPlaygroundState().settingsByType,
    );
  const [isHydrated, setIsHydrated] = useState(false);

  const scope = useMemo(() => buildStudioGenerationSetupScope(type), [type]);
  const defaults = useMemo(() => getDefaultGenerationSetupValues(type), [type]);

  const setupByScope = useGenerationSetupStore((state) => state.setupByScope);
  const setup = setupByScope[scope];
  const values = normalizeGenerationSetupValues(setup?.values ?? defaults);

  // Runs once on mount only: rehydrates the residual local settings and
  // migrates legacy values into the shared store. The migration is
  // idempotent (never clobbers an existing scope), so re-running it on every
  // render would be redundant.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const persisted = readStudioPlaygroundState();
    setTypeState(persisted.type);
    setResidualByType(persisted.settingsByType);
    seedGenerationSetupFromLegacyStudioSettings(persisted);
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }
    writeStudioPlaygroundState({ settingsByType: residualByType, type });
  }, [isHydrated, residualByType, type]);

  const settings: StudioPlaygroundSettings = useMemo(
    () => ({
      ...residualByType[type],
      ...generationSetupValuesToStudioSettingsPatch(values),
    }),
    [residualByType, type, values],
  );

  const settingsByType = useMemo(
    () =>
      STUDIO_PLAYGROUND_TYPES.reduce((accumulator, settingsType) => {
        const typeValues = normalizeGenerationSetupValues(
          setupByScope[buildStudioGenerationSetupScope(settingsType)]?.values ??
            getDefaultGenerationSetupValues(settingsType),
        );
        accumulator[settingsType] = {
          ...residualByType[settingsType],
          ...generationSetupValuesToStudioSettingsPatch(typeValues),
        };
        return accumulator;
      }, {} as StudioPlaygroundSettingsByType),
    [residualByType, setupByScope],
  );

  const updateSettings = useCallback(
    (patch: Partial<StudioPlaygroundSettings>) => {
      const { bridged, residual } = splitStudioSettingsPatch(patch);
      applyBridgedPatch(scope, bridged, defaults);

      if (Object.keys(residual).length > 0) {
        setResidualByType((previous) => ({
          ...previous,
          [type]: { ...previous[type], ...residual },
        }));
      }
    },
    [defaults, scope, type],
  );

  const applyTypeSettings = useCallback(
    (
      nextType: StudioPlaygroundType,
      patch: Partial<StudioPlaygroundSettings>,
    ) => {
      setTypeState(nextType);

      const nextScope = buildStudioGenerationSetupScope(nextType);
      const nextDefaults = getDefaultGenerationSetupValues(nextType);
      const { bridged, residual } = splitStudioSettingsPatch(patch);
      applyBridgedPatch(nextScope, bridged, nextDefaults);

      if (Object.keys(residual).length > 0) {
        setResidualByType((previous) => ({
          ...previous,
          [nextType]: { ...previous[nextType], ...residual },
        }));
      }
    },
    [],
  );

  // The saved draft is the whole setup: a field it leaves empty is cleared,
  // not merged over, so a stale local style, folder or identity never leaks
  // into the restored composer.
  const restoreSettings = useCallback(
    (state: StudioPlaygroundPersistedState) => {
      const { setupByScope: currentSetups } =
        useGenerationSetupStore.getState();

      for (const settingsType of STUDIO_PLAYGROUND_TYPES) {
        const typeScope = buildStudioGenerationSetupScope(settingsType);
        const typeDefaults = getDefaultGenerationSetupValues(settingsType);
        const current = normalizeGenerationSetupValues(
          currentSetups[typeScope]?.values ?? typeDefaults,
        );
        const restored = studioSettingsFieldsToGenerationSetupPatch(
          state.settingsByType[settingsType],
        );
        const changed = Object.fromEntries(
          Object.entries(restored).filter(
            ([key, value]) =>
              current[key as keyof GenerationSetupValues] !== value,
          ),
        ) as Partial<GenerationSetupValues>;
        if (Object.keys(changed).length > 0) {
          applyBridgedPatch(typeScope, changed, typeDefaults);
        }
        for (const key of STUDIO_CLEARABLE_SETUP_KEYS) {
          if (restored[key] === undefined && current[key] !== undefined) {
            setGenerationSetupField(typeScope, key, undefined, typeDefaults);
          }
        }
      }

      setResidualByType((previous) =>
        STUDIO_PLAYGROUND_TYPES.reduce(
          (accumulator, settingsType) => {
            const residual: Partial<StudioPlaygroundSettings> = {};
            for (const key of STUDIO_RESIDUAL_SETTINGS_KEYS) {
              (residual as Record<string, unknown>)[key] =
                state.settingsByType[settingsType][key];
            }
            accumulator[settingsType] = {
              ...previous[settingsType],
              ...residual,
            };
            return accumulator;
          },
          { ...previous },
        ),
      );
      setTypeState(state.type);
    },
    [],
  );

  const resetSettings = useCallback(() => {
    resetGenerationSetupAll(scope, defaults);
    setResidualByType((previous) => ({
      ...previous,
      [type]: getDefaultStudioPlaygroundState().settingsByType[type],
    }));
  }, [defaults, scope, type]);

  const setType = useCallback((next: StudioPlaygroundType) => {
    setTypeState(next);
  }, []);

  return {
    applyTypeSettings,
    isHydrated,
    resetSettings,
    restoreSettings,
    settings,
    settingsByType,
    setType,
    type,
    updateSettings,
  };
}
