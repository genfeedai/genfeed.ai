import { HOMEPAGE_AGENT_MARKDOWN } from '@data/agent-readiness.data';

export const dynamic = 'force-static';
export const revalidate = false;

export function GET(): Response {
  return new Response(HOMEPAGE_AGENT_MARKDOWN, {
    headers: {
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      'Content-Signal': 'ai-train=no, search=yes, ai-input=yes',
      'Content-Type': 'text/markdown; charset=utf-8',
      Vary: 'Accept',
      'X-Markdown-Tokens': String(
        Math.ceil(HOMEPAGE_AGENT_MARKDOWN.length / 4),
      ),
    },
  });
}
