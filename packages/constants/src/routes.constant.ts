export const APP_ROUTES = {
  ROOT: '/',
  CONNECT: '/connect',
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
    FLEET: {
      CHARACTERS: '/admin/fleet/characters',
      GALLERY: '/admin/fleet/gallery',
      GENERATE: '/admin/fleet/generate',
      INFRASTRUCTURE: '/admin/fleet/infrastructure',
      LIP_SYNC: '/admin/fleet/lip-sync',
      PIPELINE: '/admin/fleet/pipeline',
      TRAINING: '/admin/fleet/training',
      VOICES: '/admin/fleet/voices',
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
  AUTOMATE: {
    /**
     * @deprecated Legacy path — permanently redirects to Analytics Overview.
     * Prefer APP_ROUTES.ANALYTICS.OVERVIEW for links.
     */
    ANALYTICS: '/automate/analytics',
    AUTOPILOT: '/automate/autopilot',
    CONFIGURATION: '/automate/configuration',
    /** Content-run history: briefs handed off from Discover through publish. */
    CONTENT_RUNS: '/automate/content-runs',
    HIRE: '/automate/hire',
    LIBRARY: '/automate/library',
    NEW: '/automate/new',
    ORCHESTRATOR: '/automate/orchestrator',
    /**
     * Canonical automate home. Bare ROOT permanently redirects here so Overview
     * is a complete path (same pattern as workspace/overview).
     */
    OVERVIEW: '/automate/overview',
    ROOT: '/automate',
    RUNS: '/automate/runs',
    SKILLS: '/automate/skills',
    STRATEGIES: '/automate/strategies',
    /**
     * Agent-driven content campaigns (bulk production programs).
     * Canonical home under Automate — not Publish.
     */
    CAMPAIGNS: '/automate/campaigns',
    CAMPAIGNS_NEW: '/automate/campaigns/new',
    /**
     * Outreach / growth engagement campaigns (replies, DMs).
     * Canonical home under Automate — not Publish.
     */
    OUTREACH_CAMPAIGNS: '/automate/outreach-campaigns',
    OUTREACH_CAMPAIGNS_NEW: '/automate/outreach-campaigns/new',
    /** Throttled social reply drip campaigns. */
    REPLY_CAMPAIGNS: '/automate/reply-campaigns',
    /** Pipeline canvas library (merged former /workflows surface). */
    WORKFLOWS: '/automate/workflows',
    WORKFLOWS_EXECUTIONS: '/automate/workflows/executions',
    WORKFLOWS_NEW: '/automate/workflows/new',
    WORKFLOWS_TEMPLATES: '/automate/workflows/templates',
  },
  DISCOVER: {
    ADS: '/discover/ads',
    ADS_GOOGLE: '/discover/ads/google',
    ADS_META: '/discover/ads/meta',
    ADS_TIKTOK: '/discover/ads/tiktok',
    /**
     * @deprecated Use OVERVIEW. Bare `/discover/discovery` permanently redirects
     * to `/discover/overview` (same pattern as workspace/analytics/automate).
     */
    DISCOVERY: '/discover/discovery',
    FOLLOWING: '/discover/following',
    /**
     * Canonical Discover home. Bare ROOT permanently redirects here so Overview
     * is a complete path (same pattern as workspace/overview).
     */
    OVERVIEW: '/discover/overview',
    /**
     * Platform feeds. Served by the dynamic `/discover/[platform]` route, but
     * enumerated here because they are real menu destinations — same reason
     * `ADS_*` are spelled out rather than built from a segment.
     */
    PLATFORM_INSTAGRAM: '/discover/instagram',
    PLATFORM_LINKEDIN: '/discover/linkedin',
    PLATFORM_PINTEREST: '/discover/pinterest',
    PLATFORM_REDDIT: '/discover/reddit',
    PLATFORM_TIKTOK: '/discover/tiktok',
    PLATFORM_TWITTER: '/discover/twitter',
    PLATFORM_YOUTUBE: '/discover/youtube',
    ROOT: '/discover',
    /**
     * @deprecated Same TrendsList as OVERVIEW. Permanently redirects to
     * `/discover/overview` — keep for deep-link compatibility only.
     */
    SOCIALS: '/discover/socials',
  },
  /**
   * Legacy long-form editor aliases retained for existing deep links. New
   * operator navigation uses the type-aware `/publish/posts/{id}` route built
   * by `createArtifactEditorRoute`. Distinct from STUDIO.EDIT, which is the
   * Remotion project canvas.
   */
  EDIT: {
    ARTICLE: '/edit/article',
    NEWSLETTER: '/edit/newsletter',
    ROOT: '/edit',
  },
  LAB: {
    ARTICLES: '/lab/articles',
    LIBRARY_PREVIEW: '/lab/library-preview',
    TWITTER_ENGAGE: '/lab/twitter-engage',
  },
  LIBRARY: {
    AVATARS: '/library/avatars',
    CAPTIONS: '/library/captions',
    GIFS: '/library/gifs',
    IMAGES: '/library/images',
    /** @deprecated Use OVERVIEW. Retained for legacy deep-link redirects. */
    INGREDIENTS: '/library/ingredients',
    MOODBOARD: '/library/moodboard',
    MUSIC: '/library/music',
    /**
     * Canonical library home. Bare ROOT permanently redirects here so Overview
     * is a complete path (same pattern as workspace/overview).
     */
    OVERVIEW: '/library/overview',
    ROOT: '/library',
    VIDEOS: '/library/videos',
    VOICES: '/library/voices',
  },
  MESSAGES: {
    ROOT: '/messages',
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
    ACTIVITIES: '/overview/activities',
    ROOT: '/overview',
  },
  PUBLISH: {
    CALENDAR: '/publish/calendar',
    /** Posts whose latest publication attempt failed. */
    FAILED: '/publish/failed',
    /** Posts queued to enter the publishing pipeline. */
    PENDING: '/publish/pending',
    /**
     * @deprecated Canonical path is APP_ROUTES.AUTOMATE.CAMPAIGNS.
     * Legacy `/publish/campaigns` permanently redirects there.
     */
    CAMPAIGNS: '/automate/campaigns',
    /** @deprecated Use APP_ROUTES.AUTOMATE.CAMPAIGNS_NEW. */
    CAMPAIGNS_NEW: '/automate/campaigns/new',
    /**
     * @deprecated Canonical path is APP_ROUTES.AUTOMATE.OUTREACH_CAMPAIGNS.
     * Legacy `/publish/outreach-campaigns` permanently redirects there.
     */
    OUTREACH_CAMPAIGNS: '/automate/outreach-campaigns',
    /** @deprecated Use APP_ROUTES.AUTOMATE.OUTREACH_CAMPAIGNS_NEW. */
    OUTREACH_CAMPAIGNS_NEW: '/automate/outreach-campaigns/new',
    /**
     * Canonical Publish home (dashboard). Bare ROOT permanently redirects
     * here so Overview is a complete path that does not prefix-match Review /
     * Posts / etc. (same pattern as workspace/discover/library).
     */
    OVERVIEW: '/publish/overview',
    /**
     * Canonical content library + type-aware editor.
     * - List: `/publish/posts`
     * - Editor: `/publish/posts/:id` (social post today; article/newsletter
     *   can share this path once kind resolution is wired)
     */
    POSTS: '/publish/posts',
    /** Posts currently being sent to destination platforms. */
    PROCESSING: '/publish/processing',
    PUBLISHED: '/publish/published',
    /**
     * Remix is a contextual **action** (Discover/Library button), not a module
     * page. This path is the deep-link target for that action only — never a
     * Publish nav item.
     */
    REMIX: '/publish/remix',
    REVIEW: '/publish/review',
    ROOT: '/publish',
    /** Pipeline shortcut: drafts + scheduled + in-progress (not live). */
    SCHEDULED: '/publish/scheduled',
  },
  SETTINGS: {
    API_KEYS: '/settings/api-keys',
    BRANDS: '/settings/brands',
    CREDITS: '/settings/credits',
    /** Provider BYOK keys (OpenAI, Replicate, …) — not Genfeed product API keys. */
    INTEGRATIONS: '/settings/integrations',
    SUBSCRIPTION: '/settings/subscription',
    ELEMENTS_SCENES: '/settings/elements/scenes',
    HELP: '/settings/help',
    MEMBERS: '/settings/members',
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
    POLICY: '/settings/policy',
    PUBLISHING: '/settings/publishing',
    ROOT: '/settings',
    /**
     * Brand-scoped social + ad OAuth connect surface (Facebook → Meta Ads,
     * Google Ads, Twitter, etc.). Canonical home for "connect accounts".
     */
    SOCIAL: '/settings/social',
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
     * Activity/Tasks/Inbox (same pattern as Studio → Storyboard, Discover →
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
  AUTOMATE: APP_ROUTES.AUTOMATE.ROOT,
  DISCOVER: APP_ROUTES.DISCOVER.ROOT,
  EDIT: APP_ROUTES.EDIT.ROOT,
  LIBRARY: '/library',
  MESSAGES: APP_ROUTES.MESSAGES.ROOT,
  OVERVIEW: APP_ROUTES.OVERVIEW.ROOT,
  PUBLISH: APP_ROUTES.PUBLISH.ROOT,
  SETTINGS: APP_ROUTES.SETTINGS.ROOT,
  STUDIO: APP_ROUTES.STUDIO.ROOT,
  WORKSPACE: APP_ROUTES.WORKSPACE.ROOT,
} as const;

export const APP_ROUTE_TEMPLATES = {
  BRAND: '/:orgSlug/:brandSlug',
  BRAND_SETTINGS: '/:orgSlug/:brandSlug/settings',
  ORGANIZATION: '/:orgSlug/~',
  ORGANIZATION_SETTINGS: '/:orgSlug/~/settings',
  PERSONAL_SETTINGS: APP_ROUTES.SETTINGS.ROOT,
} as const;

export const LEGACY_APP_ROUTES = {
  /**
   * @deprecated Newsletter writing is Agent-first. This path permanently
   * redirects to APP_ROUTES.AGENT.NEW; `?id=` links resolve to the editor.
   */
  PUBLISH_NEWSLETTERS: '/publish/newsletters',
  /** @deprecated Use APP_ROUTES.WORKSPACE.TASKS. */
  TASKS: '/tasks',
} as const;

/** Artifact type → canonical Publish editor route root. */
export const ARTIFACT_EDITOR_ROUTES = {
  article: APP_ROUTES.PUBLISH.POSTS,
  newsletter: APP_ROUTES.PUBLISH.POSTS,
  post: APP_ROUTES.PUBLISH.POSTS,
} as const;

export type ArtifactEditorType = keyof typeof ARTIFACT_EDITOR_ROUTES;

/**
 * Query parameter carrying the list an artifact editor was opened from, so
 * back-navigation returns to that list instead of a hardcoded default.
 */
export const ARTIFACT_EDITOR_RETURN_PARAM = 'returnTo';

/** Query parameter identifying the editor surface hosted by Publish. */
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

export function createOrganizationAppRoute(
  orgSlug: string,
  path: string = APP_ROUTES.ROOT,
): string {
  return `/${orgSlug}/~${normalizeScopedRoutePath(path)}`;
}

/**
 * Build the brand-relative path to an artifact's dedicated editor page.
 * Pass the result through `useOrgUrl().href()` to scope it to org + brand.
 */
export function createArtifactEditorRoute(
  artifactType: ArtifactEditorType,
  artifactId: string,
): string {
  const editorRoute = `${ARTIFACT_EDITOR_ROUTES[artifactType]}/${artifactId}`;

  return artifactType === 'post'
    ? editorRoute
    : `${editorRoute}?${ARTIFACT_EDITOR_KIND_PARAM}=${artifactType}`;
}

/** Append the originating list to an artifact editor href. */
export function withArtifactEditorReturn(
  editorHref: string,
  returnTo: string,
): string {
  const separator = editorHref.includes('?') ? '&' : '?';

  return `${editorHref}${separator}${ARTIFACT_EDITOR_RETURN_PARAM}=${encodeURIComponent(returnTo)}`;
}

/**
 * Resolve an artifact editor's back destination.
 *
 * Only same-origin absolute paths are honoured — a protocol-relative or
 * absolute-URL value would turn the editor into an open redirect, so anything
 * that is not a single-slash-prefixed path falls back to the owning list.
 */
export function resolveArtifactEditorBackHref(
  returnTo: string | null | undefined,
  fallbackHref: string,
): string {
  const normalizedReturnTo = returnTo?.replace(/\\/g, '/');

  if (
    !normalizedReturnTo?.startsWith('/') ||
    normalizedReturnTo.startsWith('//')
  ) {
    return fallbackHref;
  }

  return normalizedReturnTo;
}
