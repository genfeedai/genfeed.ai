import type {
  ProviderVerificationItem,
  ProviderVerificationMatch,
  ProviderVerificationPageReader,
} from '@api/services/integrations/publishers/interfaces/publish-verification.interface';
import type { PublishContext } from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { htmlToText } from '@api/shared/utils/html-to-text/html-to-text.util';
import { PostCategory } from '@genfeedai/contracts';

export const PROVIDER_VERIFICATION_REQUEST_TIMEOUT_MS = 10_000;
export const PROVIDER_VERIFICATION_PAGE_SIZE = 100;
const MAX_PAGES = 5;
const VISIBILITY_GRACE_MS = 5 * 60_000;

/**
 * A caption cannot prove which uploaded asset landed: upload/container IDs are
 * not in the receipt. Keep those attempts uncertain rather than risk a second
 * publish or attribute a different upload. Parent evidence cannot prove thread
 * completion either. URLs may be shortened by providers, so exact text proof
 * excludes them until full unshortened-text evidence is available.
 */
export async function verifyTextPublish(
  context: PublishContext,
  attemptStartedAt: Date,
  readPage: ProviderVerificationPageReader,
  now = new Date(),
): Promise<string | null> {
  const found = await verifyProviderPublish(
    context,
    attemptStartedAt,
    readPage,
    { text: htmlToText(context.post.description) },
    now,
  );
  return found?.id ?? null;
}

export function verifyHtmlPublish(
  context: PublishContext,
  attemptStartedAt: Date,
  readPage: ProviderVerificationPageReader,
  status?: string,
  now = new Date(),
): Promise<ProviderVerificationItem | null> {
  return verifyProviderPublish(
    context,
    attemptStartedAt,
    readPage,
    {
      text: context.post.description,
      title: context.post.label ?? 'Untitled',
      status,
      isNativeHtml: true,
    },
    now,
  );
}

export async function verifyProviderPublish(
  context: PublishContext,
  attemptStartedAt: Date,
  readPage: ProviderVerificationPageReader,
  match: ProviderVerificationMatch,
  now = new Date(),
): Promise<ProviderVerificationItem | null> {
  const text = match.text;
  if (
    context.post.category !== PostCategory.TEXT ||
    context.post.ingredients.length > 0 ||
    context.hasThreadChildren !== false ||
    !!context.post.quoteTweetId ||
    (context.isDraft && !match.isNativeHtml) ||
    !text ||
    (!match.isNativeHtml &&
      /(?:https?:\/\/|www\.|\b[a-z0-9][a-z0-9.-]+\.[a-z]{2,}(?:\/|\s|$))/i.test(
        text,
      ))
  ) {
    throw new Error(
      'Provider verification lacks exact text/media/thread proof',
    );
  }
  if (
    !Number.isFinite(attemptStartedAt.getTime()) ||
    attemptStartedAt.getTime() > now.getTime()
  ) {
    throw new Error('Invalid provider verification attempt time');
  }

  const seenCursors = new Set<string>();
  const matches = new Map<string, ProviderVerificationItem>();
  let cursor: string | undefined;
  for (let pageNumber = 0; pageNumber < MAX_PAGES; pageNumber++) {
    const page = await readPage(cursor);
    for (const item of page.items) {
      // Provider timestamps often have only second precision. An identical
      // caption in the boundary second could predate this attempt: unavailable.
      const lowerBound = Math.floor(attemptStartedAt.getTime() / 1000) * 1000;
      if (item.createdAt.getTime() < lowerBound) continue;
      if (match.title !== undefined && item.title !== match.title) {
        if (item.text === text)
          throw new Error(
            'Provider verification has ambiguous body/title proof',
          );
        continue;
      }
      if (item.text !== text) {
        if (match.title !== undefined)
          throw new Error(
            'Provider verification has ambiguous title/body proof',
          );
        continue;
      }
      if (
        item.createdAt.getTime() < attemptStartedAt.getTime() ||
        item.createdAt.getTime() > now.getTime() ||
        item.hasMedia ||
        item.isReply ||
        item.isQuote ||
        (match.status !== undefined && item.status !== match.status) ||
        (match.visibility !== undefined &&
          item.visibility !== match.visibility) ||
        (match.scheduledAt !== undefined &&
          item.scheduledAt?.getTime() !== match.scheduledAt.getTime()) ||
        item.quoteId !== (context.post.quoteTweetId || undefined)
      ) {
        throw new Error(
          'Provider verification has ambiguous caption semantics',
        );
      }
      matches.set(item.id, item);
      if (matches.size > 1) {
        throw new Error(
          'Provider verification found ambiguous duplicate captions',
        );
      }
    }
    if (page.nextCursor === null) {
      const found = [...matches.values()][0];
      if (found) return found;
      if (now.getTime() - attemptStartedAt.getTime() < VISIBILITY_GRACE_MS) {
        throw new Error('Provider verification is within the visibility grace');
      }
      return null;
    }
    if (!page.nextCursor || seenCursors.has(page.nextCursor)) {
      throw new Error(
        'Provider verification pagination is incomplete or cyclic',
      );
    }
    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }
  throw new Error(
    'Provider verification pagination exceeded the bounded window',
  );
}
