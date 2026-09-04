/**
 * Product-route inventory and classification drift guard.
 *
 * Protected routes are classified at their trusted runtime registration in the
 * workspace-shell registry. Public app and website routes are classified here,
 * in a CI-only data registry, so neither Next.js bundle depends on the other.
 *
 * The guard compares both sides:
 * - every discovered page must be registered and classified;
 * - every classified route must still be backed by a page or an explicit
 *   organization catch-all expansion;
 * - hard-cut pages and catch-all expansions must remain explicit.
 */
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROTECTED_ROUTE_INVENTORY } from '../../apps/app/src/lib/workspace-shell/workspace-shell-registry';

export type PublicRouteApplication = 'app' | 'website';

export type PublicRouteProductClass =
  | 'authentication'
  | 'legal'
  | 'marketing'
  | 'onboarding'
  | 'public-content'
  // Shells the runtime serves rather than pages a user navigates to — the
  // service worker's offline fallback is the only one today.
  | 'system'
  | 'transactional';

export type PublicRouteClassification = {
  readonly application: PublicRouteApplication;
  readonly canonicalUrl: string;
  readonly productClass: PublicRouteProductClass;
};

export type DiscoveredPublicRoute = Pick<
  PublicRouteClassification,
  'application' | 'canonicalUrl'
>;

export type ProductRouteInventoryReport = {
  readonly appPublicRouteCount: number;
  readonly issues: readonly string[];
  readonly protectedPageCount: number;
  readonly protectedRouteCount: number;
  readonly publicRouteCount: number;
  readonly websitePublicRouteCount: number;
};

type ProductRouteInventoryInputs = {
  readonly catchAllExpansions: readonly string[];
  readonly catchAllPage: string;
  readonly discoveredProtectedRoutes: readonly string[];
  readonly discoveredPublicRoutes: readonly DiscoveredPublicRoute[];
  readonly hardCutPages: readonly string[];
  readonly hardCutPrefixes: readonly string[];
  readonly protectedRoutes: readonly {
    readonly canonicalUrl: string;
    readonly productClass: string;
  }[];
  readonly publicRoutes: readonly PublicRouteClassification[];
};

type RunCheckProductRouteInventoryOptions = {
  readonly rootDir?: string;
};

const APP_DIRECTORY = 'apps/app/app';
const PROTECTED_APP_DIRECTORY = `${APP_DIRECTORY}/(protected)`;
const WEBSITE_DIRECTORY = 'apps/website/app';

export const ORGANIZATION_CATCH_ALL_PAGE = '/:orgSlug/~/:orgRootApp/*segments?';

export const ORGANIZATION_CATCH_ALL_EXPANSIONS = Object.freeze([
  '/:orgSlug/~/library',
  '/:orgSlug/~/library/:type',
  '/:orgSlug/~/library/shelf/:shelf',
  '/:orgSlug/~/studio/edit',
  '/:orgSlug/~/studio/edit/projects',
  '/:orgSlug/~/studio/edit/new',
  '/:orgSlug/~/studio/edit/:id',
  '/:orgSlug/~/publishing',
  '/:orgSlug/~/publishing/overview',
  '/:orgSlug/~/publishing/posts',
  '/:orgSlug/~/publishing/posts/:id',
  '/:orgSlug/~/publishing/calendar',
  '/:orgSlug/~/publishing/content',
  '/:orgSlug/~/publishing/review',
  '/:orgSlug/~/publishing/campaigns',
  '/:orgSlug/~/publishing/campaigns/new',
  '/:orgSlug/~/publishing/campaigns/compare',
  '/:orgSlug/~/publishing/campaigns/:id',
  '/:orgSlug/~/publishing/campaigns/:id/content',
  '/:orgSlug/~/publishing/campaigns/:id/calendar',
  '/:orgSlug/~/publishing/campaigns/:id/performance',
  '/:orgSlug/~/publishing/campaigns/:id/ads',
  '/:orgSlug/~/publishing/campaigns/:id/edit',
] as const);

export const PROTECTED_HARD_CUT_PREFIXES = Object.freeze([
  '/:orgSlug/~/settings/organization',
] as const);

export const PROTECTED_HARD_CUT_PAGES = Object.freeze([
  '/:orgSlug/~/settings/organization',
  '/:orgSlug/~/settings/organization/api-keys',
  // `billing` is a sidebar group, not a page. Credits, Subscription, and Usage
  // are the real destinations, so the route and its redirects were deleted.
  '/:orgSlug/~/settings/organization/credits',
  '/:orgSlug/~/settings/organization/policy',
  '/:orgSlug/~/settings/organization/webhooks',
] as const);

function classifyPublicRoutes(
  application: PublicRouteApplication,
  productClass: PublicRouteProductClass,
  canonicalUrls: readonly string[],
): readonly PublicRouteClassification[] {
  return canonicalUrls.map((canonicalUrl) =>
    Object.freeze({ application, canonicalUrl, productClass }),
  );
}

export const PUBLIC_ROUTE_CLASSIFICATION_REGISTRY = Object.freeze([
  ...classifyPublicRoutes('app', 'authentication', [
    '/agent-auth/claim',
    '/forgot-password',
    '/login',
    '/login/magic-link',
    '/login/password',
    '/logout',
    '/oauth/:platform',
    '/oauth/cli',
    '/oauth/consent',
    '/reset-password',
    '/sign-up',
    '/sign-up/magic-link',
  ] as const),
  ...classifyPublicRoutes('app', 'onboarding', [
    '/onboarding',
    '/onboarding/brand',
    '/onboarding/post-signup',
    '/onboarding/proactive',
    '/onboarding/providers',
    '/onboarding/success',
    '/onboarding/summary',
  ] as const),
  // Runtime-owned shells rather than ordinary public destinations. The
  // service worker renders /~offline after failed navigation; Electron owns
  // /desktop/local and exposes it only after explicit local-mode selection.
  ...classifyPublicRoutes('app', 'system', [
    '/desktop/local',
    '/~offline',
  ] as const),
  ...classifyPublicRoutes('app', 'transactional', [
    '/managed-credits/success',
  ] as const),
  ...classifyPublicRoutes('website', 'marketing', [
    '/',
    '/:slug',
    '/about',
    '/agent',
    '/analytics',
    '/brand-os',
    '/calendar',
    '/cloud',
    '/contact',
    '/demo',
    '/developers',
    '/dfy',
    '/done-for-you',
    '/download',
    '/faq',
    '/features',
    '/fleet',
    '/founder-content',
    '/gen',
    '/hire-agents',
    '/integrations',
    '/integrations/:slug',
    '/launch-content',
    '/library',
    '/linkedin-content',
    '/models',
    '/podcast-to-content',
    '/pricing',
    '/publishing',
    '/research',
    '/retainer',
    '/self-hosted',
    '/services',
    '/sitemap',
    '/skills',
    '/studio',
    '/tools',
    '/tools/youtube-clips',
    '/tools/youtube-long-form',
    '/use-cases',
    '/use-cases/:slug',
    '/vs',
    '/vs/:slug',
    '/workflows',
  ] as const),
  ...classifyPublicRoutes('website', 'public-content', [
    '/articles',
    '/articles/:slug',
    '/articles/:slug/preview',
    '/posts',
    '/posts/:id',
    '/u/:handle',
  ] as const),
  ...classifyPublicRoutes('website', 'legal', ['/privacy', '/terms'] as const),
  ...classifyPublicRoutes('website', 'transactional', [
    '/skills/success',
  ] as const),
] as const satisfies readonly PublicRouteClassification[]);

const PROTECTED_PRODUCT_CLASSES = new Set([
  'compatibility-only',
  'contextual-action',
  'control-plane',
  'removable',
  'visual-data',
]);

function normalizePath(filePath: string): string {
  return filePath.replaceAll('\\', '/');
}

function collectPageFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return collectPageFiles(entryPath);
    }

    return entry.name === 'page.tsx' || entry.name === 'page.ts'
      ? [entryPath]
      : [];
  });
}

function normalizeNextRouteSegment(segment: string): string | null {
  if (/^\(.+\)$/.test(segment)) {
    return null;
  }

  const optionalCatchAll = segment.match(/^\[\[\.\.\.([^[\]]+)\]\]$/);
  if (optionalCatchAll) {
    return `*${optionalCatchAll[1]}?`;
  }

  const catchAll = segment.match(/^\[\.\.\.([^[\]]+)\]$/);
  if (catchAll) {
    return `*${catchAll[1]}`;
  }

  const dynamic = segment.match(/^\[([^[\]]+)\]$/);
  if (dynamic) {
    return `:${dynamic[1]}`;
  }

  return segment;
}

export function normalizeNextPageRoute(
  appDirectory: string,
  pageFile: string,
): string {
  const segments = normalizePath(
    path.relative(appDirectory, path.dirname(pageFile)),
  )
    .split('/')
    .filter(Boolean)
    .map(normalizeNextRouteSegment)
    .filter((segment): segment is string => segment !== null);

  return segments.length === 0 ? '/' : `/${segments.join('/')}`;
}

function discoverRoutes(appDirectory: string): string[] {
  return collectPageFiles(appDirectory)
    .map((pageFile) => normalizeNextPageRoute(appDirectory, pageFile))
    .sort();
}

function discoverPublicRoutes(rootDir: string): DiscoveredPublicRoute[] {
  const appDirectory = path.join(rootDir, APP_DIRECTORY);
  const protectedDirectory = normalizePath(
    path.join(rootDir, PROTECTED_APP_DIRECTORY),
  );
  const appRoutes = collectPageFiles(appDirectory)
    .filter(
      (pageFile) =>
        !normalizePath(pageFile).startsWith(`${protectedDirectory}/`),
    )
    .map((pageFile) => ({
      application: 'app' as const,
      canonicalUrl: normalizeNextPageRoute(appDirectory, pageFile),
    }));
  const websiteDirectory = path.join(rootDir, WEBSITE_DIRECTORY);
  const websiteRoutes = discoverRoutes(websiteDirectory).map(
    (canonicalUrl) => ({
      application: 'website' as const,
      canonicalUrl,
    }),
  );

  return [...appRoutes, ...websiteRoutes].sort((left, right) =>
    publicRouteKey(left).localeCompare(publicRouteKey(right)),
  );
}

function publicRouteKey(
  route: Pick<PublicRouteClassification, 'application' | 'canonicalUrl'>,
): string {
  return `${route.application}:${route.canonicalUrl}`;
}

function findDuplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  }

  return [...duplicates].sort();
}

function startsWithRoutePrefix(route: string, prefix: string): boolean {
  return route === prefix || route.startsWith(`${prefix}/`);
}

export function compareProductRouteInventories(
  inputs: ProductRouteInventoryInputs,
): readonly string[] {
  const issues: string[] = [];
  const discoveredProtected = new Set(inputs.discoveredProtectedRoutes);
  const hardCutPages = new Set(inputs.hardCutPages);
  const catchAllExpansions = new Set(inputs.catchAllExpansions);
  const protectedRoutePatterns = inputs.protectedRoutes.map(
    (route) => route.canonicalUrl,
  );
  const registeredProtected = new Set(protectedRoutePatterns);
  const expectedProtected = new Set(
    inputs.discoveredProtectedRoutes.filter(
      (route) =>
        route !== inputs.catchAllPage &&
        !inputs.hardCutPrefixes.some((prefix) =>
          startsWithRoutePrefix(route, prefix),
        ),
    ),
  );

  for (const expansion of catchAllExpansions) {
    expectedProtected.add(expansion);
  }

  for (const duplicate of findDuplicates(inputs.discoveredProtectedRoutes)) {
    issues.push(`Duplicate protected page route: ${duplicate}`);
  }
  for (const duplicate of findDuplicates(protectedRoutePatterns)) {
    issues.push(`Duplicate protected registration: ${duplicate}`);
  }
  if (!discoveredProtected.has(inputs.catchAllPage)) {
    issues.push(`Missing organization catch-all page: ${inputs.catchAllPage}`);
  }
  for (const hardCutPage of hardCutPages) {
    if (!discoveredProtected.has(hardCutPage)) {
      issues.push(`Missing protected hard-cut page: ${hardCutPage}`);
    }
  }
  for (const discoveredRoute of discoveredProtected) {
    const matchesHardCut = inputs.hardCutPrefixes.some((prefix) =>
      startsWithRoutePrefix(discoveredRoute, prefix),
    );
    if (matchesHardCut && !hardCutPages.has(discoveredRoute)) {
      issues.push(`Unclassified protected hard-cut page: ${discoveredRoute}`);
    }
  }
  for (const expectedRoute of expectedProtected) {
    if (!registeredProtected.has(expectedRoute)) {
      issues.push(`Missing protected registration: ${expectedRoute}`);
    }
  }
  for (const registeredRoute of registeredProtected) {
    if (!expectedProtected.has(registeredRoute)) {
      issues.push(`Stale protected registration: ${registeredRoute}`);
    }
    if (
      inputs.hardCutPrefixes.some((prefix) =>
        startsWithRoutePrefix(registeredRoute, prefix),
      )
    ) {
      issues.push(`Hard-cut route is registered: ${registeredRoute}`);
    }
  }
  for (const protectedRoute of inputs.protectedRoutes) {
    if (!PROTECTED_PRODUCT_CLASSES.has(protectedRoute.productClass)) {
      issues.push(
        `Invalid protected product class for ${protectedRoute.canonicalUrl}: ${protectedRoute.productClass}`,
      );
    }
  }

  const discoveredPublicKeys =
    inputs.discoveredPublicRoutes.map(publicRouteKey);
  const classifiedPublicKeys = inputs.publicRoutes.map(publicRouteKey);
  const discoveredPublic = new Set(discoveredPublicKeys);
  const classifiedPublic = new Set(classifiedPublicKeys);

  for (const duplicate of findDuplicates(discoveredPublicKeys)) {
    issues.push(`Duplicate public page route: ${duplicate}`);
  }
  for (const duplicate of findDuplicates(classifiedPublicKeys)) {
    issues.push(`Duplicate public classification: ${duplicate}`);
  }
  for (const discoveredRoute of discoveredPublic) {
    if (!classifiedPublic.has(discoveredRoute)) {
      issues.push(`Missing public classification: ${discoveredRoute}`);
    }
  }
  for (const classifiedRoute of classifiedPublic) {
    if (!discoveredPublic.has(classifiedRoute)) {
      issues.push(`Stale public classification: ${classifiedRoute}`);
    }
  }

  return issues.sort();
}

export function runCheckProductRouteInventory(
  options: RunCheckProductRouteInventoryOptions = {},
): ProductRouteInventoryReport {
  const rootDir = options.rootDir ?? process.cwd();
  const discoveredProtectedRoutes = discoverRoutes(
    path.join(rootDir, PROTECTED_APP_DIRECTORY),
  );
  const discoveredPublicRoutes = discoverPublicRoutes(rootDir);
  const issues = compareProductRouteInventories({
    catchAllExpansions: ORGANIZATION_CATCH_ALL_EXPANSIONS,
    catchAllPage: ORGANIZATION_CATCH_ALL_PAGE,
    discoveredProtectedRoutes,
    discoveredPublicRoutes,
    hardCutPages: PROTECTED_HARD_CUT_PAGES,
    hardCutPrefixes: PROTECTED_HARD_CUT_PREFIXES,
    protectedRoutes: PROTECTED_ROUTE_INVENTORY,
    publicRoutes: PUBLIC_ROUTE_CLASSIFICATION_REGISTRY,
  });

  return {
    appPublicRouteCount: discoveredPublicRoutes.filter(
      (route) => route.application === 'app',
    ).length,
    issues,
    protectedPageCount: discoveredProtectedRoutes.length,
    protectedRouteCount: PROTECTED_ROUTE_INVENTORY.length,
    publicRouteCount: discoveredPublicRoutes.length,
    websitePublicRouteCount: discoveredPublicRoutes.filter(
      (route) => route.application === 'website',
    ).length,
  };
}

function isMainModule(): boolean {
  const entryPoint = process.argv[1];
  return (
    entryPoint !== undefined &&
    path.resolve(entryPoint) === fileURLToPath(import.meta.url)
  );
}

if (isMainModule()) {
  const report = runCheckProductRouteInventory();

  if (report.issues.length > 0) {
    console.error('Product route inventory drift detected.');
    for (const issue of report.issues) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }

  console.log(
    `Product route inventory passed. ${report.protectedRouteCount} protected registrations cover ${report.protectedPageCount} protected page files; ${report.publicRouteCount} public routes classified (${report.appPublicRouteCount} app, ${report.websitePublicRouteCount} website).`,
  );
}
