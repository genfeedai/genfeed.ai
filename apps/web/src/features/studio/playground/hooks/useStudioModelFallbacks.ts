'use client';

import { RouterPriority } from '@genfeedai/contracts';
import type { AgentStudioHandoffPayload } from '@genfeedai/contracts/interfaces';
import { isAutoStudioModelKey } from '@genfeedai/pricing';
import { AUTO_MODEL_OPTION_VALUE } from '@ui/dropdowns/model-selector/model-selector.constants';
import { useEffect } from 'react';
import { useAdvancedModePreference } from '@/features/studio/hooks/use-advanced-mode-preference/use-advanced-mode-preference';
import type { StudioPlaygroundCapabilities } from '@/features/studio/playground/types';
import type { StudioWorkspaceScope } from '@/features/studio/props/studio-playground-workspace.props';

export interface UseStudioModelFallbacksParams
  extends Pick<
    StudioWorkspaceScope,
    'models' | 'notificationsService' | 'settings' | 'type' | 'updateSettings'
  > {
  capabilities: StudioPlaygroundCapabilities;
  handoffPayload: AgentStudioHandoffPayload | null;
  isModelCatalogReady: boolean;
}

/**
 * Keeps the saved model pick honest: Auto when Advanced is off, and a
 * fallback (with a notice) when the saved model left the organization's
 * catalog.
 */
export function useStudioModelFallbacks({
  capabilities,
  handoffPayload,
  isModelCatalogReady,
  models,
  notificationsService,
  settings,
  type,
  updateSettings,
}: UseStudioModelFallbacksParams) {
  // Auto (Advanced off) hides model choice and always routes for top quality,
  // so a concrete pick or priority saved earlier must not keep applying
  // unseen. An Agent handoff's pick is kept.
  const { isAdvancedMode, isLoaded: isAdvancedModeLoaded } =
    useAdvancedModePreference();
  useEffect(() => {
    if (
      !isAdvancedModeLoaded ||
      isAdvancedMode ||
      !capabilities.hasModelSelection ||
      handoffPayload ||
      // Editing has a contractual default (Ideogram 4.5). Choosing Auto there
      // is a deliberate, Advanced choice, never what simple mode implies.
      type === 'image-edit' ||
      (isAutoStudioModelKey(settings.modelKey) &&
        settings.prioritize === RouterPriority.QUALITY)
    ) {
      return;
    }
    updateSettings({
      modelKey: AUTO_MODEL_OPTION_VALUE,
      prioritize: RouterPriority.QUALITY,
    });
  }, [
    capabilities.hasModelSelection,
    handoffPayload,
    isAdvancedMode,
    isAdvancedModeLoaded,
    settings.modelKey,
    settings.prioritize,
    type,
    updateSettings,
  ]);

  // A persisted model pick can outlive the org's catalog (model disabled or
  // retired). Fall back to Auto once this type's catalog has actually loaded
  // instead of showing "Model unavailable" and blocking Generate.
  useEffect(() => {
    if (
      !isModelCatalogReady ||
      !capabilities.hasModelSelection ||
      isAutoStudioModelKey(settings.modelKey) ||
      models.some((model) => model.key === settings.modelKey)
    ) {
      return;
    }
    // An editor the org no longer offers falls back to its own editing default
    // before Auto, so the selection keeps naming a model.
    const fallbackEditor =
      type === 'image-edit'
        ? (models.find((model) => model.isDefault) ?? models[0])
        : undefined;
    updateSettings({
      modelKey: fallbackEditor?.key ?? AUTO_MODEL_OPTION_VALUE,
    });
    notificationsService.info(
      fallbackEditor
        ? `Your saved model is no longer available — Studio switched to ${fallbackEditor.label}.`
        : 'Your saved model is no longer available — Studio switched to Auto.',
    );
  }, [
    capabilities.hasModelSelection,
    isModelCatalogReady,
    models,
    notificationsService,
    settings.modelKey,
    type,
    updateSettings,
  ]);
}
