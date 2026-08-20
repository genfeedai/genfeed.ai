import { useBrand } from '@contexts/user/brand-context/brand-context';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import type { ClipProjectSummary } from '@props/studio/clips.props';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { ClipsApiService } from './services/clips-api.service';

export function useStudioClipProjects(options?: { isEnabled?: boolean }) {
  const isEnabled = options?.isEnabled ?? true;
  const { getToken } = useAuthIdentity();
  const { selectedBrand } = useBrand();
  const [projects, setProjects] = useState<ClipProjectSummary[]>([]);
  const [isLoading, setIsLoading] = useState(isEnabled);
  const [error, setError] = useState<string | null>(null);

  const resolveToken = useCallback(async (): Promise<string> => {
    return (await resolveAuthToken(getToken)) ?? '';
  }, [getToken]);

  const clipsService = useMemo(
    () => new ClipsApiService(resolveToken),
    [resolveToken],
  );

  useEffect(() => {
    if (!isEnabled) {
      setIsLoading(false);
      return;
    }

    const abortController = new AbortController();
    let cancelled = false;
    setIsLoading(true);

    void clipsService
      .listProjects(abortController.signal)
      .then((items) => {
        if (cancelled) {
          return;
        }

        const brandId = selectedBrand?.id;
        setProjects(
          brandId
            ? items.filter((item) => !item.brandId || item.brandId === brandId)
            : items,
        );
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }

        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }

        setError(
          err instanceof Error ? err.message : 'Could not load clip projects.',
        );
        setProjects([]);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [clipsService, isEnabled, selectedBrand?.id]);

  return { error, isLoading, projects };
}
