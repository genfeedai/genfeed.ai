import type {
  AgentApiService,
  EstimateGenerationCreditsParams,
} from '@genfeedai/agent/services/agent-api.service';
import type { AgentGenerationQuoteState } from '@genfeedai/contracts/interfaces';
import { useEffect, useRef, useState } from 'react';

export function useGenerationQuote(
  apiService: AgentApiService,
  input: EstimateGenerationCreditsParams,
  fingerprint: string,
  isEnabled = true,
) {
  const [quote, setQuote] = useState<AgentGenerationQuoteState | null>(null);
  const identity = useRef({ fingerprint, version: 0 });
  if (identity.current.fingerprint !== fingerprint)
    identity.current = { fingerprint, version: identity.current.version + 1 };
  const version = identity.current.version;
  useEffect(() => {
    const controller = new AbortController();
    if (!isEnabled) return () => controller.abort();
    const timer = setTimeout(() => {
      if (!input.prompt) return;
      void apiService
        .estimateGenerationCredits(input, controller.signal)
        .then((result) => {
          if (controller.signal.aborted) return;
          const isAvailable =
            result.isAvailable &&
            typeof result.credits === 'number' &&
            Number.isFinite(result.credits) &&
            result.credits >= 0 &&
            Boolean(result.modelKey);
          setQuote({
            ...result,
            version,
            isAvailable,
            status: isAvailable ? 'available' : 'error',
          });
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setQuote({
              credits: null,
              version,
              isAvailable: false,
              modelKey: null,
              status: 'error',
            });
        });
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [apiService, version, input, isEnabled]);
  const isCurrent = isEnabled && quote?.version === version;
  return {
    estimatedCredits: isCurrent ? quote.credits : null,
    isEstimateAvailable: isCurrent && quote.isAvailable,
    isEstimatePending: isEnabled && Boolean(input.prompt) && !isCurrent,
    resolvedModelKey: isCurrent && quote.isAvailable ? quote.modelKey : null,
  };
}
