import {
  isTrustedMediaSource,
  parsePostMediaFile,
} from '@data/post-media-rendition';
import { getPostMedia } from '@genfeedai/helpers/content/public-post.helper';
import sharp from 'sharp';
import { getCreatorPost } from '../../../post-loader';

/**
 * A public post's image at a permanent address: `/@handle/posts/<post>/media/<media>/640.webp`.
 *
 * Post media is delivered through signed grants that expire, and the originals
 * are multi-megabyte PNGs shown as small tiles (#11617). This route finds the
 * picture through the public post, so it only ever serves media the post lists
 * as public, fetches a fresh grant, and answers with a resized WebP the CDN can
 * keep. Nothing here accepts a media id that the public post does not carry.
 */

interface PostMediaRouteProps {
  params: Promise<{
    file: string;
    handle: string;
    id: string;
    mediaId: string;
  }>;
}

const SOURCE_TIMEOUT_MS = 15_000;
const MAX_SOURCE_BYTES = 30 * 1024 * 1024;
const WEBP_QUALITY = 78;

const NOT_FOUND_HEADERS = {
  'Cache-Control': 'public, max-age=60',
  'Content-Type': 'text/plain; charset=utf-8',
};

/** The grant is renewed on every post read, the picture behind it is not. */
const RENDITION_CACHE_CONTROL =
  'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400';

function notFound(): Response {
  return new Response('Image not found\n', {
    headers: NOT_FOUND_HEADERS,
    status: 404,
  });
}

export async function GET(
  _request: Request,
  { params }: PostMediaRouteProps,
): Promise<Response> {
  const { file, handle, id, mediaId } = await params;
  const width = parsePostMediaFile(file);
  if (!width) {
    return notFound();
  }

  const result = await getCreatorPost(handle, id);
  const image = result
    ? getPostMedia(result.post.ingredients).find(
        (item) => item.kind === 'image' && item.id === mediaId,
      )
    : undefined;
  if (!image || !isTrustedMediaSource(image.url)) {
    return notFound();
  }

  const source = await fetch(image.url, {
    signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS),
  });
  const contentType = source.headers.get('content-type') ?? '';
  const declaredSize = Number(source.headers.get('content-length') ?? 0);
  if (
    !source.ok ||
    !contentType.startsWith('image/') ||
    declaredSize > MAX_SOURCE_BYTES
  ) {
    return new Response('Image unavailable\n', {
      headers: { 'Cache-Control': 'no-store' },
      status: 502,
    });
  }

  const original = Buffer.from(await source.arrayBuffer());
  if (original.byteLength > MAX_SOURCE_BYTES) {
    return new Response('Image unavailable\n', {
      headers: { 'Cache-Control': 'no-store' },
      status: 502,
    });
  }

  // An animated GIF would lose its motion in a resize, so it goes out as it is.
  if (contentType.startsWith('image/gif')) {
    return new Response(new Uint8Array(original), {
      headers: {
        'Cache-Control': RENDITION_CACHE_CONTROL,
        'Content-Type': contentType,
      },
    });
  }

  const rendition = await sharp(original, { failOn: 'none' })
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();

  return new Response(new Uint8Array(rendition), {
    headers: {
      'Cache-Control': RENDITION_CACHE_CONTROL,
      'Content-Type': 'image/webp',
    },
  });
}
