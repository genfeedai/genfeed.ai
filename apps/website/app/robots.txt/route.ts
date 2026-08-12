const ROBOTS_TXT = `User-agent: *
Allow: /
Disallow: /private/
Content-Signal: ai-train=no, search=yes, ai-input=yes

User-agent: GPTBot
Allow: /

User-agent: Claude-Web
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Googlebot
Allow: /

User-agent: CCBot
Allow: /

Sitemap: https://genfeed.ai/sitemap.xml
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
