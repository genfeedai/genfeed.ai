import { readRecordOrUndefined } from '@genfeedai/utils/data/extract.util';

/**
 * Facebook Page ids that received a new comment in this delivery. A Page
 * subscribed to `feed` also reports posts, reactions, edits and removals, and
 * the comments the Page wrote itself; none of those carry anything new for the
 * inbox, so only a third party's added comment counts.
 *
 * The delivery only says which Page to look at. The comment itself is read back
 * from Graph by the sync, so nothing in this payload is stored.
 *
 * @see https://developers.facebook.com/docs/graph-api/webhooks/getting-started/webhooks-for-pages
 */
export function extractFacebookCommentPageIds(payload: unknown): string[] {
  const body = readRecordOrUndefined(payload);
  if (body?.object !== 'page' || !Array.isArray(body.entry)) {
    return [];
  }

  const pageIds = new Set<string>();

  for (const rawEntry of body.entry) {
    const entry = readRecordOrUndefined(rawEntry);
    const pageId = entry?.id;
    if (
      typeof pageId !== 'string' ||
      pageId.length === 0 ||
      !Array.isArray(entry?.changes)
    ) {
      continue;
    }

    const hasNewComment = entry.changes.some((rawChange) => {
      const change = readRecordOrUndefined(rawChange);
      const value = readRecordOrUndefined(change?.value);
      return (
        change?.field === 'feed' &&
        value?.item === 'comment' &&
        value.verb === 'add' &&
        readRecordOrUndefined(value.from)?.id !== pageId
      );
    });

    if (hasNewComment) {
      pageIds.add(pageId);
    }
  }

  return [...pageIds];
}
