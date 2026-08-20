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
import {
  readPreferredGenerationModel,
  readPreferredGenerationOutputs,
  readPreferredGenerationPriority,
  writePreferredGenerationModel,
  writePreferredGenerationOutputs,
  writePreferredGenerationPriority,
} from '@genfeedai/agent/stores/agent-preferred-model.store';
import { isAutoAgentModel } from '@genfeedai/agent/utils/agent-auto-model.util';
import { formatStructuredPrompt } from '@genfeedai/agent/utils/format-structured-prompt.util';
import {
  buildAgentGenerationRequestBody,
  DEFAULT_AGENT_GENERATION_PRIORITY,
  getPromptCategoryForGenerationType,
} from '@genfeedai/agent/utils/generation-request';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import {
  ModelCategory,
  type RouterPriority,
  toRouterPriority,
} from '@genfeedai/enums';
import { resolveGenerationModelControls } from '@helpers/generation-controls.helper';
import {
  resolveOrgAllowlistedModels,
  shouldOfferAutoModel,
} from '@helpers/model-allowlist.helper';
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

type CardStatus = 'idle' | 'generating' | 'done' | 'error';

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
  const preferredModel = readPreferredGenerationModel();
  const preferredPriority = readPreferredGenerationPriority();
  const preferredOutputs = readPreferredGenerationOutputs();
  const actionPriority = toRouterPriority(initParams?.prioritize);
  const shouldStartInAutoMode = preferredModel
    ? isAutoAgentModel(preferredModel)
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
  const [outputs, setOutputs] = useState(() => {
    const requested = preferredOutputs ?? initParams?.outputs;
    return typeof requested === 'number' &&
      Number.isFinite(requested) &&
      requested >= 1
      ? Math.min(8, Math.round(requested))
      : 1;
  });
  const [status, setStatus] = useState<CardStatus>('idle');
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
  const [referenceIds, setReferenceIds] = useState<string[]>([]);
  const activeThreadId = useAgentChatStore((s) => s.activeThreadId);
  const setThreadUiBusy = useAgentChatStore((s) => s.setThreadUiBusy);
  const setComposerError = useAgentChatStore((s) => s.setError);
  const abortRef = useRef<AbortController | null>(null);
  const busyThreadIdRef = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    if (!prompt.trim() || status === 'generating' || isAllowlistEmpty) {
      return;
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
          duration: generationType === 'video' ? duration : undefined,
          generationType,
          model: !isAutoMode && modelKey ? modelKey : undefined,
          outputs: generationType === 'image' ? outputs : undefined,
          prioritize,
          prompt,
          references: referenceIds.length > 0 ? referenceIds : undefined,
          sourceActionId: action.id,
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
        setStatus('done');
        return;
      }

      const promptDoc = await runAgentApiEffect(
        apiService.createPromptEffect(
          {
            category: getPromptCategoryForGenerationType(generationType),
            duration: generationType === 'video' ? duration : undefined,
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
        duration: generationType === 'video' ? duration : undefined,
        modelKey: !isAutoMode && modelKey ? modelKey : undefined,
        outputs: generationType === 'image' ? outputs : undefined,
        prioritize,
        promptId: promptDoc.id,
        promptText: prompt,
        references: referenceIds.length > 0 ? referenceIds : undefined,
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
      setStatus('done');
    } catch (err: unknown) {
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
    outputs,
    generationType,
    apiService,
    clearGenerationOutcome,
    prioritize,
    referenceIds,
    onUiAction,
    setComposerError,
    setThreadUiBusy,
    isAllowlistEmpty,
  ]);

  const handleRetry = useCallback(async () => {
    clearGenerationOutcome();
    setStatus('idle');
    await handleGenerate();
  }, [clearGenerationOutcome, handleGenerate]);

  const handleRetryVoid = useCallback(() => {
    void handleRetry();
  }, [handleRetry]);

  const handleGenerateVoid = useCallback(() => {
    void handleGenerate();
  }, [handleGenerate]);

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
    setReferenceIds((current) =>
      current.includes(resultId) ? current : [...current, resultId],
    );
    // Return to idle so the user can re-generate with the result as input.
    setStatus('idle');
  }, [resultId]);

  const handlePrioritizeChange = useCallback((next: RouterPriority) => {
    setPrioritize(next);
    writePreferredGenerationPriority(next);
    setIsAutoMode(true);
    setModelKey('');
    writePreferredGenerationModel(AUTO_MODEL_OPTION_VALUE);
  }, []);

  const handleModelChange = useCallback((_name: string, values: string[]) => {
    const hasAutoOption = values.includes(AUTO_MODEL_OPTION_VALUE);
    const manualValues = values.filter(
      (value) => value !== AUTO_MODEL_OPTION_VALUE,
    );
    const nextModelKey = manualValues.at(-1) ?? '';

    if (hasAutoOption && manualValues.length === 0) {
      setIsAutoMode(true);
      setModelKey('');
      writePreferredGenerationModel(AUTO_MODEL_OPTION_VALUE);
      return;
    }

    setIsAutoMode(false);
    setModelKey(nextModelKey);
    if (nextModelKey) {
      writePreferredGenerationModel(nextModelKey);
    }
  }, []);

  const handleAspectRatioChange = useCallback(
    (_name: string, value: string) => setAspectRatio(value),
    [],
  );

  const handleDurationChange = useCallback(
    (value: number) => setDuration(value),
    [],
  );

  const handleOutputsChange = useCallback((value: number) => {
    setOutputs(value);
    writePreferredGenerationOutputs(value);
  }, []);

  return {
    generationType,
    prompt,
    setPrompt,
    modelKey,
    isAutoMode,
    aspectRatio,
    duration,
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
    referenceIds,
    textareaRef: textareaRef as RefObject<HTMLTextAreaElement | null>,
    onRegenerateProp,
    handleRetryVoid,
    handleGenerateVoid,
    handleStop,
    handleToggleReference,
    handleUseResultAsReference,
    handleModelChange,
    handleAspectRatioChange,
    handleDurationChange,
    handleOutputsChange,
  };
}
