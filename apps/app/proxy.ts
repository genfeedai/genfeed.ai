import { resolveAuthContinuation } from '@genfeedai/auth-client/callback';
import { isBetterAuthEnabled } from '@genfeedai/auth-client/server';
import {
  hasAgentFirstOnboarding,
  isCloudDeployment,
  isDesktopClient,
} from '@genfeedai/config/deployment';
import {
  APP_ROUTE_PREFIXES,
  APP_ROUTES,
  createBrandAppRoute,
  hasCompletedBrandOnboardingStep,
  isPersonalSettingsPath,
  isSharedBrandOnboardingPath,
  LEGACY_APP_ROUTES,
  ONBOARDING_STEPS,
  parseScopedAppPath,
} from '@genfeedai/constants';
import { DESKTOP_HTTP_HEADERS } from '@genfeedai/desktop-contracts';
import { type NextRequest, NextResponse } from 'next/server';

type BootstrapBrandSummary = {
  id: string;
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

const ONBOARDING_PATH = APP_ROUTES.ONBOARDING.ROOT;
const SEEDED_WORKSPACE_PATH = createBrandAppRoute(
  'default',
  'default',
  APP_ROUTES.WORKSPACE.OVERVIEW,
);
let hasWarnedAboutHostedModeMisconfiguration = false;
const DEFAULT_MINIMUM_DESKTOP_VERSION = '0.1.0';

type ParsedVersion = {
  core: readonly [number, number, number];
  isPrerelease: boolean;
};

function parseVersion(value: string): ParsedVersion | null {
  const match =
    /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(
      value,
    );
  if (!match) {
    return null;
  }

  const core = match.slice(1, 4).map(Number) as [number, number, number];
  if (core.some((part) => !Number.isSafeInteger(part))) {
    return null;
  }

  return { core, isPrerelease: Boolean(match[4]) };
}

function isVersionAtLeast(current: string, minimum: string): boolean {
  const parsedCurrent = parseVersion(current);
  const parsedMinimum = parseVersion(minimum);
  if (!parsedCurrent || !parsedMinimum) {
    return false;
  }

  for (let index = 0; index < parsedCurrent.core.length; index += 1) {
    const currentPart = parsedCurrent.core[index] ?? 0;
    const minimumPart = parsedMinimum.core[index] ?? 0;
    if (currentPart !== minimumPart) {
      return currentPart > minimumPart;
    }
  }

  return !parsedCurrent.isPrerelease || parsedMinimum.isPrerelease;
}

function getMinimumDesktopVersion(): string {
  const configured = process.env.GENFEED_DESKTOP_MINIMUM_VERSION?.trim();
  return configured && parseVersion(configured)
    ? configured
    : DEFAULT_MINIMUM_DESKTOP_VERSION;
}

function getDesktopVersion(req: NextRequest): string | null {
  return req.headers.get(DESKTOP_HTTP_HEADERS.version);
}

function isDesktopSurfaceRequest(req: NextRequest): boolean {
  return isDesktopClient() || getDesktopVersion(req) !== null;
}

function enforceMinimumDesktopVersion(req: NextRequest): NextResponse | null {
  const desktopVersion = getDesktopVersion(req);
  if (desktopVersion === null) {
    return null;
  }

  const minimumVersion = getMinimumDesktopVersion();
  if (isVersionAtLeast(desktopVersion.trim(), minimumVersion)) {
    return null;
  }

  return NextResponse.json(
    {
      code: 'DESKTOP_UPDATE_REQUIRED',
      currentVersion: desktopVersion.trim() || null,
      minimumVersion,
      message: 'Update Genfeed Desktop to continue.',
    },
    {
      headers: {
        'Cache-Control': 'no-store',
        [DESKTOP_HTTP_HEADERS.minimumVersion]: minimumVersion,
      },
      status: 426,
    },
  );
}

const BRAND_SCOPED_PREFIXES = [
  APP_ROUTE_PREFIXES.ANALYTICS.slice(1),
  APP_ROUTE_PREFIXES.AGENT.slice(1),
  LEGACY_APP_ROUTES.TASKS.slice(1),
  APP_ROUTE_PREFIXES.LIBRARY.slice(1),
  APP_ROUTE_PREFIXES.AUTOMATE.slice(1),
  APP_ROUTE_PREFIXES.OVERVIEW.slice(1),
  APP_ROUTE_PREFIXES.PUBLISH.slice(1),
  APP_ROUTE_PREFIXES.DISCOVER.slice(1),
  APP_ROUTE_PREFIXES.STUDIO.slice(1),
  APP_ROUTE_PREFIXES.WORKSPACE.slice(1),
] as const;

const ORG_SCOPED_PREFIXES = [APP_ROUTE_PREFIXES.SETTINGS.slice(1)] as const;

const FLAT_PATH_REDIRECTS = new Map<string, string>([
  [APP_ROUTES.ANALYTICS.ROOT, APP_ROUTES.ANALYTICS.OVERVIEW],
  [APP_ROUTES.AUTOMATE.ROOT, APP_ROUTES.AUTOMATE.OVERVIEW],
  [APP_ROUTES.LIBRARY.ROOT, APP_ROUTES.LIBRARY.ASSETS],
  [APP_ROUTES.LIBRARY.OVERVIEW, APP_ROUTES.LIBRARY.ASSETS],
  [APP_ROUTES.DISCOVER.ROOT, APP_ROUTES.DISCOVER.OVERVIEW],
  [APP_ROUTES.DISCOVER.DISCOVERY, APP_ROUTES.DISCOVER.OVERVIEW],
  [APP_ROUTES.STUDIO.ROOT, APP_ROUTES.STUDIO.GENERATE],
  [LEGACY_APP_ROUTES.TASKS, APP_ROUTES.WORKSPACE.TASKS],
  [APP_ROUTES.WORKSPACE.ROOT, APP_ROUTES.WORKSPACE.OVERVIEW],
  [APP_ROUTES.WORKSPACE.INBOX, APP_ROUTES.WORKSPACE.INBOX_UNREAD],
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

/**
 * Slug segments are alphanumeric + hyphens (Demo brand `FUDNEWS` is uppercase).
 * Reject `/`, `//`, and dots so slugs cannot become open redirects.
 */
const SLUG_RE = /^[a-zA-Z0-9][a-zA-Z0-9-]*$/;

function canonicalizeLegacyScopedProtectedPath(
  pathname: string,
): string | null {
  const segments = pathname.split('/').filter(Boolean);
  const [orgSlug, brandSlug, section, taskId] = segments;

  if (
    (segments.length !== 3 && segments.length !== 4) ||
    section !== LEGACY_APP_ROUTES.TASKS.slice(1) ||
    !orgSlug ||
    !brandSlug ||
    !SLUG_RE.test(orgSlug) ||
    !SLUG_RE.test(brandSlug)
  ) {
    return null;
  }

  const taskPath = taskId ? `/${taskId}` : '';
  return createBrandAppRoute(
    orgSlug,
    brandSlug,
    `${APP_ROUTES.WORKSPACE.TASKS}${taskPath}`,
  );
}

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

/**
 * Bounce an unauthenticated request to `/login`, preserving the route the user
 * was actually heading to as a `callbackUrl` param so the login flow returns
 * them there after auth.
 *
 * Finding #25: the previous `redirectPreservingSearch(req, '/login')` copied the
 * protected route's *query string* onto `/login` but dropped its *pathname*, so
 * every cold-compile bounce lost the destination and stranded the user on the
 * seeded workspace after sign-in. The destination is the original pathname +
 * search; `callbackUrl` is the exact param the login surface consumes
 * (`getAuthCallbackURL` reads `callbackUrl` | `return_to` | `redirect_url`).
 *
 * `resolveAuthContinuation` applies the product-route allowlist at the source.
 * Better Auth later returns to the fixed root callback; this value is carried
 * as data and consumed only after the new session is confirmed.
 */
function redirectToLoginPreservingDestination(req: NextRequest) {
  const url = createSafeRedirectUrl(req, '/login');
  const { pathname, search } = req.nextUrl;
  const destination = `${pathname}${search}`;
  const continuation = resolveAuthContinuation(
    pathname === APP_ROUTES.ROOT
      ? req.nextUrl.searchParams.get('callbackUrl') ||
          req.nextUrl.searchParams.get('return_to') ||
          req.nextUrl.searchParams.get('redirect_url')
      : destination,
  );
  if (continuation?.startsWith('/') && continuation !== '/') {
    url.searchParams.set('callbackUrl', continuation);
  }
  return NextResponse.redirect(url);
}

function getTopLevelSegment(pathname: string): string | null {
  const [segment] = pathname.split('/').filter(Boolean);
  return segment ?? null;
}

function isValidSlug(slug: string | undefined): slug is string {
  return typeof slug === 'string' && SLUG_RE.test(slug);
}

function isValidWorkspaceOrgSlug(slug: string | undefined): slug is string {
  if (!isValidSlug(slug)) {
    return false;
  }

  return parseScopedAppPath(`/${slug}/~`).orgSlug === slug;
}

function isBareProtectedPath(pathname: string): boolean {
  const topLevelSegment = getTopLevelSegment(pathname);

  if (!topLevelSegment) {
    return false;
  }

  if (topLevelSegment === 'settings') {
    return !isPersonalSettingsPath(pathname);
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

function getApiNamespacePoisonedProtectedPath(pathname: string): string | null {
  const [namespace, staleBrandSlug, ...rest] = pathname
    .split('/')
    .filter(Boolean);
  if (namespace !== 'api' || !staleBrandSlug || rest.length === 0) {
    return null;
  }

  const protectedPath = `/${rest.join('/')}`;
  return isBareProtectedPath(protectedPath) ? protectedPath : null;
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
    if (!isValidWorkspaceOrgSlug(parsed.s.orgSlug)) return null;
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

  if (!isValidWorkspaceOrgSlug(entry.slugs.orgSlug)) {
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

type WorkspaceSlugResolutionOptions = {
  preferAvailableBrand?: boolean;
  skipSlugCookie?: boolean;
};

function slugsFromPathname(pathname: string): WorkspaceSlugs | null {
  const scope = parseScopedAppPath(pathname);
  if (!scope.orgSlug || !isValidWorkspaceOrgSlug(scope.orgSlug)) {
    return null;
  }
  if (scope.brandSlug && !isValidSlug(scope.brandSlug)) {
    return null;
  }

  return {
    brandCount: scope.brandSlug ? 1 : 0,
    brandSlug: scope.brandSlug || undefined,
    orgSlug: scope.orgSlug,
  };
}

function resolveRefererWorkspaceSlugs(
  req?: NextRequest,
): WorkspaceSlugs | null {
  if (!req) {
    return null;
  }

  const referer = req.headers.get('referer');
  if (!referer) {
    return null;
  }

  try {
    const parsed = new URL(referer);
    const requestOrigin = req.nextUrl.origin ?? new URL(req.url).origin;
    if (parsed.origin !== requestOrigin) {
      return null;
    }

    return slugsFromPathname(parsed.pathname);
  } catch {
    return null;
  }
}

function resolveAppRouterSourceWorkspaceSlugs(
  req: NextRequest,
): WorkspaceSlugs | null {
  const refererSlugs = resolveRefererWorkspaceSlugs(req);
  if (refererSlugs) {
    return refererSlugs;
  }

  // Next's client router does not consistently expose the browser-generated
  // Referer through Request.headers. It does send the mounted route as the
  // relative `next-url` header on RSC fetches, which is the actual shell the
  // transition originated from. Keep this deliberately relative: an absolute
  // or protocol-relative value must not be treated as a trusted app route.
  const nextUrl = req.headers.get('next-url');
  if (!nextUrl?.startsWith('/') || nextUrl.startsWith('//')) {
    return null;
  }

  try {
    return slugsFromPathname(new URL(nextUrl, req.url).pathname);
  } catch {
    return null;
  }
}

async function continueWithCurrentWorkspace(
  req: NextRequest,
  cacheKey?: string | null,
): Promise<NextResponse> {
  const slugs = slugsFromPathname(req.nextUrl.pathname);
  if (!slugs) {
    return NextResponse.next();
  }

  writeWorkspaceSlugCache(cacheKey, slugs);
  const cookieValue = await encodeSlugCookie(slugs);
  const response = NextResponse.next();
  if (cookieValue) {
    setSlugCookie(response, cookieValue);
  }
  return response;
}

/**
 * Either a bootstrap payload or the fact that the API did not give us one.
 * Kept distinct so a successful response with a null body still falls through
 * to the organizations lookup, as an unmemoised fetch did.
 */
type BootstrapRead =
  | { bootstrap: BootstrapResponse | null; isAvailable: true }
  | { isAvailable: false };

const UNAVAILABLE_BOOTSTRAP: BootstrapRead = { isAvailable: false };

/**
 * One `/auth/bootstrap` read per proxy invocation.
 *
 * Onboarding gating and workspace-slug resolution both need the same payload,
 * and a single protected navigation runs both, so every such request used to
 * wait on that round trip twice before it could redirect. Memoising on the
 * request object scopes the payload to one invocation without holding it past
 * the request that fetched it; keying the inner map on the bearer token keeps
 * a request that swaps tokens from reading another token's workspace.
 */
const bootstrapByRequest = new WeakMap<
  NextRequest,
  Map<string, Promise<BootstrapRead>>
>();

async function fetchBootstrap(token: string): Promise<BootstrapRead> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/auth/bootstrap`, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      return UNAVAILABLE_BOOTSTRAP;
    }

    return {
      bootstrap: (await response.json()) as BootstrapResponse | null,
      isAvailable: true,
    };
  } catch {
    return UNAVAILABLE_BOOTSTRAP;
  }
}

function readBootstrap(
  token: string,
  req?: NextRequest,
): Promise<BootstrapRead> {
  if (!req) {
    return fetchBootstrap(token);
  }

  let byToken = bootstrapByRequest.get(req);

  if (!byToken) {
    byToken = new Map();
    bootstrapByRequest.set(req, byToken);
  }

  const inFlight = byToken.get(token);

  if (inFlight) {
    return inFlight;
  }

  const pending = fetchBootstrap(token);
  byToken.set(token, pending);
  return pending;
}

async function resolveActiveWorkspaceSlugs(
  token: string,
  cacheKey?: string | null,
  req?: NextRequest,
  options?: WorkspaceSlugResolutionOptions,
): Promise<SlugResolution | null> {
  const preferAvailableBrand = options?.preferAvailableBrand === true;
  const skipSlugCookie = options?.skipSlugCookie === true;
  // Root/login recovery must come from the authenticated bootstrap. A scoped
  // request, referrer, in-memory entry, or signed cookie proves only that the
  // slug was syntactically valid when it was recorded; it does not prove the
  // current session still belongs to that workspace. Letting one of those
  // sources win here can permanently redirect `/` into an unauthorized scope.
  const mayReuseCurrentWorkspace = !preferAvailableBrand;
  const fromRequestPath =
    req && !skipSlugCookie ? slugsFromPathname(req.nextUrl.pathname) : null;
  if (mayReuseCurrentWorkspace && fromRequestPath) {
    const cookieValue = await encodeSlugCookie(fromRequestPath);
    return { cookieValue, slugs: fromRequestPath };
  }

  const fromReferer = resolveRefererWorkspaceSlugs(req);
  if (mayReuseCurrentWorkspace && fromReferer) {
    const cookieValue = await encodeSlugCookie(fromReferer);
    return { cookieValue, slugs: fromReferer };
  }

  const cached = skipSlugCookie ? null : readWorkspaceSlugCache(cacheKey);
  if (mayReuseCurrentWorkspace && cached) {
    return { cookieValue: null, slugs: cached };
  }

  if (mayReuseCurrentWorkspace && req && !skipSlugCookie) {
    const cookieRaw = req.cookies.get(WORKSPACE_SLUG_COOKIE_NAME)?.value;
    if (cookieRaw) {
      const fromCookie = await decodeSlugCookie(cookieRaw);
      if (fromCookie) {
        writeWorkspaceSlugCache(cacheKey, fromCookie);
        return { cookieValue: null, slugs: fromCookie };
      }
    }
  }

  const bootstrapRead = await readBootstrap(token, req);

  if (!bootstrapRead.isAvailable) {
    return null;
  }

  const bootstrap = bootstrapRead.bootstrap;
  const brands = bootstrap?.brands ?? [];
  const activeBrandId = bootstrap?.access?.brandId ?? '';
  const matchedBrand = activeBrandId
    ? brands.find((brand) => brand.id === activeBrandId)
    : undefined;
  const resolvedBrand =
    activeBrandId && matchedBrand?.slug
      ? matchedBrand
      : activeBrandId || preferAvailableBrand
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
        `${getApiBaseUrl()}/organizations?mine=true`,
        {
          cache: 'no-store',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
          },
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
  if (
    !isValidWorkspaceOrgSlug(orgSlug) ||
    (brandSlug && !SLUG_RE.test(brandSlug))
  ) {
    return null;
  }

  const slugs = { brandCount: brands.length, brandSlug, orgSlug };
  writeWorkspaceSlugCache(cacheKey, slugs);
  const cookieValue = await encodeSlugCookie(slugs);
  return { cookieValue, slugs };
}

type OnboardingRedirectState = {
  completedSteps: string[];
  shouldRedirect: boolean;
};

async function readOnboardingRedirectState(
  token: string,
  req?: NextRequest,
): Promise<OnboardingRedirectState> {
  const bootstrapRead = await readBootstrap(token, req);

  if (!bootstrapRead.isAvailable) {
    return { completedSteps: [], shouldRedirect: false };
  }

  const bootstrap = bootstrapRead.bootstrap;

  const completedSteps = Array.isArray(
    bootstrap?.currentUser?.onboardingStepsCompleted,
  )
    ? (bootstrap.currentUser.onboardingStepsCompleted as string[])
    : [];

  if (
    bootstrap?.access?.isOnboardingCompleted === true ||
    bootstrap?.currentUser?.isOnboardingCompleted === true
  ) {
    return { completedSteps, shouldRedirect: false };
  }

  if (!bootstrap?.currentUser) {
    return { completedSteps, shouldRedirect: false };
  }

  return {
    completedSteps,
    shouldRedirect: !ONBOARDING_STEPS.every((step) =>
      completedSteps.includes(step),
    ),
  };
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
): Promise<{
  cookieValue: string | null;
  orgSlug: string;
  path: string;
} | null> {
  const resolution = await resolveActiveWorkspaceSlugs(token, cacheKey, req, {
    skipSlugCookie: true,
  });
  if (!resolution) {
    return null;
  }

  const { cookieValue, slugs } = resolution;
  return {
    cookieValue,
    orgSlug: slugs.orgSlug,
    path: `/${slugs.orgSlug}/~/agent/onboarding`,
  };
}

function getAgentOnboardingOrgSlug(pathname: string): string | null {
  const match = pathname.match(/^\/([^/]+)\/~\/agent\/onboarding(?:\/|$)/);
  return match?.[1] ?? null;
}

// Wizard routes that stay reachable in every mode. `post-signup` owns the
// provisioning handoff (including the managed-checkout return), and `proactive`
// is a standalone prompt surface rather than a step of the classic journey.
const MODE_AGNOSTIC_ONBOARDING_PATHS = [
  APP_ROUTES.ONBOARDING.POST_SIGNUP,
  APP_ROUTES.ONBOARDING.PROACTIVE,
] as const;

/**
 * True for a classic wizard path that an agent-first mode should never render.
 */
function isClassicWizardPath(pathname: string): boolean {
  if (!hasAgentFirstOnboarding()) {
    return false;
  }

  // Shared brand setup stays reachable on every surface, including after
  // Skip completes the onboarding gate so the operator can come back.
  if (isSharedBrandOnboardingPath(pathname)) {
    return false;
  }

  if (
    MODE_AGNOSTIC_ONBOARDING_PATHS.some(
      (path) => pathname === path || pathname.startsWith(`${path}/`),
    )
  ) {
    return false;
  }

  return (
    pathname === ONBOARDING_PATH || pathname.startsWith(`${ONBOARDING_PATH}/`)
  );
}

/**
 * Send a signed-in agent-first user from the classic wizard to the agent
 * onboarding surface. Returns null when the workspace slug cannot be resolved,
 * so the caller renders the wizard rather than bouncing to a broken path.
 */
async function redirectSignedInUserToAgentOnboarding(
  req: NextRequest,
  token: string,
  cacheKey?: string | null,
): Promise<NextResponse | null> {
  const onboardingState = await readOnboardingRedirectState(token, req);
  if (!hasCompletedBrandOnboardingStep(onboardingState.completedSteps)) {
    if (!onboardingState.shouldRedirect) {
      return null;
    }
    return redirectDroppingSearch(req, APP_ROUTES.ONBOARDING.BRAND);
  }

  const agentOnboarding = await resolveAgentOnboardingRedirect(
    token,
    cacheKey,
    req,
  );
  if (!agentOnboarding) {
    return null;
  }

  const response = redirectDroppingSearch(req, agentOnboarding.path);
  if (agentOnboarding.cookieValue) {
    setSlugCookie(response, agentOnboarding.cookieValue);
  }

  return response;
}

type CanonicalResolution = {
  cookieValue: string | null;
  path: string;
};

const ORG_ROOT_APP_PREFIXES = [
  'analytics',
  'agent',
  'discover',
  'library',
  'publish',
  'settings',
  'studio',
  'workspace',
] as const;

function createOrgScopedCanonicalPath(
  canonicalPath: string,
  orgSlug: string,
): string {
  const topLevelSegment = getTopLevelSegment(canonicalPath);

  if (topLevelSegment === 'overview') {
    return `/${orgSlug}/~/workspace/overview`;
  }

  // Automate has one org-scoped surface — the cross-brand overview. Deeper
  // automation paths are brand-scoped, so they collapse onto that overview
  // rather than falling into the org catch-all and 404ing.
  if (topLevelSegment === 'automate') {
    return `/${orgSlug}/~/automate`;
  }

  if (
    topLevelSegment &&
    ORG_ROOT_APP_PREFIXES.includes(
      topLevelSegment as (typeof ORG_ROOT_APP_PREFIXES)[number],
    )
  ) {
    return `/${orgSlug}/~${canonicalPath}`;
  }

  return `/${orgSlug}/~/workspace/overview`;
}

async function resolveCanonicalProtectedPath(
  pathname: string,
  token: string,
  cacheKey?: string | null,
  req?: NextRequest,
  options?: WorkspaceSlugResolutionOptions,
): Promise<CanonicalResolution | null> {
  const canonicalPath = canonicalizeFlatProtectedPath(pathname);
  const resolution = await resolveActiveWorkspaceSlugs(
    token,
    cacheKey,
    req,
    options,
  );

  if (!resolution) {
    return null;
  }

  const { cookieValue, slugs } = resolution;
  const topLevelSegment = getTopLevelSegment(canonicalPath);

  if (topLevelSegment === 'settings') {
    if (isPersonalSettingsPath(canonicalPath)) {
      if (canonicalPath === APP_ROUTES.SETTINGS.ROOT) {
        return { cookieValue, path: APP_ROUTES.SETTINGS.PERSONAL };
      }

      return { cookieValue, path: canonicalPath };
    }

    if (canonicalPath === APP_ROUTES.SETTINGS.GENERAL) {
      return {
        cookieValue,
        path: `/${slugs.orgSlug}/~${APP_ROUTES.SETTINGS.GENERAL}`,
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

/**
 * Public (no-session) routes under the Better Auth guard. Unlike the keyless
 * self-hosted branch, /login, /sign-up, password reset, and /logout are real
 * auth pages here. /oauth/* are integration callbacks and must never be gated.
 */
function isBetterAuthPublicRoute(pathname: string): boolean {
  return (
    pathname.startsWith('/login') ||
    pathname === '/desktop/local' ||
    pathname.startsWith('/desktop/local/') ||
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

/**
 * Product continuation from `callbackUrl` / `return_to` / `redirect_url`.
 * Absolute web URLs, runtime paths, and auth-loop routes are rejected by the
 * shared resolver.
 */
function getSafeSignedInCallbackPath(req: NextRequest): string | null {
  const raw =
    req.nextUrl.searchParams.get('callbackUrl') ||
    req.nextUrl.searchParams.get('return_to') ||
    req.nextUrl.searchParams.get('redirect_url');

  if (!raw) {
    return null;
  }

  const continuation = resolveAuthContinuation(raw);
  return continuation?.startsWith('/') && continuation !== '/'
    ? continuation
    : null;
}

async function redirectSignedInUserToDefaultRoute(
  req: NextRequest,
  token: string,
  cacheKey?: string | null,
  isDesktopSurface = false,
): Promise<NextResponse | null> {
  // Prefer an explicit post-auth destination from session restore through
  // /login?callbackUrl=…. Do this before onboarding defaulting
  // so deep links like /settings/credits survive a cold reload.
  const callbackPath = getSafeSignedInCallbackPath(req);
  if (callbackPath) {
    return NextResponse.redirect(createSafeRedirectUrl(req, callbackPath));
  }

  const onboardingState = await readOnboardingRedirectState(token, req);
  if (onboardingState.shouldRedirect) {
    if (!isDesktopSurface && hasAgentFirstOnboarding()) {
      if (!hasCompletedBrandOnboardingStep(onboardingState.completedSteps)) {
        return redirectDroppingSearch(req, APP_ROUTES.ONBOARDING.BRAND);
      }

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
    APP_ROUTES.WORKSPACE.OVERVIEW,
    token,
    cacheKey,
    req,
    { preferAvailableBrand: true },
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

/**
 * `/serwist/*` serves the compiled service worker (and its source map);
 * `/~offline` is the precached offline shell. Both are static, session-free,
 * and identical for every visitor.
 */
function isServiceWorkerRoute(pathname: string): boolean {
  return pathname === '/~offline' || pathname.startsWith('/serwist/');
}

/**
 * Client App Router transitions already originate inside an authenticated,
 * scoped shell. Let Next serve their RSC payload without blocking on the
 * token -> bootstrap network waterfall. Full entries, bare-route
 * canonicalization, and mutations keep the strict validation path below.
 * Page data and actions remain authorized at their server/API boundaries.
 */
function isScopedAppRouterTransition(req: NextRequest): boolean {
  return (
    req.method === 'GET' &&
    req.headers.get('rsc') === '1' &&
    req.headers.get('next-action') === null &&
    slugsFromPathname(req.nextUrl.pathname) !== null &&
    resolveAppRouterSourceWorkspaceSlugs(req) !== null
  );
}

interface BetterAuthRoutingOptions {
  isDesktopSurface?: boolean;
  preferredBearerToken?: string | null;
}

async function routeBetterAuthRequest(
  req: NextRequest,
  options: BetterAuthRoutingOptions = {},
): Promise<NextResponse> {
  const { pathname } = req.nextUrl;
  const sessionCookie = getBetterAuthSessionCookie(req);
  const hasSession = Boolean(sessionCookie);
  const isDesktopOnboardingRoute =
    options.isDesktopSurface === true && pathname.startsWith('/onboarding');

  if (pathname.startsWith('/logout')) {
    const response = NextResponse.next();
    deleteSlugCookie(response);
    return response;
  }

  if (isDesktopOnboardingRoute) {
    if (
      pathname === APP_ROUTES.ONBOARDING.BRAND ||
      pathname === APP_ROUTES.ONBOARDING.PROVIDERS
    ) {
      return NextResponse.next();
    }

    return hasSession
      ? NextResponse.next()
      : redirectToLoginPreservingDestination(req);
  }

  if (isBetterAuthPublicRoute(pathname)) {
    if (hasSession && pathname.startsWith('/login')) {
      const token =
        options.preferredBearerToken ?? (await getBetterAuthBearerToken(req));
      let response = token
        ? await redirectSignedInUserToDefaultRoute(
            req,
            token,
            sessionCookie,
            options.isDesktopSurface,
          )
        : null;

      if (!response && options.preferredBearerToken) {
        const fallbackToken = await getBetterAuthBearerToken(req);
        response = fallbackToken
          ? await redirectSignedInUserToDefaultRoute(
              req,
              fallbackToken,
              sessionCookie,
              options.isDesktopSurface,
            )
          : null;
      }

      if (response) {
        return response;
      }
    }

    // `/onboarding/*` is public so a half-provisioned signup can reach it.
    // `/onboarding/brand` is the shared brand step and stays reachable.
    // Other classic wizard paths still bounce agent-first users to the
    // agent surface after brand is confirmed.
    if (hasSession && isClassicWizardPath(pathname)) {
      const token = await getBetterAuthBearerToken(req);
      const response = token
        ? await redirectSignedInUserToAgentOnboarding(req, token, sessionCookie)
        : null;

      if (response) {
        return response;
      }
    }

    return NextResponse.next();
  }

  if (!hasSession) {
    return redirectToLoginPreservingDestination(req);
  }

  if (isScopedAppRouterTransition(req)) {
    return continueWithCurrentWorkspace(req, sessionCookie);
  }

  const token =
    options.preferredBearerToken ?? (await getBetterAuthBearerToken(req));
  if (!token) {
    return redirectToLoginPreservingDestination(req);
  }

  // Better Auth always returns browser sign-ins to `/`. A validated product
  // continuation is carried as data on that fixed callback and consumed only
  // after the session token has been confirmed here.
  const callbackPath =
    pathname === APP_ROUTES.ROOT ? getSafeSignedInCallbackPath(req) : null;
  if (callbackPath) {
    return NextResponse.redirect(createSafeRedirectUrl(req, callbackPath));
  }

  // Desktop stays exempt from proxy-driven onboarding redirects: a
  // cloud-connected desktop user is not routed into web onboarding.
  // Onboarding on desktop is reached through `/onboarding`, which the
  // session gate above already protects. Skip the bootstrap fetch entirely
  // on desktop — do not pay it only to ignore shouldRedirect.
  if (options.isDesktopSurface !== true) {
    const onboardingState = await readOnboardingRedirectState(token, req);
    if (onboardingState.shouldRedirect) {
      if (!hasAgentFirstOnboarding()) {
        return redirectPreservingSearch(req, ONBOARDING_PATH);
      }

      const hasBrand = hasCompletedBrandOnboardingStep(
        onboardingState.completedSteps,
      );

      if (!hasBrand) {
        return redirectPreservingSearch(req, APP_ROUTES.ONBOARDING.BRAND);
      }

      // The agent onboarding surface is itself a protected route — stay there
      // after brand exists. If the URL org is a leftover stub (or a stale slug
      // cookie), move the user onto their membership org.
      if (isAgentOnboardingPath(pathname)) {
        const agentOnboarding = await resolveAgentOnboardingRedirect(
          token,
          sessionCookie,
          req,
        );
        const pathOrgSlug = getAgentOnboardingOrgSlug(pathname);
        if (
          agentOnboarding &&
          pathOrgSlug &&
          pathOrgSlug !== agentOnboarding.orgSlug
        ) {
          const rest = pathname.replace(/^\/[^/]+/, '');
          const response = redirectPreservingSearch(
            req,
            `/${agentOnboarding.orgSlug}${rest}`,
          );
          if (agentOnboarding.cookieValue) {
            setSlugCookie(response, agentOnboarding.cookieValue);
          }
          return response;
        }

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
  }

  const recoveredProtectedPath = getApiNamespacePoisonedProtectedPath(pathname);
  if (recoveredProtectedPath) {
    const resolved = await resolveCanonicalProtectedPath(
      recoveredProtectedPath,
      token,
      sessionCookie,
      req,
      { skipSlugCookie: true },
    );

    if (resolved) {
      const response = redirectPreservingSearch(req, resolved.path);
      if (resolved.cookieValue) {
        setSlugCookie(response, resolved.cookieValue);
      }
      return response;
    }
  }

  if (pathname === '/') {
    let resolved = await resolveCanonicalProtectedPath(
      APP_ROUTES.WORKSPACE.OVERVIEW,
      token,
      sessionCookie,
      req,
      { preferAvailableBrand: true },
    );

    if (!resolved && options.preferredBearerToken) {
      const fallbackToken = await getBetterAuthBearerToken(req);
      resolved = fallbackToken
        ? await resolveCanonicalProtectedPath(
            APP_ROUTES.WORKSPACE.OVERVIEW,
            fallbackToken,
            sessionCookie,
            req,
            { preferAvailableBrand: true },
          )
        : null;
    }

    if (!resolved) {
      return NextResponse.next();
    }

    const response = redirectPreservingSearch(req, resolved.path);
    if (resolved.cookieValue) {
      setSlugCookie(response, resolved.cookieValue);
    }
    return response;
  }

  if (pathname === APP_ROUTES.SETTINGS.ROOT) {
    return redirectPreservingSearch(req, APP_ROUTES.SETTINGS.PERSONAL);
  }

  if (isBareProtectedPath(pathname)) {
    let resolved = await resolveCanonicalProtectedPath(
      pathname,
      token,
      sessionCookie,
      req,
    );

    if (!resolved && options.preferredBearerToken) {
      const fallbackToken = await getBetterAuthBearerToken(req);
      resolved = fallbackToken
        ? await resolveCanonicalProtectedPath(
            pathname,
            fallbackToken,
            sessionCookie,
            req,
          )
        : null;
    }

    if (resolved) {
      const response = redirectPreservingSearch(req, resolved.path);
      if (resolved.cookieValue) {
        setSlugCookie(response, resolved.cookieValue);
      }
      return response;
    }

    return continueWithCurrentWorkspace(req, sessionCookie);
  }

  return continueWithCurrentWorkspace(req, sessionCookie);
}

export async function proxy(req: NextRequest) {
  // These same-origin API routes must reach their route/rewrite without
  // entering app-page auth or workspace slug routing.
  if (
    req.nextUrl.pathname === '/api/version' ||
    req.nextUrl.pathname === '/v1' ||
    req.nextUrl.pathname.startsWith('/v1/')
  ) {
    return NextResponse.next();
  }

  const minimumVersionResponse = enforceMinimumDesktopVersion(req);
  if (minimumVersionResponse) {
    return minimumVersionResponse;
  }

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

  // Service worker assets and the offline shell must never be auth-gated. The
  // shell is precached at install time, and a redirect to /login would be
  // cached in its place — the offline fallback would then render a login page
  // to a signed-in user with no network.
  if (isServiceWorkerRoute(req.nextUrl.pathname)) {
    return NextResponse.next();
  }

  if (isPlaywrightBypassRequest(req)) {
    return NextResponse.next();
  }

  const canonicalLegacyPath = canonicalizeLegacyScopedProtectedPath(
    req.nextUrl.pathname,
  );
  if (canonicalLegacyPath) {
    return redirectPreservingSearch(req, canonicalLegacyPath);
  }

  if (isDesktopSurfaceRequest(req)) {
    const desktopToken =
      req.headers.get(DESKTOP_HTTP_HEADERS.token)?.trim() || null;

    return routeBetterAuthRequest(req, {
      isDesktopSurface: true,
      preferredBearerToken: desktopToken,
    });
  }

  if (!isBetterAuthEnabled()) {
    const { pathname } = req.nextUrl;

    if (pathname === '/') {
      return redirectDroppingSearch(req, SEEDED_WORKSPACE_PATH);
    }

    if (isSeededWorkspaceEntrypoint(pathname)) {
      return redirectPreservingSearch(req, SEEDED_WORKSPACE_PATH);
    }

    return NextResponse.next();
  }

  if (isBetterAuthEnabled()) {
    return routeBetterAuthRequest(req);
  }

  return NextResponse.next();
}

export default proxy;

export const config = {
  matcher: [
    '/((?!_next|serwist(?:/|$)|v1(?:/|$)|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|xml|txt)).*)',
    '/(api|trpc)(.*)',
  ],
};
