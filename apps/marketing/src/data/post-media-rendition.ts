import { creatorPostPath } from '@genfeedai/contracts/constants';

/**
 * The permanent, unsigned address of a public post's image.
 *
 * Post media is delivered through short-lived signed grants, which an image
 * search engine cannot keep, and the originals are 2 to 4 MB PNGs shown as
 * small tiles (#11617). This address names the post and the picture, never a
 * signature, and answers with a resized WebP. The route behind it only serves
 * a picture the public post itself lists.
 */

/** Widths a rendition is offered in: a tile, a phone, and the post page. */
export const POST_MEDIA_WIDTHS = [320, 640, 1280] as const;

export type PostMediaWidth = (typeof POST_MEDIA_WIDTHS)[number];

const RENDITION_FILE_PATTERN = /^(\d+)\.webp$/;

/** `/@handle/posts/<post>/media/<media>/640.webp` */
export function postMediaRenditionPath(
  handle: string,
  postId: string,
  mediaId: string,
  width: PostMediaWidth,
): string {
  return `${creatorPostPath(handle, postId)}/media/${encodeURIComponent(mediaId)}/${width}.webp`;
}

/** A `srcset` over every width, for the browser to choose from. */
export function postMediaSrcSet(
  handle: string,
  postId: string,
  mediaId: string,
): string {
  return POST_MEDIA_WIDTHS.map(
    (width) =>
      `${postMediaRenditionPath(handle, postId, mediaId, width)} ${width}w`,
  ).join(', ');
}

/** The width a rendition file name asks for, or null when it is not offered. */
export function parsePostMediaFile(file: string): PostMediaWidth | null {
  const match = RENDITION_FILE_PATTERN.exec(file);
  const width = match ? Number(match[1]) : Number.NaN;
  return POST_MEDIA_WIDTHS.find((offered) => offered === width) ?? null;
}

/** Hosts the media delivery hands out; a source anywhere else is never fetched. */
const TRUSTED_MEDIA_HOST_PATTERN =
  /(?:^|\.)(?:genfeed\.ai|genfeed\.localhost|cloudfront\.net)$/;

export function isTrustedMediaSource(source: string): boolean {
  try {
    const url = new URL(source);
    return (
      url.protocol === 'https:' && TRUSTED_MEDIA_HOST_PATTERN.test(url.hostname)
    );
  } catch {
    return false;
  }
}
