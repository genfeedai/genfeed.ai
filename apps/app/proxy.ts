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
  currentUser?: unknown;
};

type OrganizationMineResponseItem = {
  isActive: boolean;
  slug?: string;
};

const hasClerkKeys =
  Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim()) &&
  Boolean(process.env.CLERK_SECRET_KEY?.trim());
const isDesktopShell = process.env.NEXT_PUBLIC_DESKTOP_SHELL === '1';
const ONBOARDING_PATH = '/onboarding';
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
  ['/compose', '/compose/article'],
  ['/library', '/library/ingredients'],
  ['/research', '/research/discovery'],
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

/** Slug segments must be alphanumeric + hyphens only (no dots, slashes, etc.). */
const SLUG_RE = /^[a-zA-Z0-9-]+$/;

function redirectPreservingSearch(req: NextRequest, pathname: string) {
  const url = new URL(pathname, req.url);
  const requestOrigin = req.nextUrl.origin ?? new URL(req.url).origin;
  // Guard: the resolved URL must share the same origin as the incoming request.
  // This prevents slugs like `//attacker.example` from becoming cross-origin
  // redirects via the `new URL(pathname, base)` constructor.
  if (url.origin !== requestOrigin) {
    // Fall back to the workspace home rather than redirecting off-origin.
    const safe = new URL(SEEDED_WORKSPACE_PATH, req.url);
    const search = req.nextUrl.search;
    if (search) safe.search = search;
    return NextResponse.redirect(safe);
  }
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

/**
 * Validate a workspace slug to prevent open redirects.
 * Slugs must start with a lowercase letter or digit and consist only of
 * lowercase letters, digits, and hyphens. A slug starting with "/" or
 * containing "//" could create cross-origin redirect vectors.
 */
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

function isValidSlug(slug: string | undefined): slug is string {
  return typeof slug === 'string' && SLUG_PATTERN.test(slug);
}

function isBareProtectedPath(pathname: string): boolean {
  const topLevelSegment = getTopLevelSegment(pathname);

  if (!topLevelSegment) {
    return false;
  }

  if (topLevelSegment === 'settings') {
    return pathname !== '/settings';
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

function isScopedWorkspacePath(pathname: string): boolean {
  const parts = pathname.split('/').filter(Boolean);

  if (parts.length === 0 || parts[0] === 'admin') {
    return false;
  }

  if (parts.length === 1) {
    return !isBareProtectedPath(pathname);
  }

  return !isBareProtectedPath(pathname);
}

type WorkspaceSlugs = {
  brandCount: number;
  brandSlug?: string;
  orgSlug: string;
};

const WORKSPACE_SLUG_CACHE_TTL_MS = 300_000;
const WORKSPACE_SLUG_COOKIE_NAME = 'gf_ws';
const WORKSPACE_SLUG_COOKIE_MAX_AGE_S = 300;
const workspaceSlugCache = new Map<
  string,
  {
    expiresAt: number;
    slugs: WorkspaceSlugs;
  }
>();

async function getCookieSecret(): Promise<CryptoKey | null> {
  const secret = process.env.COOKIE_SECRET;
  if (!secret) return null;
  const encoder = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function uint8ToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlToUint8(str: string): Uint8Array<ArrayBuffer> {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function encodeSlugCookie(slugs: WorkspaceSlugs): Promise<string | null> {
  const key = await getCookieSecret();
  if (!key) return null;
  const payload = JSON.stringify({
    e: Date.now() + WORKSPACE_SLUG_CACHE_TTL_MS,
    s: slugs,
  });
  const encoder = new TextEncoder();
  const payloadBytes = encoder.encode(payload);
  const sig = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, payloadBytes),
  );
  return `${uint8ToBase64Url(payloadBytes)}.${uint8ToBase64Url(sig)}`;
}

async function decodeSlugCookie(value: string): Promise<WorkspaceSlugs | null> {
  try {
    const key = await getCookieSecret();
    if (!key) return null;
    const [payloadPart, sigPart] = value.split('.');
    if (!payloadPart || !sigPart) return null;
    const payloadBytes = base64UrlToUint8(payloadPart);
    const sigBytes = base64UrlToUint8(sigPart);
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes,
      payloadBytes,
    );
    if (!valid) return null;
    const decoder = new TextDecoder();
    const parsed = JSON.parse(decoder.decode(payloadBytes)) as {
      e: number;
      s: WorkspaceSlugs;
    };
    if (parsed.e <= Date.now()) return null;
    if (!parsed.s?.orgSlug) return null;
    if (!isValidSlug(parsed.s.orgSlug)) return null;
    if (parsed.s.brandSlug !== undefined && !isValidSlug(parsed.s.brandSlug)) {
      return null;
    }
    return parsed.s;
  } catch {
    return null;
  }
}

function setSlugCookie(response: NextResponse, cookieValue: string): void {
  response.cookies.set(WORKSPACE_SLUG_COOKIE_NAME, cookieValue, {
    httpOnly: true,
    maxAge: WORKSPACE_SLUG_COOKIE_MAX_AGE_S,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
}

function deleteSlugCookie(response: NextResponse): void {
  response.cookies.delete(WORKSPACE_SLUG_COOKIE_NAME);
}

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

type SlugResolution = {
  cookieValue: string | null;
  slugs: WorkspaceSlugs;
};

async function resolveActiveWorkspaceSlugs(
  token: string,
  cacheKey?: string | null,
  req?: NextRequest,
): Promise<SlugResolution | null> {
  const cached = readWorkspaceSlugCache(cacheKey);
  if (cached) {
    return { cookieValue: null, slugs: cached };
  }

  if (req) {
    const cookieRaw = req.cookies.get(WORKSPACE_SLUG_COOKIE_NAME)?.value;
    if (cookieRaw) {
      const fromCookie = await decodeSlugCookie(cookieRaw);
      if (fromCookie) {
        writeWorkspaceSlugCache(cacheKey, fromCookie);
        return { cookieValue: null, slugs: fromCookie };
      }
    }
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
  const matchedBrand = activeBrandId
    ? brands.find((brand) => {
        return String(brand.id ?? brand._id ?? '') === activeBrandId;
      })
    : undefined;
  const resolvedBrand =
    activeBrandId && matchedBrand?.slug
      ? matchedBrand
      : activeBrandId
        ? (brands.find((brand) => Boolean(brand.slug)) ?? matchedBrand)
        : undefined;
  const brandSlug = resolvedBrand?.slug;
  let orgSlug =
    resolvedBrand?.organization?.slug ??
    brands.find((brand) => Boolean(brand.organization?.slug))?.organization
      ?.slug;

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

  if (!orgSlug) {
    return null;
  }

  // Validate slugs before caching and using them in redirect paths.
  // This prevents an attacker-controlled API response from injecting a slug
  // like `//attacker.example` and causing a cross-origin redirect.
  if (!SLUG_RE.test(orgSlug) || (brandSlug && !SLUG_RE.test(brandSlug))) {
    return null;
  }

  const slugs = { brandCount: brands.length, brandSlug, orgSlug };
  writeWorkspaceSlugCache(cacheKey, slugs);
  const cookieValue = await encodeSlugCookie(slugs);
  return { cookieValue, slugs };
}

async function shouldRedirectSignedInUserToOnboarding(
  token: string,
): Promise<boolean> {
  let bootstrapResponse: Response;

  try {
    bootstrapResponse = await fetch(`${getApiBaseUrl()}/auth/bootstrap`, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
  } catch {
    return false;
  }

  if (!bootstrapResponse.ok) {
    return false;
  }

  const bootstrap =
    (await bootstrapResponse.json()) as BootstrapResponse | null;

  return Array.isArray(bootstrap?.brands) && bootstrap.brands.length === 0;
}

type CanonicalResolution = {
  cookieValue: string | null;
  path: string;
};

const ORG_ROOT_APP_PREFIXES = [
  'analytics',
  'chat',
  'compose',
  'editor',
  'library',
  'posts',
  'settings',
  'studio',
  'workflows',
] as const;

function createOrgScopedCanonicalPath(
  canonicalPath: string,
  orgSlug: string,
): string {
  const topLevelSegment = getTopLevelSegment(canonicalPath);

  if (topLevelSegment === 'workspace' || topLevelSegment === 'overview') {
    return `/${orgSlug}/~/overview`;
  }

  if (topLevelSegment === 'compose') {
    return `/${orgSlug}/~/posts`;
  }

  if (
    topLevelSegment &&
    ORG_ROOT_APP_PREFIXES.includes(
      topLevelSegment as (typeof ORG_ROOT_APP_PREFIXES)[number],
    )
  ) {
    return `/${orgSlug}/~${canonicalPath}`;
  }

  return `/${orgSlug}/~/overview`;
}

async function resolveCanonicalProtectedPath(
  pathname: string,
  token: string,
  cacheKey?: string | null,
  req?: NextRequest,
): Promise<CanonicalResolution | null> {
  const canonicalPath = canonicalizeFlatProtectedPath(pathname);
  const resolution = await resolveActiveWorkspaceSlugs(token, cacheKey, req);

  if (!resolution) {
    return null;
  }

  const { cookieValue, slugs } = resolution;
  const topLevelSegment = getTopLevelSegment(canonicalPath);

  if (topLevelSegment === 'settings') {
    if (canonicalPath === '/settings/personal') {
      return { cookieValue, path: '/settings' };
    }

    if (canonicalPath === '/settings/organization') {
      return { cookieValue, path: `/${slugs.orgSlug}/~/settings` };
    }

    if (canonicalPath.startsWith('/settings/organization/')) {
      return {
        cookieValue,
        path: `/${slugs.orgSlug}/~${canonicalPath.replace(
          '/settings/organization',
          '/settings',
        )}`,
      };
    }

    return { cookieValue, path: `/${slugs.orgSlug}/~${canonicalPath}` };
  }

  if (!slugs.brandSlug) {
    return {
      cookieValue,
      path: createOrgScopedCanonicalPath(canonicalPath, slugs.orgSlug),
    };
  }

  if (
    topLevelSegment &&
    ORG_SCOPED_PREFIXES.includes(
      topLevelSegment as (typeof ORG_SCOPED_PREFIXES)[number],
    )
  ) {
    return { cookieValue, path: `/${slugs.orgSlug}/~${canonicalPath}` };
  }

  return {
    cookieValue,
    path: `/${slugs.orgSlug}/${slugs.brandSlug}${canonicalPath}`,
  };
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
            const resolution = await resolveActiveWorkspaceSlugs(
              token,
              sessionId,
              req,
            );
            if (resolution) {
              const destination = resolution.slugs.brandSlug
                ? `/${resolution.slugs.orgSlug}/${resolution.slugs.brandSlug}/workspace/overview`
                : `/${resolution.slugs.orgSlug}/~/overview`;
              const response = redirectPreservingSearch(req, destination);
              if (resolution.cookieValue) {
                setSlugCookie(response, resolution.cookieValue);
              }
              return response;
            }

            if (
              token &&
              (await shouldRedirectSignedInUserToOnboarding(token))
            ) {
              return redirectPreservingSearch(req, ONBOARDING_PATH);
            }
          }
          return NextResponse.next();
        }

        const skipRedirectPrefixes = ['/oauth/', '/onboarding', '/logout'];
        if (isPublicRoute?.(req)) {
          const shouldSkipRedirect = skipRedirectPrefixes.some((p) =>
            pathname.startsWith(p),
          );
          if (shouldSkipRedirect) {
            if (pathname.startsWith('/logout')) {
              const response = NextResponse.next();
              deleteSlugCookie(response);
              return response;
            }
            return NextResponse.next();
          }

          if (userId && sessionId) {
            const token = await session.getToken?.();
            const resolved = token
              ? await resolveCanonicalProtectedPath(
                  '/workspace/overview',
                  token,
                  sessionId,
                  req,
                )
              : null;

            if (resolved) {
              const response = redirectPreservingSearch(req, resolved.path);
              if (resolved.cookieValue) {
                setSlugCookie(response, resolved.cookieValue);
              }
              return response;
            }

            if (
              token &&
              (await shouldRedirectSignedInUserToOnboarding(token))
            ) {
              return redirectPreservingSearch(req, ONBOARDING_PATH);
            }

            return NextResponse.next();
          }
          return NextResponse.next();
        }

        if (!userId || !sessionId) {
          if (isDesktopShell) {
            return NextResponse.next();
          }
          return redirectPreservingSearch(req, '/login');
        }

        if (pathname.startsWith('/logout')) {
          const response = NextResponse.next();
          deleteSlugCookie(response);
          return response;
        }

        if (isBareProtectedPath(pathname)) {
          const token = await session.getToken?.();
          const resolved = token
            ? await resolveCanonicalProtectedPath(
                pathname,
                token,
                sessionId,
                req,
              )
            : null;

          if (!resolved) {
            if (
              token &&
              (await shouldRedirectSignedInUserToOnboarding(token))
            ) {
              return redirectPreservingSearch(req, ONBOARDING_PATH);
            }

            return NextResponse.next();
          }

          const response = redirectPreservingSearch(req, resolved.path);
          if (resolved.cookieValue) {
            setSlugCookie(response, resolved.cookieValue);
          }
          return response;
        }

        if (isScopedWorkspacePath(pathname)) {
          const token = await session.getToken?.();

          if (token && (await shouldRedirectSignedInUserToOnboarding(token))) {
            return redirectPreservingSearch(req, ONBOARDING_PATH);
          }
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
    const resolveDesktopWorkspace =
      async (): Promise<CanonicalResolution | null> => {
        if (!desktopToken) {
          return null;
        }

        return await resolveCanonicalProtectedPath(
          '/workspace/overview',
          desktopToken,
          undefined,
          req,
        );
      };

    if (!hasDesktopToken) {
      if (
        pathname === '/' ||
        pathname === '/settings' ||
        isBareProtectedPath(pathname)
      ) {
        return redirectPreservingSearch(req, SEEDED_WORKSPACE_PATH);
      }
      return NextResponse.next();
    }

    if (pathname === '/') {
      const resolved = await resolveDesktopWorkspace();
      const response = redirectPreservingSearch(
        req,
        resolved?.path ?? '/login',
      );
      if (resolved?.cookieValue) {
        setSlugCookie(response, resolved.cookieValue);
      }
      return response;
    }

    if (pathname === '/logout') {
      const response = NextResponse.next();
      deleteSlugCookie(response);
      return response;
    }

    if (isAuthRoute) {
      const resolved = await resolveDesktopWorkspace();

      if (resolved) {
        const response = redirectPreservingSearch(req, resolved.path);
        if (resolved.cookieValue) {
          setSlugCookie(response, resolved.cookieValue);
        }
        return response;
      }

      return NextResponse.next();
    }

    if (hasDesktopToken && isBareProtectedPath(pathname) && desktopToken) {
      const resolved = await resolveCanonicalProtectedPath(
        pathname,
        desktopToken,
        undefined,
        req,
      );

      if (resolved) {
        const response = redirectPreservingSearch(req, resolved.path);
        if (resolved.cookieValue) {
          setSlugCookie(response, resolved.cookieValue);
        }
        return response;
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

  // E2E auth bypass.
  //
  // Master switch: the Playwright harness builds + serves the app with
  // NEXT_PUBLIC_PLAYWRIGHT_TEST=true (playwright.config webServer.env, plus the
  // CI build step). Because it is a NEXT_PUBLIC_* flag it is inlined into the
  // middleware bundle at build time, so it is readable here regardless of the
  // middleware runtime (edge or node) — unlike a plain server env, which an edge
  // middleware cannot read at request time. A real production build never sets
  // it, so this branch is dead code in production. `PLAYWRIGHT_TEST` is also
  // honored for the `next dev` path, where runtime env is available.
  //
  // Per-request opt-in: the __playwright_test cookie. It is only trusted while
  // the master switch is on, so a forged cookie can never bypass auth in a real
  // deployment. Requiring the cookie (rather than bypassing every request on the
  // test server) also keeps the real-Clerk `app-authed` project meaningful — it
  // sends no cookie, so it still exercises the genuine clerkMiddleware path.
  //
  // This replaces the previous `NODE_ENV !== 'production'` guard, which silently
  // disabled the bypass under `next start` (NODE_ENV=production) in CI and made
  // every protected route redirect to /login, timing out the suite.
  const isPlaywrightTestBuild =
    process.env.NEXT_PUBLIC_PLAYWRIGHT_TEST === 'true' ||
    process.env.PLAYWRIGHT_TEST === 'true';
  const hasPlaywrightBypassCookie =
    req.cookies.get('__playwright_test')?.value === 'true';
  const isE2ETest = isPlaywrightTestBuild && hasPlaywrightBypassCookie;

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
