'use client';

import type {
  KnowledgeSource,
  KnowledgeSourceVersion,
  KnowledgeSpace,
} from '@genfeedai/client/models';
import { KnowledgeProcessingState } from '@genfeedai/contracts';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { KnowledgeSourceRow } from '@props/content/knowledge-library.props';
import { KnowledgeSourcesService } from '@services/content/knowledge-sources.service';
import { KnowledgeSpacesService } from '@services/content/knowledge-spaces.service';
import { logger } from '@services/core/logger.service';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export const KNOWLEDGE_LIBRARY_PAGE_SIZE = 25;
/** How often the list re-reads while a capture is still being processed. */
export const KNOWLEDGE_LIBRARY_POLL_INTERVAL_MS = 4_000;

const PENDING_PROCESSING_STATES = new Set<KnowledgeProcessingState>([
  KnowledgeProcessingState.QUEUED,
  KnowledgeProcessingState.PROCESSING,
]);

interface UseKnowledgeLibraryOptions {
  brandId: string | undefined;
  page?: number;
  selectedSourceId?: string;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'CanceledError';
}

/**
 * Loads one brand's Knowledge sources, their current versions and spaces.
 * Every request is aborted when the brand changes so a slow response for the
 * previous brand can never land in the next brand's view. While any current
 * version is queued or processing, the list re-reads in the background until
 * it settles, so ingestion outcomes appear without a manual reload.
 */
export function useKnowledgeLibrary({
  brandId,
  page = 1,
  selectedSourceId,
}: UseKnowledgeLibraryOptions) {
  const getSourcesService = useAuthedService((token: string) =>
    KnowledgeSourcesService.getInstance(token),
  );
  const getSpacesService = useAuthedService((token: string) =>
    KnowledgeSpacesService.getInstance(token),
  );
  // useAuthedService changes identity when actor/session/organization changes.
  const scope = useMemo(
    () => ({
      brandId,
      getSourcesService,
      getSpacesService,
      page,
      selectedSourceId,
    }),
    [brandId, getSourcesService, getSpacesService, page, selectedSourceId],
  );
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const loadedScopeRef = useRef<typeof scope | null>(null);
  const [rows, setRows] = useState<KnowledgeSourceRow[]>([]);
  const [spaces, setSpaces] = useState<KnowledgeSpace[]>([]);
  const [selectedRow, setSelectedRow] = useState<KnowledgeSourceRow | null>(
    null,
  );
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const hasSelection = selectedSourceId !== undefined;
  const isValidSelection =
    typeof selectedSourceId === 'string' &&
    selectedSourceId.length > 0 &&
    selectedSourceId.length <= 128 &&
    !/[^A-Za-z0-9_-]/.test(selectedSourceId);

  const load = useCallback(
    async (isBackground = false) => {
      // An old action's retained refresh callback cannot cancel a new scope.
      if (scopeRef.current !== scope) return;
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const isCurrent = () =>
        !controller.signal.aborted &&
        controllerRef.current === controller &&
        scopeRef.current === scope;
      if (!isBackground) {
        setIsLoading(true);
        setError(null);
        setSelectedRow(null);
        setSelectionError(null);
      }
      if (!brandId) {
        loadedScopeRef.current = scope;
        setRows([]);
        setSpaces([]);
        setSelectedRow(null);
        setIsLoading(false);
        return;
      }
      try {
        const [sourcesService, spacesService] = await Promise.all([
          getSourcesService(),
          getSpacesService(),
        ]);
        if (!isCurrent()) return;
        const [sources, nextSpaces] = await Promise.all([
          sourcesService.findForBrand(
            { brandId, limit: KNOWLEDGE_LIBRARY_PAGE_SIZE, page },
            controller.signal,
          ),
          spacesService.findForBrand(brandId, controller.signal),
        ]);
        if (!isCurrent()) return;
        let isSelectedVersionUnavailable = false;
        const versions = await Promise.all(
          sources.map((source: KnowledgeSource) =>
            sourcesService
              .findVersions(source.id, brandId, controller.signal)
              .then(
                (list: KnowledgeSourceVersion[]) =>
                  list.find((version) => version.isCurrent) ?? list[0],
              )
              .catch((versionError: unknown) => {
                if (source.id !== selectedSourceId) throw versionError;
                isSelectedVersionUnavailable = true;
                return undefined;
              }),
          ),
        );
        if (!isCurrent()) return;
        const memberships = await Promise.all(
          nextSpaces.map((space: KnowledgeSpace) =>
            spacesService
              .findMemberships(space.id, brandId, controller.signal)
              .then((list) => ({ list, spaceId: space.id })),
          ),
        );
        if (!isCurrent()) return;
        const spaceIdsBySource = new Map<string, string[]>();
        for (const { list, spaceId } of memberships) {
          for (const membership of list) {
            const ids = spaceIdsBySource.get(membership.sourceId) ?? [];
            ids.push(spaceId);
            spaceIdsBySource.set(membership.sourceId, ids);
          }
        }
        const nextRows = sources.map(
          (source: KnowledgeSource, index: number) => ({
            source,
            spaceIds: spaceIdsBySource.get(source.id) ?? [],
            version: versions[index],
          }),
        );
        let nextSelected: KnowledgeSourceRow | null = null;
        let nextSelectionError: string | null =
          (hasSelection && !isValidSelection) || isSelectedVersionUnavailable
            ? 'Knowledge could not be loaded.'
            : null;
        if (
          isValidSelection &&
          selectedSourceId &&
          !isSelectedVersionUnavailable
        ) {
          nextSelected =
            nextRows.find((row) => row.source.id === selectedSourceId) ?? null;
          if (!nextSelected) {
            try {
              const source = await sourcesService.findOne(
                selectedSourceId,
                { brandId },
                controller.signal,
              );
              if (!isCurrent()) return;
              if (source.id !== selectedSourceId) {
                throw new Error('knowledge_selection_unavailable');
              }
              const list = await sourcesService.findVersions(
                source.id,
                brandId,
                controller.signal,
              );
              if (!isCurrent()) return;
              nextSelected = {
                source,
                spaceIds: spaceIdsBySource.get(source.id) ?? [],
                version: list.find((version) => version.isCurrent) ?? list[0],
              };
            } catch {
              if (!isCurrent()) return;
              // All denied/missing responses are indistinguishable in the UI.
              nextSelectionError = 'Knowledge could not be loaded.';
            }
          }
        }
        if (!isCurrent()) return;
        loadedScopeRef.current = scope;
        setRows(nextRows);
        setSpaces(nextSpaces);
        setSelectedRow(nextSelected);
        setSelectionError(nextSelectionError);
        setError(null);
      } catch (loadError) {
        if (!isCurrent() || isAbortError(loadError)) return;
        // Failed scope/membership reads cannot leave actionable selected data.
        setSelectedRow(null);
        setSelectionError(
          hasSelection ? 'Knowledge could not be loaded.' : null,
        );
        if (isBackground) return;
        logger.error('Failed to load Knowledge library', loadError);
        loadedScopeRef.current = scope;
        setRows([]);
        setSpaces([]);
        setError('Knowledge could not be loaded.');
      } finally {
        if (isCurrent()) setIsLoading(false);
      }
    },
    [
      brandId,
      getSourcesService,
      getSpacesService,
      hasSelection,
      isValidSelection,
      page,
      scope,
      selectedSourceId,
    ],
  );

  useEffect(() => {
    load().catch((loadError) => {
      logger.error('Failed to initialize Knowledge library', loadError);
    });
    return () => {
      controllerRef.current?.abort();
    };
  }, [load]);

  const hasPendingVersion = [
    ...rows,
    ...(selectedRow ? [selectedRow] : []),
  ].some(
    (row) =>
      row.version !== undefined &&
      PENDING_PROCESSING_STATES.has(row.version.processingState),
  );
  useEffect(() => {
    if (!hasPendingVersion) {
      return;
    }
    const interval = setInterval(() => {
      load(true).catch((pollError) => {
        logger.error('Failed to refresh Knowledge library', pollError);
      });
    }, KNOWLEDGE_LIBRARY_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [hasPendingVersion, load]);

  const refresh = useCallback(() => load(), [load]);

  // Hide data synchronously during a scope change, before effect cleanup runs.
  const isLoadedScope = loadedScopeRef.current === scope;
  return {
    error: isLoadedScope ? error : null,
    isLoading: !isLoadedScope || isLoading,
    refresh,
    rows: isLoadedScope ? rows : [],
    selectedRow: isLoadedScope ? selectedRow : null,
    selectionError: isLoadedScope ? selectionError : null,
    spaces: isLoadedScope ? spaces : [],
  };
}
