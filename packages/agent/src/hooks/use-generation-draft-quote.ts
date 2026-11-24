import { useGenerationQuote } from '@genfeedai/agent/hooks/use-generation-quote';
import type {
  AgentApiService,
  EstimateGenerationCreditsParams,
} from '@genfeedai/agent/services/agent-api.service';
import type { IModel } from '@genfeedai/contracts/interfaces';
import { buildVideoDraftSettings } from '@genfeedai/helpers/media/video-draft/video-draft.helper';
import { useMemo } from 'react';

interface UseGenerationDraftQuoteParams {
  apiService: AgentApiService;
  /** The quote of the render the card was asked for, before any draft. */
  fullEstimateInput: EstimateGenerationCreditsParams;
  /** Models on offer, the siblings a draft may run on. */
  models: readonly IModel[];
  /** Everything else the quote depends on (references, scope), as a stable list. */
  quoteScope: readonly unknown[];
  duration: number;
  /** True once the user approved the draft: the card quotes the full render. */
  isFullRun: boolean;
  isAutoMode: boolean;
  /** False when the request asked for the full render with no draft first. */
  isDraftAllowed: boolean;
  modelKey: string;
  resolution: string;
}

/**
 * Quotes what the card runs next (#7727). A video starts as a draft: the same
 * cheap settings Studio drafts with (a fast sibling, the lowest resolution,
 * the shortest length), quoted and run first. Accepting the draft arms the full
 * render, which is quoted at `fullEstimateInput`. A picked model drafts at
 * once; Auto drafts the model its own full quote routed to, so that quote
 * stays on for Auto.
 */
export function useGenerationDraftQuote({
  apiService,
  duration,
  fullEstimateInput,
  isAutoMode,
  isDraftAllowed,
  isFullRun,
  modelKey,
  models,
  quoteScope,
  resolution,
}: UseGenerationDraftQuoteParams) {
  const isDraftRequested =
    fullEstimateInput.category === 'video' && !isFullRun && isDraftAllowed;
  const draftFor = (draftModelKey: string | null | undefined) =>
    isDraftRequested && draftModelKey
      ? buildVideoDraftSettings(
          {
            duration,
            isAudioEnabled: false,
            modelKey: draftModelKey,
            outputs: 1,
            resolution,
          },
          models,
        )
      : null;
  const pickedModelDraft = isAutoMode ? null : draftFor(modelKey);
  const fullQuote = useGenerationQuote(
    apiService,
    fullEstimateInput,
    JSON.stringify([fullEstimateInput, isAutoMode, quoteScope]),
    (isAutoMode || Boolean(modelKey)) && pickedModelDraft === null,
  );
  const draft = isAutoMode
    ? draftFor(fullQuote.resolvedModelKey)
    : pickedModelDraft;
  // Scalars, so the quote input stays referentially stable across renders.
  const isDraftRun = draft !== null;
  const draftModelKey = draft?.modelKey;
  const draftDuration = draft?.duration;
  const draftResolution = draft?.resolution;
  const draftEstimateInput = useMemo(
    () => ({
      ...fullEstimateInput,
      duration: draftDuration ?? fullEstimateInput.duration,
      modelKey: draftModelKey,
      resolution: draftResolution || undefined,
    }),
    [draftDuration, draftModelKey, draftResolution, fullEstimateInput],
  );
  const draftQuote = useGenerationQuote(
    apiService,
    draftEstimateInput,
    JSON.stringify([draftEstimateInput, quoteScope]),
    isDraftRun,
  );
  return {
    ...(isDraftRun ? draftQuote : fullQuote),
    draftDuration,
    draftResolution,
    isDraftRun,
  };
}
