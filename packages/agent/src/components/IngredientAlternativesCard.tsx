import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { runAgentApiEffect } from '@genfeedai/agent/services/agent-base-api.service';
import {
  buildAgentGenerationRequestBody,
  getPromptCategoryForGenerationType,
} from '@genfeedai/agent/utils/generation-request';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import Button from '@ui/buttons/base/Button';
import { type ReactElement, useCallback, useRef, useState } from 'react';
import {
  HiArrowPath,
  HiOutlinePhoto,
  HiOutlineVideoCamera,
} from 'react-icons/hi2';

interface IngredientAlternativesCardProps {
  action: AgentUiAction;
  apiService: AgentApiService;
}

type CardStatus = 'idle' | 'generating' | 'done' | 'error';

export function IngredientAlternativesCard({
  action,
  apiService,
}: IngredientAlternativesCardProps): ReactElement {
  const alternatives = action.alternatives ?? [];
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [status, setStatus] = useState<CardStatus>('idle');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultId, setResultId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleSelect = useCallback(
    async (index: number) => {
      const alt = alternatives[index];
      if (!alt || status === 'generating') return;

      setSelectedIndex(index);
      setStatus('generating');
      setResultUrl(null);
      setResultId(null);
      setError(null);

      const controller = new AbortController();
      abortRef.current = controller;

      const promptDoc = await runAgentApiEffect(
        apiService.createPromptEffect(
          {
            category: getPromptCategoryForGenerationType(alt.generationType),
            isSkipEnhancement: true,
            original: alt.prompt,
          },
          controller.signal,
        ),
      );

      const body = buildAgentGenerationRequestBody({
        aspectRatio: '1:1',
        promptId: promptDoc.id,
        promptText: alt.prompt,
      });

      try {
        const result = await runAgentApiEffect(
          apiService.generateIngredientEffect(
            alt.generationType,
            body,
            controller.signal,
          ),
        );
        setResultId(result.id);
        const mediaPath = alt.generationType === 'video' ? 'videos' : 'images';
        setResultUrl(
          result.url || `${apiService.baseUrl}/${mediaPath}/${result.id}`,
        );
        setStatus('done');
      } catch (err: unknown) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Generation failed');
        setStatus('error');
      }
    },
    [alternatives, status, apiService],
  );

  const handleRetry = useCallback(() => {
    setStatus('idle');
    setSelectedIndex(null);
    setResultUrl(null);
    setResultId(null);
    setError(null);
  }, []);

  const generationType =
    alternatives[selectedIndex ?? 0]?.generationType ?? 'image';
  const isImage = generationType === 'image';

  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-border bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        {isImage ? (
          <HiOutlinePhoto className="h-4 w-4 text-primary" />
        ) : (
          <HiOutlineVideoCamera className="h-4 w-4 text-primary" />
        )}
        <span className="text-sm font-medium text-foreground">
          {action.title}
        </span>
      </div>

      <div className="space-y-3 p-3">
        {/* Alternatives grid */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {alternatives.map((alt, index) => {
            const isSelected = selectedIndex === index;
            const isGeneratingThis = isSelected && status === 'generating';
            const isDimmed = status === 'generating' && !isSelected;

            return (
              <Button
                key={`alt-${index}`}
                variant={ButtonVariant.UNSTYLED}
                withWrapper={false}
                isDisabled={status === 'generating'}
                onClick={() => handleSelect(index)}
                className={`relative rounded-lg border p-2.5 text-left transition-all disabled:cursor-not-allowed ${
                  isSelected && status !== 'idle'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50 hover:bg-accent'
                } ${isDimmed ? 'opacity-40' : ''}`}
              >
                {isGeneratingThis && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/70">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  </div>
                )}
                <p className="mb-1 text-xs font-semibold text-foreground">
                  {alt.label}
                </p>
                <p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                  {alt.prompt}
                </p>
              </Button>
            );
          })}
        </div>

        {/* Error state */}
        {status === 'error' && (
          <div className="space-y-2">
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
              {error}
            </div>
            <Button
              variant={ButtonVariant.OUTLINE}
              onClick={handleRetry}
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
            <div className="overflow-hidden rounded-lg border border-border">
              {isImage ? (
                <img
                  src={resultUrl}
                  alt="Generated result"
                  className="w-full object-cover"
                />
              ) : (
                <video src={resultUrl} controls className="w-full" />
              )}
            </div>
            <div className="flex gap-2">
              <a
                href={`/${isImage ? 'images' : 'videos'}/${resultId}`}
                className="flex flex-1 items-center justify-center rounded border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
              >
                Open in Library
              </a>
              <Button
                variant={ButtonVariant.OUTLINE}
                size={ButtonSize.SM}
                onClick={handleRetry}
                className="flex-1"
              >
                <HiArrowPath className="h-3 w-3" />
                Try Another
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
