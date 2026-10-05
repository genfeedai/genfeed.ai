import { connection, NextResponse } from 'next/server';

// connection() keeps this request-time under Cache Components; no-store prevents
// a stale CDN build id from hiding a fresh deployment from polling clients.

/**
 * Reports the build id baked into THIS deployment. The client compares it to the
 * NEXT_PUBLIC_BUILD_ID it was served with; a mismatch means a newer deployment
 * is live behind the alias and the user should refresh to load it.
 */
export async function GET(): Promise<NextResponse> {
  await connection();

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
