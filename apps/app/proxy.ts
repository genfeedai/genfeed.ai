import { isBetterAuthEnabled } from '@genfeedai/auth-client/server';
import {
  isCloudDeployment,
  isDesktopClient,
  isSaaS,
} from '@genfeedai/config/deployment';
import { type NextRequest, NextResponse } from 'next/server';

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
    isOnboardingCompleted?: boolean;
  };
  brands?: BootstrapBrandSummary[];
  currentUser?: {
    isOnboardingCompleted?: boolean;
    onboardingStepsCompleted?: unknown;
  } | null;
};

type OrganizationMineResponseItem = {
  isActive: boolean;
  slug?: string;
};

const ONBOARDING_PATH = '/onboarding';
const SEEDED_WORKSPACE_PATH = '/default/default/workspace/overview';
const ONBOARDING_STEPS = ['brand', 'providers', 'summary'] as const;
let hasWarnedAboutHostedModeMisconfiguration = false;

const BRAND_SCOPED_PREFIXES = [
  'analytics',
  'agent',
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

const ORG_SCOPED_PREFIXES = ['settings'] as const;

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
  const rawBaseUrl = (
    process.env.API_URL ||
    process.env.NEXT_PUBLIC_API_ENDPOINT ||
    'http://localhost:3010/v1'
  ).replace(/\/$/, '');

  try {
    const url = new URL(rawBaseUrl);
    if (url.pathname === '' || url.pathname === '/') {
      url.pathname = '/v1';
      return url.toString().replace(/\/$/, '');
    }
  } catch {
    // Relative paths such as /v1 are already valid API bases for fetch.
  }

  return rawBaseUrl;
}

function canonicalizeFlatProtectedPath(pathname: string): string {
  return FLAT_PATH_REDIRECTS.get(pathname) ?? pathname;
}

/** Slug segments must be alphanumeric + hyphens only (no dots, slashes, etc.). */
const SLUG_RE = /^[a-zA-Z0-9-]+$/;

function createSafeRedirectUrl(req: NextRequest, pathname: string): URL {
  const url = new URL(pathname, req.url);
  const requestOrigin = req.nextUrl.origin ?? new URL(req.url).origin;
  // Guard: the resolved URL must share the same origin as the incoming request.
  // This prevents slugs like `//attacker.example` from becoming cross-origin
  // redirects via the `new URL(pathname, base)` constructor.
  if (url.origin !== requestOrigin) {
    // Fall back to the workspace home rather than redirecting off-origin.
    return new URL(SEEDED_WORKSPACE_PATH, req.url);
  }
  return url;
}

function redirectPreservingSearch(req: NextRequest, pathname: string) {
  const url = createSafeRedirectUrl(req, pathname);
  const search = req.nextUrl.search;
  if (search) {
    url.search = search;
  }
  return NextResponse.redirect(url);
}

function redirectDroppingSearch(req: NextRequest, pathname: string) {
  return NextResponse.redirect(createSafeRedirectUrl(req, pathname));
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

function isSeededWorkspaceEntrypoint(pathname: string): boolean {
  return (
    pathname === '/' ||
    pathname === '/settings' ||
    isBareProtectedPath(pathname)
  );
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

  if (
    bootstrap?.access?.isOnboardingCompleted === true ||
    bootstrap?.currentUser?.isOnboardingCompleted === true
  ) {
    return false;
  }

  if (!bootstrap?.currentUser) {
    return false;
  }

  const completedSteps = Array.isArray(
    bootstrap.currentUser.onboardingStepsCompleted,
  )
    ? bootstrap.currentUser.onboardingStepsCompleted
    : [];

  return !ONBOARDING_STEPS.every((step) => completedSteps.includes(step));
}

// Matches the org-scoped agent onboarding surface and its threaded children,
// e.g. `/acme/~/agent/onboarding` and `/acme/~/agent/onboarding/<threadId>`.
const AGENT_ONBOARDING_PATH_RE = /^\/[^/]+\/~\/agent\/onboarding(?:\/|$)/;

function isAgentOnboardingPath(pathname: string): boolean {
  return AGENT_ONBOARDING_PATH_RE.test(pathname);
}

// Resolve the org-scoped agent onboarding destination for an incomplete user.
// SaaS uses this route unconditionally. If slug resolution is temporarily
// unavailable, callers keep the user inside the protected agent-first bootstrap
// instead of switching to the classic wizard.
async function resolveAgentOnboardingRedirect(
  token: string,
  cacheKey?: string | null,
  req?: NextRequest,
): Promise<{ cookieValue: string | null; path: string } | null> {
  const resolution = await resolveActiveWorkspaceSlugs(token, cacheKey, req);
  if (!resolution) {
    return null;
  }

  const { cookieValue, slugs } = resolution;
  return {
    cookieValue,
    path: `/${slugs.orgSlug}/~/agent/onboarding`,
  };
}

type CanonicalResolution = {
  cookieValue: string | null;
  path: string;
};

const ORG_ROOT_APP_PREFIXES = [
  'analytics',
  'agent',
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

/**
 * Public (no-session) routes under the Better Auth guard. Unlike the keyless
 * self-hosted branch, /login, /sign-up, password reset, and /logout are real
 * auth pages here. /oauth/* are integration callbacks and must never be gated.
 */
function isBetterAuthPublicRoute(pathname: string): boolean {
  return (
    pathname.startsWith('/login') ||
    pathname.startsWith('/sign-in') ||
    pathname.startsWith('/sign-up') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/logout') ||
    pathname.startsWith('/onboarding') ||
    pathname.startsWith('/oauth')
  );
}

function getBetterAuthSessionCookie(req: NextRequest): string | null {
  return (
    req.cookies.get('better-auth.session_token')?.value ||
    req.cookies.get('__Secure-better-auth.session_token')?.value ||
    null
  );
}

async function getBetterAuthBearerToken(
  req: NextRequest,
): Promise<string | null> {
  const cookieHeader = req.headers.get('cookie');
  if (!cookieHeader) {
    return null;
  }

  try {
    const response = await fetch(`${getApiBaseUrl()}/auth/token`, {
      cache: 'no-store',
      headers: { cookie: cookieHeader },
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { token?: string };
    return data.token ?? null;
  } catch {
    return null;
  }
}

async function redirectSignedInUserToDefaultRoute(
  req: NextRequest,
  token: string,
  cacheKey?: string | null,
): Promise<NextResponse | null> {
  if (await shouldRedirectSignedInUserToOnboarding(token)) {
    if (isSaaS()) {
      const agentOnboarding = await resolveAgentOnboardingRedirect(
        token,
        cacheKey,
        req,
      );
      if (agentOnboarding) {
        const response = redirectDroppingSearch(req, agentOnboarding.path);
        if (agentOnboarding.cookieValue) {
          setSlugCookie(response, agentOnboarding.cookieValue);
        }
        return response;
      }

      return redirectDroppingSearch(req, '/');
    }

    return redirectDroppingSearch(req, ONBOARDING_PATH);
  }

  const resolved = await resolveCanonicalProtectedPath(
    '/workspace/overview',
    token,
    cacheKey,
    req,
  );

  if (!resolved) {
    return null;
  }

  const response = redirectDroppingSearch(req, resolved.path);
  if (resolved.cookieValue) {
    setSlugCookie(response, resolved.cookieValue);
  }
  return response;
}

function isPlaywrightBypassRequest(req: NextRequest): boolean {
  const isPlaywrightTestBuild =
    process.env.NEXT_PUBLIC_PLAYWRIGHT_TEST === 'true' ||
    process.env.PLAYWRIGHT_TEST === 'true';
  const hasPlaywrightBypassCookie =
    req.cookies.get('__playwright_test')?.value === 'true';

  return isPlaywrightTestBuild && hasPlaywrightBypassCookie;
}

export async function proxy(req: NextRequest) {
  if (
    !hasWarnedAboutHostedModeMisconfiguration &&
    req.nextUrl.hostname === 'app.genfeed.ai' &&
    !isCloudDeployment()
  ) {
    hasWarnedAboutHostedModeMisconfiguration = true;
    console.warn(
      'app.genfeed.ai is running without GENFEED_CLOUD; deployment mode remains self-hosted.',
    );
  }

  if (req.nextUrl.pathname === '/playwright-ready') {
    return NextResponse.next();
  }

  if (isPlaywrightBypassRequest(req)) {
    return NextResponse.next();
  }

  if (isDesktopClient()) {
    const { pathname } = req.nextUrl;
    const desktopToken = req.headers.get('x-genfeed-desktop-token')?.trim();
    const hasDesktopToken = Boolean(desktopToken);
    const isAuthRoute =
      pathname.startsWith('/login') ||
      pathname.startsWith('/sign-in') ||
      pathname.startsWith('/sign-up') ||
      pathname.startsWith('/forgot-password') ||
      pathname.startsWith('/reset-password') ||
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
      if (isSeededWorkspaceEntrypoint(pathname)) {
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

  if (!isBetterAuthEnabled()) {
    const { pathname } = req.nextUrl;

    if (isSeededWorkspaceEntrypoint(pathname)) {
      return redirectPreservingSearch(req, SEEDED_WORKSPACE_PATH);
    }

    return NextResponse.next();
  }

  if (isBetterAuthEnabled()) {
    const { pathname } = req.nextUrl;
    const sessionCookie = getBetterAuthSessionCookie(req);
    const hasSession = Boolean(sessionCookie);

    if (pathname.startsWith('/logout')) {
      const response = NextResponse.next();
      deleteSlugCookie(response);
      return response;
    }

    if (isBetterAuthPublicRoute(pathname)) {
      if (hasSession && pathname.startsWith('/login')) {
        const token = await getBetterAuthBearerToken(req);
        const response = token
          ? await redirectSignedInUserToDefaultRoute(req, token, sessionCookie)
          : null;

        if (response) {
          return response;
        }
      }
      return NextResponse.next();
    }

    if (!hasSession) {
      return redirectPreservingSearch(req, '/login');
    }

    const token = await getBetterAuthBearerToken(req);
    if (!token) {
      return redirectPreservingSearch(req, '/login');
    }

    if (await shouldRedirectSignedInUserToOnboarding(token)) {
      // Community/Desktop keep the form wizard until their local/BYOK
      // onboarding path reaches parity. SaaS always uses agent-first
      // onboarding; there is no rollout flag or legacy-shell kill switch.
      if (!isSaaS()) {
        return redirectPreservingSearch(req, ONBOARDING_PATH);
      }

      // The agent onboarding surface is itself a protected route — let it
      // render instead of bouncing the user back to the wizard (redirect loop).
      if (isAgentOnboardingPath(pathname)) {
        return NextResponse.next();
      }

      const agentOnboarding = await resolveAgentOnboardingRedirect(
        token,
        sessionCookie,
        req,
      );
      if (agentOnboarding) {
        const response = redirectPreservingSearch(req, agentOnboarding.path);
        if (agentOnboarding.cookieValue) {
          setSlugCookie(response, agentOnboarding.cookieValue);
        }
        return response;
      }

      return pathname === '/'
        ? NextResponse.next()
        : redirectPreservingSearch(req, '/');
    }

    if (pathname === '/') {
      const resolved = await resolveCanonicalProtectedPath(
        '/workspace/overview',
        token,
        sessionCookie,
        req,
      );

      if (resolved) {
        const response = redirectPreservingSearch(req, resolved.path);
        if (resolved.cookieValue) {
          setSlugCookie(response, resolved.cookieValue);
        }
        return response;
      }

      return NextResponse.next();
    }

    if (isBareProtectedPath(pathname)) {
      const resolved = await resolveCanonicalProtectedPath(
        pathname,
        token,
        sessionCookie,
        req,
      );

      if (resolved) {
        const response = redirectPreservingSearch(req, resolved.path);
        if (resolved.cookieValue) {
          setSlugCookie(response, resolved.cookieValue);
        }
        return response;
      }

      return NextResponse.next();
    }

    return NextResponse.next();
  }

  return NextResponse.next();
}

export default proxy;

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|xml|txt)).*)',
    '/(api|trpc)(.*)',
  ],
};
