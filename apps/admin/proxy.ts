import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { resolveClerkSessionClaims } from '@helpers/auth/clerk-session-claims.helper';
import { EnvironmentService } from '@services/core/environment.service';
import {
  type NextFetchEvent,
  type NextRequest,
  NextResponse,
} from 'next/server';

const isPublicRoute = createRouteMatcher([
  '/',
  '/playwright-ready',
  '/login(.*)',
  '/sign-in(.*)',
  '/logout(.*)',
]);

const clerkProxy = clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) {
    const { userId, sessionId } = await auth();
    const redirectUrl =
      process.env.NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL ??
      '/overview/dashboard';
    const targetUrl = new URL(redirectUrl, req.url);

    if (userId && sessionId) {
      if (targetUrl.pathname !== req.nextUrl.pathname) {
        return NextResponse.redirect(targetUrl);
      }
    }

    return NextResponse.next();
  }

  // Protected routes
  const { sessionClaims, userId } = await auth();

  if (!userId) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const claims = resolveClerkSessionClaims(sessionClaims);
  if (claims.isSuperAdmin !== true) {
    return NextResponse.redirect(
      new URL(EnvironmentService.apps.website, req.url),
    );
  }

  return NextResponse.next();
});

export default function proxy(req: NextRequest, event: NextFetchEvent) {
  if (req.nextUrl.pathname === '/playwright-ready') {
    return NextResponse.next();
  }

  const hasPlaywrightBypassCookie =
    req.cookies?.get('__playwright_test')?.value === 'true';
  const isE2ETest =
    process.env.NODE_ENV !== 'production' && hasPlaywrightBypassCookie;

  if (isE2ETest) {
    return NextResponse.next();
  }

  return clerkProxy(req, event);
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|xml|txt)).*)',
    '/(api|trpc)(.*)',
  ],
};
