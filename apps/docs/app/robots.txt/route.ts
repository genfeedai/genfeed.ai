const ROBOTS_TXT = `User-agent: *
Allow: /
Content-Signal: ai-train=no, search=yes, ai-input=yes

Sitemap: https://docs.genfeed.ai/sitemap.xml
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
