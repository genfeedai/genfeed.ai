export const APP_ROUTES = {
  ROOT: '/',
  CONNECT: '/connect',
  DESKTOP: {
    LOCAL: '/desktop/local',
  },
  LOGIN: '/login',
  LOGOUT: '/logout',
  MANAGED_CREDITS_SUCCESS: '/managed-credits/success',
  OAUTH: '/oauth',
  SIGN_UP: '/sign-up',
  ADMIN: {
    ROOT: '/admin',
    ADMINISTRATION: {
      ANNOUNCEMENTS: '/admin/administration/announcements',
      CREDIT_USAGE: '/admin/administration/credit-usage',
      REFERRALS: '/admin/administration/referrals',
      PLATFORM_SETTINGS: '/admin/administration/platform-settings',
      ROLES: '/admin/administration/roles',
      SUBSCRIPTIONS: '/admin/administration/subscriptions',
      SYSTEM_EMAILS: '/admin/administration/system-emails',
      USERS: '/admin/administration/users',
      WARMUP_ACCOUNTS: '/admin/administration/warmup-accounts',
    },
    AUTOMATION: {
      BOTS: '/admin/automation/bots',
      MODELS: '/admin/automation/models',
      MODELS_ALL: '/admin/automation/models/all',
      TRAININGS: '/admin/automation/trainings',
      WORKFLOWS: '/admin/automation/workflows',
    },
    CONFIGURATION: {
      ELEMENTS: '/admin/configuration/elements',
      ELEMENTS_BLACKLISTS: '/admin/configuration/elements/blacklists',
      ELEMENTS_CAMERA_MOVEMENTS:
        '/admin/configuration/elements/camera-movements',
      ELEMENTS_CAMERAS: '/admin/configuration/elements/cameras',
      ELEMENTS_LENSES: '/admin/configuration/elements/lenses',
      ELEMENTS_LIGHTINGS: '/admin/configuration/elements/lightings',
      ELEMENTS_MOODS: '/admin/configuration/elements/moods',
      ELEMENTS_SCENES: '/admin/configuration/elements/scenes',
      ELEMENTS_SOUNDS: '/admin/configuration/elements/sounds',
      ELEMENTS_STYLES: '/admin/configuration/elements/styles',
      FONT_FAMILIES: '/admin/configuration/font-families',
      PRESETS: '/admin/configuration/presets',
      TAGS: '/admin/configuration/tags',
      TAGS_ALL: '/admin/configuration/tags/all',
    },
    CONTENT: {
      // Ghost CRM routes (analytics/companies/leads/tasks) removed — no pages.
      INGREDIENTS: '/admin/content/ingredients',
      INGREDIENTS_VIDEOS: '/admin/content/ingredients/videos',
      POSTS: '/admin/content/posts',
      PROMPTS: '/admin/content/prompts',
      PROMPTS_LIST: '/admin/content/prompts/list',
      TEMPLATES: '/admin/content/templates',
    },
    FOLDERS: '/admin/folders',
    IMAGES: '/admin/images',
    LIBRARY: {
      VOICES: '/admin/library/voices',
    },
    ORGANIZATION: '/admin/organization',
    OVERVIEW: {
      ACTIVITIES: '/admin/overview/activities',
      ANALYTICS: '/admin/overview/analytics',
      ANALYTICS_ALL: '/admin/overview/analytics/all',
      ANALYTICS_BRANDS: '/admin/overview/analytics/brands',
      ANALYTICS_BUSINESS: '/admin/overview/analytics/business',
      ANALYTICS_ORGANIZATIONS: '/admin/overview/analytics/organizations',
      DASHBOARD: '/admin/overview/dashboard',
    },
    VIDEOS: '/admin/videos',
  },
  ANALYTICS: {
    ROOT: '/analytics',
    BRANDS: '/analytics/brands',
    HOOKS: '/analytics/hooks',
    INSIGHTS: '/analytics/insights',
    /**
     * Canonical analytics home. Bare ROOT permanently redirects here so Overview
     * is a complete path (same pattern as workspace/overview).
     */
    OVERVIEW: '/analytics/overview',
    PERFORMANCE_LAB: '/analytics/performance-lab',
    POSTS: '/analytics/posts',
    STREAKS: '/analytics/streaks',
    TREND_TURNOVER: '/analytics/trend-turnover',
    TRENDS: '/analytics/trends',
  },
  AGENT: {
    ROOT: '/agent',
    JOURNEY: '/agent/journey',
    NEW: '/agent/new',
    ONBOARDING: '/agent/onboarding',
  },
  AUTOMATION: {
    /**
     * @deprecated Legacy path — permanently redirects to Analytics Overview.
     * Prefer APP_ROUTES.ANALYTICS.OVERVIEW for links.
     */
    ANALYTICS: '/automation/analytics',
    AUTOPILOT: '/automation/autopilot',
    /** @deprecated Automation settings live under brand Settings. */
    CONFIGURATION: '/automation/configuration',
    /** Content-run history: briefs handed off from Discovery through publish. */
    CONTENT_RUNS: '/automation/content-runs',
    /**
     * Agent roster. Detail pages nest at `/automation/agents/:agentId`.
     */
    AGENTS: '/automation/agents',
    /** @deprecated Opens the Add agent library on AUTOMATION.AGENTS. */
    HIRE: '/automation/hire',
    /**
     * @deprecated Team list permanently redirects to AGENTS.
     * `/automation/library/:type` remains the Twitch/YouTube chat-bot surfaces.
     */
    LIBRARY: '/automation/library',
    /** @deprecated Opens the custom mode of the Add agent dialog. */
    NEW: '/automation/agents/new',
    /** @deprecated Opens the Creator Studio template on CAMPAIGNS_NEW. */
    ORCHESTRATOR: '/automation/orchestrator',
    /**
     * Canonical Automation home. Bare ROOT permanently redirects here so Overview
     * is a complete path (same pattern as workspace/overview).
     */
    OVERVIEW: '/automation/overview',
    ROOT: '/automation',
    RUNS: '/automation/runs',
    /** @deprecated Skill configuration lives at APP_ROUTES.SETTINGS.SKILLS. */
    SKILLS: '/automation/skills',
    /**
     * Agent Programs (budget/quota wrappers around strategies).
     * UI label is "Programs"; path kept for deep-link stability.
     * Marketer multi-platform content campaigns belong in Publishing (P1).
     */
    CAMPAIGNS: '/automation/campaigns',
    CAMPAIGNS_NEW: '/automation/campaigns/new',
    /**
     * @deprecated Canonical path is APP_ROUTES.MESSAGES.OUTREACH.
     * Value points at Messages so stale imports land correctly.
     */
    OUTREACH_CAMPAIGNS: '/messages/outreach',
    /** @deprecated Use APP_ROUTES.MESSAGES.OUTREACH_NEW. */
    OUTREACH_CAMPAIGNS_NEW: '/messages/outreach/new',
    /**
     * @deprecated Canonical path is APP_ROUTES.MESSAGES.REPLY_DRIP.
     */
    REPLY_CAMPAIGNS: '/messages/reply-drip',
    /**
     * @deprecated Canonical path is APP_ROUTES.MESSAGES.REPLIES.
     */
    REPLIES: '/messages/replies',
    /** @deprecated Use APP_ROUTES.MESSAGES.REPLIES */
    AUTHOR_REPLIES: '/messages/replies',
    /** Pipeline canvas library (merged former /workflows surface). */
    WORKFLOWS: '/automation/workflows',
    WORKFLOWS_EXECUTIONS: '/automation/workflows/executions',
    WORKFLOWS_NEW: '/automation/workflows/new',
    WORKFLOWS_TEMPLATES: '/automation/workflows/templates',
  },
  DISCOVERY: {
    ADS: '/discovery/ads',
    ADS_GOOGLE: '/discovery/ads/google',
    ADS_META: '/discovery/ads/meta',
    ADS_TIKTOK: '/discovery/ads/tiktok',
    ADS_X: '/discovery/ads/x',
    /**
     * @deprecated Use OVERVIEW. Bare `/discovery/discovery` permanently redirects
     * to `/discovery/overview` (same pattern as workspace/analytics/automation).
     */
    DISCOVERY: '/discovery/discovery',
    FOLLOWING: '/discovery/following',
    /**
     * Canonical Discovery home. Bare ROOT permanently redirects here so Overview
     * is a complete path (same pattern as workspace/overview).
     */
    OVERVIEW: '/discovery/overview',
    /**
     * Platform feeds. Served by the dynamic `/discovery/[platform]` route, but
     * enumerated here because they are real menu destinations — same reason
     * `ADS_*` are spelled out rather than built from a segment.
     */
    PLATFORM_INSTAGRAM: '/discovery/instagram',
    PLATFORM_LINKEDIN: '/discovery/linkedin',
    PLATFORM_PINTEREST: '/discovery/pinterest',
    PLATFORM_REDDIT: '/discovery/reddit',
    PLATFORM_TIKTOK: '/discovery/tiktok',
    PLATFORM_TWITTER: '/discovery/twitter',
    PLATFORM_YOUTUBE: '/discovery/youtube',
    ROOT: '/discovery',
    /**
     * @deprecated Same TrendsList as OVERVIEW. Permanently redirects to
     * `/discovery/overview` — keep for deep-link compatibility only.
     */
    SOCIALS: '/discovery/socials',
  },
  /**
   * Legacy long-form editor aliases retained for existing deep links. New
   * operator navigation uses the type-aware `/publishing/posts/{id}` route built
   * by `createArtifactEditorRoute`. Distinct from STUDIO.EDIT, which is the
   * Remotion project canvas.
   */
  EDIT: {
    ARTICLE: '/edit/article',
    NEWSLETTER: '/edit/newsletter',
    ROOT: '/edit',
  },
  LAB: {
    LIBRARY_PREVIEW: '/lab/library-preview',
    TWITTER_ENGAGE: '/lab/twitter-engage',
  },
  LIBRARY: {
    /**
     * Canonical library home — the unified asset browser with no filter seeded.
     * Bare ROOT redirects here. The Library has three orthogonal axes: type
     * (`?categories=`), shelf (`/library/shelf/:shelf`), and folder
     * (`?folder=`); this route is all three unset.
     */
    ASSETS: '/library/assets',
    /**
     * Type-seeded entry points into the same browser. They are shareable deep
     * links (see `LIBRARY_ROUTE_BY_INGREDIENT_CATEGORY`), not navigation — type
     * is a filter chip, so the sidebar never lists them.
     */
    AVATARS: '/library/avatars',
    CAPTIONS: '/library/captions',
    GIFS: '/library/gifs',
    IMAGES: '/library/images',
    /** @deprecated Use ASSETS. Retained for legacy deep-link redirects. */
    INGREDIENTS: '/library/ingredients',
    MUSIC: '/library/music',
    /** @deprecated Use ASSETS. The tile-grid Overview held no assets. */
    OVERVIEW: '/library/overview',
    /** Assets touched most recently, newest first. */
    RECENT: '/library/recent',
    ROOT: '/library',
    /**
     * Generation-state axis. Append a `LibraryShelf` value:
     * `${SHELF}/needs-review`. A shelf is a saved query, not a location.
     */
    SHELF: '/library/shelf',
    STARRED: '/library/starred',
    TRASH: '/library/trash',
    VIDEOS: '/library/videos',
    VOICES: '/library/voices',
  },
  MESSAGES: {
    /**
     * Outreach / growth engagement sequences (DMs, launches).
     * Lives in Messages — send-side of the engagement inbox.
     */
    OUTREACH: '/messages/outreach',
    OUTREACH_NEW: '/messages/outreach/new',
    /**
     * Author replies on your own posts (reply-bot surface).
     */
    REPLIES: '/messages/replies',
    /**
     * Throttled social reply drip (not a blast sender).
     */
    REPLY_DRIP: '/messages/reply-drip',
    ROOT: '/messages',
  },
  /**
   * Per-destination brand hub (`/platforms/:platform`).
   * Composition page — queue, engage, connect, and create shortcuts.
   */
  PLATFORMS: {
    ROOT: '/platforms',
  },
  ONBOARDING: {
    BRAND: '/onboarding/brand',
    POST_SIGNUP: '/onboarding/post-signup',
    PROACTIVE: '/onboarding/proactive',
    PROVIDERS: '/onboarding/providers',
    ROOT: '/onboarding',
    SUCCESS: '/onboarding/success',
    SUMMARY: '/onboarding/summary',
  },
  OVERVIEW: {
    /**
     * Legacy activity list. Workspace Activity is the operator surface
     * (`WORKSPACE.ACTIVITY`); this path stays registered under the workspace
     * switcher so old bookmarks still resolve.
     */
    ACTIVITIES: '/overview/activities',
    /**
     * @deprecated Use WORKSPACE.OVERVIEW. Bare `/overview` permanently
     * redirects there so org Workspace is not a competing `/overview` app.
     */
    ROOT: '/overview',
  },
  PUBLISHING: {
    CALENDAR: '/publishing/calendar',
    /** Posts whose latest publication attempt failed. */
    FAILED: '/publishing/failed',
    /** Posts queued to enter the publishing pipeline. */
    PENDING: '/publishing/pending',
    /**
     * @deprecated Agent Programs live at APP_ROUTES.AUTOMATION.CAMPAIGNS.
     * Legacy `/publishing/campaigns` permanently redirects there.
     * Future marketer content Campaigns reclaim this Publishing prefix (P1).
     */
    CAMPAIGNS: '/automation/campaigns',
    /** @deprecated Use APP_ROUTES.AUTOMATION.CAMPAIGNS_NEW. */
    CAMPAIGNS_NEW: '/automation/campaigns/new',
    /**
     * @deprecated Canonical path is APP_ROUTES.MESSAGES.OUTREACH.
     * Legacy `/publishing/outreach-campaigns` permanently redirects there.
     */
    OUTREACH_CAMPAIGNS: '/messages/outreach',
    /** @deprecated Use APP_ROUTES.MESSAGES.OUTREACH_NEW. */
    OUTREACH_CAMPAIGNS_NEW: '/messages/outreach/new',
    /**
     * Canonical Publishing home (dashboard). Bare ROOT permanently redirects
     * here so Overview is a complete path that does not prefix-match Review /
     * Posts / etc. (same pattern as workspace/discovery/library).
     */
    OVERVIEW: '/publishing/overview',
    /**
     * Canonical content library + type-aware editor.
     * - List: `/publishing/posts`
     * - Editor: `/publishing/posts/:id` (social post today; article/newsletter
     *   can share this path once kind resolution is wired)
     */
    POSTS: '/publishing/posts',
    /** Posts currently being sent to destination platforms. */
    PROCESSING: '/publishing/processing',
    PUBLISHED: '/publishing/published',
    /**
     * Remix is a contextual **action** (Discovery/Library button), not a module
     * page. This path is the deep-link target for that action only — never a
     * Publishing nav item.
     */
    REMIX: '/publishing/remix',
    REVIEW: '/publishing/review',
    ROOT: '/publishing',
    /** Pipeline shortcut: drafts + scheduled + in-progress (not live). */
    SCHEDULED: '/publishing/scheduled',
  },
  SETTINGS: {
    AGENT_DEFAULTS: '/settings/agent-defaults',
    API_KEYS: '/settings/api-keys',
    BRANDS: '/settings/brands',
    CREDITS: '/settings/credits',
    /** Provider BYOK keys (OpenAI, Replicate, …) — not Genfeed product API keys. */
    INTEGRATIONS: '/settings/integrations',
    SUBSCRIPTION: '/settings/subscription',
    ELEMENTS_SCENES: '/settings/elements/scenes',
    CHARACTERS: '/settings/characters',
    HELP: '/settings/help',
    MEMBERS: '/settings/members',
    /** Personal email and future in-app notification preferences. */
    NOTIFICATIONS: '/settings/notifications',
    /** Creation heatmap, streaks, and setup checklist. */
    PROGRESS: '/settings/progress',
    MODEL_IMAGE: '/settings/models/image',
    MODELS: '/settings/models',
    MODEL_TRAININGS: '/settings/models/trainings',
    MODEL_VIDEO: '/settings/models/video',
    ORGANIZATION: '/settings/organization',
    ORGANIZATION_API_KEYS: '/settings/organization/api-keys',
    /**
     * @deprecated Dead path — no page shipped. Brand OAuth (Facebook / Google Ads
     * / social) lives at SETTINGS.SOCIAL. Prefer that; legacy URLs redirect.
     */
    ORGANIZATION_CREDENTIALS: '/settings/organization/credentials',
    ORGANIZATION_POLICY: '/settings/organization/policy',
    PERSONAL: '/settings/personal',
    /**
     * Org agent/automation defaults. Menu label is Agents — keep the slug
     * identical. `/settings/policy` redirects here.
     */
    AGENTS: '/settings/agents',
    /** @deprecated Same path as SETTINGS.AGENTS. */
    POLICY: '/settings/agents',
    PUBLISHING: '/settings/publishing',
    /**
     * Organization settings home. Bare `/:orgSlug/~/settings` redirects here
     * the same way Workspace ROOT redirects to Overview.
     */
    GENERAL: '/settings/general',
    ROOT: '/settings',
    /**
     * Brand-scoped social + ad OAuth connect surface (Facebook → Meta Ads,
     * Google Ads, Twitter, etc.). Canonical home for "connect accounts".
     */
    SOCIAL: '/settings/social',
    /** Brand-enabled agent skills and organization-owned skill variants. */
    SKILLS: '/settings/skills',
    /**
     * @deprecated External links edit on Brand Profile via ModalBrandLink.
     * Route permanently redirects to SETTINGS.ROOT.
     */
    LINKS: '/settings/links',
    USAGE: '/settings/usage',
    WEBHOOKS: '/settings/webhooks',
  },
  /**
   * Studio is a production surface only. One-off "make me an image/video"
   * generation lives in the Agent (`AGENT.NEW`) — the standalone
   * image/video/avatar/music tabs were retired.
   */
  STUDIO: {
    BATCH: '/studio/batch',
    CLIPS: '/studio/clips',
    EDIT: '/studio/edit',
    EDIT_NEW: '/studio/edit/new',
    FASTLANE: '/studio/fastlane',
    /**
     * The single-asset playground: every generatable type behind one prompt
     * bar. Asset type is composer state, never a route segment.
     */
    GENERATE: '/studio/generate',
    ROOT: '/studio',
    STORYBOARD: '/studio/storyboard',
  },
  WORKSPACE: {
    ACTIVITY: '/workspace/activity',
    INBOX: '/workspace/inbox',
    INBOX_ALL: '/workspace/inbox/all',
    INBOX_RECENT: '/workspace/inbox/recent',
    INBOX_UNREAD: '/workspace/inbox/unread',
    /**
     * Canonical workspace home. Bare ROOT (`/workspace`) redirects here so the
     * Overview nav item is a complete path that does not prefix-match
     * Activity/Tasks/Inbox (same pattern as Studio → Storyboard, Discovery →
     * Discovery).
     */
    OVERVIEW: '/workspace/overview',
    ROOT: '/workspace',
    TASKS: '/workspace/tasks',
  },
} as const;

export const APP_ROUTE_PREFIXES = {
  ADMIN: APP_ROUTES.ADMIN.ROOT,
  ANALYTICS: APP_ROUTES.ANALYTICS.ROOT,
  AGENT: APP_ROUTES.AGENT.ROOT,
  AUTOMATION: APP_ROUTES.AUTOMATION.ROOT,
  DISCOVERY: APP_ROUTES.DISCOVERY.ROOT,
  EDIT: APP_ROUTES.EDIT.ROOT,
  LIBRARY: '/library',
  MESSAGES: APP_ROUTES.MESSAGES.ROOT,
  OVERVIEW: APP_ROUTES.OVERVIEW.ROOT,
  PLATFORMS: APP_ROUTES.PLATFORMS.ROOT,
  PUBLISHING: APP_ROUTES.PUBLISHING.ROOT,
  SETTINGS: APP_ROUTES.SETTINGS.ROOT,
  STUDIO: APP_ROUTES.STUDIO.ROOT,
  WORKSPACE: APP_ROUTES.WORKSPACE.ROOT,
} as const;

export const APP_ROUTE_TEMPLATES = {
  BRAND: '/:orgSlug/:brandSlug',
  BRAND_SETTINGS: '/:orgSlug/:brandSlug/settings',
  ORGANIZATION: '/:orgSlug/~',
  ORGANIZATION_SETTINGS: '/:orgSlug/~/settings',
  PERSONAL_SETTINGS: APP_ROUTES.SETTINGS.PERSONAL,
} as const;

/**
 * Personal settings live on the unscoped `/settings/*` shell. These child
 * segments must not be rewritten onto `/:orgSlug/~/settings/*`.
 */
export const PERSONAL_SETTINGS_CHILD_SEGMENTS = [
  'personal',
  'notifications',
  'progress',
  'help',
] as const;

export function isPersonalSettingsPath(pathname: string): boolean {
  if (pathname === APP_ROUTES.SETTINGS.ROOT) {
    return true;
  }

  if (!pathname.startsWith(`${APP_ROUTES.SETTINGS.ROOT}/`)) {
    return false;
  }

  const segment =
    pathname.slice(APP_ROUTES.SETTINGS.ROOT.length + 1).split('/')[0] ?? '';

  return (PERSONAL_SETTINGS_CHILD_SEGMENTS as readonly string[]).includes(
    segment,
  );
}

export const LEGACY_APP_ROUTES = {
  /**
   * @deprecated Newsletter writing is Agent-first. This path permanently
   * redirects to APP_ROUTES.AGENT.NEW; `?id=` links resolve to the editor.
   */
  PUBLISHING_NEWSLETTERS: '/publishing/newsletters',
  /**
   * @deprecated Legacy cron-jobs lab. Permanently redirects to
   * APP_ROUTES.AUTOMATION.WORKFLOWS. Scheduling is workflow-canonical.
   */
  LAB_CRON_JOBS: '/lab/cron-jobs',
  /**
   * @deprecated Not a standalone Workflows app. Permanently redirects to
   * APP_ROUTES.AUTOMATION.WORKFLOWS (and nested templates/executions).
   */
  WORKFLOWS: '/workflows',
  /** @deprecated Use APP_ROUTES.WORKSPACE.TASKS. */
  TASKS: '/tasks',
} as const;

/** Artifact type → canonical Publishing editor route root. */
export const ARTIFACT_EDITOR_ROUTES = {
  article: APP_ROUTES.PUBLISHING.POSTS,
  newsletter: APP_ROUTES.PUBLISHING.POSTS,
  post: APP_ROUTES.PUBLISHING.POSTS,
} as const;

export type ArtifactEditorType = keyof typeof ARTIFACT_EDITOR_ROUTES;

/**
 * @deprecated Legacy query param. The Publishing desk resolves editor kind from
 * the entity the id belongs to (post / article / newsletter). Still accepted
 * nowhere as source of truth; kept only so old bookmarked URLs do not 404.
 */
export const ARTIFACT_EDITOR_KIND_PARAM = 'kind';

type NestedRouteValue<T> = T extends string
  ? T
  : T extends Readonly<Record<string, unknown>>
    ? NestedRouteValue<T[keyof T]>
    : never;

export type AppRoute = NestedRouteValue<typeof APP_ROUTES>;
export type AppRoutePrefix =
  (typeof APP_ROUTE_PREFIXES)[keyof typeof APP_ROUTE_PREFIXES];

function normalizeScopedRoutePath(path: string): string {
  if (path.length === 0 || path === APP_ROUTES.ROOT) {
    return '';
  }

  return path.startsWith('/') ? path : `/${path}`;
}

export function createBrandAppRoute(
  orgSlug: string,
  brandSlug: string,
  path: string = APP_ROUTES.ROOT,
): string {
  return `/${orgSlug}/${brandSlug}${normalizeScopedRoutePath(path)}`;
}

/**
 * Inverse of {@link createBrandAppRoute} / {@link createOrganizationAppRoute}.
 * Parent layouts sit above `[orgSlug]/[brandSlug]`, so `useParams()` there
 * cannot see the current brand. Parse the URL instead.
 */
const RESERVED_APP_ROOT_SEGMENTS = new Set(
  [
    ...Object.values(APP_ROUTE_PREFIXES).map(
      (prefix) => prefix.replace(/^\//, '').split('/')[0] ?? '',
    ),
    APP_ROUTES.CONNECT.replace(/^\//, ''),
    APP_ROUTES.LOGIN.replace(/^\//, ''),
    APP_ROUTES.LOGOUT.replace(/^\//, ''),
    APP_ROUTES.SIGN_UP.replace(/^\//, ''),
    APP_ROUTES.OAUTH.replace(/^\//, ''),
    LEGACY_APP_ROUTES.TASKS.replace(/^\//, '').split('/')[0] ?? '',
    LEGACY_APP_ROUTES.LAB_CRON_JOBS.replace(/^\//, '').split('/')[0] ?? '',
    'agent-auth',
    'api',
    'desktop',
    'forgot-password',
    'ingest',
    'managed-credits',
    'monitoring',
    'onboarding',
    'request-access',
    'reset-password',
    'serwist',
    'sign-in',
    'trpc',
    'v1',
  ].filter(Boolean),
);

export function parseScopedAppPath(pathname: string): {
  brandSlug: string;
  orgSlug: string;
} {
  const parts = pathname.split('/').filter(Boolean);
  const first = parts[0];

  // Known product roots stay unscoped. Every other lone segment is handled by
  // the `/:orgSlug` landing route and must be reconciled as organization scope
  // before tenant content mounts.
  if (!first || RESERVED_APP_ROOT_SEGMENTS.has(first)) {
    return { brandSlug: '', orgSlug: '' };
  }

  if (parts.length === 1) {
    return { brandSlug: '', orgSlug: first };
  }

  if (parts[1] === '~') {
    return { brandSlug: '', orgSlug: first };
  }

  return { brandSlug: parts[1] ?? '', orgSlug: first };
}

const AUTH_CONTINUATION_ROUTE_PREFIXES = [
  ...Object.values(APP_ROUTE_PREFIXES),
  APP_ROUTES.CONNECT,
  APP_ROUTES.OAUTH,
  APP_ROUTES.ONBOARDING.ROOT,
  '/agent-auth',
  APP_ROUTES.DESKTOP.LOCAL,
  '/managed-credits',
  '/request-access',
  LEGACY_APP_ROUTES.TASKS,
  LEGACY_APP_ROUTES.WORKFLOWS,
] as const;
const AUTH_CONTINUATION_SCOPE_SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

function decodeAppPathname(pathname: string): string | null {
  let decoded = pathname;

  try {
    for (let pass = 0; pass < 3; pass += 1) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) {
        break;
      }
      decoded = next;
    }
  } catch {
    return null;
  }

  if (
    !decoded.startsWith('/') ||
    decoded.startsWith('//') ||
    decoded.includes('\\') ||
    [...decoded].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 31 || codePoint === 127;
    })
  ) {
    return null;
  }

  return decoded;
}

/**
 * Whether a pathname is a user-facing Genfeed navigation destination.
 *
 * Authentication continuations use this positive product-route boundary so
 * infrastructure endpoints and future runtime mounts cannot become post-login
 * destinations merely because they share the app origin.
 */
export function isUserFacingAppPathname(pathname: string): boolean {
  const decoded = decodeAppPathname(pathname);
  if (!decoded) {
    return false;
  }

  if (decoded === APP_ROUTES.ROOT) {
    return true;
  }

  const normalized = decoded.toLowerCase();
  if (
    AUTH_CONTINUATION_ROUTE_PREFIXES.some(
      (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
    )
  ) {
    return true;
  }

  const scope = parseScopedAppPath(normalized);
  return (
    AUTH_CONTINUATION_SCOPE_SLUG_RE.test(scope.orgSlug) &&
    (!scope.brandSlug || AUTH_CONTINUATION_SCOPE_SLUG_RE.test(scope.brandSlug))
  );
}

/** Brand-relative path to a destination hub: `/platforms/instagram`. */
export function createPlatformHomeRoute(platform: string): string {
  return `${APP_ROUTES.PLATFORMS.ROOT}/${encodeURIComponent(platform)}`;
}

/** Append a `platform=` filter to an existing brand-relative path. */
export function withPlatformQuery(path: string, platform: string): string {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}platform=${encodeURIComponent(platform)}`;
}

export function createOrganizationAppRoute(
  orgSlug: string,
  path: string = APP_ROUTES.ROOT,
): string {
  return `/${orgSlug}/~${normalizeScopedRoutePath(path)}`;
}

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

function workspaceSurfacePath(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length < 3) {
    return APP_ROUTES.WORKSPACE.OVERVIEW;
  }

  const rest = `/${parts.slice(2).join('/')}`;
  return rest === '/overview' ? APP_ROUTES.WORKSPACE.OVERVIEW : rest;
}

function toOrganizationScopePath(brandScopedPath: string): string {
  const path = brandScopedPath.startsWith('/')
    ? brandScopedPath
    : `/${brandScopedPath}`;

  for (const prefix of BRAND_ONLY_SETTINGS_PREFIXES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) {
      return APP_ROUTES.SETTINGS.BRANDS;
    }
  }

  return path;
}

/**
 * Client-side org switch keeps the current app surface. Brand-only settings
 * fall back to the org brands hub so the destination is never a 404.
 */
export function getOrgSwitchHref(
  nextOrgSlug: string,
  pathname: string,
): string {
  return createOrganizationAppRoute(
    nextOrgSlug,
    toOrganizationScopePath(workspaceSurfacePath(pathname)),
  );
}

/**
 * Build the brand-relative path to an artifact's dedicated editor page.
 * Pass the result through `useOrgUrl().href()` to scope it to org + brand.
 *
 * Kind is **not** encoded in the URL. Posts, articles, and newsletters are
 * separate tables with no shared `type` column; the desk at
 * `/publishing/posts/:id` resolves which editor to mount by looking up the id.
 * `artifactType` is kept so callers stay explicit when constructing links.
 */
export function createArtifactEditorRoute(
  artifactType: ArtifactEditorType,
  artifactId: string,
): string {
  return `${ARTIFACT_EDITOR_ROUTES[artifactType]}/${artifactId}`;
}
