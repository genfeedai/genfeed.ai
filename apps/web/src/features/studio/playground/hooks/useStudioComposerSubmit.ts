'use client';

import type { IModel } from '@genfeedai/contracts/interfaces';
import type { AgentGenerationQuoteRequest } from '@genfeedai/contracts/interfaces/ai/agent-generation-quote.interface';
import type {
  StudioPlaygroundSettings,
  StudioSubmitOptions,
} from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';
import { canSubmitStudioGeneration } from '@genfeedai/services/core/desktop-runtime.service';
import { useRef } from 'react';
import type { UseStudioSpendQuoteReturn } from '@/features/studio/playground/hooks/useStudioSpendQuote';
import type { StudioSpendSource } from '@/features/studio/props/studio-playground.props';

interface UseStudioComposerSubmitParams {
  buildQuoteRequest: (
    pinnedModelKey?: string,
    draftOverride?: StudioPlaygroundSettings,
  ) => AgentGenerationQuoteRequest | null;
  draftSettings: StudioPlaygroundSettings | null;
  isDraftActive: boolean;
  isSubmitBlocked: boolean;
  modelKey: string | undefined;
  models: readonly IModel[];
  onSubmit: (options?: StudioSubmitOptions) => void;
  quoteSpend: UseStudioSpendQuoteReturn['quoteSpend'];
  spendSource: StudioSpendSource;
}

/**
 * Generate and Draft submits. The price is quoted by the server first; a price
 * it cannot confirm submits nothing.
 */
export function useStudioComposerSubmit({
  buildQuoteRequest,
  draftSettings,
  isDraftActive,
  isSubmitBlocked,
  modelKey,
  models,
  onSubmit,
  quoteSpend,
  spendSource,
}: UseStudioComposerSubmitParams): () => void {
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;
  const guardedDraftSubmit = () => {
    if (!draftSettings || isSubmitBlocked || !canSubmitStudioGeneration())
      return;
    quoteSpend(
      {
        modelKey: draftSettings.modelKey,
        models,
        source: {
          autoRequest: null,
          buildRequest: () => buildQuoteRequest(undefined, draftSettings),
          kind: 'server',
        },
      },
      (options) => onSubmitRef.current({ ...options, isDraft: true }),
    );
  };
  return () => {
    if (isSubmitBlocked || !canSubmitStudioGeneration()) return;
    if (isDraftActive) {
      guardedDraftSubmit();
      return;
    }
    quoteSpend({ modelKey, models, source: spendSource }, (options) =>
      onSubmitRef.current(options),
    );
  };
}
