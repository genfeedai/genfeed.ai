import type { PublicationCaptureScope } from '@genfeedai/contracts/interfaces/extension/extension-publication-observer.interface';
import {
  publicationCaptureRecord as object,
  samePublicationCaptureScope as same,
} from '~services/publication-capture-validation';

/**
 * Text the extension itself wrote into an X composer. Only a publication whose
 * text matches one of these is ever captured: the user's other posts are
 * never recorded or uploaded.
 */
export const NOT_WRITTEN_BY_GENFEED = 'Not written with Genfeed';
export const PUBLICATION_WRITTEN_KEY = 'genfeed-publication-written-v1';
export const PUBLICATION_WRITTEN_LIFETIME_MS = 30 * 60 * 1000;
const MAX_WRITTEN_PER_TAB = 10;
const MAX_WRITTEN_BYTES = 1048576;

export interface PublicationWrittenText {
  text: string;
  origin: string;
  scope: PublicationCaptureScope;
  createdAt: number;
}
export type PublicationWrittenTexts = Record<string, PublicationWrittenText[]>;

/** X rewrites whitespace in its editor, so compare on collapsed whitespace. */
export function normalizePublicationWrittenText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
function parseEntry(value: unknown): PublicationWrittenText | null {
  const v = object(value);
  const scope = object(v?.scope);
  if (
    !v ||
    !scope ||
    typeof v.text !== 'string' ||
    typeof v.origin !== 'string' ||
    typeof v.createdAt !== 'number' ||
    typeof scope.userId !== 'string' ||
    typeof scope.organizationId !== 'string' ||
    typeof scope.brandId !== 'string' ||
    typeof scope.revision !== 'number'
  )
    return null;
  return {
    text: v.text,
    origin: v.origin,
    createdAt: v.createdAt,
    scope: {
      userId: scope.userId,
      organizationId: scope.organizationId,
      brandId: scope.brandId,
      revision: scope.revision,
    },
  };
}
/** Unreadable storage authorizes nothing: it reads as empty. */
export async function readPublicationWrittenTexts(): Promise<PublicationWrittenTexts> {
  const stored = await chrome.storage.session.get(PUBLICATION_WRITTEN_KEY);
  const raw = object(stored[PUBLICATION_WRITTEN_KEY]);
  const entries: PublicationWrittenTexts = {};
  for (const [key, list] of Object.entries(raw ?? {})) {
    if (!/^\d+$/.test(key) || !Array.isArray(list)) continue;
    const parsed = list.flatMap((item) => parseEntry(item) ?? []);
    if (parsed.length) entries[key] = parsed;
  }
  return entries;
}
export function prunePublicationWrittenTexts(
  entries: PublicationWrittenTexts,
  now: number,
): PublicationWrittenTexts {
  const kept: PublicationWrittenTexts = {};
  for (const [key, list] of Object.entries(entries)) {
    const live = list.filter(
      (item) =>
        now >= item.createdAt &&
        now <= item.createdAt + PUBLICATION_WRITTEN_LIFETIME_MS,
    );
    if (live.length) kept[key] = live;
  }
  return kept;
}
export function addPublicationWrittenText(
  entries: PublicationWrittenTexts,
  key: string,
  origin: string,
  scope: PublicationCaptureScope,
  content: string,
  now: number,
): boolean {
  const text = normalizePublicationWrittenText(content);
  if (!text || new TextEncoder().encode(text).length > MAX_WRITTEN_BYTES)
    return false;
  const list = (entries[key] ?? []).filter((item) => item.text !== text);
  list.push({ text, origin, scope, createdAt: now });
  entries[key] = list.slice(-MAX_WRITTEN_PER_TAB);
  return true;
}
export function matchesPublicationWrittenText(
  entries: PublicationWrittenTexts,
  key: string,
  origin: string,
  scope: PublicationCaptureScope,
  description: string,
  now: number,
): boolean {
  const text = normalizePublicationWrittenText(description);
  return (entries[key] ?? []).some(
    (item) =>
      item.text === text &&
      item.origin === origin &&
      same(item.scope, scope, false) &&
      now >= item.createdAt &&
      now <= item.createdAt + PUBLICATION_WRITTEN_LIFETIME_MS,
  );
}
