import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import type { AgentGenerationType } from '@genfeedai/agent/utils/agent-generation-setup.util';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import type { IStudioLook } from '@genfeedai/contracts/interfaces';
import type { GenerationSetupValues } from '@genfeedai/contracts/interfaces/studio/generation-setup.interface';
import { logger } from '@genfeedai/services/core/logger.service';
import { StudioLooksService } from '@services/content/studio-looks.service';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseAgentGenerationSetupPresetsReturn {
  deletePreset: (id: string) => Promise<boolean>;
  isPresetsLoading: boolean;
  /** Fetches once per org+brand+type scope — safe to call on every open. */
  loadPresets: () => void;
  presets: readonly IStudioLook[];
  savePreset: (
    label: string,
    values: GenerationSetupValues,
  ) => Promise<boolean>;
}

/**
 * Builds the full widened `StudioLookPayload`. Reimplemented from
 * `packages/pages/studio/generate/hooks/useStudioLooks.ts` — cross-package
 * imports from `packages/pages` are not permitted, and the body is small
 * enough that duplicating it beats introducing a shared dependency for one
 * function.
 */
function buildAgentStudioLookPayload(
  label: string,
  type: AgentGenerationType,
  values: GenerationSetupValues,
) {
  const isVideo = type === 'video';

  return {
    aspectRatio: values.aspectRatio,
    assetType: type,
    brandingMode: values.brandingMode,
    camera: values.camera ?? '',
    cameraMovement: isVideo ? (values.cameraMovement ?? '') : null,
    duration: isVideo ? (values.duration ?? null) : null,
    isPromptEnhanceEnabled: values.isPromptEnhanceEnabled,
    label: label.trim(),
    lens: values.lens ?? '',
    lighting: values.lighting ?? '',
    modelKey: values.modelKey || null,
    mood: values.mood ?? '',
    outputs: values.outputs,
    prioritize: values.prioritize,
    promptTemplate: values.promptTemplate ?? '',
    resolution: values.resolution ?? null,
    scene: values.scene ?? '',
    style: values.style ?? '',
  };
}

/**
 * Projects a persisted preset back onto the shared generation-setup store's
 * values, for `onApplyPreset`. Reimplemented from `useStudioLooks.ts` for the
 * same cross-package reason as `buildAgentStudioLookPayload`.
 */
export function agentPresetToGenerationSetupValues(
  preset: IStudioLook,
): Partial<GenerationSetupValues> {
  const isVideo = preset.assetType === 'video';
  const patch: Partial<GenerationSetupValues> = {
    camera: preset.camera || undefined,
    lens: preset.lens || undefined,
    lighting: preset.lighting || undefined,
    mood: preset.mood || undefined,
    promptTemplate: preset.promptTemplate || undefined,
    scene: preset.scene || undefined,
    style: preset.style || undefined,
  };

  if (isVideo && preset.cameraMovement) {
    patch.cameraMovement = preset.cameraMovement;
  }
  if (isVideo && preset.duration != null) {
    patch.duration = preset.duration;
  }
  if (preset.aspectRatio) {
    patch.aspectRatio = preset.aspectRatio;
  }
  if (preset.brandingMode) {
    patch.brandingMode = preset.brandingMode;
  }
  if (preset.isPromptEnhanceEnabled != null) {
    patch.isPromptEnhanceEnabled = preset.isPromptEnhanceEnabled;
  }
  if (preset.modelKey) {
    patch.modelKey = preset.modelKey;
  }
  if (preset.outputs != null) {
    patch.outputs = preset.outputs;
  }
  if (preset.prioritize) {
    patch.prioritize = preset.prioritize;
  }
  if (preset.resolution) {
    patch.resolution = preset.resolution;
  }

  return patch;
}

/**
 * Lazily loads Studio Looks (org + brand scoped) for the agent composer's
 * `GenerationSetupPopover`. `loadPresets` is a no-op once a scope has been
 * fetched — the toolbar calls it from a `pointerdown` listener on the
 * popover's trigger button, since the popover manages its own open state
 * internally and exposes no open-change prop.
 */
export function useAgentGenerationSetupPresets(
  apiService: AgentApiService | undefined,
  type: AgentGenerationType,
): UseAgentGenerationSetupPresetsReturn {
  const { brandId, organizationId } = useBrand();
  const scopeKey =
    organizationId && brandId ? `${organizationId}${brandId}${type}` : '';

  const [presets, setPresets] = useState<readonly IStudioLook[]>([]);
  const [isPresetsLoading, setIsPresetsLoading] = useState(false);
  const loadedScopeRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (loadedScopeRef.current !== scopeKey) {
      loadedScopeRef.current = null;
      setPresets([]);
      setIsPresetsLoading(false);
    }
  }, [scopeKey]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const loadPresets = useCallback(() => {
    if (!apiService || !scopeKey || loadedScopeRef.current === scopeKey) {
      return;
    }

    loadedScopeRef.current = scopeKey;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsPresetsLoading(true);

    void (async () => {
      try {
        const token = await apiService.getToken();
        if (!token || controller.signal.aborted) {
          return;
        }

        const looks = await StudioLooksService.getInstance(
          token,
        ).findForAssetType(type, controller.signal);
        if (!controller.signal.aborted) {
          setPresets(looks);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          logger.error('Failed to load agent generation-setup presets', error);
          loadedScopeRef.current = null;
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsPresetsLoading(false);
        }
      }
    })();
  }, [apiService, scopeKey, type]);

  const savePreset = useCallback(
    async (label: string, values: GenerationSetupValues) => {
      if (!apiService || !label.trim()) {
        return false;
      }

      try {
        const token = await apiService.getToken();
        if (!token) {
          return false;
        }

        const created = await StudioLooksService.getInstance(token).post(
          buildAgentStudioLookPayload(label, type, values),
        );
        setPresets((current) => [created, ...current]);
        return true;
      } catch (error) {
        logger.error('Failed to save agent generation-setup preset', error);
        return false;
      }
    },
    [apiService, type],
  );

  const deletePreset = useCallback(
    async (id: string) => {
      if (!apiService) {
        return false;
      }

      try {
        const token = await apiService.getToken();
        if (!token) {
          return false;
        }

        await StudioLooksService.getInstance(token).removeLook(id);
        setPresets((current) => current.filter((preset) => preset.id !== id));
        return true;
      } catch (error) {
        logger.error('Failed to delete agent generation-setup preset', error);
        return false;
      }
    },
    [apiService],
  );

  return { deletePreset, isPresetsLoading, loadPresets, presets, savePreset };
}
