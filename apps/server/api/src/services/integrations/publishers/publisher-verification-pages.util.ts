import type { ProviderVerificationPage } from '@api/services/integrations/publishers/interfaces/publish-verification.interface';
import { htmlToText } from '@api/shared/utils/html-to-text/html-to-text.util';

export function verificationRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Incomplete provider verification record');
  }
  return value as Record<string, unknown>;
}

function optionalRecord(value: unknown): Record<string, unknown> {
  return value === undefined ? {} : verificationRecord(value);
}

export function verificationString(value: unknown): string {
  if (typeof value !== 'string')
    throw new Error('Incomplete provider verification text');
  return value;
}

export function verificationId(value: unknown): string {
  const result = verificationString(value);
  if (!result) throw new Error('Incomplete provider verification ID');
  return result;
}

export function verificationPostUrl(value: unknown): string {
  const result = verificationId(value);
  const url = new URL(result);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new Error('Invalid provider verification post URL');
  }
  return result;
}

export function verificationArray(value: unknown): unknown[] {
  if (!Array.isArray(value))
    throw new Error('Incomplete provider verification list');
  return value;
}

export function verificationTimestamp(value: unknown): Date {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new Error('Incomplete provider verification timestamp');
  }
  const result = new Date(value);
  if (!Number.isFinite(result.getTime()))
    throw new Error('Invalid provider verification timestamp');
  return result;
}

export function verificationInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error('Incomplete provider verification pagination');
  }
  return value;
}

export function verificationResponse(value: unknown): Record<string, unknown> {
  const result = verificationRecord(value);
  if (
    result.error ||
    (result.errors !== undefined && verificationArray(result.errors).length > 0)
  ) {
    throw new Error('Provider verification returned partial errors');
  }
  return result;
}

export function parseTwitterVerificationPage(
  value: unknown,
  authorId: string,
): ProviderVerificationPage {
  const root = verificationResponse(value);
  const meta = verificationRecord(root.meta);
  const count = verificationInteger(meta.result_count);
  const nodes =
    root.data === undefined && count === 0 ? [] : verificationArray(root.data);
  if (nodes.length !== count) throw new Error('Incomplete X verification page');
  return {
    items: nodes.map((node) => {
      const item = verificationRecord(node);
      if (item.author_id !== authorId)
        throw new Error('X verification author mismatch');
      const references =
        item.referenced_tweets === undefined
          ? []
          : verificationArray(item.referenced_tweets).map((value) => {
              const reference = verificationRecord(value);
              if (
                !['replied_to', 'retweeted', 'quoted'].includes(
                  verificationString(reference.type),
                )
              )
                throw new Error('Incomplete X reference semantics');
              return {
                type: verificationString(reference.type),
                id: verificationId(reference.id),
              };
            });
      const attachments = optionalRecord(item.attachments);
      const note = optionalRecord(item.note_tweet);
      return {
        createdAt: verificationTimestamp(item.created_at),
        hasMedia:
          (attachments.media_keys !== undefined &&
            verificationArray(attachments.media_keys).length > 0) ||
          (attachments.poll_ids !== undefined &&
            verificationArray(attachments.poll_ids).length > 0),
        id: verificationId(item.id),
        isReply: references.some(
          (reference) =>
            reference.type === 'replied_to' || reference.type === 'retweeted',
        ),
        quoteId: references.find((reference) => reference.type === 'quoted')
          ?.id,
        text: verificationString(note.text ?? item.text),
      };
    }),
    nextCursor:
      meta.next_token === undefined ? null : verificationId(meta.next_token),
  };
}

export function parseLinkedInVerificationPage(
  value: unknown,
  authorUrn: string,
): ProviderVerificationPage {
  const root = verificationResponse(value);
  const nodes = verificationArray(root.elements);
  const paging = verificationRecord(root.paging);
  const start = verificationInteger(paging.start);
  const count = verificationInteger(paging.count);
  const total = verificationInteger(paging.total);
  const next = start + nodes.length;
  if (
    nodes.length > count ||
    next > total ||
    (nodes.length === 0 && next < total)
  ) {
    throw new Error('Incomplete LinkedIn verification pagination');
  }
  return {
    items: nodes.map((node) => {
      const item = verificationRecord(node);
      if (item.author !== authorUrn || item.lifecycleState !== 'PUBLISHED') {
        throw new Error('LinkedIn verification author/lifecycle mismatch');
      }
      const share = verificationRecord(
        verificationRecord(item.specificContent)[
          'com.linkedin.ugc.ShareContent'
        ],
      );
      return {
        createdAt: verificationTimestamp(verificationRecord(item.created).time),
        hasMedia: verificationId(share.shareMediaCategory) !== 'NONE',
        id: verificationId(item.id),
        isReply: item.responseContext !== undefined,
        visibility: verificationId(
          verificationRecord(item.visibility)[
            'com.linkedin.ugc.MemberNetworkVisibility'
          ],
        ),
        text: verificationString(
          verificationRecord(share.shareCommentary).text,
        ),
      };
    }),
    nextCursor: next < total ? String(next) : null,
  };
}

export function parseThreadsVerificationPage(
  value: unknown,
): ProviderVerificationPage {
  const root = verificationResponse(value);
  const paging = optionalRecord(root.paging);
  const nextCursor =
    paging.next === undefined
      ? null
      : verificationId(verificationRecord(paging.cursors).after);
  return {
    items: verificationArray(root.data).map((node) => {
      const item = verificationRecord(node);
      if (
        typeof item.is_reply !== 'boolean' ||
        typeof item.is_quote_post !== 'boolean'
      )
        throw new Error('Incomplete Threads reply/quote evidence');
      return {
        createdAt: verificationTimestamp(item.timestamp),
        hasMedia: verificationId(item.media_type) !== 'TEXT_POST',
        id: verificationId(item.id),
        isReply: item.is_reply,
        isQuote: item.is_quote_post,
        text: verificationString(item.text),
      };
    }),
    nextCursor,
  };
}

export function parseMastodonVerificationPage(
  value: unknown,
  authorId: string,
  link: unknown,
  endpoint: string,
): ProviderVerificationPage {
  const nodes = verificationArray(value);
  if (link !== undefined && typeof link !== 'string')
    throw new Error('Incomplete Mastodon pagination');
  const next =
    typeof link === 'string'
      ? /<([^>]+)>;\s*rel="next"/.exec(link)?.[1]
      : undefined;
  if (typeof link === 'string' && /\bnext\b/.test(link) && !next)
    throw new Error('Incomplete Mastodon pagination format');
  let nextCursor: string | null = null;
  if (next) {
    const url = new URL(next);
    const expected = new URL(endpoint);
    if (url.origin !== expected.origin || url.pathname !== expected.pathname)
      throw new Error('Mastodon pagination account changed');
    nextCursor = verificationId(url.searchParams.get('max_id'));
  } else if (nodes.length >= 40)
    throw new Error('Incomplete Mastodon terminal pagination');
  return {
    items: nodes.map((node) => {
      const item = verificationRecord(node);
      if (verificationRecord(item.account).id !== authorId)
        throw new Error('Mastodon verification author mismatch');
      if (item.in_reply_to_id === undefined || item.reblog === undefined)
        throw new Error('Incomplete Mastodon reply evidence');
      return {
        id: verificationId(item.id),
        createdAt: verificationTimestamp(item.created_at),
        text: htmlToText(verificationString(item.content)),
        hasMedia: verificationArray(item.media_attachments).length > 0,
        isReply: item.in_reply_to_id !== null || item.reblog !== null,
        isQuote:
          (item.quote !== undefined && item.quote !== null) ||
          verificationString(item.spoiler_text).length > 0,
        visibility: verificationId(item.visibility),
        url: verificationPostUrl(item.url),
      };
    }),
    nextCursor,
  };
}
