import type { PersistedKnowledgeSource } from '@api/collections/contexts/utils/knowledge-source.util';
import {
  KnowledgeBaseCategory,
  KnowledgeMemoryScope,
  KnowledgeSourceKind,
  KnowledgeSourcePurpose,
} from '@genfeedai/contracts';
import type {
  KnowledgeSourceCapturePayload,
  KnowledgeSourceCaptureProvenance,
} from '@genfeedai/contracts/interfaces';
import type { Bookmark } from '@genfeedai/prisma';

export const LEGACY_CONTEXT_SOURCE_CAPTURE = 'legacy-context-source';
export const LEGACY_BOOKMARK_CAPTURE = 'legacy-bookmark';

const KIND_BY_CATEGORY: Record<KnowledgeBaseCategory, KnowledgeSourceKind> = {
  [KnowledgeBaseCategory.AUDIO]: KnowledgeSourceKind.AUDIO,
  [KnowledgeBaseCategory.DOCUMENT]: KnowledgeSourceKind.DOCUMENT,
  [KnowledgeBaseCategory.FILE]: KnowledgeSourceKind.FILE,
  [KnowledgeBaseCategory.RSS]: KnowledgeSourceKind.RSS,
  [KnowledgeBaseCategory.URL]: KnowledgeSourceKind.URL,
  [KnowledgeBaseCategory.VIDEO]: KnowledgeSourceKind.VIDEO,
};

/**
 * Bookmarks were saved as things to draw from, never as facts about the
 * brand, so nothing legacy becomes Brand Truth. Replies were saved to be
 * answered and read as market signal.
 */
export function purposeForBookmarkIntent(
  intent: Bookmark['intent'],
): KnowledgeSourcePurpose {
  return intent === 'REPLY'
    ? KnowledgeSourcePurpose.RESEARCH
    : KnowledgeSourcePurpose.INSPIRATION;
}

export function kindForLegacyCategory(
  category: KnowledgeBaseCategory,
): KnowledgeSourceKind {
  return KIND_BY_CATEGORY[category];
}

export function isHttpUrl(value: string | null | undefined): value is string {
  if (!value) {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function titleForBookmark(
  bookmark: Pick<Bookmark, 'title' | 'url'>,
): string {
  const title = bookmark.title?.trim();
  if (title) {
    return title.slice(0, 500);
  }
  try {
    return new URL(bookmark.url).hostname || 'Saved link';
  } catch {
    return 'Saved link';
  }
}

export function scopeForBrand(
  brandId: string | null | undefined,
): KnowledgeMemoryScope {
  return brandId ? KnowledgeMemoryScope.BRAND : KnowledgeMemoryScope.ORG;
}

export interface LegacyKnowledgeCapture {
  payload: KnowledgeSourceCapturePayload;
  provenance: KnowledgeSourceCaptureProvenance;
}

export function captureForLegacyContextSource(
  contextBaseId: string,
  source: PersistedKnowledgeSource,
  observedAt: Date,
): LegacyKnowledgeCapture {
  return {
    payload: source.referenceUrl ? { referenceUrl: source.referenceUrl } : {},
    provenance: {
      capturedAt: source.lastIngestedAt ?? observedAt.toISOString(),
      capturedBy: LEGACY_CONTEXT_SOURCE_CAPTURE,
      contextBaseId,
      legacySourceId: source.id,
      legacyStatus: source.status,
      ...(source.summary ? { summary: source.summary } : {}),
      ...(source.tags?.length ? { tags: source.tags } : {}),
      title: source.label,
      ...(source.referenceUrl ? { url: source.referenceUrl } : {}),
    },
  };
}

export function captureForBookmark(bookmark: Bookmark): LegacyKnowledgeCapture {
  const text = bookmark.content?.trim();
  return {
    payload: {
      referenceUrl: bookmark.url,
      ...(text ? { text } : {}),
    },
    provenance: {
      ...(bookmark.author ? { author: bookmark.author } : {}),
      ...(bookmark.authorHandle ? { authorHandle: bookmark.authorHandle } : {}),
      bookmarkId: bookmark.id,
      capturedAt: bookmark.savedAt.toISOString(),
      capturedBy: LEGACY_BOOKMARK_CAPTURE,
      category: bookmark.category,
      ...(bookmark.description ? { description: bookmark.description } : {}),
      intent: bookmark.intent,
      ...(bookmark.mediaUrls.length ? { mediaUrls: bookmark.mediaUrls } : {}),
      platform: bookmark.platform,
      platformData: bookmark.platformData,
      ...(bookmark.thumbnailUrl ? { thumbnailUrl: bookmark.thumbnailUrl } : {}),
      title: titleForBookmark(bookmark),
      url: bookmark.url,
    },
  };
}
