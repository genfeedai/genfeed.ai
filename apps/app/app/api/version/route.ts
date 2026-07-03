import { NextResponse } from 'next/server';

// Always render at request time and never cache: a stale CDN copy would report
// the old build id and hide a fresh deployment from clients polling for updates.
export const dynamic = 'force-dynamic';

/**
 * Reports the build id baked into THIS deployment. The client compares it to the
 * NEXT_PUBLIC_BUILD_ID it was served with; a mismatch means a newer deployment
 * is live behind the alias and the user should refresh to load it.
 */
export function GET(): NextResponse {
  const buildId = process.env.NEXT_PUBLIC_BUILD_ID ?? '';

  return NextResponse.json(
    { buildId },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    },
  );
}
