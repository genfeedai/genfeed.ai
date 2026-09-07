'use client';

import type {
  KnowledgeSource,
  KnowledgeSourceVersion,
  KnowledgeSpace,
} from '@genfeedai/client/models';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { KnowledgeSourceRow } from '@props/content/knowledge-library.props';
import { KnowledgeSourcesService } from '@services/content/knowledge-sources.service';
import { KnowledgeSpacesService } from '@services/content/knowledge-spaces.service';
import { logger } from '@services/core/logger.service';
import { useCallback, useEffect, useRef, useState } from 'react';

export const KNOWLEDGE_LIBRARY_PAGE_SIZE = 25;

interface UseKnowledgeLibraryOptions {
  brandId: string | undefined;
  page?: number;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'CanceledError';
}

/**
 * Loads one brand's Knowledge sources, their current versions and spaces.
 * Every request is aborted when the brand changes so a slow response for the
 * previous brand can never land in the next brand's view.
 */
export function useKnowledgeLibrary({
  brandId,
  page = 1,
}: UseKnowledgeLibraryOptions) {
  const getSourcesService = useAuthedService((token: string) =>
    KnowledgeSourcesService.getInstance(token),
  );
  const getSpacesService = useAuthedService((token: string) =>
    KnowledgeSpacesService.getInstance(token),
  );
  const [rows, setRows] = useState<KnowledgeSourceRow[]>([]);
  const [spaces, setSpaces] = useState<KnowledgeSpace[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setIsLoading(true);
    setError(null);
    if (!brandId) {
      setRows([]);
      setSpaces([]);
      setIsLoading(false);
      return;
    }
    try {
      const [sourcesService, spacesService] = await Promise.all([
        getSourcesService(),
        getSpacesService(),
      ]);
      const [sources, nextSpaces] = await Promise.all([
        sourcesService.findForBrand(
          { brandId, limit: KNOWLEDGE_LIBRARY_PAGE_SIZE, page },
          controller.signal,
        ),
        spacesService.findForBrand(brandId, controller.signal),
      ]);
      const versions = await Promise.all(
        sources.map((source: KnowledgeSource) =>
          sourcesService
            .findVersions(source.id, brandId, controller.signal)
            .then(
              (list: KnowledgeSourceVersion[]) =>
                list.find((version) => version.isCurrent) ?? list[0],
            ),
        ),
      );
      const memberships = await Promise.all(
        nextSpaces.map((space: KnowledgeSpace) =>
          spacesService
            .findMemberships(space.id, brandId, controller.signal)
            .then((list) => ({ list, spaceId: space.id })),
        ),
      );
      if (controller.signal.aborted) {
        return;
      }
      const spaceIdsBySource = new Map<string, string[]>();
      for (const { list, spaceId } of memberships) {
        for (const membership of list) {
          const ids = spaceIdsBySource.get(membership.sourceId) ?? [];
          ids.push(spaceId);
          spaceIdsBySource.set(membership.sourceId, ids);
        }
      }
      setRows(
        sources.map((source: KnowledgeSource, index: number) => ({
          source,
          spaceIds: spaceIdsBySource.get(source.id) ?? [],
          version: versions[index],
        })),
      );
      setSpaces(nextSpaces);
      setError(null);
    } catch (loadError) {
      if (controller.signal.aborted || isAbortError(loadError)) {
        return;
      }
      logger.error('Failed to load Knowledge library', loadError);
      setRows([]);
      setSpaces([]);
      setError('Knowledge could not be loaded.');
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [brandId, getSourcesService, getSpacesService, page]);

  useEffect(() => {
    load().catch((loadError) => {
      logger.error('Failed to initialize Knowledge library', loadError);
    });
    return () => {
      controllerRef.current?.abort();
    };
  }, [load]);

  return { error, isLoading, refresh: load, rows, spaces };
}
