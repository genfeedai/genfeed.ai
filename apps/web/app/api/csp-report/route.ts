import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { parseCspViolation } from '@/lib/security/csp-report';

const MAX_BODY_BYTES = 16_384;
// A serverless instance can freeze the moment this route answers, before the
// SDK has sent a queued event. Wait for the send, but never hold the browser's
// report request for long.
const FLUSH_TIMEOUT_MS = 2_000;
const MAX_REMEMBERED_VIOLATIONS = 500;

// Every page view can repeat the same violation. Report each distinct
// directive and blocked origin once per server instance so a noisy page cannot
// spend the error quota.
const reportedViolations = new Set<string>();

/**
 * Receives Content-Security-Policy-Report-Only violations from the browser.
 * Reports carry no cookies or credentials, so the route is open to anyone; it
 * only ever writes a deduplicated warning.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) {
    return new NextResponse(null, { status: 413 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const violation = parseCspViolation(payload);
  if (!violation) {
    return new NextResponse(null, { status: 204 });
  }

  const key = `${violation.effectiveDirective}|${violation.blockedOrigin}`;
  if (
    !reportedViolations.has(key) &&
    reportedViolations.size < MAX_REMEMBERED_VIOLATIONS
  ) {
    reportedViolations.add(key);
    Sentry.captureMessage('CSP report-only violation', {
      fingerprint: [
        'csp-report-only',
        violation.effectiveDirective,
        violation.blockedOrigin,
      ],
      level: 'warning',
      tags: {
        csp_blocked_origin: violation.blockedOrigin || 'unknown',
        csp_directive: violation.effectiveDirective,
      },
    });
    await Sentry.flush(FLUSH_TIMEOUT_MS);
  }

  return new NextResponse(null, { status: 204 });
}
