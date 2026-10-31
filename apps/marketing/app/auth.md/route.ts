import { AUTH_MARKDOWN } from '@data/agent-readiness.data';

export const dynamic = 'force-static';
export const revalidate = false;

export function GET(): Response {
  return new Response(AUTH_MARKDOWN, {
    headers: {
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      'Content-Type': 'text/markdown; charset=utf-8',
    },
  });
}
