import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import type { ContextCoverage } from '@genfeedai/contracts/interfaces';
import { useCallback, useEffect, useState } from 'react';

type ContextCoverageStatus = 'error' | 'idle' | 'loading' | 'ready';

interface UseContextCoverageParams {
  apiService: Pick<AgentApiService, 'getContextCoverage'>;
  /** The thread's brand; coverage is requested for exactly this scope. */
  brandId?: string;
  /** Only the visible panel reads: a closed sidebar never spends a request. */
  isActive: boolean;
}

interface UseContextCoverageResult {
  coverage: ContextCoverage | null;
  reload: () => void;
  status: ContextCoverageStatus;
}

/**
 * Loads coverage for the current scope. A scope change drops the previous
 * answer immediately and aborts its read, so one brand's coverage is never
 * shown against another. Returning from a recovery link (window focus)
 * reloads, because the user may have refreshed a source or reconnected.
 */
export function useContextCoverage({
  apiService,
  brandId,
  isActive,
}: UseContextCoverageParams): UseContextCoverageResult {
  const [coverage, setCoverage] = useState<ContextCoverage | null>(null);
  const [status, setStatus] = useState<ContextCoverageStatus>('idle');
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  // `reloadToken` re-runs this effect; it is not read inside it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadToken is the retrigger
  useEffect(() => {
    setCoverage(null);
    if (!isActive) {
      setStatus('idle');
      return;
    }
    const controller = new AbortController();
    setStatus('loading');
    apiService
      .getContextCoverage({ brandId, usage: 'search' }, controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return;
        setCoverage(next);
        setStatus('ready');
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setStatus('error');
      });
    return () => controller.abort();
  }, [apiService, brandId, isActive, reloadToken]);

  useEffect(() => {
    if (!isActive) return;
    window.addEventListener('focus', reload);
    return () => window.removeEventListener('focus', reload);
  }, [isActive, reload]);

  return { coverage, reload, status };
}
