import { readRecordOrUndefined } from '@genfeedai/utils/data/extract.util';

function isNewCommentChange(rawChange: unknown, pageId: string): boolean {
  const change = readRecordOrUndefined(rawChange);
  const value = readRecordOrUndefined(change?.value);
  return (
    change?.field === 'feed' &&
    value?.item === 'comment' &&
    value.verb === 'add' &&
    readRecordOrUndefined(value.from)?.id !== pageId
  );
}

/**
 * A Messenger event that carries a message from a person. Deliveries and read
 * receipts have no `message`, and an echo is the Page's own send coming back.
 */
function isInboundMessagingEvent(rawEvent: unknown, pageId: string): boolean {
  const event = readRecordOrUndefined(rawEvent);
  const message = readRecordOrUndefined(event?.message);
  return (
    message !== undefined &&
    message.is_echo !== true &&
    readRecordOrUndefined(event?.sender)?.id !== pageId
  );
}

/**
 * Facebook Page ids that received something new for the inbox in this
 * delivery: a third party's comment (`feed`) or a Messenger message
 * (`messaging`). A Page subscribed to `feed` also reports posts, reactions,
 * edits and removals, and the comments the Page wrote itself; none of those
 * carry anything new, so they are ignored.
 *
 * The delivery only says which Page to look at. The comment or message itself
 * is read back from Graph by the sync, so nothing in this payload is stored.
 *
 * @see https://developers.facebook.com/docs/graph-api/webhooks/getting-started/webhooks-for-pages
 * @see https://developers.facebook.com/docs/messenger-platform/webhooks
 */
export function extractFacebookInboxPageIds(payload: unknown): string[] {
  const body = readRecordOrUndefined(payload);
  if (body?.object !== 'page' || !Array.isArray(body.entry)) {
    return [];
  }

  const pageIds = new Set<string>();

  for (const rawEntry of body.entry) {
    const entry = readRecordOrUndefined(rawEntry);
    const pageId = entry?.id;
    if (typeof pageId !== 'string' || pageId.length === 0) {
      continue;
    }

    const hasNewComment =
      Array.isArray(entry?.changes) &&
      entry.changes.some((change) => isNewCommentChange(change, pageId));
    const hasNewMessage =
      Array.isArray(entry?.messaging) &&
      entry.messaging.some((event) => isInboundMessagingEvent(event, pageId));

    if (hasNewComment || hasNewMessage) {
      pageIds.add(pageId);
    }
  }

  return [...pageIds];
}
