import { timingSafeEqual } from 'node:crypto';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

const BEARER_PREFIX = 'Bearer ';
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' };

function isAuthorized(authorization: string | null, secret: string): boolean {
  if (!authorization?.startsWith(BEARER_PREFIX)) {
    return false;
  }
  const sent = Buffer.from(authorization.slice(BEARER_PREFIX.length));
  const expected = Buffer.from(secret);
  return sent.length === expected.length && timingSafeEqual(sent, expected);
}

/**
 * Drops every cached page, so a removal from community (an unpublished image,
 * video or profile) is gone on the next visit instead of after the pages'
 * revalidate window. Only the API calls it, with the shared
 * `WEBSITE_REVALIDATE_SECRET`; without the secret configured it refuses.
 * Clearing everything is deliberate: unpublishing is rare, and removed work
 * can show on profiles, articles and posts as well as on community pages.
 */
export async function POST(request: Request): Promise<Response> {
  const secret = process.env.WEBSITE_REVALIDATE_SECRET?.trim();
  if (!secret || !isAuthorized(request.headers.get('authorization'), secret)) {
    return Response.json(
      { error: 'Unauthorized' },
      { headers: NO_STORE_HEADERS, status: 401 },
    );
  }

  revalidatePath('/', 'layout');
  return Response.json({ revalidated: true }, { headers: NO_STORE_HEADERS });
}
