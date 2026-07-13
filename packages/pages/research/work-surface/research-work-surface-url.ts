import {
  RESEARCH_FINDING_REFERENCE_KINDS,
  type ResearchFindingReference,
  type ResearchFindingReferenceKind,
} from './research-work-surface.types';

export const RESEARCH_WORK_SURFACE_QUERY_KEYS = {
  FINDING: 'finding',
  PAGE: 'page',
  QUERY: 'q',
} as const;

const MAX_QUERY_LENGTH = 200;
const MAX_PAGE = 10_000;
const SAFE_FINDING_ID = /^[A-Za-z0-9._~-]{1,160}$/;

export interface ResearchWorkSurfaceUrlState {
  readonly canonicalSearchParams: URLSearchParams;
  readonly isCanonical: boolean;
  readonly page: number;
  readonly query: string;
  readonly requestedReference: ResearchFindingReference | null;
}

function isResearchFindingReferenceKind(
  value: string,
): value is ResearchFindingReferenceKind {
  return RESEARCH_FINDING_REFERENCE_KINDS.includes(
    value as ResearchFindingReferenceKind,
  );
}

export function encodeResearchFindingReference(
  reference: ResearchFindingReference,
): string {
  return `${reference.kind}:${reference.id}`;
}

export function parseResearchFindingReference(
  value: string | null,
): ResearchFindingReference | null {
  if (!value) {
    return null;
  }

  const separatorIndex = value.indexOf(':');
  if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
    return null;
  }

  const kind = value.slice(0, separatorIndex);
  const id = value.slice(separatorIndex + 1);
  if (!isResearchFindingReferenceKind(kind) || !SAFE_FINDING_ID.test(id)) {
    return null;
  }

  return { id, kind };
}

export function parseResearchWorkSurfaceUrl(
  searchParams: URLSearchParams,
): ResearchWorkSurfaceUrlState {
  const canonicalSearchParams = new URLSearchParams(searchParams);
  let isCanonical = true;

  const rawQuery = searchParams.get(RESEARCH_WORK_SURFACE_QUERY_KEYS.QUERY);
  const query = rawQuery?.trim() ?? '';
  if (rawQuery !== null) {
    if (!query || query.length > MAX_QUERY_LENGTH) {
      canonicalSearchParams.delete(RESEARCH_WORK_SURFACE_QUERY_KEYS.QUERY);
      isCanonical = false;
    } else if (rawQuery !== query) {
      canonicalSearchParams.set(RESEARCH_WORK_SURFACE_QUERY_KEYS.QUERY, query);
      isCanonical = false;
    }
  }

  const rawPage = searchParams.get(RESEARCH_WORK_SURFACE_QUERY_KEYS.PAGE);
  const parsedPage = rawPage === null ? 1 : Number(rawPage);
  const isValidPage =
    Number.isInteger(parsedPage) && parsedPage >= 1 && parsedPage <= MAX_PAGE;
  const page = isValidPage ? parsedPage : 1;
  if (rawPage !== null && (!isValidPage || page === 1)) {
    canonicalSearchParams.delete(RESEARCH_WORK_SURFACE_QUERY_KEYS.PAGE);
    isCanonical = false;
  }

  const rawFinding = searchParams.get(RESEARCH_WORK_SURFACE_QUERY_KEYS.FINDING);
  const requestedReference = parseResearchFindingReference(rawFinding);
  if (rawFinding !== null && !requestedReference) {
    canonicalSearchParams.delete(RESEARCH_WORK_SURFACE_QUERY_KEYS.FINDING);
    isCanonical = false;
  }

  return {
    canonicalSearchParams,
    isCanonical,
    page,
    query: query.length <= MAX_QUERY_LENGTH ? query : '',
    requestedReference,
  };
}

export function buildResearchWorkSurfaceHref(
  pathname: string,
  searchParams: URLSearchParams,
): string {
  const query = searchParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}
