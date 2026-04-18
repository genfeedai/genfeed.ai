import { NextResponse } from 'next/server';

export const dynamic = 'force-static';
export const revalidate = false;

export function GET() {
  const catalog = {
    linkset: [
      {
        anchor: 'https://genfeed.ai',
        item: [
          {
            href: 'https://api.genfeed.ai',
            title: 'Genfeed REST API',
            type: 'application/json',
          },
          {
            href: 'https://mcp.genfeed.ai/mcp',
            title: 'Genfeed MCP Server (Streamable HTTP)',
            type: 'application/json',
          },
        ],
      },
    ],
  };

  return NextResponse.json(catalog, {
    headers: {
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      'Content-Type': 'application/linkset+json',
    },
  });
}
