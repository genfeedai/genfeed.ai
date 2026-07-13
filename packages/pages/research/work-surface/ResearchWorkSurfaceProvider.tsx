'use client';

import Pagination from '@ui/navigation/pagination/Pagination';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  createContext,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  type AuthorizedResearchFinding,
  getResearchFindingReferenceKey,
} from './research-work-surface.types';
import {
  buildResearchWorkSurfaceHref,
  encodeResearchFindingReference,
  parseResearchWorkSurfaceUrl,
  RESEARCH_WORK_SURFACE_QUERY_KEYS,
  type ResearchWorkSurfaceUrlState,
} from './research-work-surface-url';

const DEFAULT_RESEARCH_PAGE_SIZE = 24;

type ResearchUrlHistory = 'push' | 'replace';

interface UpdateResearchSearchParamsOptions {
  readonly clearFinding?: boolean;
  readonly history?: ResearchUrlHistory;
  readonly resetPage?: boolean;
}

interface ResearchWorkSurfaceContextValue {
  readonly authorizedFinding: AuthorizedResearchFinding | null;
  readonly clearFinding: (history?: ResearchUrlHistory) => void;
  readonly isEmbedded: boolean;
  readonly pathname: string;
  readonly selectFinding: (finding: AuthorizedResearchFinding) => void;
  readonly setAuthorizedFinding: (
    finding: AuthorizedResearchFinding | null,
  ) => void;
  readonly setEmbedded: (isEmbedded: boolean) => void;
  readonly updateSearchParams: (
    updates: Readonly<Record<string, string | null>>,
    options?: UpdateResearchSearchParamsOptions,
  ) => void;
  readonly urlState: ResearchWorkSurfaceUrlState;
}

const ResearchWorkSurfaceContext =
  createContext<ResearchWorkSurfaceContextValue | null>(null);

export function ResearchWorkSurfaceProvider({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const searchParamsStringRef = useRef(searchParamsString);
  searchParamsStringRef.current = searchParamsString;
  const { push, replace } = useRouter();
  const [authorizedFinding, setAuthorizedFinding] =
    useState<AuthorizedResearchFinding | null>(null);
  const [isEmbedded, setEmbedded] = useState(false);
  const urlState = useMemo(
    () => parseResearchWorkSurfaceUrl(new URLSearchParams(searchParamsString)),
    [searchParamsString],
  );
  const canonicalSearchParamsString = urlState.canonicalSearchParams.toString();

  useEffect(() => {
    if (urlState.isCanonical) {
      return;
    }

    replace(
      buildResearchWorkSurfaceHref(
        pathname,
        new URLSearchParams(canonicalSearchParamsString),
      ),
      { scroll: false },
    );
  }, [canonicalSearchParamsString, pathname, replace, urlState.isCanonical]);

  const updateSearchParams = useCallback(
    (
      updates: Readonly<Record<string, string | null>>,
      options: UpdateResearchSearchParamsOptions = {},
    ) => {
      const currentSearchParamsString = searchParamsStringRef.current;
      const nextSearchParams = new URLSearchParams(currentSearchParamsString);
      const shouldClearFinding = options.clearFinding ?? true;
      const shouldResetPage = options.resetPage ?? true;

      for (const [key, value] of Object.entries(updates)) {
        if (value) {
          nextSearchParams.set(key, value);
        } else {
          nextSearchParams.delete(key);
        }
      }

      if (shouldResetPage) {
        nextSearchParams.delete(RESEARCH_WORK_SURFACE_QUERY_KEYS.PAGE);
      }
      if (shouldClearFinding) {
        nextSearchParams.delete(RESEARCH_WORK_SURFACE_QUERY_KEYS.FINDING);
        setAuthorizedFinding(null);
      }

      const nextHref = buildResearchWorkSurfaceHref(pathname, nextSearchParams);
      const currentHref = buildResearchWorkSurfaceHref(
        pathname,
        new URLSearchParams(currentSearchParamsString),
      );
      if (nextHref === currentHref) {
        return;
      }

      if (options.history === 'push') {
        push(nextHref, { scroll: false });
      } else {
        replace(nextHref, { scroll: false });
      }
    },
    [pathname, push, replace],
  );

  const clearFinding = useCallback(
    (history: ResearchUrlHistory = 'push') => {
      setAuthorizedFinding(null);
      updateSearchParams(
        { [RESEARCH_WORK_SURFACE_QUERY_KEYS.FINDING]: null },
        { clearFinding: false, history, resetPage: false },
      );
    },
    [updateSearchParams],
  );

  const selectFinding = useCallback(
    (finding: AuthorizedResearchFinding) => {
      setAuthorizedFinding(finding);
      updateSearchParams(
        {
          [RESEARCH_WORK_SURFACE_QUERY_KEYS.FINDING]:
            encodeResearchFindingReference(finding.reference),
        },
        { clearFinding: false, history: 'push', resetPage: false },
      );
    },
    [updateSearchParams],
  );

  const value = useMemo<ResearchWorkSurfaceContextValue>(
    () => ({
      authorizedFinding,
      clearFinding,
      isEmbedded,
      pathname,
      selectFinding,
      setAuthorizedFinding,
      setEmbedded,
      updateSearchParams,
      urlState,
    }),
    [
      authorizedFinding,
      clearFinding,
      isEmbedded,
      pathname,
      selectFinding,
      updateSearchParams,
      urlState,
    ],
  );

  return (
    <ResearchWorkSurfaceContext.Provider value={value}>
      {children}
    </ResearchWorkSurfaceContext.Provider>
  );
}

export function useOptionalResearchWorkSurface(): ResearchWorkSurfaceContextValue | null {
  return useContext(ResearchWorkSurfaceContext);
}

export function useResearchQueryState(): readonly [
  string,
  (value: string) => void,
] {
  const surface = useOptionalResearchWorkSurface();
  const updateSearchParams = surface?.updateSearchParams;
  const [localQuery, setLocalQuery] = useState('');
  const query = surface?.urlState.query ?? localQuery;
  const setQuery = useCallback(
    (value: string) => {
      if (!updateSearchParams) {
        setLocalQuery(value);
        return;
      }

      updateSearchParams({
        [RESEARCH_WORK_SURFACE_QUERY_KEYS.QUERY]: value.trim() || null,
      });
    },
    [updateSearchParams],
  );

  return [query, setQuery] as const;
}

export function useResearchSearchParamState<Value extends string>({
  allowedValues,
  defaultValue,
  key,
  maxLength = 160,
}: {
  readonly allowedValues?: readonly Value[];
  readonly defaultValue: Value;
  readonly key: string;
  readonly maxLength?: number;
}): readonly [Value, (value: Value) => void] {
  const surface = useOptionalResearchWorkSurface();
  const updateSearchParams = surface?.updateSearchParams;
  const [localValue, setLocalValue] = useState<Value>(defaultValue);
  const rawValue = surface?.urlState.canonicalSearchParams.get(key) ?? null;
  const isValid = Boolean(
    rawValue !== null &&
      rawValue.length <= maxLength &&
      (!allowedValues || allowedValues.includes(rawValue as Value)),
  );
  const value = surface
    ? isValid
      ? (rawValue as Value)
      : defaultValue
    : localValue;

  useEffect(() => {
    if (!updateSearchParams || rawValue === null || isValid) {
      return;
    }

    updateSearchParams(
      { [key]: null },
      { clearFinding: false, resetPage: false },
    );
  }, [isValid, key, rawValue, updateSearchParams]);

  const setValue = useCallback(
    (nextValue: Value) => {
      if (!updateSearchParams) {
        setLocalValue(nextValue);
        return;
      }

      updateSearchParams({
        [key]: nextValue === defaultValue ? null : nextValue,
      });
    },
    [defaultValue, key, updateSearchParams],
  );

  return [value, setValue] as const;
}

export function useResearchPagination<Item>(
  items: readonly Item[],
  pageSize = DEFAULT_RESEARCH_PAGE_SIZE,
): {
  readonly currentPage: number;
  readonly pageItems: readonly Item[];
  readonly pagination: ReactElement | null;
  readonly totalPages: number;
} {
  const surface = useOptionalResearchWorkSurface();
  const totalPages = surface
    ? Math.max(1, Math.ceil(items.length / pageSize))
    : 1;
  const currentPage = surface ? Math.min(surface.urlState.page, totalPages) : 1;

  useEffect(() => {
    if (!surface || surface.urlState.page <= totalPages) {
      return;
    }

    surface.updateSearchParams(
      {
        [RESEARCH_WORK_SURFACE_QUERY_KEYS.PAGE]:
          totalPages === 1 ? null : String(totalPages),
      },
      { clearFinding: false, history: 'replace', resetPage: false },
    );
  }, [surface, totalPages]);

  const pageItems = surface
    ? items.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    : items;
  const pagination =
    surface && totalPages > 1 ? (
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={(page) => {
          surface.updateSearchParams(
            {
              [RESEARCH_WORK_SURFACE_QUERY_KEYS.PAGE]:
                page === 1 ? null : String(page),
            },
            { history: 'replace', resetPage: false },
          );
        }}
      />
    ) : null;

  return { currentPage, pageItems, pagination, totalPages };
}

export function useRestoreResearchFinding(
  findings: readonly AuthorizedResearchFinding[],
  isLoading: boolean,
): void {
  const surface = useOptionalResearchWorkSurface();
  const clearFinding = surface?.clearFinding;
  const setAuthorizedFinding = surface?.setAuthorizedFinding;
  const requestedKey = surface?.urlState.requestedReference
    ? getResearchFindingReferenceKey(surface.urlState.requestedReference)
    : null;
  const findingByKey = useMemo(
    () =>
      new Map(
        findings.map((finding) => [
          getResearchFindingReferenceKey(finding.reference),
          finding,
        ]),
      ),
    [findings],
  );

  useEffect(() => {
    if (!clearFinding || !setAuthorizedFinding) {
      return;
    }
    if (!requestedKey) {
      setAuthorizedFinding(null);
      return;
    }
    if (isLoading) {
      setAuthorizedFinding(null);
      return;
    }

    const finding = findingByKey.get(requestedKey);
    if (finding) {
      setAuthorizedFinding(finding);
      return;
    }

    clearFinding('replace');
  }, [
    clearFinding,
    findingByKey,
    isLoading,
    requestedKey,
    setAuthorizedFinding,
  ]);
}
