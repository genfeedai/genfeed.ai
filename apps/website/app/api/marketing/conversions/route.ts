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

export async function POST(request: NextRequest) {
  let body: unknown;

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
