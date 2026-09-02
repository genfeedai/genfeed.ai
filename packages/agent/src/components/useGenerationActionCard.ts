import type {
  AgentUiAction,
  AgentUiActionHandler,
} from '@genfeedai/agent/models/agent-chat.model';
import type {
  AgentApiService,
  GenerationModel,
} from '@genfeedai/agent/services/agent-api.service';
import { runAgentApiEffect } from '@genfeedai/agent/services/agent-base-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { buildDefaultAgentGenerationSetupValues } from '@genfeedai/agent/utils/agent-generation-setup.util';
import { formatStructuredPrompt } from '@genfeedai/agent/utils/format-structured-prompt.util';
import {
  buildAgentGenerationRequestBody,
  DEFAULT_AGENT_GENERATION_PRIORITY,
  getPromptCategoryForGenerationType,
} from '@genfeedai/agent/utils/generation-request';
import {
  hasReachedVideoPilotRetryCeiling,
  resolveVideoPilotDuration,
  VIDEO_PILOT_PAID_RETRY_CEILING,
} from '@genfeedai/agent/utils/video-pilot-gate.util';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import {
  ModelCategory,
  type RouterPriority,
  toRouterPriority,
} from '@genfeedai/contracts';
import {
  getModelMaxVideoReferences,
  hasEndFrame,
  hasInterpolation,
  hasVideoReferences,
  MODEL_KEYS,
  requiresFirstFrame,
} from '@genfeedai/contracts/constants';
import type { GenerationSetupValues } from '@genfeedai/contracts/interfaces/studio/generation-setup.interface';
import {
  getDefaultVideoResolution,
  getVideoResolutionsByModel,
} from '@genfeedai/helpers/media/video-resolution/video-resolution.helper';
import { quoteVideoGenerationCredits } from '@genfeedai/pricing';
import { resolveGenerationModelControls } from '@helpers/generation-controls.helper';
import {
  resolveOrgAllowlistedModels,
  shouldOfferAutoModel,
} from '@helpers/model-allowlist.helper';
import {
  buildAgentGenerationSetupScope,
  getGenerationSetup,
  setGenerationSetupField,
} from '@ui/dropdowns/generation-setup/generation-setup.store';
import {
  AUTO_MODEL_OPTION_VALUE,
  getAutoModelLabel,
} from '@ui/dropdowns/model-selector/model-selector.constants';
import {
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

export type GenerationActionCardStatus =
  | 'idle'
  | 'generating'
  | 'done'
  | 'error'
  | 'pilot_review';

function isKnownInvalidModelVersionError(message: string): boolean {
  const normalized = message.toLowerCase();

  return (
    normalized.includes('status 422') &&
    (normalized.includes('invalid version') ||
      normalized.includes('version does not exist') ||
      normalized.includes('unprocessable entity'))
  );
}

function formatGenerationError(
  message: string,
  options: { isAutoMode: boolean },
): string {
  if (isKnownInvalidModelVersionError(message)) {
    const intro = options.isAutoMode
      ? 'The routed provider model is misconfigured or unavailable. Try another priority or choose a specific model.'
      : 'The selected model is misconfigured or unavailable. Choose another model or switch back to Auto.';

    return `${intro}\n\nOriginal error: ${message}`;
  }

  return message;
}

interface AgentGenerationPreference {
  /** Whether the shared setup scope has an explicit (`'user'`) model pick. */
  hasModelPreference: boolean;
  model: string;
  outputs: number | null;
  priority: RouterPriority | null;
}

/**
 * Reads the shared generation-setup scope's model/priority/outputs prefs,
 * treating a field as "preferred" only when its source is `'user'` — mirrors
 * the null-vs-set distinction the retired `agent-preferred-model.store` made
 * between "never chosen" and "explicitly set to Auto".
 */
function readAgentGenerationPreference(
  scope: string,
  defaults: GenerationSetupValues,
): AgentGenerationPreference {
  const setup = getGenerationSetup(scope, defaults);
  return {
    hasModelPreference: setup.sources.modelKey === 'user',
    model: setup.values.modelKey,
    outputs: setup.sources.outputs === 'user' ? setup.values.outputs : null,
    priority:
      setup.sources.prioritize === 'user' ? setup.values.prioritize : null,
  };
}

interface UseGenerationActionCardParams {
  action: AgentUiAction;
  apiService: AgentApiService;
  onRegenerate?: () => void;
  onUiAction?: AgentUiActionHandler;
}

export function useGenerationActionCard({
  action,
  apiService,
  onRegenerate: onRegenerateProp,
  onUiAction,
}: UseGenerationActionCardParams) {
  const { organizationId, settings, settingsLoading } = useBrand();
  const generationType = action.generationType ?? 'image';
  const initParams = action.generationParams;
  const activeThreadId = useAgentChatStore((s) => s.activeThreadId);
  const setupScope = useMemo(
    () => buildAgentGenerationSetupScope(activeThreadId, generationType),
    [activeThreadId, generationType],
  );
  const setupDefaults = useMemo(
    () => buildDefaultAgentGenerationSetupValues(generationType),
    [generationType],
  );
  const initialPreference = readAgentGenerationPreference(
    setupScope,
    setupDefaults,
  );
  const preferredModel = initialPreference.hasModelPreference
    ? initialPreference.model
    : null;
  const preferredPriority = initialPreference.priority;
  const preferredOutputs = initialPreference.outputs;
  const actionPriority = toRouterPriority(initParams?.prioritize);
  const shouldStartInAutoMode = initialPreference.hasModelPreference
    ? initialPreference.model === ''
    : !initParams?.model;

  const [prompt, setPrompt] = useState(() =>
    formatStructuredPrompt(initParams?.prompt ?? ''),
  );
  const [modelKey, setModelKey] = useState(() =>
    shouldStartInAutoMode ? '' : (preferredModel ?? initParams?.model ?? ''),
  );
  const [isAutoMode, setIsAutoMode] = useState(shouldStartInAutoMode);
  const [aspectRatio, setAspectRatio] = useState(
    initParams?.aspectRatio ?? '1:1',
  );
  const [duration, setDuration] = useState(initParams?.duration ?? 5);
  const [resolution, setResolution] = useState(initParams?.resolution ?? '');
  const [startFrameId, setStartFrameId] = useState<string | null>(
    generationType === 'video' ? (initParams?.references?.[0] ?? null) : null,
  );
  const [endFrameId, setEndFrameId] = useState<string | null>(
    initParams?.endFrame ?? null,
  );
  const [videoReferenceIds, setVideoReferenceIds] = useState<string[]>(
    initParams?.videoReferences ?? [],
  );
  const [referenceNotice, setReferenceNotice] = useState<string | null>(null);
  const [outputs, setOutputs] = useState(() => {
    const requested = preferredOutputs ?? initParams?.outputs;
    return typeof requested === 'number' &&
      Number.isFinite(requested) &&
      requested >= 1
      ? Math.min(8, Math.round(requested))
      : 1;
  });
  const [status, setStatus] = useState<GenerationActionCardStatus>('idle');
  const [paidRejectedCount, setPaidRejectedCount] = useState(0);
  const [pilotDurationSeconds, setPilotDurationSeconds] = useState<
    number | null
  >(null);
  const [isPilotCeilingReached, setIsPilotCeilingReached] = useState(false);
  const isFullRunRef = useRef(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultId, setResultId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prioritize, setPrioritize] = useState<RouterPriority>(
    preferredPriority ?? actionPriority ?? DEFAULT_AGENT_GENERATION_PRIORITY,
  );
  const [models, setModels] = useState<GenerationModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [modelsReloadToken, setModelsReloadToken] = useState(0);
  /** Ingredient IDs selected on the generation canvas as model references. */
  const [referenceIds, setReferenceIds] = useState<string[]>(
    generationType === 'image' ? (initParams?.references ?? []) : [],
  );
  const setThreadUiBusy = useAgentChatStore((s) => s.setThreadUiBusy);
  const setComposerError = useAgentChatStore((s) => s.setError);
  const abortRef = useRef<AbortController | null>(null);
  const busyThreadIdRef = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const next = readAgentGenerationPreference(setupScope, setupDefaults);
    const nextModel = next.hasModelPreference ? next.model : null;
    const nextAuto = next.hasModelPreference
      ? nextModel === ''
      : !initParams?.model;
    setIsAutoMode(nextAuto);
    setModelKey(nextAuto ? '' : (nextModel ?? initParams?.model ?? ''));
    if (next.priority) {
      setPrioritize(next.priority);
    }
    if (typeof next.outputs === 'number') {
      setOutputs(next.outputs);
    }
  }, [setupScope, setupDefaults, initParams?.model]);

  // Fetch models on mount.
  //
  // A failure here used to write into the card's generation `error` slot and
  // leave `models` empty while `modelsLoading` flipped false — the picker then
  // rendered fully enabled with nothing in it, so clicking a model did nothing
  // and the card looked stuck on Auto. Track load failure separately so the
  // control can say so and offer a retry.
  // biome-ignore lint/correctness/useExhaustiveDependencies: modelsReloadToken intentionally re-fires the fetch after a manual retry
  useEffect(() => {
    const controller = new AbortController();
    setModelsLoading(true);
    setModelsError(null);
    runAgentApiEffect(apiService.getModelsEffect(controller.signal))
      .then((data) => {
        setModels(data);
        setModelsError(null);
      })
      .catch((loadError) => {
        if (controller.signal.aborted) {
          return;
        }
        const message =
          loadError instanceof Error
            ? loadError.message
            : 'Failed to load generation models';
        setModelsError(message);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setModelsLoading(false);
        }
      });
    return () => controller.abort();
  }, [apiService, modelsReloadToken]);

  const retryLoadModels = useCallback(
    () => setModelsReloadToken((token) => token + 1),
    [],
  );

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (busyThreadIdRef.current) {
        setThreadUiBusy(busyThreadIdRef.current, false);
        busyThreadIdRef.current = null;
      }
    };
  }, [setThreadUiBusy]);

  const pickerLoading =
    modelsLoading || (Boolean(organizationId) && settingsLoading);

  const allowlistedModels = useMemo(
    () =>
      resolveOrgAllowlistedModels(models, {
        enabledModelIds: settings?.enabledModelIds,
        isSettingsReady: !settingsLoading,
        organizationId,
      }),
    [models, organizationId, settings?.enabledModelIds, settingsLoading],
  );

  // Filter models by generation type after the org allowlist.
  const filteredModels = useMemo(() => {
    const targetCategory =
      generationType === 'video' ? ModelCategory.VIDEO : ModelCategory.IMAGE;
    return allowlistedModels.filter((m) => m.category === targetCategory);
  }, [allowlistedModels, generationType]);

  const isAllowlistEmpty =
    Boolean(organizationId) &&
    !pickerLoading &&
    !modelsError &&
    !shouldOfferAutoModel(filteredModels);

  useEffect(() => {
    if (!isAllowlistEmpty) {
      return;
    }

    if (isAutoMode || modelKey) {
      setIsAutoMode(false);
      setModelKey('');
    }
  }, [isAllowlistEmpty, isAutoMode, modelKey]);

  useEffect(() => {
    if (pickerLoading || isAutoMode || !modelKey) {
      return;
    }

    if (!filteredModels.some((model) => model.key === modelKey)) {
      setModelKey('');
    }
  }, [filteredModels, isAutoMode, modelKey, pickerLoading]);

  const selectedModel = useMemo(
    () => filteredModels.find((model) => model.key === modelKey) ?? null,
    [filteredModels, modelKey],
  );

  const autoModelLabel = useMemo(
    () => getAutoModelLabel(prioritize),
    [prioritize],
  );

  const modelControls = useMemo(
    () => resolveGenerationModelControls(selectedModel, generationType),
    [generationType, selectedModel],
  );
  const {
    availableAspectRatios,
    defaultAspectRatio,
    defaultDuration,
    durationOptions,
    showDuration,
  } = modelControls;
  const supportsEndFrame =
    generationType === 'video' && !isAutoMode && hasEndFrame(modelKey);
  const supportsInterpolation = supportsEndFrame && hasInterpolation(modelKey);
  const supportsVideoReferences =
    generationType === 'video' && !isAutoMode && hasVideoReferences(modelKey);
  const maxVideoReferences = supportsVideoReferences
    ? getModelMaxVideoReferences(modelKey)
    : 0;
  const resolutionOptions = useMemo(
    () =>
      generationType === 'video' && !isAutoMode
        ? getVideoResolutionsByModel(modelKey).map((option) => ({
            label: option.label,
            value: option.value,
          }))
        : [],
    [generationType, isAutoMode, modelKey],
  );
  const estimatedCredits =
    generationType === 'video' && selectedModel
      ? quoteVideoGenerationCredits({
          cost: selectedModel.cost,
          costPerUnit: selectedModel.costPerUnit,
          duration,
          minCost: selectedModel.minCost,
          modelKey: selectedModel.key,
          outputs,
          pricingType: selectedModel.pricingType,
          resolution,
        })
      : null;
  const maxOutputs =
    typeof selectedModel?.maxOutputs === 'number' &&
    Number.isFinite(selectedModel.maxOutputs) &&
    selectedModel.maxOutputs >= 1
      ? Math.min(8, Math.round(selectedModel.maxOutputs))
      : 4;

  // Reset invalid values when model changes
  useEffect(() => {
    if (
      availableAspectRatios.length > 0 &&
      !availableAspectRatios.includes(aspectRatio)
    ) {
      setAspectRatio(defaultAspectRatio);
    }
  }, [availableAspectRatios, aspectRatio, defaultAspectRatio]);

  useEffect(() => {
    if (showDuration && !durationOptions.includes(duration)) {
      setDuration(defaultDuration ?? durationOptions[0] ?? duration);
    }
  }, [defaultDuration, duration, durationOptions, showDuration]);

  useEffect(() => {
    if (outputs > maxOutputs) {
      setOutputs(maxOutputs);
    }
  }, [maxOutputs, outputs]);

  useEffect(() => {
    if (resolutionOptions.length === 0) {
      setResolution('');
      return;
    }

    if (!resolutionOptions.some((option) => option.value === resolution)) {
      setResolution(
        getDefaultVideoResolution(modelKey) ??
          resolutionOptions[0]?.value ??
          '',
      );
    }
  }, [modelKey, resolution, resolutionOptions]);

  useEffect(() => {
    const cleared: string[] = [];
    if (!supportsEndFrame && endFrameId) {
      setEndFrameId(null);
      cleared.push('End Frame');
    } else if (supportsInterpolation && !startFrameId && endFrameId) {
      setEndFrameId(null);
      cleared.push('End Frame');
    } else if (
      supportsEndFrame &&
      !supportsInterpolation &&
      startFrameId &&
      endFrameId
    ) {
      setEndFrameId(null);
      cleared.push('End Frame');
    }
    if (!supportsVideoReferences && videoReferenceIds.length > 0) {
      setVideoReferenceIds([]);
      cleared.push('Video Reference');
    } else if (
      supportsVideoReferences &&
      videoReferenceIds.length > maxVideoReferences
    ) {
      setVideoReferenceIds((current) => current.slice(0, maxVideoReferences));
      setReferenceNotice(
        `Video References limited to ${maxVideoReferences} for the selected model.`,
      );
    }
    if (cleared.length > 0) {
      setReferenceNotice(
        `${cleared.join(' and ')} cleared because the selected model does not support it.`,
      );
    }
  }, [
    endFrameId,
    maxVideoReferences,
    startFrameId,
    supportsEndFrame,
    supportsInterpolation,
    supportsVideoReferences,
    videoReferenceIds.length,
  ]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      Object.assign(el.style, { height: 'auto' });
      Object.assign(el.style, { height: `${el.scrollHeight}px` });
    }
  }, []);

  const clearGenerationOutcome = useCallback(() => {
    setResultUrl(null);
    setResultId(null);
    setError(null);
  }, []);

  const handleGenerate = useCallback(async () => {
    if (
      !prompt.trim() ||
      status === 'generating' ||
      isAllowlistEmpty ||
      isPilotCeilingReached
    ) {
      return;
    }

    if (
      generationType === 'video' &&
      !isAutoMode &&
      requiresFirstFrame(modelKey) &&
      !startFrameId
    ) {
      setError('Start Frame is required for the selected model.');
      setStatus('error');
      return;
    }
    if (
      generationType === 'video' &&
      modelKey === MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_OMNI_VIDEO &&
      resolution === '4k' &&
      videoReferenceIds.length > 0
    ) {
      setError('Kling Omni video references require Pro quality, not 4K.');
      setStatus('error');
      return;
    }
    if (
      generationType === 'video' &&
      modelKey === MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5 &&
      videoReferenceIds.length > 0 &&
      (startFrameId !== null || endFrameId !== null)
    ) {
      setError(
        'Seedance 2.5 accepts first/last frames or a video reference, not both.',
      );
      setStatus('error');
      return;
    }

    const isFullRun = isFullRunRef.current;
    const pilotDuration =
      generationType === 'video'
        ? resolveVideoPilotDuration(duration, durationOptions)
        : null;
    const requestDuration =
      generationType === 'video'
        ? isFullRun
          ? duration
          : (pilotDuration ?? duration)
        : undefined;
    if (!isFullRun && pilotDuration !== null) {
      setPilotDurationSeconds(pilotDuration);
    }

    clearGenerationOutcome();
    setStatus('generating');
    // Dismiss the sticky composer error stack so it cannot cover this card's
    // Generate control while the user retries from the card itself.
    setComposerError(null);

    const controller = new AbortController();
    abortRef.current = controller;
    const requestThreadId = activeThreadId;
    busyThreadIdRef.current = requestThreadId;
    if (requestThreadId) {
      setThreadUiBusy(requestThreadId, true);
    }

    try {
      if (onUiAction) {
        const outcome = await onUiAction('confirm_generate_media', {
          aspectRatio,
          duration: requestDuration,
          endFrame: endFrameId ?? undefined,
          generationType,
          model: !isAutoMode && modelKey ? modelKey : undefined,
          outputs: generationType === 'image' ? outputs : undefined,
          prioritize,
          prompt,
          references:
            generationType === 'video' && startFrameId
              ? [startFrameId]
              : referenceIds.length > 0
                ? referenceIds
                : undefined,
          resolution: resolution || undefined,
          sourceActionId: action.id,
          videoReferences:
            videoReferenceIds.length > 0 ? videoReferenceIds : undefined,
        });
        // handleAgentUiAction returns false and writes the composer error
        // instead of throwing. Treating that as success marked the card Done
        // and hid Generate after a 401.
        if (outcome === false) {
          const composerError = useAgentChatStore.getState().error;
          throw new Error(
            composerError?.trim() ? composerError : 'Generation failed',
          );
        }
        isFullRunRef.current = false;
        setStatus(
          !isFullRun && pilotDuration !== null ? 'pilot_review' : 'done',
        );
        return;
      }

      const promptDoc = await runAgentApiEffect(
        apiService.createPromptEffect(
          {
            category: getPromptCategoryForGenerationType(generationType),
            duration: requestDuration,
            isSkipEnhancement: true,
            model: !isAutoMode && modelKey ? modelKey : undefined,
            original: prompt,
            ratio: aspectRatio,
          },
          controller.signal,
        ),
      );

      const body = buildAgentGenerationRequestBody({
        aspectRatio,
        duration: requestDuration,
        endFrame: endFrameId ?? undefined,
        modelKey: !isAutoMode && modelKey ? modelKey : undefined,
        outputs: generationType === 'image' ? outputs : undefined,
        prioritize,
        promptId: promptDoc.id,
        promptText: prompt,
        references:
          generationType === 'video' && startFrameId
            ? [startFrameId]
            : referenceIds.length > 0
              ? referenceIds
              : undefined,
        resolution: resolution || undefined,
        videoReferences:
          videoReferenceIds.length > 0 ? videoReferenceIds : undefined,
        waitForCompletion: false,
      });

      const result = await runAgentApiEffect(
        apiService.generateIngredientEffect(
          generationType,
          body,
          controller.signal,
        ),
      );
      setResultId(result.id);
      const mediaPath = generationType === 'video' ? 'videos' : 'images';
      setResultUrl(
        result.url || `${apiService.baseUrl}/${mediaPath}/${result.id}`,
      );
      isFullRunRef.current = false;
      setStatus(!isFullRun && pilotDuration !== null ? 'pilot_review' : 'done');
    } catch (err: unknown) {
      isFullRunRef.current = false;
      if (controller.signal.aborted) {
        setStatus('idle');
        return;
      }
      const rawMessage =
        err instanceof Error ? err.message : 'Generation failed';
      setError(formatGenerationError(rawMessage, { isAutoMode }));
      setStatus('error');
      // Keep Generate reachable — the sticky composer stack covers the card
      // when this error also lives there.
      setComposerError(null);
    } finally {
      abortRef.current = null;
      if (requestThreadId) {
        setThreadUiBusy(requestThreadId, false);
      }
      if (busyThreadIdRef.current === requestThreadId) {
        busyThreadIdRef.current = null;
      }
    }
  }, [
    activeThreadId,
    action.id,
    prompt,
    status,
    isAutoMode,
    modelKey,
    aspectRatio,
    duration,
    durationOptions,
    endFrameId,
    outputs,
    generationType,
    isPilotCeilingReached,
    apiService,
    clearGenerationOutcome,
    prioritize,
    referenceIds,
    resolution,
    startFrameId,
    onUiAction,
    setComposerError,
    setThreadUiBusy,
    isAllowlistEmpty,
    videoReferenceIds,
  ]);

  const handleRetry = useCallback(async () => {
    if (isPilotCeilingReached) {
      return;
    }
    isFullRunRef.current = false;
    clearGenerationOutcome();
    setStatus('idle');
    await handleGenerate();
  }, [clearGenerationOutcome, handleGenerate, isPilotCeilingReached]);

  const handleAcceptPilot = useCallback(async () => {
    if (status !== 'pilot_review' || isPilotCeilingReached) {
      return;
    }
    isFullRunRef.current = true;
    await handleGenerate();
  }, [handleGenerate, isPilotCeilingReached, status]);

  const handleRejectPilot = useCallback(() => {
    if (status !== 'pilot_review') {
      return;
    }

    const nextRejected = paidRejectedCount + 1;
    setPaidRejectedCount(nextRejected);
    isFullRunRef.current = false;

    if (hasReachedVideoPilotRetryCeiling(nextRejected)) {
      setIsPilotCeilingReached(true);
      setError(
        `Stopped after ${VIDEO_PILOT_PAID_RETRY_CEILING} rejected paid candidates. No further video generation will run for this clip.`,
      );
      setStatus('error');
      return;
    }

    clearGenerationOutcome();
    setStatus('idle');
  }, [clearGenerationOutcome, paidRejectedCount, status]);

  const handleRetryVoid = useCallback(() => {
    void handleRetry();
  }, [handleRetry]);

  const handleGenerateVoid = useCallback(() => {
    void handleGenerate();
  }, [handleGenerate]);

  const handleAcceptPilotVoid = useCallback(() => {
    void handleAcceptPilot();
  }, [handleAcceptPilot]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleToggleReference = useCallback((assetId: string) => {
    setReferenceIds((current) =>
      current.includes(assetId)
        ? current.filter((id) => id !== assetId)
        : [...current, assetId],
    );
  }, []);

  const handleUseResultAsReference = useCallback(() => {
    if (!resultId) {
      return;
    }
    if (generationType === 'video') {
      if (!supportsVideoReferences) {
        setReferenceNotice(
          'The selected model accepts stills only and cannot use this video as a reference.',
        );
        return;
      }
      setVideoReferenceIds([resultId]);
      setReferenceNotice(null);
      setStatus('idle');
      return;
    }
    setReferenceIds((current) =>
      current.includes(resultId) ? current : [...current, resultId],
    );
    // Return to idle so the user can re-generate with the result as input.
    setStatus('idle');
  }, [generationType, resultId, supportsVideoReferences]);

  const handlePrioritizeChange = useCallback(
    (next: RouterPriority) => {
      setPrioritize(next);
      setGenerationSetupField(setupScope, 'prioritize', next, setupDefaults);
      setIsAutoMode(true);
      setModelKey('');
      setGenerationSetupField(setupScope, 'modelKey', '', setupDefaults);
    },
    [setupScope, setupDefaults],
  );

  const handleModelChange = useCallback(
    (_name: string, values: string[]) => {
      const hasAutoOption = values.includes(AUTO_MODEL_OPTION_VALUE);
      const manualValues = values.filter(
        (value) => value !== AUTO_MODEL_OPTION_VALUE,
      );
      const nextModelKey = manualValues.at(-1) ?? '';

      if (hasAutoOption && manualValues.length === 0) {
        setIsAutoMode(true);
        setModelKey('');
        setGenerationSetupField(setupScope, 'modelKey', '', setupDefaults);
        return;
      }

      setIsAutoMode(false);
      setModelKey(nextModelKey);
      if (nextModelKey) {
        setGenerationSetupField(
          setupScope,
          'modelKey',
          nextModelKey,
          setupDefaults,
        );
      }
    },
    [setupScope, setupDefaults],
  );

  const handleAspectRatioChange = useCallback(
    (_name: string, value: string) => setAspectRatio(value),
    [],
  );

  const handleDurationChange = useCallback(
    (value: number) => setDuration(value),
    [],
  );

  const handleResolutionChange = useCallback((value: string) => {
    setResolution(value);
  }, []);

  const handleToggleStartFrame = useCallback(
    (assetId: string) => {
      setStartFrameId((current) => (current === assetId ? null : assetId));
      if (!supportsInterpolation) {
        setEndFrameId(null);
      }
      setReferenceNotice(null);
    },
    [supportsInterpolation],
  );

  const handleToggleEndFrame = useCallback(
    (assetId: string) => {
      if (supportsInterpolation && !startFrameId) {
        setReferenceNotice('Choose a Start Frame before the End Frame.');
        return;
      }
      setEndFrameId((current) => (current === assetId ? null : assetId));
      if (!supportsInterpolation) {
        setStartFrameId(null);
      }
      setReferenceNotice(null);
    },
    [startFrameId, supportsInterpolation],
  );

  const handleToggleVideoReference = useCallback(
    (assetId: string) => {
      if (videoReferenceIds.includes(assetId)) {
        setVideoReferenceIds((current) =>
          current.filter((id) => id !== assetId),
        );
        setReferenceNotice(null);
        return;
      }
      if (videoReferenceIds.length >= maxVideoReferences) {
        setReferenceNotice(
          `The selected model accepts at most ${maxVideoReferences} video references.`,
        );
        return;
      }
      setVideoReferenceIds((current) => [...current, assetId]);
      setReferenceNotice(null);
    },
    [maxVideoReferences, videoReferenceIds],
  );

  const handleOutputsChange = useCallback(
    (value: number) => {
      setOutputs(value);
      setGenerationSetupField(setupScope, 'outputs', value, setupDefaults);
    },
    [setupScope, setupDefaults],
  );

  return {
    generationType,
    prompt,
    setPrompt,
    modelKey,
    isAutoMode,
    aspectRatio,
    duration,
    endFrameId,
    outputs,
    maxOutputs,
    status,
    resultUrl,
    resultId,
    error,
    prioritize,
    setPrioritize: handlePrioritizeChange,
    models,
    modelsLoading: pickerLoading,
    modelsError,
    isAllowlistEmpty,
    retryLoadModels,
    filteredModels,
    autoModelLabel,
    availableAspectRatios,
    showDuration,
    durationOptions,
    estimatedCredits,
    referenceIds,
    referenceNotice,
    resolution,
    resolutionOptions,
    startFrameId,
    supportsEndFrame,
    supportsInterpolation,
    supportsVideoReferences,
    textareaRef: textareaRef as RefObject<HTMLTextAreaElement | null>,
    onRegenerateProp,
    handleRetryVoid,
    handleGenerateVoid,
    handleAcceptPilotVoid,
    handleRejectPilot,
    handleStop,
    isPilotCeilingReached,
    paidRejectedCount,
    pilotDurationSeconds,
    handleToggleReference,
    handleUseResultAsReference,
    handleModelChange,
    handleAspectRatioChange,
    handleDurationChange,
    handleResolutionChange,
    handleToggleEndFrame,
    handleToggleStartFrame,
    handleToggleVideoReference,
    handleOutputsChange,
    videoReferenceIds,
  };
}
