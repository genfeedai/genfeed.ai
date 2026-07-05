export const APP_ROUTES = {
  ROOT: '/',
  LOGIN: '/login',
  LOGOUT: '/logout',
  MANAGED_CREDITS_SUCCESS: '/managed-credits/success',
  OAUTH: '/oauth',
  REQUEST_ACCESS: '/request-access',
  SIGN_UP: '/sign-up',
  ADMIN: {
    ROOT: '/admin',
    ADMINISTRATION: {
      ANNOUNCEMENTS: '/admin/administration/announcements',
      PLATFORM_SETTINGS: '/admin/administration/platform-settings',
      ROLES: '/admin/administration/roles',
      SUBSCRIPTIONS: '/admin/administration/subscriptions',
      USERS: '/admin/administration/users',
      WARMUP_ACCOUNTS: '/admin/administration/warmup-accounts',
    },
    AGENT: '/admin/agent',
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
      FONT_FAMILIES: '/admin/configuration/font-families',
      PRESETS: '/admin/configuration/presets',
      TAGS: '/admin/configuration/tags',
      TAGS_ALL: '/admin/configuration/tags/all',
    },
    CONTENT: {
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
    DARKROOM: {
      CHARACTERS: '/admin/fleet/characters',
      GALLERY: '/admin/fleet/gallery',
      GENERATE: '/admin/fleet/generate',
      INFRASTRUCTURE: '/admin/fleet/infrastructure',
      LIP_SYNC: '/admin/fleet/lip-sync',
      PIPELINE: '/admin/fleet/pipeline',
      TRAINING: '/admin/fleet/training',
      VOICES: '/admin/fleet/voices',
    },
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
  },
  ANALYTICS: {
    ROOT: '/analytics',
    BRANDS: '/analytics/brands',
    HOOKS: '/analytics/hooks',
    INSIGHTS: '/analytics/insights',
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
  COMPOSE: {
    ARTICLE: '/compose/article',
    NEWSLETTER: '/compose/newsletter',
    POST: '/compose/post',
    ROOT: '/compose',
  },
  EDITOR: {
    NEW: '/editor/new',
    ROOT: '/editor',
  },
  LAB: {
    ARTICLES: '/lab/articles',
    CRON_JOBS: '/workflows',
    LIBRARY_PREVIEW: '/lab/library-preview',
    TWITTER_ENGAGE: '/lab/twitter-engage',
  },
  LIBRARY: {
    AVATARS: '/library/avatars',
    CAPTIONS: '/library/captions',
    GIFS: '/library/gifs',
    IMAGES: '/library/images',
    INGREDIENTS: '/library/ingredients',
    MOODBOARD: '/library/moodboard',
    MUSIC: '/library/music',
    ROOT: '/library/ingredients',
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
  ORCHESTRATION: {
    ANALYTICS: '/orchestration/analytics',
    AUTOPILOT: '/orchestration/autopilot',
    CAMPAIGNS: '/orchestration/campaigns',
    CAMPAIGNS_NEW: '/orchestration/campaigns/new',
    CONFIGURATION: '/orchestration/configuration',
    HIRE: '/orchestration/hire',
    LIBRARY: '/orchestration/library',
    NEW: '/orchestration/new',
    ORCHESTRATOR: '/orchestration/orchestrator',
    OUTREACH_CAMPAIGNS: '/orchestration/outreach-campaigns',
    OUTREACH_CAMPAIGNS_NEW: '/orchestration/outreach-campaigns/new',
    OVERVIEW: '/orchestration/overview',
    ROOT: '/orchestration',
    RUNS: '/orchestration/runs',
    SKILLS: '/orchestration/skills',
    WORKFLOWS: '/orchestration/workflows',
  },
  OVERVIEW: {
    ACTIVITIES: '/overview/activities',
    ROOT: '/overview',
  },
  POSTS: {
    ANALYTICS: '/posts/analytics',
    CALENDAR: '/posts/calendar',
    NEWSLETTERS: '/posts/newsletters',
    PUBLISHED: '/posts/published',
    REMIX: '/posts/remix',
    REVIEW: '/posts/review',
    ROOT: '/posts',
    SCHEDULED: '/posts/scheduled',
  },
  RESEARCH: {
    ADS: '/research/ads',
    ADS_GOOGLE: '/research/ads/google',
    ADS_META: '/research/ads/meta',
    DISCOVERY: '/research/discovery',
    ROOT: '/research',
    SOCIALS: '/research/socials',
  },
  SETTINGS: {
    API_KEYS: '/settings/api-keys',
    BILLING: '/settings/billing',
    BRANDS: '/settings/brands',
    HELP: '/settings/help',
    MEMBERS: '/settings/members',
    MODELS: '/settings/models',
    MODEL_TRAININGS: '/settings/models/trainings',
    PERSONAL: '/settings/personal',
    POLICY: '/settings/policy',
    ROOT: '/settings',
  },
  STUDIO: {
    AVATAR: '/studio/avatar',
    BATCH: '/studio/batch',
    CLIPS: '/studio/clips',
    FASTLANE: '/studio/fastlane',
    IMAGE: '/studio/image',
    MUSIC: '/studio/music',
    ROOT: '/studio',
    VIDEO: '/studio/video',
  },
  TASKS: {
    ROOT: '/tasks',
  },
  WORKFLOWS: {
    AUTOPILOT: '/workflows/autopilot',
    CONFIGURATION: '/workflows/configuration',
    EXECUTIONS: '/workflows/executions',
    NEW: '/workflows/new',
    ROOT: '/workflows',
    TEMPLATES: '/workflows/templates',
  },
  WORKSPACE: {
    ACTIVITY: '/workspace/activity',
    INBOX: '/workspace/inbox',
    INBOX_ALL: '/workspace/inbox/all',
    INBOX_RECENT: '/workspace/inbox/recent',
    INBOX_UNREAD: '/workspace/inbox/unread',
    OVERVIEW: '/workspace/overview',
    ROOT: '/workspace',
  },
} as const;

export const APP_ROUTE_PREFIXES = {
  ADMIN: APP_ROUTES.ADMIN.ROOT,
  ANALYTICS: APP_ROUTES.ANALYTICS.ROOT,
  AGENT: APP_ROUTES.AGENT.ROOT,
  COMPOSE: APP_ROUTES.COMPOSE.ROOT,
  EDITOR: APP_ROUTES.EDITOR.ROOT,
  LIBRARY: '/library',
  MESSAGES: APP_ROUTES.MESSAGES.ROOT,
  ORCHESTRATION: APP_ROUTES.ORCHESTRATION.ROOT,
  POSTS: APP_ROUTES.POSTS.ROOT,
  SETTINGS: APP_ROUTES.SETTINGS.ROOT,
  STUDIO: APP_ROUTES.STUDIO.ROOT,
  TASKS: APP_ROUTES.TASKS.ROOT,
  WORKFLOWS: APP_ROUTES.WORKFLOWS.ROOT,
  WORKSPACE: APP_ROUTES.WORKSPACE.ROOT,
} as const;

export const APP_ROUTE_TEMPLATES = {
  BRAND: '/:orgSlug/:brandSlug',
  BRAND_SETTINGS: '/:orgSlug/:brandSlug/settings',
  ORGANIZATION: '/:orgSlug/~',
  ORGANIZATION_SETTINGS: '/:orgSlug/~/settings',
  PERSONAL_SETTINGS: APP_ROUTES.SETTINGS.ROOT,
} as const;

export const COMPOSE_ROUTES = APP_ROUTES.COMPOSE;

type NestedRouteValue<T> = T extends string
  ? T
  : T extends Readonly<Record<string, unknown>>
    ? NestedRouteValue<T[keyof T]>
    : never;

export type AppRoute = NestedRouteValue<typeof APP_ROUTES>;
export type AppRoutePrefix =
  (typeof APP_ROUTE_PREFIXES)[keyof typeof APP_ROUTE_PREFIXES];
export type ComposeRoute = (typeof COMPOSE_ROUTES)[keyof typeof COMPOSE_ROUTES];

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
