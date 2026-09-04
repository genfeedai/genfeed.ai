import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import {
  buildAgentGenerationRequestBody,
  getPromptCategoryForGenerationType,
} from '@genfeedai/agent/utils/generation-request';
import { usePromptModal } from '@genfeedai/contexts/providers/global-modals/global-modals.provider';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import {
  ButtonSize,
  ButtonVariant,
  IngredientCategory,
} from '@genfeedai/contracts';
import { createLibraryAssetRoute } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { Button } from '@ui/primitives/button';
import { Expand, Image, RefreshCw, Video } from 'lucide-react';
import { type ReactElement, useCallback, useRef, useState } from 'react';

import { AgentErrorMessage } from './AgentErrorMessage';

interface IngredientAlternativesCardProps {
  action: AgentUiAction;
  apiService: AgentApiService;
}

type CardStatus = 'idle' | 'generating' | 'done' | 'error';

export function IngredientAlternativesCard({
  action,
  apiService,
}: IngredientAlternativesCardProps): ReactElement {
  const { openPromptModal } = usePromptModal();
  const { brandId } = useBrand();
  const { href } = useOrgUrl();
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

      try {
        const promptDoc = await apiService.createPrompt(
          {
            category: getPromptCategoryForGenerationType(alt.generationType),
            isSkipEnhancement: true,
            original: alt.prompt,
          },
          controller.signal,
        );

        const body = buildAgentGenerationRequestBody({
          aspectRatio: '1:1',
          brandId: brandId || undefined,
          promptId: promptDoc.id,
          promptText: alt.prompt,
        });

        const result = await apiService.generateIngredient(
          alt.generationType,
          body,
          controller.signal,
        );
        setResultId(result.id);
        if (!result.url) {
          throw new Error(
            'Generation completed without a renderable asset preview.',
          );
        }
        setResultUrl(result.url);
        setStatus('done');
      } catch (err: unknown) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Generation failed');
        setStatus('error');
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    },
    [alternatives, apiService, brandId, status],
  );

  const handleViewPrompt = useCallback(
    (index: number) => {
      const alternative = alternatives[index];
      if (!alternative) return;

      openPromptModal({
        originalPrompt: alternative.prompt,
        onConfirm: () => {
          void handleSelect(index);
        },
      });
    },
    [alternatives, handleSelect, openPromptModal],
  );

  const handleReset = useCallback(() => {
    setStatus('idle');
    setSelectedIndex(null);
    setResultUrl(null);
    setResultId(null);
    setError(null);
  }, []);

  const handleRetry = useCallback(() => {
    if (selectedIndex === null) return;
    void handleSelect(selectedIndex);
  }, [handleSelect, selectedIndex]);

  const generationType =
    alternatives[selectedIndex ?? 0]?.generationType ?? 'image';
  const isImage = generationType === 'image';

  return (
    <div className="mt-2 overflow-hidden border border-border bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        {isImage ? (
          <Image className="size-4 text-primary" />
        ) : (
          <Video className="size-4 text-primary" />
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
              <div
                key={alt.label}
                className={`relative border p-2.5 text-left transition-all ${
                  isSelected && status !== 'idle'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50 hover:bg-accent'
                } ${isDimmed ? 'opacity-40' : ''}`}
              >
                {isGeneratingThis && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                    <div className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  </div>
                )}
                <Button
                  ariaLabel={`Generate ${alt.label}`}
                  className="block w-full text-left"
                  isDisabled={status === 'generating'}
                  onClick={() => handleSelect(index)}
                  variant={ButtonVariant.UNSTYLED}
                  withWrapper={false}
                >
                  <span className="mb-1 block text-xs font-semibold text-foreground">
                    {alt.label}
                  </span>
                  <span className="line-clamp-2 text-2xs leading-relaxed text-muted-foreground">
                    {alt.prompt}
                  </span>
                </Button>
                <Button
                  ariaLabel={`View full prompt for ${alt.label}`}
                  className="mt-2 h-7 px-0 text-2xs"
                  icon={<Expand className="size-3" />}
                  isDisabled={status === 'generating'}
                  label="View full prompt"
                  onClick={() => handleViewPrompt(index)}
                  size={ButtonSize.SM}
                  variant={ButtonVariant.GHOST}
                  withWrapper={false}
                />
              </div>
            );
          })}
        </div>

        {/* Error state */}
        {status === 'error' && (
          <div className="space-y-2">
            <AgentErrorMessage message={error ?? 'Generation failed'} />
            <Button
              variant={ButtonVariant.SECONDARY}
              onClick={handleRetry}
              className="w-full"
            >
              <RefreshCw className="size-4" />
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
                <video
                  src={resultUrl}
                  controls
                  aria-label="Generated result"
                  className="w-full"
                >
                  <track kind="captions" />
                </video>
              )}
            </div>
            <div className="flex gap-2">
              <a
                href={href(
                  createLibraryAssetRoute(
                    isImage
                      ? IngredientCategory.IMAGE
                      : IngredientCategory.VIDEO,
                    resultId ?? undefined,
                  ),
                )}
                className="flex flex-1 items-center justify-center border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
              >
                Open in Library
              </a>
              <Button
                variant={ButtonVariant.SECONDARY}
                size={ButtonSize.SM}
                onClick={handleReset}
                className="flex-1"
              >
                <RefreshCw className="size-3" />
                Try Another
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
