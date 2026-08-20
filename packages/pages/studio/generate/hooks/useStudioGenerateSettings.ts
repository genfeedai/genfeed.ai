'use client';

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
import { useCallback, useEffect, useMemo, useState } from 'react';

export interface UseStudioGenerateSettingsReturn {
  resetSettings: () => void;
  settings: StudioGenerateSettings;
  setType: (type: StudioGenerateType) => void;
  type: StudioGenerateType;
  updateSettings: (patch: Partial<StudioGenerateSettings>) => void;
}

/**
 * Per-type composer settings. Each asset type keeps its own aspect ratio,
 * model, and Look so switching the type chip never silently rewrites another
 * type's setup. State is rehydrated from localStorage after mount to keep the
 * first server render deterministic.
 */
export function useStudioGenerateSettings(): UseStudioGenerateSettingsReturn {
  const [type, setTypeState] = useState<StudioGenerateType>(
    () => getDefaultStudioGenerateState().type,
  );
  const [settingsByType, setSettingsByType] =
    useState<StudioGenerateSettingsByType>(
      () => getDefaultStudioGenerateState().settingsByType,
    );
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const persisted = readStudioGenerateState();
    setTypeState(persisted.type);
    setSettingsByType(persisted.settingsByType);
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }
    writeStudioGenerateState({ settingsByType, type });
  }, [isHydrated, settingsByType, type]);

  const updateSettings = useCallback(
    (patch: Partial<StudioGenerateSettings>) => {
      setSettingsByType((previous) => ({
        ...previous,
        [type]: { ...previous[type], ...patch },
      }));
    },
    [type],
  );

  const resetSettings = useCallback(() => {
    setSettingsByType((previous) => ({
      ...previous,
      [type]: getDefaultStudioGenerateState().settingsByType[type],
    }));
  }, [type]);

  const setType = useCallback((next: StudioGenerateType) => {
    setTypeState(next);
  }, []);

  const settings = useMemo(() => settingsByType[type], [settingsByType, type]);

  return { resetSettings, settings, setType, type, updateSettings };
}
