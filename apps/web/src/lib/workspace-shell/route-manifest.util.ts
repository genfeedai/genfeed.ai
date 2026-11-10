import { ROUTE_MANIFEST } from '@genfeedai/contracts/constants';
import type {
  RouteManifest,
  RouteManifestGroup,
  RouteManifestPage,
  RouteManifestScope,
} from '@genfeedai/contracts/interfaces/ui/route-manifest.interface';
import type { PageHelpRoute } from '@/props/layout/page-help-route.props';

const REGEX_SPECIAL_CHARS_PATTERN = /[.*+?^${}()|[\]\\]/g;
const ROOT_PATH_PATTERN = /^\/$/;

const SCOPE_PREFIXES = Object.freeze({
  brand: '/:orgSlug/:brandSlug',
  organization: '/:orgSlug/~',
  personal: '',
} as const satisfies Record<RouteManifestScope, string>);

/** A manifest page with its group and the scopes it is served in. */
export interface ManifestPageEntry {
  readonly group: RouteManifestGroup;
  readonly page: RouteManifestPage;
  /** Scope-relative path pattern, as written in the manifest. */
  readonly path: string;
  readonly scopes: readonly RouteManifestScope[];
}

export interface CompiledPathPattern {
  readonly matcher: RegExp;
  readonly parameterNames: readonly string[];
  readonly specificity: number;
}

function escapeRegExp(value: string): string {
  return value.replace(REGEX_SPECIAL_CHARS_PATTERN, '\\$&');
}

/**
 * Compile a route pattern (`/:orgSlug/~/agent/:id`). More static segments win,
 * then more segments, then fewer parameters.
 */
export function compilePathPattern(pattern: string): CompiledPathPattern {
  if (pattern === '/') {
    return {
      matcher: ROOT_PATH_PATTERN,
      parameterNames: [],
      specificity: 10_000,
    };
  }

  const parameterNames: string[] = [];
  let staticSegments = 0;
  const matcherSegments = pattern
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      if (segment.startsWith(':')) {
        parameterNames.push(segment.slice(1));
        return '([^/]+)';
      }

      staticSegments += 1;
      return escapeRegExp(segment);
    });

  return {
    matcher: new RegExp(`^/${matcherSegments.join('/')}/?$`),
    parameterNames,
    specificity:
      staticSegments * 1_000 +
      matcherSegments.length * 10 -
      parameterNames.length,
  };
}

/**
 * Canonical pattern of a scope-relative manifest path. `/` is the scope root:
 * `/:orgSlug` for an organization (not `/:orgSlug/~`), the brand root for a
 * brand.
 */
export function toScopedPattern(
  scope: RouteManifestScope,
  path: string,
): string {
  if (scope === 'organization' && path === '/') {
    return '/:orgSlug';
  }

  const prefix = SCOPE_PREFIXES[scope];
  if (path === '/') {
    return prefix || '/';
  }

  return `${prefix}${path}`;
}

/**
 * A manifest href or fallback: scope-relative, or already absolute when it
 * starts with `/:orgSlug`.
 */
export function toScopedHref(scope: RouteManifestScope, href: string): string {
  return href.startsWith('/:orgSlug') ? href : toScopedPattern(scope, href);
}

export function listManifestPages(
  manifest: RouteManifest = ROUTE_MANIFEST,
): readonly ManifestPageEntry[] {
  return manifest.groups.flatMap((group) =>
    group.pages.map((entry) => {
      const page = typeof entry === 'string' ? { path: entry } : entry;
      return {
        group,
        page,
        path: page.path,
        scopes: page.scopes ?? group.scopes,
      };
    }),
  );
}

/** `pages.help.<key>` entries by route prefix, one per distinct key and path. */
export function derivePageHelpRoutes(
  manifest: RouteManifest = ROUTE_MANIFEST,
): PageHelpRoute[] {
  const routes = new Map<string, PageHelpRoute>();

  for (const { page, path } of listManifestPages(manifest)) {
    if (page.help) {
      routes.set(`${page.help}:${path}`, { key: page.help, prefix: path });
    }
  }

  return [...routes.values()];
}

/**
 * Whether `normalizedPathname` (no org or brand segment) is a page that
 * renders `AgentOutputShell`. The most specific manifest page decides, so
 * `/agent/new` stays full width while `/agent/:id` is a thread; a path the
 * manifest does not list has no output pane.
 */
export function createAgentOutputMatcher(
  manifest: RouteManifest = ROUTE_MANIFEST,
): (normalizedPathname: string) => boolean {
  const isAgentOutputByPath = new Map<string, boolean>();
  for (const { page, path } of listManifestPages(manifest)) {
    isAgentOutputByPath.set(
      path,
      !!page.isAgentOutput || (isAgentOutputByPath.get(path) ?? false),
    );
  }

  const compiled = [...isAgentOutputByPath]
    .map(([path, isAgentOutput]) => ({
      ...compilePathPattern(path),
      isAgentOutput,
    }))
    .sort((first, second) => second.specificity - first.specificity);

  return (normalizedPathname) =>
    compiled.find(({ matcher }) => matcher.test(normalizedPathname))
      ?.isAgentOutput ?? false;
}
