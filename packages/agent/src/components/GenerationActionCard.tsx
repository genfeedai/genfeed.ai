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
import {
  ButtonSize,
  ButtonVariant,
  ModelCategory,
  type RouterPriority,
} from '@genfeedai/enums';
import { resolveGenerationModelControls } from '@helpers/generation-controls.helper';
import AspectRatioDropdown from '@ui/dropdowns/aspect-ratio/AspectRatioDropdown';
import ModelSelectorPopover from '@ui/dropdowns/model-selector/ModelSelectorPopover';
import {
  AUTO_MODEL_OPTION_VALUE,
  getAutoModelLabel,
} from '@ui/dropdowns/model-selector/model-selector.constants';
import { useModelFavorites } from '@ui/dropdowns/model-selector/useModelFavorites';
import { Button } from '@ui/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  HiArrowPath,
  HiOutlineClipboard,
  HiOutlinePhoto,
  HiOutlineVideoCamera,
  HiPlay,
} from 'react-icons/hi2';

interface GenerationActionCardProps {
  action: AgentUiAction;
  apiService: AgentApiService;
  qualityScore?: number;
  qualityFeedback?: string[];
  onRegenerate?: () => void;
}

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

function QualityBadge({
  score,
  feedback,
  onRegenerate,
}: {
  score: number;
  feedback?: string[];
  onRegenerate?: () => void;
}): ReactElement | null {
  if (score >= 8) {
    return (
      <div className="flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-200">
        ✨ Quality: {score}/10
      </div>
    );
  }

  if (score < 6) {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
          ⚠️ Quality: {score}/10
        </div>
        {feedback && feedback.length > 0 && (
          <p className="text-xs text-muted-foreground">{feedback[0]}</p>
        )}
        {onRegenerate && (
          <Button
            variant={ButtonVariant.OUTLINE}
            size={ButtonSize.XS}
            onClick={onRegenerate}
            className="border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200 dark:hover:bg-amber-900"
          >
            <HiArrowPath className="h-3 w-3" />
            Regenerate
          </Button>
        )}
      </div>
    );
  }

  // Score 6-7: neutral display
  return (
    <div className="flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
      Quality: {score}/10
    </div>
  );
}

export function GenerationActionCard({
  action,
  apiService,
  qualityScore,
  qualityFeedback,
  onRegenerate: onRegenerateProp,
}: GenerationActionCardProps): ReactElement {
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
  const { favoriteModelKeys, onFavoriteToggle } = useModelFavorites();
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
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
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

  const isDisabled = status === 'generating';
  const isImage = generationType === 'image';
  const Icon = isImage ? HiOutlinePhoto : HiOutlineVideoCamera;

  return (
    <div className="group/card relative mt-2 overflow-hidden border border-border bg-background">
      {/* Hover actions */}
      <div className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-full border border-white/[0.08] bg-background/80 px-1.5 py-1 opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-hover/card:opacity-100">
        <Button
          variant={ButtonVariant.GHOST}
          size={ButtonSize.ICON}
          onClick={handleCopyPrompt}
          isDisabled={!prompt.trim()}
          ariaLabel="Copy prompt"
          className="p-1 text-muted-foreground hover:text-foreground"
        >
          <HiOutlineClipboard className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant={ButtonVariant.GHOST}
          size={ButtonSize.ICON}
          onClick={() => {
            void handleRetry();
          }}
          ariaLabel="Retry"
          className="p-1 text-muted-foreground hover:text-foreground"
        >
          <HiArrowPath className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Icon className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium text-foreground">
          {action.title}
        </span>
      </div>

      <div className="space-y-3 p-3">
        {/* Prompt */}
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Prompt
          </label>
          <Textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={isDisabled}
            rows={2}
            className="w-full resize-none"
            placeholder="Describe what you want to generate..."
          />
        </div>

        {/* Model & Aspect Ratio row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Model
            </label>
            {modelsLoading ? (
              <Select disabled value="loading-models">
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Loading Genfeed models..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="loading-models">
                    Loading Genfeed models...
                  </SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <div
                className={isDisabled ? 'pointer-events-none opacity-50' : ''}
              >
                <ModelSelectorPopover
                  name="models"
                  className="w-full justify-between border border-border bg-background hover:bg-accent/50"
                  models={filteredModels}
                  values={
                    isAutoMode
                      ? [AUTO_MODEL_OPTION_VALUE]
                      : modelKey
                        ? [modelKey]
                        : []
                  }
                  autoLabel={autoModelLabel}
                  prioritize={prioritize}
                  onPrioritizeChange={setPrioritize}
                  favoriteModelKeys={favoriteModelKeys}
                  onFavoriteToggle={onFavoriteToggle}
                  onChange={(_name, values) => {
                    const hasAutoOption = values.includes(
                      AUTO_MODEL_OPTION_VALUE,
                    );
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
                  }}
                />
              </div>
            )}
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Aspect Ratio
            </label>
            <AspectRatioDropdown
              name="aspectRatio"
              value={aspectRatio}
              ratios={availableAspectRatios}
              onChange={(_name, value) => setAspectRatio(value)}
              className="w-full justify-between border border-border bg-background hover:bg-accent/50"
              isDisabled={isDisabled}
              placeholder="Aspect ratio"
            />
          </div>
        </div>

        {/* Duration (video only, if model supports it) */}
        {showDuration && (
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Duration (seconds)
            </label>
            <Select
              value={String(duration)}
              onValueChange={(value) => setDuration(Number(value))}
              disabled={isDisabled}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select duration" />
              </SelectTrigger>
              <SelectContent>
                {durationOptions.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option}s
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Generate button */}
        {status === 'idle' && (
          <Button
            variant={ButtonVariant.DEFAULT}
            onClick={handleGenerate}
            isDisabled={!prompt.trim()}
            className="w-full"
          >
            <HiPlay className="h-4 w-4" />
            Generate {isImage ? 'Image' : 'Video'}
          </Button>
        )}

        {/* Generating state */}
        {status === 'generating' && (
          <div className="flex items-center justify-center gap-2 border border-border px-4 py-3">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="text-sm text-muted-foreground">Generating...</span>
          </div>
        )}

        {/* Error state */}
        {status === 'error' && (
          <div className="space-y-2">
            <div className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
              {error}
            </div>
            <Button
              variant={ButtonVariant.OUTLINE}
              onClick={() => {
                void handleRetry();
              }}
              className="w-full"
            >
              <HiArrowPath className="h-4 w-4" />
              Try Again
            </Button>
          </div>
        )}

        {/* Result state */}
        {status === 'done' && resultUrl && (
          <div className="space-y-2">
            <div className="overflow-hidden border border-border">
              {isImage ? (
                <img
                  src={resultUrl}
                  alt="Generated result"
                  className="w-full object-cover"
                />
              ) : (
                <video src={resultUrl} controls className="w-full">
                  <track kind="captions" />
                </video>
              )}
            </div>
            {qualityScore !== undefined && (
              <QualityBadge
                score={qualityScore}
                feedback={qualityFeedback}
                onRegenerate={
                  onRegenerateProp ??
                  (() => {
                    void handleRetry();
                  })
                }
              />
            )}
            <div className="flex gap-2">
              <a
                href={`/${generationType === 'video' ? 'videos' : 'images'}/${resultId}`}
                className="flex flex-1 items-center justify-center border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
              >
                Open in Library
              </a>
              <Button
                variant={ButtonVariant.OUTLINE}
                size={ButtonSize.SM}
                onClick={() => {
                  void handleRetry();
                }}
                className="flex-1"
              >
                <HiArrowPath className="h-3 w-3" />
                Regenerate
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
