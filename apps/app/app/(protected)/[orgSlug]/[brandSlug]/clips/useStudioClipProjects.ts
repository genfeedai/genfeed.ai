import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import type { ClipProjectSummary } from '@props/studio/clips.props';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { ClipsApiService } from './services/clips-api.service';

export function useStudioClipProjects(options?: { isEnabled?: boolean }) {
  const isEnabled = options?.isEnabled ?? true;
  const { getToken } = useAuthIdentity();
  const { selectedBrand } = useBrand();
  const searchParams = useSearchParams();
  const currentPage = Number(searchParams.get('page')) || 1;
  const brandId = selectedBrand?.id;
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
      .listProjects(
        { brandId, limit: ITEMS_PER_PAGE, page: currentPage },
        abortController.signal,
      )
      .then((items) => {
        if (cancelled) {
          return;
        }

        // The API scopes the page to this brand (plus brandless projects).
        setProjects(items);
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
  }, [brandId, clipsService, currentPage, isEnabled]);

  const renameProject = useCallback(
    async (id: string, name: string): Promise<void> => {
      await clipsService.updateProject(id, { name });
      setProjects((items) =>
        items.map((item) =>
          item.id === id
            ? { ...item, name, updatedAt: new Date().toISOString() }
            : item,
        ),
      );
    },
    [clipsService],
  );

  const deleteProject = useCallback(
    async (id: string): Promise<void> => {
      await clipsService.updateProject(id, { isDeleted: true });
      setProjects((items) => items.filter((item) => item.id !== id));
    },
    [clipsService],
  );

  return { error, isLoading, projects, renameProject, deleteProject };
}
