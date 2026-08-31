import { isRenderableThreadId } from '@genfeedai/agent/utils/thread-id.util';
import { APP_ROUTE_PREFIXES, APP_ROUTES } from '@genfeedai/constants';
import type { AgentConversationRoute } from '@genfeedai/interfaces';
import type { Task } from '@services/management/tasks.service';

export type TaskLaunchMode =
  | 'auto'
  | 'automation'
  | 'edit'
  | 'generate'
  | 'write';

export const OPERATOR_TASK_CONTEXT_QUERY_KEYS = [
  'taskId',
  'taskTitle',
  'taskOutputType',
  'taskExecutionPath',
  'taskSource',
] as const;

const KNOWN_PROTECTED_PREFIXES = [
  'workspace',
  'studio',
  'settings',
  'agents',
  'publishing',
  'analytics',
  'library',
  'agent',
  'messages',
  'discovery',
  'overview',
  'platforms',
  'ingredients',
  'videos',
  'edit',
  'automation',
  'elements',
  'bots',
  'admin',
] as const;

/**
 * First path segment of every global (non org/brand-scoped) route root.
 * `/admin/overview/analytics/...` must NOT be rewritten as
 * `/:org/:brand/analytics/...` just because segment[2] is a known module.
 */
const RESERVED_GLOBAL_ROOT_SEGMENTS = new Set(
  [
    ...Object.values(APP_ROUTE_PREFIXES).map(
      (prefix) => prefix.replace(/^\//, '').split('/')[0] ?? '',
    ),
    APP_ROUTES.CONNECT.replace(/^\//, ''),
    APP_ROUTES.LOGIN.replace(/^\//, ''),
    APP_ROUTES.LOGOUT.replace(/^\//, ''),
    APP_ROUTES.SIGN_UP.replace(/^\//, ''),
    APP_ROUTES.OAUTH.replace(/^\//, ''),
    'managed-credits',
  ].filter(Boolean),
);

/**
 * Resolve the conversation surface an `/agent/*` pathname (already passed
 * through {@link normalizeProtectedPathname}) belongs to.
 *
 * The agent layout hosts one persistent conversation for `/agent`,
 * `/agent/new`, `/agent/:threadId`, `/agent/onboarding`, and
 * `/agent/onboarding/:threadId` — the URL is the thread selector, the shell
 * never remounts. Anything else under `/agent` (`/agent/journey`) is a page
 * with its own content and resolves to `null`.
 *
 * Malformed ids (`/agent/undefined` from a stale link) resolve without a
 * `threadId`: the thread page redirects to the agent root, and the layout must
 * not request `/threads/undefined/*` while that redirect is pending.
 */
export function resolveAgentConversationRoute(
  normalizedPathname: string,
): AgentConversationRoute | null {
  const agentRoot = APP_ROUTES.AGENT.ROOT;

  if (
    normalizedPathname !== agentRoot &&
    !normalizedPathname.startsWith(`${agentRoot}/`)
  ) {
    return null;
  }

  const segments = normalizedPathname
    .slice(agentRoot.length)
    .split('/')
    .filter(Boolean);

  const toThreadId = (segment: string | undefined): string | undefined =>
    isRenderableThreadId(segment) ? segment : undefined;

  if (segments[0] === 'onboarding') {
    return segments.length <= 2
      ? { isOnboarding: true, threadId: toThreadId(segments[1]) }
      : null;
  }

  if (
    segments.length === 0 ||
    (segments.length === 1 && segments[0] === 'new')
  ) {
    return { isOnboarding: false, threadId: undefined };
  }

  if (
    segments.length === 1 &&
    normalizedPathname !== APP_ROUTES.AGENT.JOURNEY
  ) {
    return { isOnboarding: false, threadId: toThreadId(segments[0]) };
  }

  return null;
}

/**
 * First-login agent onboarding (`/agent/onboarding` and `/agent/onboarding/:threadId`)
 * after {@link normalizeProtectedPathname}. Conversation is the canvas; the
 * workspace inspector does not host it.
 */
export function isFocusedOnboardingPath(normalizedPathname: string): boolean {
  return (
    normalizedPathname === APP_ROUTES.AGENT.ONBOARDING ||
    normalizedPathname.startsWith(`${APP_ROUTES.AGENT.ONBOARDING}/`)
  );
}

export function normalizeProtectedPathname(
  rawPathname: string | null | undefined,
): string {
  if (!rawPathname) {
    return '';
  }

  const parts = rawPathname.split('/').filter(Boolean);

  // Platform / product roots keep their full path. Without this,
  // `/admin/overview/analytics/all` collapses to `/analytics/all` and the
  // shell swaps the Admin control plane for brand Analytics chrome.
  if (parts[0] && RESERVED_GLOBAL_ROOT_SEGMENTS.has(parts[0])) {
    return `/${parts.join('/')}`;
  }

  if (parts.length >= 3) {
    const thirdSegment = parts[2];

    if (
      parts[1] === '~' ||
      KNOWN_PROTECTED_PREFIXES.some((prefix) => prefix === thirdSegment)
    ) {
      const rest = parts[1] === '~' ? parts.slice(2) : parts.slice(2);
      return `/${rest.join('/')}`;
    }
  }

  return rawPathname;
}

/**
 * First-asset unlock gate — the main app sections that are soft-locked until the
 * org generates its first asset. Values are normalized app-relative prefixes
 * (post-{@link normalizeProtectedPathname}), so pass a normalized pathname.
 *
 * Covers the five product sections plus their canonical route aliases: Workspace
 * (`/workspace`, `/overview`), Library, Analytics, Automation
 * (`/automation`, including merged workflows), and the Calendar
 * (`/publishing/calendar`). The agent, settings, studio, discovery,
 * messages, and admin surfaces are intentionally NOT gated — nor is the rest of
 * Publishing outside its Calendar.
 */
const ASSET_GATE_SECTION_PREFIXES = [
  '/workspace',
  '/overview',
  '/library',
  '/analytics',
  '/automation',
  '/publishing/calendar',
] as const;

export function isAssetGateSectionPath(normalizedPathname: string): boolean {
  return ASSET_GATE_SECTION_PREFIXES.some(
    (prefix) =>
      normalizedPathname === prefix ||
      normalizedPathname.startsWith(`${prefix}/`),
  );
}

export function getCurrentBrandScopedPath(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);

  // Brand (`/:org/:brand/...`) and org (`/:org/~/...`) scopes both keep the
  // app surface after the scope segments when switching brand selection.
  if (parts.length >= 3) {
    const rest = `/${parts.slice(2).join('/')}`;
    // Org overview alias normalizes to the canonical workspace overview path.
    if (rest === '/overview') {
      return APP_ROUTES.WORKSPACE.OVERVIEW;
    }
    return rest;
  }

  return APP_ROUTES.WORKSPACE.OVERVIEW;
}

/**
 * Brand-owned resources (a selected conversation, an onboarding thread)
 * cannot follow the user onto another brand. Keep the surface; drop the id.
 */
export function resolveBrandSwitchSurfacePath(brandScopedPath: string): string {
  const path = brandScopedPath.startsWith('/')
    ? brandScopedPath
    : `/${brandScopedPath}`;
  const conversation = resolveAgentConversationRoute(path);

  if (conversation) {
    // Bare /agent resumes the organization's most recent conversation. A
    // brand switch must instead stay unthreaded so that bootstrap cannot
    // reopen the conversation (and brand) the operator just left.
    return APP_ROUTES.AGENT.NEW;
  }

  return path;
}

/**
 * Brand settings that only exist under `/:org/:brand/settings/*` — there is no
 * org-level `/:org/~/settings/...` page. Clearing brand selection must not
 * rewrite those to a 404.
 */
const BRAND_ONLY_SETTINGS_PREFIXES = [
  APP_ROUTES.SETTINGS.AGENT_DEFAULTS,
  APP_ROUTES.SETTINGS.PUBLISHING,
  APP_ROUTES.SETTINGS.SKILLS,
  APP_ROUTES.SETTINGS.SOCIAL,
  APP_ROUTES.SETTINGS.LINKS,
  '/settings/voice',
  '/settings/interview',
  '/settings/harness',
  '/settings/kit',
  '/settings/characters',
] as const;

/**
 * Map a brand-scoped app path to a valid org-scoped (`~`) destination.
 * Shared surfaces (agent, studio, workspace) keep the same path; brand-only
 * settings fall back to the org brands hub.
 */
export function resolveOrganizationScopePath(brandScopedPath: string): string {
  const path = brandScopedPath.startsWith('/')
    ? brandScopedPath
    : `/${brandScopedPath}`;

  // A branded conversation cannot remain selected after brand scope is
  // cleared. Deep-linking that thread under `~` canonicalizes straight back to
  // its owning brand, while `/agent` resumes the most recent branded thread.
  // The explicit new route is the stable brandless destination.
  if (resolveAgentConversationRoute(path)) {
    return APP_ROUTES.AGENT.NEW;
  }

  for (const prefix of BRAND_ONLY_SETTINGS_PREFIXES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) {
      return APP_ROUTES.SETTINGS.BRANDS;
    }
  }

  return path;
}

export function getBrandSwitchHref({
  nextBrandSlug,
  nextOrgSlug,
  pathname,
}: {
  nextBrandSlug: string;
  nextOrgSlug: string;
  pathname: string;
}): string {
  return `/${nextOrgSlug}/${nextBrandSlug}${resolveBrandSwitchSurfacePath(
    getCurrentBrandScopedPath(pathname),
  )}`;
}

export function pickOperatorTaskContextSearchParams(
  searchParams: URLSearchParams,
): URLSearchParams {
  const picked = new URLSearchParams();

  for (const key of OPERATOR_TASK_CONTEXT_QUERY_KEYS) {
    const value = searchParams.get(key);

    if (value) {
      picked.set(key, value);
    }
  }

  return picked;
}

export function appendSearchParamsToHref(
  href: string,
  searchParams: URLSearchParams,
): string {
  if ([...searchParams.keys()].length === 0) {
    return href;
  }

  const [pathWithoutHash, hash = ''] = href.split('#', 2);
  const [pathname, existingQuery = ''] = pathWithoutHash.split('?', 2);
  const mergedSearchParams = new URLSearchParams(existingQuery);

  for (const [key, value] of searchParams.entries()) {
    mergedSearchParams.set(key, value);
  }

  const queryString = mergedSearchParams.toString();
  const resolvedHash = hash ? `#${hash}` : '';

  return queryString
    ? `${pathname}?${queryString}${resolvedHash}`
    : `${pathname}${resolvedHash}`;
}

export function withTaskContextHref(
  href: string | undefined,
  searchParams: URLSearchParams,
): string | undefined {
  if (!href) {
    return href;
  }

  return appendSearchParamsToHref(href, searchParams);
}

type TaskLaunchCapabilities = {
  studio: boolean;
};

function getTaskLaunchPath(
  task: Task,
  mode: TaskLaunchMode,
  capabilities: TaskLaunchCapabilities,
): string {
  if (mode === 'write') {
    return APP_ROUTES.AGENT.NEW;
  }

  // One-off media generation is Agent-first: Studio no longer has standalone
  // image/video prompt-bar tabs, so every generate launch opens the Agent.
  if (mode === 'generate') {
    return APP_ROUTES.AGENT.NEW;
  }

  if (mode === 'edit') {
    // Edit is a Studio surface — it follows the same capability gate as generate.
    return capabilities.studio ? APP_ROUTES.STUDIO.EDIT : APP_ROUTES.AGENT.NEW;
  }

  if (mode === 'automation') {
    return APP_ROUTES.AUTOMATION.WORKFLOWS;
  }

  switch (task.executionPathUsed) {
    case 'caption_generation':
      return APP_ROUTES.AGENT.NEW;
    case 'image_generation':
    case 'video_generation':
      return APP_ROUTES.AGENT.NEW;
    default:
      return APP_ROUTES.AUTOMATION.WORKFLOWS;
  }
}

export function buildTaskLaunchHref(
  task: Task,
  mode: TaskLaunchMode = 'auto',
  capabilities: TaskLaunchCapabilities = { studio: true },
): string {
  const searchParams = new URLSearchParams({
    taskExecutionPath: task.executionPathUsed ?? '',
    taskId: task.id,
    taskOutputType: task.outputType ?? '',
    taskSource: 'workspace',
    taskTitle: task.title,
  });

  return appendSearchParamsToHref(
    getTaskLaunchPath(task, mode, capabilities),
    searchParams,
  );
}
