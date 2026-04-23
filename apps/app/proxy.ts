import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import {
  type NextFetchEvent,
  type NextRequest,
  NextResponse,
} from 'next/server';

type ClerkSessionState = {
  getToken?: () => Promise<string | null>;
  sessionId?: string | null;
  userId?: string | null;
};

type BootstrapBrandSummary = {
  _id?: string;
  id?: string;
  organization?: {
    slug?: string;
  };
  slug?: string;
};

type BootstrapResponse = {
  access?: {
    brandId?: string;
  };
  brands?: BootstrapBrandSummary[];
};

type OrganizationMineResponseItem = {
  isActive: boolean;
  slug?: string;
};

const hasClerkKeys =
  Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) &&
  Boolean(process.env.CLERK_SECRET_KEY);
const isDesktopShell = process.env.NEXT_PUBLIC_DESKTOP_SHELL === '1';
const SEEDED_WORKSPACE_PATH = '/default/default/workspace/overview';

/**
 * In self-hosted core mode Clerk keys are absent.
 * Eagerly check so we never instantiate Clerk middleware.
 */
const isCloudConnected = hasClerkKeys;

const BRAND_SCOPED_PREFIXES = [
  'analytics',
  'compose',
  'editor',
  'tasks',
  'library',
  'orchestration',
  'overview',
  'posts',
  'research',
  'studio',
  'workflows',
  'workspace',
] as const;

const ORG_SCOPED_PREFIXES = ['chat', 'settings'] as const;

const FLAT_PATH_REDIRECTS = new Map<string, string>([
  ['/analytics', '/analytics/overview'],
  ['/chat', '/chat/new'],
  ['/compose', '/compose/article'],
  ['/library', '/library/ingredients'],
  ['/research', '/research/discovery'],
  ['/settings', '/settings/personal'],
  ['/studio', '/studio/image'],
  ['/workspace', '/workspace/overview'],
  ['/workspace/inbox', '/workspace/inbox/unread'],
]);

function getApiBaseUrl(): string {
  return (
    process.env.API_URL ||
    process.env.NEXT_PUBLIC_API_ENDPOINT ||
    'http://localhost:3010/v1'
  ).replace(/\/$/, '');
}

function canonicalizeFlatProtectedPath(pathname: string): string {
  return FLAT_PATH_REDIRECTS.get(pathname) ?? pathname;
}

function redirectPreservingSearch(req: NextRequest, pathname: string) {
  const url = new URL(pathname, req.url);
  const search = req.nextUrl.search;
  if (search) {
    url.search = search;
  }
  return NextResponse.redirect(url);
}

function getTopLevelSegment(pathname: string): string | null {
  const [segment] = pathname.split('/').filter(Boolean);
  return segment ?? null;
}

function isBareProtectedPath(pathname: string): boolean {
  const topLevelSegment = getTopLevelSegment(pathname);

  if (!topLevelSegment) {
    return false;
  }

  return (
    BRAND_SCOPED_PREFIXES.includes(
      topLevelSegment as (typeof BRAND_SCOPED_PREFIXES)[number],
    ) ||
    ORG_SCOPED_PREFIXES.includes(
      topLevelSegment as (typeof ORG_SCOPED_PREFIXES)[number],
    )
  );
}

type WorkspaceSlugs = {
  brandCount: number;
  brandSlug: string;
  orgSlug: string;
};

const WORKSPACE_SLUG_CACHE_TTL_MS = 30_000;
const workspaceSlugCache = new Map<
  string,
  {
    expiresAt: number;
    slugs: WorkspaceSlugs;
  }
>();

function readWorkspaceSlugCache(
  cacheKey?: string | null,
): WorkspaceSlugs | null {
  if (!cacheKey || process.env.NODE_ENV === 'test') {
    return null;
  }

  const entry = workspaceSlugCache.get(cacheKey);
  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    workspaceSlugCache.delete(cacheKey);
    return null;
  }

  return entry.slugs;
}

function writeWorkspaceSlugCache(
  cacheKey: string | null | undefined,
  slugs: WorkspaceSlugs,
) {
  if (!cacheKey || process.env.NODE_ENV === 'test') {
    return;
  }

  workspaceSlugCache.set(cacheKey, {
    expiresAt: Date.now() + WORKSPACE_SLUG_CACHE_TTL_MS,
    slugs,
  });
}

async function resolveActiveWorkspaceSlugs(
  token: string,
  cacheKey?: string | null,
): Promise<WorkspaceSlugs | null> {
  const cached = readWorkspaceSlugCache(cacheKey);
  if (cached) {
    return cached;
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };

  let bootstrapResponse: Response;

  try {
    bootstrapResponse = await fetch(`${getApiBaseUrl()}/auth/bootstrap`, {
      cache: 'no-store',
      headers,
    });
  } catch {
    return null;
  }

  if (!bootstrapResponse.ok) {
    return null;
  }

  const bootstrap =
    (await bootstrapResponse.json()) as BootstrapResponse | null;
  const brands = bootstrap?.brands ?? [];
  const activeBrandId = bootstrap?.access?.brandId ?? '';
  const matchedBrand = brands.find((brand) => {
    return String(brand.id ?? brand._id ?? '') === activeBrandId;
  });
  const resolvedBrand =
    (matchedBrand?.slug ? matchedBrand : null) ??
    brands.find((brand) => Boolean(brand.slug)) ??
    matchedBrand;
  const brandSlug = resolvedBrand?.slug;
  let orgSlug = resolvedBrand?.organization?.slug;

  if (!orgSlug) {
    let organizationsResponse: Response;

    try {
      organizationsResponse = await fetch(
        `${getApiBaseUrl()}/organizations/mine`,
        {
          cache: 'no-store',
          headers,
        },
      );
    } catch {
      return null;
    }

    if (!organizationsResponse.ok) {
      return null;
    }

    const organizations = (await organizationsResponse.json()) as
      | OrganizationMineResponseItem[]
      | null;
    orgSlug =
      organizations?.find((organization) => organization.isActive)?.slug ??
      organizations?.[0]?.slug;
  }

  if (!orgSlug || !brandSlug) {
    return null;
  }

  const slugs = { brandCount: brands.length, brandSlug, orgSlug };
  writeWorkspaceSlugCache(cacheKey, slugs);
  return slugs;
}

async function resolveCanonicalProtectedPath(
  pathname: string,
  token: string,
  cacheKey?: string | null,
): Promise<string | null> {
  const canonicalPath = canonicalizeFlatProtectedPath(pathname);
  const slugs = await resolveActiveWorkspaceSlugs(token, cacheKey);

  if (!slugs) {
    return null;
  }

  const topLevelSegment = getTopLevelSegment(canonicalPath);

  if (
    topLevelSegment &&
    ORG_SCOPED_PREFIXES.includes(
      topLevelSegment as (typeof ORG_SCOPED_PREFIXES)[number],
    )
  ) {
    return `/${slugs.orgSlug}/~${canonicalPath}`;
  }

  return `/${slugs.orgSlug}/${slugs.brandSlug}${canonicalPath}`;
}

const isPublicRoute = isCloudConnected
  ? createRouteMatcher([
      '/',
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
        const session = (await auth()) as ClerkSessionState;
        const { userId, sessionId } = session || {};

        // Public routes: redirect authenticated users to the workspace home
        // (except routes that must remain accessible while signed in)
        const pathname = req.nextUrl.pathname;
        if (pathname === '/') {
          if (!userId || !sessionId) {
            if (isDesktopShell) {
              return NextResponse.redirect(
                new URL(SEEDED_WORKSPACE_PATH, req.url),
              );
            }
            return NextResponse.redirect(new URL('/login', req.url));
          }

          const token = await session.getToken?.();
          if (token) {
            const slugs = await resolveActiveWorkspaceSlugs(token, sessionId);
            if (slugs) {
              return redirectPreservingSearch(
                req,
                `/${slugs.orgSlug}/${slugs.brandSlug}/workspace/overview`,
              );
            }
          }
          return NextResponse.next();
        }

        const skipRedirectPrefixes = ['/oauth/', '/onboarding', '/logout'];
        if (isPublicRoute?.(req)) {
          const shouldSkipRedirect = skipRedirectPrefixes.some((p) =>
            pathname.startsWith(p),
          );
          if (userId && sessionId && !shouldSkipRedirect) {
            const token = await session.getToken?.();
            const resolvedPath = token
              ? await resolveCanonicalProtectedPath(
                  '/workspace/overview',
                  token,
                  sessionId,
                )
              : null;

            if (resolvedPath) {
              return redirectPreservingSearch(req, resolvedPath);
            }

            return NextResponse.next();
          }
          return NextResponse.next();
        }

        if (!userId || !sessionId) {
          // Desktop offline: no session is valid — pass straight through.
          if (isDesktopShell) {
            return NextResponse.next();
          }
          return redirectPreservingSearch(req, '/login');
        }

        if (isBareProtectedPath(pathname)) {
          const token = await session.getToken?.();
          const resolvedPath = token
            ? await resolveCanonicalProtectedPath(pathname, token, sessionId)
            : null;

          if (!resolvedPath) {
            return NextResponse.next();
          }

          return redirectPreservingSearch(req, resolvedPath);
        }

        return NextResponse.next();
      },
      { debug: false },
    )
  : null;

export default async function proxy(req: NextRequest, event: NextFetchEvent) {
  if (req.nextUrl.pathname === '/playwright-ready') {
    return NextResponse.next();
  }

  if (isDesktopShell && !isCloudConnected) {
    const { pathname } = req.nextUrl;
    const desktopToken = req.headers.get('x-genfeed-desktop-token')?.trim();
    const hasDesktopToken = Boolean(desktopToken);
    const isAuthRoute =
      pathname.startsWith('/login') ||
      pathname.startsWith('/sign-in') ||
      pathname.startsWith('/sign-up') ||
      pathname.startsWith('/logout') ||
      pathname.startsWith('/onboarding');
    const resolveDesktopWorkspacePath = async (): Promise<string | null> => {
      if (!desktopToken) {
        return null;
      }

      return await resolveCanonicalProtectedPath(
        '/workspace/overview',
        desktopToken,
      );
    };

    // Offline / no active session: skip all token-dependent logic and go
    // straight to the default seeded workspace (same as self-hosted mode).
    if (!hasDesktopToken) {
      if (pathname === '/' || isBareProtectedPath(pathname)) {
        return redirectPreservingSearch(req, SEEDED_WORKSPACE_PATH);
      }
      return NextResponse.next();
    }

    if (pathname === '/') {
      const resolvedPath = await resolveDesktopWorkspacePath();
      return redirectPreservingSearch(req, resolvedPath ?? '/login');
    }

    if (pathname === '/logout') {
      return NextResponse.next();
    }

    if (isAuthRoute) {
      const resolvedPath = await resolveDesktopWorkspacePath();

      if (resolvedPath) {
        return redirectPreservingSearch(req, resolvedPath);
      }

      return NextResponse.next();
    }

    if (hasDesktopToken && isBareProtectedPath(pathname) && desktopToken) {
      const resolvedPath = await resolveCanonicalProtectedPath(
        pathname,
        desktopToken,
      );

      if (resolvedPath) {
        return redirectPreservingSearch(req, resolvedPath);
      }

      return redirectPreservingSearch(req, '/login');
    }

    return NextResponse.next();
  }

  // Self-hosted core mode — no Clerk.
  // Redirect root + all Clerk-dependent routes to the seeded default workspace.
  // SelfHostedSeedService always seeds org slug="default" and brand slug="default"
  // (apps/server/api/src/seeds/self-hosted-seed.service.ts:87,103).
  // /login, /sign-up, /logout render Clerk components — redirect them.
  // /oauth (bare) redirects, but /oauth/[platform] and /oauth/cli are integration
  // callback pages that must NOT be redirected.
  if (!isCloudConnected) {
    const { pathname } = req.nextUrl;
    const redirectToWorkspace =
      pathname === '/' ||
      pathname.startsWith('/onboarding') ||
      pathname.startsWith('/login') ||
      pathname.startsWith('/sign-in') ||
      pathname.startsWith('/sign-up') ||
      pathname.startsWith('/logout') ||
      pathname === '/oauth' ||
      pathname === '/oauth/';
    if (redirectToWorkspace) {
      return NextResponse.redirect(new URL(SEEDED_WORKSPACE_PATH, req.url));
    }
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
