import { HOME_PROOF_BRANDS } from '@data/home-proof.data';
import { EnvironmentService } from '@services/core/environment.service';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * The first picture of one of our own public posts, as a redirect to a freshly
 * signed CDN address. The API signs media for about 20 minutes, so the homepage
 * (which is rendered ahead of time) cannot hold those addresses; it points
 * its images here instead, and the redirect is cached for less than the
 * signature lasts.
 */
const POST_ID_PATTERN = /^[a-z0-9]{20,32}$/;
const CDN_HOST = 'cdn.genfeed.ai';
const REDIRECT_CACHE = 'public, max-age=60, s-maxage=300';

interface PostDocument {
  data?: {
    relationships?: {
      brand?: { data?: { id?: string } | null } | null;
      ingredients?: { data?: Array<{ id?: string }> | null } | null;
    } | null;
  } | null;
  included?: Array<{
    attributes?: { category?: string; cdnUrl?: string | null };
    id?: string;
  }>;
}

function notFound(): NextResponse {
  return new NextResponse(null, { status: 404 });
}

function isCdnUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === CDN_HOST;
  } catch {
    return false;
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ postId: string }> },
): Promise<NextResponse> {
  const { postId } = await params;
  if (!POST_ID_PATTERN.test(postId)) {
    return notFound();
  }

  const response = await fetch(
    `${EnvironmentService.apiEndpoint}/public/posts/${postId}`,
    { cache: 'no-store' },
  ).catch(() => null);
  if (!response?.ok) {
    return notFound();
  }
  const document = (await response.json()) as PostDocument;

  const brandId = document.data?.relationships?.brand?.data?.id;
  if (!HOME_PROOF_BRANDS.some((brand) => brand.id === brandId)) {
    return notFound();
  }

  const firstId = document.data?.relationships?.ingredients?.data?.[0]?.id;
  const cover = document.included?.find(
    (item) => item.id === firstId && item.attributes?.category === 'IMAGE',
  );
  const url = cover?.attributes?.cdnUrl;
  if (!url || !isCdnUrl(url)) {
    return notFound();
  }

  return NextResponse.redirect(url, {
    headers: { 'Cache-Control': REDIRECT_CACHE },
    status: 302,
  });
}
