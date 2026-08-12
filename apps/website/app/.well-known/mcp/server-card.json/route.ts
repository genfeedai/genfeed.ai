import { buildMcpServerCard } from '@data/agent-readiness.data';
import { NextResponse } from 'next/server';

export const dynamic = 'force-static';
export const revalidate = false;

export function GET(): NextResponse {
  return NextResponse.json(buildMcpServerCard(), {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}
