import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import {
  type NextFetchEvent,
  type NextRequest,
  NextResponse,
} from 'next/server';

const hasClerkKeys =
  Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) &&
  Boolean(process.env.CLERK_SECRET_KEY);

/**
 * In self-hosted core mode Clerk keys are absent.
 * Eagerly check so we never instantiate Clerk middleware.
 */
const isCloudConnected = hasClerkKeys;

const isPublicRoute = isCloudConnected
  ? createRouteMatcher([
      '/playwright-ready',
      '/login(.*)',
      '/sign-in(.*)',
      '/sign-up(.*)',
      '/request-access(.*)',
      '/logout(.*)',
      '/oauth/(.*)',
      '/onboarding',
      '/onboarding/(.*)',
    ])
  : null;

const clerkProxy = isCloudConnected
  ? clerkMiddleware(
      async (auth, req) => {
        const session = await auth();
        const { userId, sessionId } = session || {};

        // Public routes: redirect authenticated users to the workspace home
        // (except routes that must remain accessible while signed in)
        const skipRedirectPrefixes = ['/oauth/', '/onboarding', '/logout'];
        if (isPublicRoute?.(req)) {
          const pathname = req.nextUrl.pathname;
          const shouldSkipRedirect = skipRedirectPrefixes.some((p) =>
            pathname.startsWith(p),
          );
          if (userId && sessionId && !shouldSkipRedirect) {
            return NextResponse.redirect(new URL('/', req.url));
          }
          return NextResponse.next();
        }

        // Protected routes: let Clerk handle unauthenticated users (handshake, redirect)
        await auth.protect();

        return NextResponse.next();
      },
      { debug: false },
    )
  : null;

export default function proxy(req: NextRequest, event: NextFetchEvent) {
  if (req.nextUrl.pathname === '/playwright-ready') {
    return NextResponse.next();
  }

  // Self-hosted core mode — no Clerk, pass through
  if (!isCloudConnected) {
    return NextResponse.next();
  }

  const hasPlaywrightBypassCookie =
    req.cookies.get('__playwright_test')?.value === 'true';
  const hasPlaywrightBypassEnv = process.env.PLAYWRIGHT_TEST === 'true';
  const isE2ETest =
    process.env.NODE_ENV !== 'production' &&
    (hasPlaywrightBypassEnv || hasPlaywrightBypassCookie);

  if (isE2ETest) {
    return NextResponse.next();
  }

  if (process.env.NODE_ENV !== 'production' && !hasClerkKeys) {
    return NextResponse.next();
  }

  return clerkProxy?.(req, event);
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|xml|txt)).*)',
    '/(api|trpc)(.*)',
  ],
};
