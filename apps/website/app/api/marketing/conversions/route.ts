import { EnvironmentService } from '@services/core/environment.service';
import { type NextRequest, NextResponse } from 'next/server';
import {
  parseServerConversionRequest,
  sendServerConversions,
} from '../../../../packages/marketing/server-conversions';

export const dynamic = 'force-dynamic';

function getClientIp(request: NextRequest): string | undefined {
  return (
    request.headers.get('x-vercel-forwarded-for') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    undefined
  );
}

function getAllowedConversionHosts(request: NextRequest): Set<string> {
  const hosts = new Set<string>([request.nextUrl.host]);

  try {
    hosts.add(new URL(EnvironmentService.apps.website).host);
  } catch {
    // Keep the request host as the fallback provenance boundary.
  }

  return hosts;
}

function isSameSiteConversionRequest(request: NextRequest): boolean {
  const source =
    request.headers.get('origin') || request.headers.get('referer');
  if (!source) {
    return false;
  }

  try {
    return getAllowedConversionHosts(request).has(new URL(source).host);
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  let body: unknown;

  if (!isSameSiteConversionRequest(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const event = parseServerConversionRequest(body);

  if (!event) {
    return NextResponse.json({ error: 'Unsupported event' }, { status: 400 });
  }

  const result = await sendServerConversions(event, {
    clientIp: getClientIp(request),
    userAgent: request.headers.get('user-agent') || undefined,
  });

  return NextResponse.json({ ok: true, result });
}
