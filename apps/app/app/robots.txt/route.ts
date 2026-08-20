/**
 * The studio origin stays closed to crawlers except for its two front doors.
 *
 * `Allow` lines beat `Disallow: /` by longest-match, so only `/login` and
 * `/sign-up` are reachable — the pages that also carry `index, follow` metadata.
 * Everything else, including the whole authenticated tree, remains disallowed.
 *
 * `search=no` is deliberately absent now that those two pages are meant to
 * rank; the AI-reuse signals stay off for the entire origin.
 */
const ROBOTS_TXT = `User-agent: *
Allow: /login
Allow: /sign-up
Disallow: /
Content-Signal: ai-train=no, ai-input=no
Sitemap: https://app.genfeed.ai/sitemap.xml
`;

export const dynamic = 'force-static';
export const revalidate = false;

export function GET(): Response {
  return new Response(ROBOTS_TXT, {
    headers: {
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
