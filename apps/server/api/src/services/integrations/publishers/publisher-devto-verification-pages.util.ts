import type {
  ProviderVerificationItem,
  ProviderVerificationPage,
} from '@api/services/integrations/publishers/interfaces/publish-verification.interface';
import {
  verificationArray as array,
  verificationInteger as integer,
  verificationPostUrl as postUrl,
  verificationRecord as record,
  verificationString as string,
  verificationTimestamp as timestamp,
} from '@api/services/integrations/publishers/publisher-verification-pages.util';

/**
 * The documented default page size, requested explicitly. A larger size could
 * be capped by the server (`API_PER_PAGE_MAX`), and a short page would then
 * read as the last one.
 */
export const DEVTO_VERIFICATION_PAGE_SIZE = 30;

/**
 * Reads one page of the account's published articles or drafts. The listing
 * carries the title, URL and times but no body.
 *
 * Drafts come newest created first and published articles newest published
 * first, so a page with nothing since the attempt ends the search. An article
 * that breaks that order is evidence the assumption is wrong, so it stays
 * unknown.
 */
export function parseDevtoVerificationPage(
  value: unknown,
  page: number,
  attemptStartedAt: Date,
  isDraft: boolean,
): ProviderVerificationPage {
  const nodes = array(value);
  if (nodes.length > DEVTO_VERIFICATION_PAGE_SIZE) {
    throw new Error('Incomplete Dev.to verification pagination');
  }
  const floor = Math.floor(attemptStartedAt.getTime() / 1000) * 1000;
  let previousKey = Number.POSITIVE_INFINITY;
  let hasWindowItem = false;
  const items: ProviderVerificationItem[] = nodes.map((node) => {
    const article = record(node);
    const createdAt = timestamp(article.created_at);
    const orderKey = isDraft
      ? createdAt.getTime()
      : timestamp(article.published_at).getTime();
    if (orderKey > previousKey) {
      throw new Error('Dev.to verification order is not newest first');
    }
    previousKey = orderKey;
    if (orderKey >= floor) hasWindowItem = true;
    return {
      createdAt,
      hasMedia: false,
      id: String(integer(article.id)),
      isReply: false,
      status: isDraft ? 'draft' : 'published',
      text: '',
      title: string(article.title),
      url: postUrl(article.url),
    };
  });
  const isFullPage = nodes.length === DEVTO_VERIFICATION_PAGE_SIZE;
  return {
    items,
    nextCursor: isFullPage && hasWindowItem ? String(page + 1) : null,
  };
}
