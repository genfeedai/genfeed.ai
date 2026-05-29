import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import type {
  AgentApiService,
  GenerationModel,
} from '@genfeedai/agent/services/agent-api.service';
import { runAgentApiEffect } from '@genfeedai/agent/services/agent-base-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import {
  buildAgentGenerationRequestBody,
  DEFAULT_AGENT_GENERATION_PRIORITY,
  getPromptCategoryForGenerationType,
} from '@genfeedai/agent/utils/generation-request';
import { ModelCategory, type RouterPriority } from '@genfeedai/enums';
import { resolveGenerationModelControls } from '@helpers/generation-controls.helper';
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

function formatStructuredPrompt(prompt: string): string {
  if (!prompt.trim()) {
    return prompt;
  }

  return prompt
    .replace(/\\n/g, '\n')
    .replace(/([^\n])\s+([A-Z][A-Z0-9/&()' -]{1,40}:\s)/g, '$1\n$2')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

interface UseGenerationActionCardParams {
  action: AgentUiAction;
  apiService: AgentApiService;
  onRegenerate?: () => void;
}

export function useGenerationActionCard({
  action,
  apiService,
  onRegenerate: onRegenerateProp,
}: UseGenerationActionCardParams) {
  const generationType = action.generationType ?? 'image';
  const initParams = action.generationParams;

  const [prompt, setPrompt] = useState(() =>
    formatStructuredPrompt(initParams?.prompt ?? ''),
  );
  const [modelKey, setModelKey] = useState(initParams?.model ?? '');
  const [isAutoMode, setIsAutoMode] = useState(() => !initParams?.model);
  const [aspectRatio, setAspectRatio] = useState(
    initParams?.aspectRatio ?? '1:1',
  );
  const [duration, setDuration] = useState(initParams?.duration ?? 5);
  const [status, setStatus] = useState<CardStatus>('idle');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultId, setResultId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prioritize, setPrioritize] = useState<RouterPriority>(
    DEFAULT_AGENT_GENERATION_PRIORITY,
  );
  const [models, setModels] = useState<GenerationModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const activeThreadId = useAgentChatStore((s) => s.activeThreadId);
  const setThreadUiBusy = useAgentChatStore((s) => s.setThreadUiBusy);
  const abortRef = useRef<AbortController | null>(null);
  const busyThreadIdRef = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch models on mount
  useEffect(() => {
    const controller = new AbortController();
    setModelsLoading(true);
    runAgentApiEffect(apiService.getModelsEffect(controller.signal))
      .then((data) => setModels(data))
      .catch((loadError) => {
        const message =
          loadError instanceof Error
            ? loadError.message
            : 'Failed to load generation models';
        setError(message);
      })
      .finally(() => setModelsLoading(false));
    return () => controller.abort();
  }, [apiService]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (busyThreadIdRef.current) {
        setThreadUiBusy(busyThreadIdRef.current, false);
        busyThreadIdRef.current = null;
      }
    };
  }, [setThreadUiBusy]);

  // Filter models by generation type
  const filteredModels = useMemo(() => {
    const targetCategory =
      generationType === 'video' ? ModelCategory.VIDEO : ModelCategory.IMAGE;
    return models.filter((m) => m.category === targetCategory);
  }, [models, generationType]);

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
    if (!prompt.trim() || status === 'generating') {
      return;
    }

    clearGenerationOutcome();
    setStatus('generating');

    const controller = new AbortController();
    abortRef.current = controller;
    const requestThreadId = activeThreadId;
    busyThreadIdRef.current = requestThreadId;
    if (requestThreadId) {
      setThreadUiBusy(requestThreadId, true);
    }

    try {
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
        prioritize,
        promptId: promptDoc.id,
        promptText: prompt,
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
        return;
      }
      const rawMessage =
        err instanceof Error ? err.message : 'Generation failed';
      setError(formatGenerationError(rawMessage, { isAutoMode }));
      setStatus('error');
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
    prompt,
    status,
    isAutoMode,
    modelKey,
    aspectRatio,
    duration,
    generationType,
    apiService,
    clearGenerationOutcome,
    prioritize,
    setThreadUiBusy,
  ]);

  const handleCopyPrompt = useCallback(() => {
    if (prompt.trim()) {
      navigator.clipboard.writeText(prompt);
    }
  }, [prompt]);

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

  const handleModelChange = useCallback((_name: string, values: string[]) => {
    const hasAutoOption = values.includes(AUTO_MODEL_OPTION_VALUE);
    const manualValues = values.filter(
      (value) => value !== AUTO_MODEL_OPTION_VALUE,
    );
    const nextModelKey = manualValues.at(-1) ?? '';

    if (hasAutoOption && manualValues.length === 0) {
      setIsAutoMode(true);
      setModelKey('');
      return;
    }

    setIsAutoMode(false);
    setModelKey(nextModelKey);
  }, []);

  const handleAspectRatioChange = useCallback(
    (_name: string, value: string) => setAspectRatio(value),
    [],
  );

  const handleDurationChange = useCallback(
    (value: number) => setDuration(value),
    [],
  );

  return {
    generationType,
    prompt,
    setPrompt,
    modelKey,
    isAutoMode,
    aspectRatio,
    duration,
    status,
    resultUrl,
    resultId,
    error,
    prioritize,
    setPrioritize,
    models,
    modelsLoading,
    filteredModels,
    autoModelLabel,
    availableAspectRatios,
    showDuration,
    durationOptions,
    textareaRef: textareaRef as RefObject<HTMLTextAreaElement | null>,
    onRegenerateProp,
    handleCopyPrompt,
    handleRetryVoid,
    handleGenerateVoid,
    handleModelChange,
    handleAspectRatioChange,
    handleDurationChange,
  };
}
