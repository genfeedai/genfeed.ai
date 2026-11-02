import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  EMPTY_PAGE_TOTALS,
  ITEMS_PER_PAGE,
} from '@genfeedai/contracts/constants';
import type { IPaginatedResponse } from '@genfeedai/contracts/interfaces';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ClipperProjectSummary } from '@/props/studio/clipper.props';

import { ClipperApiService } from './services/clipper-api.service';

const EMPTY_PROJECTS: ClipperProjectSummary[] = [];

export function useStudioClipperProjects(options?: { isEnabled?: boolean }) {
  const isEnabled = options?.isEnabled ?? true;
  const { getToken } = useAuthIdentity();
  const { selectedBrand } = useBrand();
  const searchParams = useSearchParams();
  const currentPage = Number(searchParams.get('page')) || 1;
  const search = searchParams.get('q') ?? '';
  const brandId = selectedBrand?.id;
  const [projectsPage, setProjectsPage] =
    useState<IPaginatedResponse<ClipperProjectSummary> | null>(null);
  const projects = projectsPage?.items ?? EMPTY_PROJECTS;
  const [isLoading, setIsLoading] = useState(isEnabled);
  const [error, setError] = useState<string | null>(null);

  const resolveToken = useCallback(async (): Promise<string> => {
    return (await resolveAuthToken(getToken)) ?? '';
  }, [getToken]);

  const clipsService = useMemo(
    () => new ClipperApiService(resolveToken),
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
        {
          brandId,
          limit: ITEMS_PER_PAGE,
          page: currentPage,
          ...(search ? { search } : {}),
        },
        abortController.signal,
      )
      .then((items) => {
        if (cancelled) {
          return;
        }

        // The API scopes the page to this brand (plus brandless projects).
        setProjectsPage(items);
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
        setProjectsPage(null);
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
  }, [brandId, clipsService, currentPage, isEnabled, search]);

  const renameProject = useCallback(
    async (id: string, name: string): Promise<void> => {
      await clipsService.updateProject(id, { name });
      setProjectsPage((current) =>
        current
          ? {
              ...current,
              items: current.items.map((item) =>
                item.id === id
                  ? { ...item, name, updatedAt: new Date().toISOString() }
                  : item,
              ),
            }
          : current,
      );
    },
    [clipsService],
  );

  const deleteProject = useCallback(
    async (id: string): Promise<void> => {
      await clipsService.updateProject(id, { isDeleted: true });
      setProjectsPage((current) =>
        current
          ? {
              ...current,
              items: current.items.filter((item) => item.id !== id),
            }
          : current,
      );
    },
    [clipsService],
  );

  return {
    error,
    isLoading,
    projects,
    pageTotals: projectsPage
      ? { totalDocs: projectsPage.total, totalPages: projectsPage.totalPages }
      : EMPTY_PAGE_TOTALS,
    renameProject,
    deleteProject,
  };
}
