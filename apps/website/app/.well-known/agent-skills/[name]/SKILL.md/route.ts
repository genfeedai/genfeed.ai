import {
  getPublishedAgentSkill,
  PUBLISHED_AGENT_SKILL_NAMES,
} from '@data/agent-readiness.data';

export const dynamicParams = false;
export const dynamic = 'force-static';
export const revalidate = false;

export function generateStaticParams() {
  return PUBLISHED_AGENT_SKILL_NAMES.map((name) => ({ name }));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
): Promise<Response> {
  const { name } = await params;
  const skill = getPublishedAgentSkill(name);

  if (!skill) {
    return new Response('Not found', { status: 404 });
  }

  return new Response(skill.content, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      'Content-Type': 'text/markdown; charset=utf-8',
    },
  });
}
