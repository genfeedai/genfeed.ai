import type {
  ProviderVerificationItem,
  ProviderVerificationPage,
  VerificationMediaKind,
} from '@api/services/integrations/publishers/interfaces/publish-verification.interface';
import {
  verificationArray,
  verificationId,
  verificationPostUrl,
  verificationRecord,
  verificationResponse,
  verificationString,
  verificationTimestamp,
} from '@api/services/integrations/publishers/publisher-verification-pages.util';

function optionalString(value: unknown): string {
  return value === undefined || value === null ? '' : verificationString(value);
}

function graphNextCursor(root: Record<string, unknown>): string | null {
  if (root.paging === undefined) return null;
  const paging = verificationRecord(root.paging);
  if (paging.next === undefined) return null;
  return verificationId(verificationRecord(paging.cursors).after);
}

const INSTAGRAM_MEDIA_KINDS: Record<string, VerificationMediaKind> = {
  CAROUSEL_ALBUM: 'carousel',
  IMAGE: 'image',
  VIDEO: 'video',
};

/**
 * One page of `GET /{ig-user-id}/media`, read with the fields
 * `id,caption,media_type,media_product_type,timestamp,permalink,shortcode,
 * children{id}`. A carousel without its children list is incomplete evidence.
 */
export function parseInstagramMediaVerificationPage(
  value: unknown,
): ProviderVerificationPage {
  const root = verificationResponse(value);
  return {
    items: verificationArray(root.data).map(
      (node): ProviderVerificationItem => {
        const item = verificationRecord(node);
        const mediaKind =
          INSTAGRAM_MEDIA_KINDS[verificationId(item.media_type)] ?? 'other';
        return {
          createdAt: verificationTimestamp(item.timestamp),
          hasMedia: true,
          id: verificationId(item.id),
          isReply: false,
          mediaCount:
            mediaKind === 'carousel'
              ? verificationArray(verificationRecord(item.children).data).length
              : 1,
          mediaKind,
          shortcode: verificationId(item.shortcode),
          text: optionalString(item.caption),
          url: verificationPostUrl(item.permalink),
        };
      },
    ),
    nextCursor: graphNextCursor(root),
  };
}

const FACEBOOK_ATTACHMENT_KINDS: Record<string, VerificationMediaKind> = {
  photo: 'image',
  video: 'video',
};

/**
 * One page of `GET /{page-id}/feed`, read with the fields
 * `id,created_time,message,is_published,permalink_url,
 * attachments{media_type,target{id}}`.
 *
 * A scheduled, unpublished post is not evidence of a publish and is skipped.
 * The id a video publish returns is the video's, not the feed story's, so a
 * video item takes its id from the attachment target and is incomplete
 * evidence without one.
 */
export function parseFacebookFeedVerificationPage(
  value: unknown,
): ProviderVerificationPage {
  const root = verificationResponse(value);
  const items: ProviderVerificationItem[] = [];
  for (const node of verificationArray(root.data)) {
    const post = verificationRecord(node);
    if (typeof post.is_published !== 'boolean') {
      throw new Error('Incomplete Facebook published evidence');
    }
    if (!post.is_published) continue;
    const attachments =
      post.attachments === undefined
        ? []
        : verificationArray(verificationRecord(post.attachments).data);
    const attachment =
      attachments.length === 1 ? verificationRecord(attachments[0]) : null;
    const mediaKind: VerificationMediaKind = attachment
      ? (FACEBOOK_ATTACHMENT_KINDS[verificationId(attachment.media_type)] ??
        'other')
      : 'other';
    items.push({
      createdAt: verificationTimestamp(post.created_time),
      hasMedia: mediaKind !== 'other',
      id:
        mediaKind === 'video' && attachment
          ? verificationId(verificationRecord(attachment.target).id)
          : verificationId(post.id),
      isReply: false,
      mediaCount: 1,
      mediaKind,
      text: optionalString(post.message),
      url: verificationPostUrl(post.permalink_url),
    });
  }
  return { items, nextCursor: graphNextCursor(root) };
}
