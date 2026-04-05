import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://local.genfeed.ai:4001/api';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // / → check setup status → onboarding or workspace/overview
  if (pathname === '/') {
    try {
      const response = await fetch(`${API_BASE_URL}/setup/status`, {
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.hasCompletedSetup) {
          return NextResponse.redirect(new URL('/workspace/overview', request.url));
        }

        return NextResponse.redirect(new URL('/onboarding', request.url));
      }
    } catch {
      // API unreachable — fall through to onboarding
    }

    return NextResponse.redirect(new URL('/onboarding', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/'],
};
