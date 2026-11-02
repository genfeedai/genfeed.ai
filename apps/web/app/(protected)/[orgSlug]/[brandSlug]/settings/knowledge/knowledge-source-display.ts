import {
  KnowledgeProcessingState,
  KnowledgeSourceKind,
} from '@genfeedai/contracts';
import type {
  KnowledgeFailureKind,
  KnowledgeFilters,
  KnowledgeSourceLink,
  KnowledgeSourceRow,
} from '@props/content/knowledge-library.props';
import {
  AudioLines,
  File,
  FileText,
  Globe,
  type LucideIcon,
  Rss,
  Text,
  Video,
} from 'lucide-react';

const SNIPPET_LENGTH = 140;
const LINK_LABEL_LENGTH = 64;

/** The label key under `pages.library.knowledge.kind` and the icon of each kind. */
export const KIND_DISPLAY: Record<
  KnowledgeSourceKind,
  { icon: LucideIcon; labelKey: string }
> = {
  [KnowledgeSourceKind.AUDIO]: { icon: AudioLines, labelKey: 'audio' },
  [KnowledgeSourceKind.DOCUMENT]: { icon: FileText, labelKey: 'document' },
  [KnowledgeSourceKind.FILE]: { icon: File, labelKey: 'file' },
  [KnowledgeSourceKind.RSS]: { icon: Rss, labelKey: 'rss' },
  [KnowledgeSourceKind.TEXT]: { icon: Text, labelKey: 'text' },
  [KnowledgeSourceKind.URL]: { icon: Globe, labelKey: 'url' },
  [KnowledgeSourceKind.VIDEO]: { icon: Video, labelKey: 'video' },
};

/** Filter values are the lowercase enum values, so a URL reads `?status=failed`. */
export const KNOWLEDGE_TYPE_FILTERS = Object.values(KnowledgeSourceKind).map(
  (kind) => kind.toLowerCase(),
);
export const KNOWLEDGE_STATUS_FILTERS = Object.values(
  KnowledgeProcessingState,
).map((state) => state.toLowerCase());

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** The pasted text of a Text source, when its current version carries one. */
export function getSourceText(row: KnowledgeSourceRow): string | null {
  return readString(row.version?.payload?.text);
}

/**
 * Where a source was captured from. Only web addresses come back, so a stored
 * `javascript:` or `data:` value can never become a clickable link.
 */
export function getSourceLink(
  row: KnowledgeSourceRow,
): KnowledgeSourceLink | null {
  const candidate =
    readString(row.source.referenceUrl) ??
    readString(row.version?.payload?.referenceUrl) ??
    readString(row.version?.provenance?.url);
  if (!candidate) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null;
  }
  const path = url.pathname === '/' ? '' : url.pathname;
  const label = `${url.host.replace(/^www\./, '')}${path}${url.search}`;
  return {
    href: url.href,
    label:
      label.length > LINK_LABEL_LENGTH
        ? `${label.slice(0, LINK_LABEL_LENGTH - 1)}…`
        : label,
  };
}

/**
 * The first words of a pasted text source, for the line under its title. A web
 * page or document is identified by its link; its extracted text stays in the
 * sidebar.
 */
export function getSourceSnippet(row: KnowledgeSourceRow): string | null {
  const text =
    row.source.kind === KnowledgeSourceKind.TEXT ? getSourceText(row) : null;
  if (!text) {
    return null;
  }
  const flat = text.replace(/\s+/g, ' ');
  return flat.length > SNIPPET_LENGTH
    ? `${flat.slice(0, SNIPPET_LENGTH - 1)}…`
    : flat;
}

/**
 * Sorts a raw ingestion error into the few causes a person can act on. The raw
 * text still goes to the sidebar as technical detail; this is the sentence
 * above it.
 */
export function classifyFailure(error: string | null): KnowledgeFailureKind {
  if (!error) {
    return 'unknown';
  }
  if (/no extractable text/i.test(error)) {
    return 'noText';
  }
  if (
    /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|getaddrinfo|fetch failed/i.test(error)
  ) {
    return 'unreachable';
  }
  if (/output validation failed/i.test(error)) {
    return 'invalidResult';
  }
  if (/request to https?:\/\/\S+ failed with status/i.test(error)) {
    return 'serviceUnavailable';
  }
  return 'unknown';
}

/** Applies the list filters to the loaded rows. */
export function filterKnowledgeRows(
  rows: KnowledgeSourceRow[],
  filters: KnowledgeFilters,
): KnowledgeSourceRow[] {
  const term = filters.search.trim().toLowerCase();
  return rows.filter((row) => {
    if (filters.spaceId && !row.spaceIds.includes(filters.spaceId)) {
      return false;
    }
    if (
      filters.status &&
      row.version?.processingState.toLowerCase() !== filters.status
    ) {
      return false;
    }
    if (filters.type && row.source.kind.toLowerCase() !== filters.type) {
      return false;
    }
    if (!term) {
      return true;
    }
    return [
      row.source.title,
      getSourceLink(row)?.href,
      getSourceText(row),
    ].some((value) => value?.toLowerCase().includes(term));
  });
}
