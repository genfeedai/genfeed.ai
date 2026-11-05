'use client';

import type {
  KnowledgeSource,
  KnowledgeSourceVersion,
  KnowledgeSpace,
} from '@genfeedai/client/models';
import { KnowledgeProcessingState } from '@genfeedai/contracts';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import type { KnowledgeSourceRow } from '@props/content/knowledge-library.props';
import { KnowledgeSourcesService } from '@services/content/knowledge-sources.service';
import { KnowledgeSpacesService } from '@services/content/knowledge-spaces.service';
import { logger } from '@services/core/logger.service';
import { useCallback, useEffect } from 'react';

const UNSAFE_ID_CHAR_PATTERN = /[^A-Za-z0-9_-]/;

export const KNOWLEDGE_LIBRARY_PAGE_SIZE = 25;
/** How often the list re-reads while a capture is still being processed. */
export const KNOWLEDGE_LIBRARY_POLL_INTERVAL_MS = 4_000;

const LOAD_ERROR = 'Knowledge could not be loaded.';
const EMPTY_ROWS: KnowledgeSourceRow[] = [];
const EMPTY_SPACES: KnowledgeSpace[] = [];

const PENDING_PROCESSING_STATES = new Set<KnowledgeProcessingState>([
  KnowledgeProcessingState.QUEUED,
  KnowledgeProcessingState.PROCESSING,
]);

interface UseKnowledgeLibraryOptions {
  brandId: string | undefined;
  page?: number;
  selectedSourceId?: string;
}

interface KnowledgeServices {
  sources: KnowledgeSourcesService;
  spaces: KnowledgeSpacesService;
}

interface KnowledgeLibraryPage {
  rows: KnowledgeSourceRow[];
  spaces: KnowledgeSpace[];
  /** Space ids per source id, for a selected source that is not on the page. */
  spaceIdsBySource: Record<string, string[]>;
  /** Sources whose current version could not be read. */
  unavailableVersionIds: string[];
}

interface KnowledgeSelectedSource {
  source: KnowledgeSource;
  version?: KnowledgeSourceVersion;
}

function createKnowledgeServices(token: string): KnowledgeServices {
  return {
    sources: KnowledgeSourcesService.getInstance(token),
    spaces: KnowledgeSpacesService.getInstance(token),
  };
}

/**
 * A superseded read (another brand, viewer or selection, or an unmount) is
 * cancelled while it still waits for its token: it never reaches the API.
 */
function throwIfSuperseded(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException('Superseded Knowledge read', 'AbortError');
  }
}

function pickCurrentVersion(
  versions: KnowledgeSourceVersion[],
): KnowledgeSourceVersion | undefined {
  return versions.find((version) => version.isCurrent) ?? versions[0];
}

function isPending(version: KnowledgeSourceVersion | undefined): boolean {
  return (
    version !== undefined &&
    PENDING_PROCESSING_STATES.has(version.processingState)
  );
}

function isValidSourceId(id: string | undefined): id is string {
  return (
    typeof id === 'string' &&
    id.length > 0 &&
    id.length <= 128 &&
    !UNSAFE_ID_CHAR_PATTERN.test(id)
  );
}

/**
 * Loads one brand's Knowledge sources, their current versions and spaces,
 * plus the selected source when it is not on the current page.
 *
 * Both reads are cached per viewer, brand, page and selection, so coming back
 * to the Library paints the last list at once and refreshes it in the
 * background. Data is only ever shown under the key it was read for: another
 * brand, viewer or selection never sees it, and a superseded read is
 * cancelled. While any current version is queued or processing, the read
 * repeats in the background until it settles.
 */
export function useKnowledgeLibrary({
  brandId,
  page = 1,
  selectedSourceId,
}: UseKnowledgeLibraryOptions) {
  const hasSelection = selectedSourceId !== undefined;
  const isValidSelection = isValidSourceId(selectedSourceId);

  const listQuery = useAuthedQuery<KnowledgeServices, KnowledgeLibraryPage>({
    enabled: Boolean(brandId),
    queryFn: async (
      { sources: sourcesService, spaces: spacesService },
      signal,
    ) => {
      throwIfSuperseded(signal);
      if (!brandId) {
        throw new Error('knowledge_brand_required');
      }
      const scopedBrandId = brandId;
      const [sources, spaces] = await Promise.all([
        sourcesService.findForBrand(
          { brandId: scopedBrandId, limit: KNOWLEDGE_LIBRARY_PAGE_SIZE, page },
          signal,
        ),
        spacesService.findForBrand(scopedBrandId, signal),
      ]);
      const unavailableVersionIds: string[] = [];
      const versions = await Promise.all(
        sources.map((source: KnowledgeSource) =>
          sourcesService
            .findVersions(source.id, scopedBrandId, signal)
            .then(pickCurrentVersion)
            .catch(() => {
              unavailableVersionIds.push(source.id);
              return undefined;
            }),
        ),
      );
      const memberships = await Promise.all(
        spaces.map((space: KnowledgeSpace) =>
          spacesService
            .findMemberships(space.id, scopedBrandId, signal)
            .then((list) => ({ list, spaceId: space.id })),
        ),
      );
      const spaceIdsBySource: Record<string, string[]> = {};
      for (const { list, spaceId } of memberships) {
        for (const membership of list) {
          spaceIdsBySource[membership.sourceId] = [
            ...(spaceIdsBySource[membership.sourceId] ?? []),
            spaceId,
          ];
        }
      }
      return {
        rows: sources.map((source: KnowledgeSource, index: number) => ({
          source,
          spaceIds: spaceIdsBySource[source.id] ?? [],
          version: versions[index],
        })),
        spaceIdsBySource,
        spaces,
        unavailableVersionIds,
      };
    },
    queryKey: ['knowledge-library', brandId ?? null, page],
    refetchInterval: (query) =>
      query.state.data?.rows.some((row) => isPending(row.version))
        ? KNOWLEDGE_LIBRARY_POLL_INTERVAL_MS
        : false,
    service: createKnowledgeServices,
  });

  const listData = listQuery.data;
  const onPageSelection =
    isValidSelection && listData
      ? listData.rows.find((row) => row.source.id === selectedSourceId)
      : undefined;
  const needsOffPageRead =
    Boolean(brandId) &&
    isValidSelection &&
    listData !== undefined &&
    onPageSelection === undefined;

  const selectionQuery = useAuthedQuery<
    KnowledgeServices,
    KnowledgeSelectedSource
  >({
    enabled: needsOffPageRead,
    queryFn: async ({ sources: sourcesService }, signal) => {
      throwIfSuperseded(signal);
      if (!brandId || !isValidSourceId(selectedSourceId)) {
        throw new Error('knowledge_selection_unavailable');
      }
      const scopedBrandId = brandId;
      const sourceId = selectedSourceId;
      const source = await sourcesService.findOne(
        sourceId,
        { brandId: scopedBrandId },
        signal,
      );
      if (source.id !== sourceId) {
        throw new Error('knowledge_selection_unavailable');
      }
      const versions = await sourcesService.findVersions(
        source.id,
        scopedBrandId,
        signal,
      );
      return { source, version: pickCurrentVersion(versions) };
    },
    queryKey: [
      'knowledge-library-selection',
      brandId ?? null,
      selectedSourceId ?? null,
    ],
    refetchInterval: (query) =>
      isPending(query.state.data?.version)
        ? KNOWLEDGE_LIBRARY_POLL_INTERVAL_MS
        : false,
    service: createKnowledgeServices,
  });

  const { refetch: refetchList } = listQuery;
  const { refetch: refetchSelection } = selectionQuery;
  const refresh = useCallback(async () => {
    if (!brandId) return;
    await Promise.all([
      refetchList(),
      needsOffPageRead ? refetchSelection() : undefined,
    ]);
  }, [brandId, needsOffPageRead, refetchList, refetchSelection]);

  const listError = listQuery.error;
  const selectionReadError = selectionQuery.error;
  const hasListData = listData !== undefined;
  useEffect(() => {
    if (listError && !hasListData) {
      logger.error('Failed to load Knowledge library', listError);
    }
  }, [hasListData, listError]);

  if (!brandId) {
    return {
      error: null,
      isLoading: false,
      refresh,
      rows: EMPTY_ROWS,
      selectedRow: null,
      selectionError: null,
      spaces: EMPTY_SPACES,
    };
  }

  if (!listData) {
    return {
      error: listError ? LOAD_ERROR : null,
      isLoading: !listError,
      refresh,
      rows: EMPTY_ROWS,
      selectedRow: null,
      selectionError: listError && hasSelection ? LOAD_ERROR : null,
      spaces: EMPTY_SPACES,
    };
  }

  // A version that could not be read fails the whole page, unless it belongs
  // to the selected source: then only the selected panel says so.
  const isPageUnavailable = listData.unavailableVersionIds.some(
    (id) => id !== selectedSourceId,
  );
  if (isPageUnavailable) {
    return {
      error: LOAD_ERROR,
      isLoading: false,
      refresh,
      rows: EMPTY_ROWS,
      selectedRow: null,
      selectionError: hasSelection ? LOAD_ERROR : null,
      spaces: EMPTY_SPACES,
    };
  }

  // A failed background read keeps the list, but never leaves actionable
  // selected details from before the failure on screen.
  let selectedRow: KnowledgeSourceRow | null = null;
  let selectionError: string | null = null;
  if (hasSelection && (!isValidSelection || listError)) {
    selectionError = LOAD_ERROR;
  } else if (onPageSelection) {
    if (listData.unavailableVersionIds.includes(onPageSelection.source.id)) {
      selectionError = LOAD_ERROR;
    } else {
      selectedRow = onPageSelection;
    }
  } else if (needsOffPageRead) {
    if (selectionReadError) {
      // Denied and missing sources are indistinguishable in the UI.
      selectionError = LOAD_ERROR;
    } else if (selectionQuery.data) {
      selectedRow = {
        source: selectionQuery.data.source,
        spaceIds:
          listData.spaceIdsBySource[selectionQuery.data.source.id] ?? [],
        version: selectionQuery.data.version,
      };
    }
  }

  return {
    error: null,
    isLoading: needsOffPageRead && selectionQuery.isPending,
    refresh,
    rows: listData.rows,
    selectedRow,
    selectionError,
    spaces: listData.spaces,
  };
}
