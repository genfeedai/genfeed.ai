'use client';

import type { GenerationSetupValues } from '@genfeedai/interfaces/studio/generation-setup.interface';
import type {
  StudioGenerateSettings,
  StudioGenerateType,
} from '@pages/studio/generate/types';
import type { StudioGenerateSettingsByType } from '@pages/studio/generate/utils/studio-generate-storage';
import {
  getDefaultStudioGenerateState,
  readStudioGenerateState,
  writeStudioGenerateState,
} from '@pages/studio/generate/utils/studio-generate-storage';
import {
  generationSetupValuesToStudioSettingsPatch,
  getDefaultGenerationSetupValues,
  seedGenerationSetupFromLegacyStudioSettings,
  splitStudioSettingsPatch,
} from '@pages/studio/generate/utils/studio-generation-setup-bridge';
import {
  buildStudioGenerationSetupScope,
  resetGenerationSetupAll,
  setGenerationSetupField,
  useGenerationSetupStore,
} from '@ui/dropdowns/generation-setup/generation-setup.store';
import { useCallback, useEffect, useMemo, useState } from 'react';

export interface UseStudioGenerateSettingsReturn {
  applyTypeSettings: (
    type: StudioGenerateType,
    patch: Partial<StudioGenerateSettings>,
  ) => void;
  isHydrated: boolean;
  resetSettings: () => void;
  settings: StudioGenerateSettings;
  setType: (type: StudioGenerateType) => void;
  type: StudioGenerateType;
  updateSettings: (patch: Partial<StudioGenerateSettings>) => void;
}

function applyBridgedPatch(
  scope: string,
  patch: Partial<GenerationSetupValues>,
  defaults: GenerationSetupValues,
): void {
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
 * exactly as before via `studio-generate-storage`. On mount, legacy
 * persisted settings are migrated into the shared store once (idempotent,
 * diff-based — see `seedGenerationSetupFromLegacyStudioSettings`).
 */
export function useStudioGenerateSettings(): UseStudioGenerateSettingsReturn {
  const [type, setTypeState] = useState<StudioGenerateType>(
    () => getDefaultStudioGenerateState().type,
  );
  const [residualByType, setResidualByType] =
    useState<StudioGenerateSettingsByType>(
      () => getDefaultStudioGenerateState().settingsByType,
    );
  const [isHydrated, setIsHydrated] = useState(false);

  const scope = useMemo(() => buildStudioGenerationSetupScope(type), [type]);
  const defaults = useMemo(() => getDefaultGenerationSetupValues(type), [type]);

  const setup = useGenerationSetupStore((state) => state.setupByScope[scope]);
  const values = setup?.values ?? defaults;

  // Runs once on mount only: rehydrates the residual local settings and
  // migrates legacy values into the shared store. The migration is
  // idempotent (never clobbers an existing scope), so re-running it on every
  // render would be redundant.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const persisted = readStudioGenerateState();
    setTypeState(persisted.type);
    setResidualByType(persisted.settingsByType);
    seedGenerationSetupFromLegacyStudioSettings(persisted);
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }
    writeStudioGenerateState({ settingsByType: residualByType, type });
  }, [isHydrated, residualByType, type]);

  const settings: StudioGenerateSettings = useMemo(
    () => ({
      ...residualByType[type],
      ...generationSetupValuesToStudioSettingsPatch(values),
    }),
    [residualByType, type, values],
  );

  const updateSettings = useCallback(
    (patch: Partial<StudioGenerateSettings>) => {
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
    (nextType: StudioGenerateType, patch: Partial<StudioGenerateSettings>) => {
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

  const resetSettings = useCallback(() => {
    resetGenerationSetupAll(scope, defaults);
    setResidualByType((previous) => ({
      ...previous,
      [type]: getDefaultStudioGenerateState().settingsByType[type],
    }));
  }, [defaults, scope, type]);

  const setType = useCallback((next: StudioGenerateType) => {
    setTypeState(next);
  }, []);

  return {
    applyTypeSettings,
    isHydrated,
    resetSettings,
    settings,
    setType,
    type,
    updateSettings,
  };
}
