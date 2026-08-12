const ROBOTS_TXT = `User-agent: *
Disallow: /
Content-Signal: ai-train=no, search=no, ai-input=no
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
