import type {
  ResolvedWorkspaceShellRoute,
  WorkspaceShellAccessPolicy,
  WorkspaceShellAuxiliaryRegistration,
  WorkspaceShellDeployment,
  WorkspaceShellOverlayRegistration,
  WorkspaceShellRestorationPolicy,
  WorkspaceShellRouteMode,
  WorkspaceShellRouteRegistration,
  WorkspaceShellScopeRequirement,
} from '@genfeedai/interfaces/ui/workspace-shell.interface';

export type {
  ResolvedWorkspaceShellRoute,
  WorkspaceShellAccessPolicy,
  WorkspaceShellAdapterSeam,
  WorkspaceShellAuxiliaryRegistration,
  WorkspaceShellAvailability,
  WorkspaceShellBaseState,
  WorkspaceShellChromeRegistration,
  WorkspaceShellDeployment,
  WorkspaceShellLaunchTarget,
  WorkspaceShellOverlayRegistration,
  WorkspaceShellReferenceKind,
  WorkspaceShellRestorationPolicy,
  WorkspaceShellRouteMode,
  WorkspaceShellRouteRegistration,
  WorkspaceShellScopeRequirement,
  WorkspaceShellSurfaceMode,
} from '@genfeedai/interfaces/ui/workspace-shell.interface';

type RouteGroupConfig = {
  readonly adapterStatus?: WorkspaceShellRouteRegistration['adapter']['status'];
  readonly fallback: string;
  readonly mode: WorkspaceShellRouteMode;
  readonly scope: WorkspaceShellScopeRequirement;
  readonly surfaceKey: string;
  readonly switcherItems?: readonly string[];
  readonly telemetryClass: WorkspaceShellRouteRegistration['telemetryClass'];
};

type CompiledRouteRegistration = {
  readonly matcher: RegExp;
  readonly parameterNames: readonly string[];
  readonly registration: WorkspaceShellRouteRegistration;
  readonly specificity: number;
};

const ALL_DEPLOYMENTS = Object.freeze([
  'cloud-web',
  'self-hosted-web',
  'desktop',
] as const satisfies readonly WorkspaceShellDeployment[]);

const URL_RESTORATION_POLICY = Object.freeze({
  history: 'canonical-url',
  invalidShellParams: 'replace',
  searchParams: 'preserve-opaque',
} as const satisfies WorkspaceShellRestorationPolicy);

const RESERVED_SCOPED_ROUTE_PREFIXES = Object.freeze(['admin', 'settings']);

const ACCESS_POLICY_BY_SCOPE = Object.freeze({
  brand: 'brand-member',
  organization: 'organization-member',
  personal: 'authenticated',
  'platform-admin': 'platform-admin',
} as const satisfies Record<
  WorkspaceShellScopeRequirement,
  WorkspaceShellAccessPolicy
>);

const ADAPTER_STATUS_BY_MODE = Object.freeze({
  canvas: 'placeholder',
  conversation: 'placeholder',
  dedicated: 'dedicated-route',
} as const satisfies Record<
  WorkspaceShellRouteMode,
  WorkspaceShellRouteRegistration['adapter']['status']
>);

const AVAILABILITY_BY_MODE = Object.freeze({
  canvas: 'conversation-shell',
  conversation: 'conversation-shell',
  dedicated: 'always',
} as const satisfies Record<
  WorkspaceShellRouteMode,
  WorkspaceShellRouteRegistration['availability']
>);

const LAUNCH_TARGET_BY_MODE = Object.freeze({
  canvas: 'focused-canvas',
  conversation: 'inline',
  dedicated: 'dedicated-route',
} as const satisfies Record<
  WorkspaceShellRouteMode,
  WorkspaceShellRouteRegistration['launchTarget']
>);

function freezeRouteRegistration(
  canonicalUrl: string,
  config: RouteGroupConfig,
): WorkspaceShellRouteRegistration {
  return Object.freeze({
    accessPolicy: ACCESS_POLICY_BY_SCOPE[config.scope],
    adapter: Object.freeze({
      key: config.surfaceKey,
      status: config.adapterStatus ?? ADAPTER_STATUS_BY_MODE[config.mode],
    }),
    allowedShellModes: Object.freeze([config.mode] as const),
    availability: AVAILABILITY_BY_MODE[config.mode],
    canonicalUrl,
    deployments: ALL_DEPLOYMENTS,
    key: `route:${canonicalUrl}`,
    kind: 'route',
    launchTarget: LAUNCH_TARGET_BY_MODE[config.mode],
    mode: config.mode,
    restoration: URL_RESTORATION_POLICY,
    safeFallback: config.fallback,
    scope: config.scope,
    surfaceKey: config.surfaceKey,
    switcherItems: Object.freeze([...(config.switcherItems ?? [])]),
    telemetryClass: config.telemetryClass,
  });
}

function registerRoutes(
  canonicalUrls: readonly string[],
  config: RouteGroupConfig,
): readonly WorkspaceShellRouteRegistration[] {
  return canonicalUrls.map((canonicalUrl) =>
    freezeRouteRegistration(canonicalUrl, config),
  );
}

const PERSONAL_ROUTE_REGISTRATIONS = [
  ...registerRoutes(['/'], {
    fallback: '/',
    mode: 'dedicated',
    scope: 'personal',
    surfaceKey: 'protected-bootstrap',
    telemetryClass: 'management',
  }),
  ...registerRoutes(['/settings', '/settings/help'], {
    fallback: '/settings',
    mode: 'dedicated',
    scope: 'personal',
    surfaceKey: 'personal-settings',
    telemetryClass: 'management',
  }),
] as const;

const ORGANIZATION_ROUTE_REGISTRATIONS = [
  ...registerRoutes(
    ['/:orgSlug', '/:orgSlug/~/overview', '/:orgSlug/~/analytics/overview'],
    {
      fallback: '/:orgSlug/~/overview',
      mode: 'canvas',
      scope: 'organization',
      surfaceKey: 'organization-overview',
      switcherItems: ['workspace', 'messages', 'research'],
      telemetryClass: 'product',
    },
  ),
  ...registerRoutes(
    ['/:orgSlug/~/agent', '/:orgSlug/~/agent/new', '/:orgSlug/~/agent/:id'],
    {
      fallback: '/:orgSlug/~/agent',
      mode: 'conversation',
      scope: 'organization',
      surfaceKey: 'agent-conversation',
      switcherItems: ['agent'],
      telemetryClass: 'agent',
    },
  ),
  ...registerRoutes(
    [
      '/:orgSlug/~/agent/journey',
      '/:orgSlug/~/agent/onboarding',
      '/:orgSlug/~/agent/onboarding/:threadId',
    ],
    {
      fallback: '/:orgSlug/~/agent',
      mode: 'dedicated',
      scope: 'organization',
      surfaceKey: 'agent-onboarding',
      telemetryClass: 'management',
    },
  ),
  ...registerRoutes(
    [
      '/:orgSlug/~/settings',
      '/:orgSlug/~/settings/personal',
      '/:orgSlug/~/settings/help',
      '/:orgSlug/~/settings/members',
      '/:orgSlug/~/settings/billing',
      '/:orgSlug/~/settings/credits',
      '/:orgSlug/~/settings/api-keys',
      '/:orgSlug/~/settings/webhooks',
      '/:orgSlug/~/settings/policy',
      '/:orgSlug/~/settings/brands',
      '/:orgSlug/~/settings/models',
      '/:orgSlug/~/settings/models/:type',
      '/:orgSlug/~/settings/elements/scenes',
    ],
    {
      fallback: '/:orgSlug/~/settings',
      mode: 'dedicated',
      scope: 'organization',
      surfaceKey: 'organization-settings',
      telemetryClass: 'management',
    },
  ),
  ...registerRoutes(['/:orgSlug/~/library', '/:orgSlug/~/library/:type'], {
    fallback: '/:orgSlug/~/library',
    mode: 'canvas',
    scope: 'organization',
    surfaceKey: 'library',
    switcherItems: ['library'],
    telemetryClass: 'product',
  }),
  ...registerRoutes(['/:orgSlug/~/studio', '/:orgSlug/~/studio/:type'], {
    fallback: '/:orgSlug/~/studio',
    mode: 'canvas',
    scope: 'organization',
    surfaceKey: 'studio',
    switcherItems: ['studio'],
    telemetryClass: 'product',
  }),
  ...registerRoutes(
    [
      '/:orgSlug/~/posts',
      '/:orgSlug/~/posts/published',
      '/:orgSlug/~/posts/scheduled',
    ],
    {
      fallback: '/:orgSlug/~/posts',
      mode: 'canvas',
      scope: 'organization',
      surfaceKey: 'publish',
      switcherItems: ['posts', 'remix'],
      telemetryClass: 'product',
    },
  ),
  ...registerRoutes(
    [
      '/:orgSlug/~/write',
      '/:orgSlug/~/write/:segment',
      '/:orgSlug/~/compose',
      '/:orgSlug/~/compose/:segment',
    ],
    {
      fallback: '/:orgSlug/~/compose',
      mode: 'canvas',
      scope: 'organization',
      surfaceKey: 'compose',
      telemetryClass: 'product',
    },
  ),
  ...registerRoutes(
    [
      '/:orgSlug/~/workflows',
      '/:orgSlug/~/workflows/library',
      '/:orgSlug/~/workflows/templates',
      '/:orgSlug/~/workflows/executions',
      '/:orgSlug/~/workflows/new',
      '/:orgSlug/~/workflows/:id',
    ],
    {
      fallback: '/:orgSlug/~/workflows',
      mode: 'canvas',
      scope: 'organization',
      surfaceKey: 'workflows',
      telemetryClass: 'product',
    },
  ),
  ...registerRoutes(
    [
      '/:orgSlug/~/editor',
      '/:orgSlug/~/editor/projects',
      '/:orgSlug/~/editor/new',
      '/:orgSlug/~/editor/:id',
    ],
    {
      fallback: '/:orgSlug/~/editor',
      mode: 'dedicated',
      scope: 'organization',
      surfaceKey: 'editor',
      telemetryClass: 'management',
    },
  ),
] as const;

const BRAND_ROUTE_REGISTRATIONS = [
  ...registerRoutes(
    [
      '/:orgSlug/:brandSlug/workspace',
      '/:orgSlug/:brandSlug/workspace/overview',
      '/:orgSlug/:brandSlug/workspace/inbox/:view',
      '/:orgSlug/:brandSlug/workspace/activity',
      '/:orgSlug/:brandSlug/tasks',
      '/:orgSlug/:brandSlug/tasks/:id',
      '/:orgSlug/:brandSlug/overview/activities',
    ],
    {
      fallback: '/:orgSlug/:brandSlug/workspace/overview',
      mode: 'canvas',
      scope: 'brand',
      surfaceKey: 'workspace',
      switcherItems: ['workspace'],
      telemetryClass: 'product',
    },
  ),
  ...registerRoutes(
    [
      '/:orgSlug/:brandSlug/agent',
      '/:orgSlug/:brandSlug/agent/new',
      '/:orgSlug/:brandSlug/agent/:id',
    ],
    {
      fallback: '/:orgSlug/:brandSlug/agent',
      mode: 'conversation',
      scope: 'brand',
      surfaceKey: 'agent-conversation',
      switcherItems: ['agent'],
      telemetryClass: 'agent',
    },
  ),
  ...registerRoutes(
    [
      '/:orgSlug/:brandSlug/agent/journey',
      '/:orgSlug/:brandSlug/agent/onboarding',
      '/:orgSlug/:brandSlug/agent/onboarding/:threadId',
    ],
    {
      fallback: '/:orgSlug/:brandSlug/agent',
      mode: 'dedicated',
      scope: 'brand',
      surfaceKey: 'agent-onboarding',
      telemetryClass: 'management',
    },
  ),
  ...registerRoutes(['/:orgSlug/:brandSlug/messages'], {
    fallback: '/:orgSlug/:brandSlug/workspace/overview',
    mode: 'canvas',
    scope: 'brand',
    surfaceKey: 'messages',
    switcherItems: ['messages'],
    telemetryClass: 'product',
  }),
  ...registerRoutes(
    [
      '/:orgSlug/:brandSlug/research/discovery',
      '/:orgSlug/:brandSlug/research/following',
      '/:orgSlug/:brandSlug/research/socials',
      '/:orgSlug/:brandSlug/research/ads',
      '/:orgSlug/:brandSlug/research/ads/google',
      '/:orgSlug/:brandSlug/research/ads/meta',
      '/:orgSlug/:brandSlug/research/:platform',
    ],
    {
      fallback: '/:orgSlug/:brandSlug/research/discovery',
      mode: 'canvas',
      scope: 'brand',
      surfaceKey: 'research',
      switcherItems: ['research'],
      telemetryClass: 'product',
    },
  ),
  ...registerRoutes(
    [
      '/:orgSlug/:brandSlug/studio/:type',
      '/:orgSlug/:brandSlug/studio/:type/:id',
      '/:orgSlug/:brandSlug/studio/batch',
      '/:orgSlug/:brandSlug/studio/clips',
      '/:orgSlug/:brandSlug/studio/fastlane',
    ],
    {
      fallback: '/:orgSlug/:brandSlug/studio/image',
      mode: 'canvas',
      scope: 'brand',
      surfaceKey: 'studio',
      switcherItems: ['studio'],
      telemetryClass: 'product',
    },
  ),
  ...registerRoutes(
    [
      '/:orgSlug/:brandSlug/compose/article',
      '/:orgSlug/:brandSlug/compose/post',
      '/:orgSlug/:brandSlug/compose/newsletter',
    ],
    {
      fallback: '/:orgSlug/:brandSlug/compose/post',
      mode: 'canvas',
      scope: 'brand',
      surfaceKey: 'compose',
      telemetryClass: 'product',
    },
  ),
  ...registerRoutes(
    [
      '/:orgSlug/:brandSlug/editor',
      '/:orgSlug/:brandSlug/editor/new',
      '/:orgSlug/:brandSlug/editor/:id',
    ],
    {
      fallback: '/:orgSlug/:brandSlug/editor',
      mode: 'dedicated',
      scope: 'brand',
      surfaceKey: 'editor',
      telemetryClass: 'management',
    },
  ),
  ...registerRoutes(
    [
      '/:orgSlug/:brandSlug/library/ingredients',
      '/:orgSlug/:brandSlug/library/videos',
      '/:orgSlug/:brandSlug/library/images',
      '/:orgSlug/:brandSlug/library/gifs',
      '/:orgSlug/:brandSlug/library/avatars',
      '/:orgSlug/:brandSlug/library/voices',
      '/:orgSlug/:brandSlug/library/music',
      '/:orgSlug/:brandSlug/library/captions',
      '/:orgSlug/:brandSlug/library/moodboard',
    ],
    {
      fallback: '/:orgSlug/:brandSlug/library/ingredients',
      mode: 'canvas',
      scope: 'brand',
      surfaceKey: 'library',
      switcherItems: ['library'],
      telemetryClass: 'product',
    },
  ),
  ...registerRoutes(
    [
      '/:orgSlug/:brandSlug/posts',
      '/:orgSlug/:brandSlug/posts/:id',
      '/:orgSlug/:brandSlug/posts/analytics',
      '/:orgSlug/:brandSlug/posts/calendar',
      '/:orgSlug/:brandSlug/posts/newsletters',
      '/:orgSlug/:brandSlug/posts/published',
      '/:orgSlug/:brandSlug/posts/remix',
      '/:orgSlug/:brandSlug/posts/review',
      '/:orgSlug/:brandSlug/posts/scheduled',
    ],
    {
      fallback: '/:orgSlug/:brandSlug/posts',
      mode: 'canvas',
      scope: 'brand',
      surfaceKey: 'publish',
      switcherItems: ['posts', 'remix'],
      telemetryClass: 'product',
    },
  ),
  ...registerRoutes(['/:orgSlug/:brandSlug/posts/composer'], {
    fallback: '/:orgSlug/:brandSlug/posts',
    mode: 'dedicated',
    scope: 'brand',
    surfaceKey: 'post-composer',
    telemetryClass: 'management',
  }),
  ...registerRoutes(
    [
      '/:orgSlug/:brandSlug/analytics/overview',
      '/:orgSlug/:brandSlug/analytics/posts',
      '/:orgSlug/:brandSlug/analytics/brands',
      '/:orgSlug/:brandSlug/analytics/brands/:id',
      '/:orgSlug/:brandSlug/analytics/brands/:id/platforms/:platform',
      '/:orgSlug/:brandSlug/analytics/insights',
      '/:orgSlug/:brandSlug/analytics/hooks',
      '/:orgSlug/:brandSlug/analytics/performance-lab',
      '/:orgSlug/:brandSlug/analytics/trends',
      '/:orgSlug/:brandSlug/analytics/trends/detail/:id',
      '/:orgSlug/:brandSlug/analytics/trends/platforms/:platform',
      '/:orgSlug/:brandSlug/analytics/trend-turnover',
      '/:orgSlug/:brandSlug/analytics/streaks',
    ],
    {
      adapterStatus: 'ready',
      fallback: '/:orgSlug/:brandSlug/analytics/overview',
      mode: 'canvas',
      scope: 'brand',
      surfaceKey: 'analytics',
      switcherItems: ['analytics'],
      telemetryClass: 'product',
    },
  ),
  ...registerRoutes(
    [
      '/:orgSlug/:brandSlug/workflows',
      '/:orgSlug/:brandSlug/workflows/new',
      '/:orgSlug/:brandSlug/workflows/:id',
      '/:orgSlug/:brandSlug/workflows/templates',
      '/:orgSlug/:brandSlug/workflows/executions',
      '/:orgSlug/:brandSlug/workflows/executions/:id',
    ],
    {
      fallback: '/:orgSlug/:brandSlug/workflows',
      mode: 'canvas',
      scope: 'brand',
      surfaceKey: 'workflows',
      telemetryClass: 'product',
    },
  ),
  ...registerRoutes(
    [
      '/:orgSlug/:brandSlug/orchestration',
      '/:orgSlug/:brandSlug/orchestration/:agentId',
      '/:orgSlug/:brandSlug/orchestration/overview',
      '/:orgSlug/:brandSlug/orchestration/analytics',
      '/:orgSlug/:brandSlug/orchestration/autopilot',
      '/:orgSlug/:brandSlug/orchestration/runs',
      '/:orgSlug/:brandSlug/orchestration/skills',
      '/:orgSlug/:brandSlug/orchestration/content-runs/:runId',
    ],
    {
      fallback: '/:orgSlug/:brandSlug/orchestration/overview',
      mode: 'canvas',
      scope: 'brand',
      surfaceKey: 'orchestration',
      telemetryClass: 'product',
    },
  ),
  ...registerRoutes(
    [
      '/:orgSlug/:brandSlug/orchestration/new',
      '/:orgSlug/:brandSlug/orchestration/configuration',
      '/:orgSlug/:brandSlug/orchestration/hire',
      '/:orgSlug/:brandSlug/orchestration/orchestrator',
      '/:orgSlug/:brandSlug/orchestration/campaigns',
      '/:orgSlug/:brandSlug/orchestration/campaigns/new',
      '/:orgSlug/:brandSlug/orchestration/campaigns/:id',
      '/:orgSlug/:brandSlug/orchestration/outreach-campaigns',
      '/:orgSlug/:brandSlug/orchestration/outreach-campaigns/new',
      '/:orgSlug/:brandSlug/orchestration/outreach-campaigns/:id',
      '/:orgSlug/:brandSlug/orchestration/library',
      '/:orgSlug/:brandSlug/orchestration/library/:type',
    ],
    {
      fallback: '/:orgSlug/:brandSlug/orchestration/overview',
      mode: 'dedicated',
      scope: 'brand',
      surfaceKey: 'orchestration-management',
      telemetryClass: 'management',
    },
  ),
  ...registerRoutes(
    [
      '/:orgSlug/:brandSlug/settings',
      '/:orgSlug/:brandSlug/settings/voice',
      '/:orgSlug/:brandSlug/settings/harness',
      '/:orgSlug/:brandSlug/settings/interview',
      '/:orgSlug/:brandSlug/settings/publishing',
      '/:orgSlug/:brandSlug/settings/agent-defaults',
    ],
    {
      fallback: '/:orgSlug/:brandSlug/settings',
      mode: 'dedicated',
      scope: 'brand',
      surfaceKey: 'brand-settings',
      telemetryClass: 'management',
    },
  ),
  ...registerRoutes(
    [
      '/:orgSlug/:brandSlug/lab/articles',
      '/:orgSlug/:brandSlug/lab/cron-jobs',
      '/:orgSlug/:brandSlug/lab/library-preview',
      '/:orgSlug/:brandSlug/lab/twitter-engage',
    ],
    {
      fallback: '/:orgSlug/:brandSlug/workspace/overview',
      mode: 'dedicated',
      scope: 'brand',
      surfaceKey: 'lab',
      telemetryClass: 'management',
    },
  ),
] as const;

const ADMIN_ROUTE_PATTERNS = [
  '/admin',
  '/admin/agent',
  '/admin/agent/new',
  '/admin/agent/:threadId',
  '/admin/overview/dashboard',
  '/admin/overview/activities',
  '/admin/overview/analytics/all',
  '/admin/overview/analytics/brands',
  '/admin/overview/analytics/brands/:id',
  '/admin/overview/analytics/brands/:id/platforms/:platform',
  '/admin/overview/analytics/business',
  '/admin/overview/analytics/organizations',
  '/admin/overview/analytics/organizations/:id',
  '/admin/content/posts',
  '/admin/content/posts/:id',
  '/admin/content/templates',
  '/admin/content/templates/:id',
  '/admin/content/prompts/list',
  '/admin/content/ingredients/:type',
  '/admin/folders',
  '/admin/images/:id',
  '/admin/videos/:id',
  '/admin/automation/bots',
  '/admin/automation/models/:type',
  '/admin/automation/trainings',
  '/admin/automation/trainings/:id/images',
  '/admin/automation/trainings/:id/sources',
  '/admin/automation/workflows',
  '/admin/configuration/elements/blacklists',
  '/admin/configuration/elements/camera-movements',
  '/admin/configuration/elements/cameras',
  '/admin/configuration/elements/lenses',
  '/admin/configuration/elements/lightings',
  '/admin/configuration/elements/moods',
  '/admin/configuration/elements/scenes',
  '/admin/configuration/elements/sounds',
  '/admin/configuration/elements/styles',
  '/admin/configuration/font-families',
  '/admin/configuration/presets',
  '/admin/configuration/tags',
  '/admin/configuration/tags/:filter',
  '/admin/fleet/characters',
  '/admin/fleet/characters/:slug',
  '/admin/fleet/gallery',
  '/admin/fleet/generate',
  '/admin/fleet/infrastructure',
  '/admin/fleet/lip-sync',
  '/admin/fleet/pipeline',
  '/admin/fleet/training',
  '/admin/fleet/voices',
  '/admin/library/voices',
  '/admin/organization',
  '/admin/administration/users',
  '/admin/administration/warmup-accounts',
  '/admin/administration/roles',
  '/admin/administration/subscriptions',
  '/admin/administration/credit-usage',
  '/admin/administration/announcements',
  '/admin/administration/system-emails',
  '/admin/administration/platform-settings',
] as const;

const ADMIN_ROUTE_REGISTRATIONS = registerRoutes(ADMIN_ROUTE_PATTERNS, {
  fallback: '/admin',
  mode: 'dedicated',
  scope: 'platform-admin',
  surfaceKey: 'platform-admin',
  switcherItems: ['admin'],
  telemetryClass: 'management',
});

/**
 * Canonical application-owned inventory for the 206 protected route patterns
 * accepted in ADR-CONVERSATION-SHELL-CONTRACTS v1.0.0. The two intentional hard
 * cuts (`/:orgSlug/~/workspace/*` and
 * `/:orgSlug/~/settings/organization/*`) are deliberately absent.
 */
export const PROTECTED_ROUTE_INVENTORY = Object.freeze([
  ...PERSONAL_ROUTE_REGISTRATIONS,
  ...ORGANIZATION_ROUTE_REGISTRATIONS,
  ...BRAND_ROUTE_REGISTRATIONS,
  ...ADMIN_ROUTE_REGISTRATIONS,
]);

export const WORKSPACE_SHELL_AUXILIARY_REGISTRY = Object.freeze([
  Object.freeze({
    accessPolicy: 'organization-member',
    adapter: Object.freeze({ key: 'notifications', status: 'placeholder' }),
    allowedShellModes: Object.freeze(['overlay'] as const),
    availability: 'conversation-shell',
    canonicalUrl: null,
    deployments: ALL_DEPLOYMENTS,
    key: 'notifications',
    kind: 'overlay',
    launchTarget: 'overlay',
    parameterContract: Object.freeze({ kind: 'none' } as const),
    presentation: Object.freeze({
      description:
        'Review workspace notifications without leaving the active conversation or canvas.',
      openAnnouncement: 'Notifications overlay opened.',
      title: 'Notifications',
    }),
    restoration: URL_RESTORATION_POLICY,
    safeFallback: 'same-canonical-url',
    scope: 'organization',
    telemetryClass: 'notifications',
  }),
  Object.freeze({
    accessPolicy: 'organization-member',
    adapter: Object.freeze({ key: 'shell-preview', status: 'placeholder' }),
    allowedShellModes: Object.freeze(['overlay'] as const),
    availability: 'conversation-shell',
    canonicalUrl: null,
    deployments: ALL_DEPLOYMENTS,
    key: 'shell-preview',
    kind: 'overlay',
    launchTarget: 'overlay',
    parameterContract: Object.freeze({
      allowedReferenceKinds: Object.freeze(['asset', 'post'] as const),
      kind: 'optional-reference',
      referenceAccess: 'server-authorized',
    } as const),
    presentation: Object.freeze({
      description:
        'This trusted placeholder demonstrates restorable overlay state without mutating scope or approving an action.',
      openAnnouncement: 'Temporary workspace overlay opened.',
      title: 'Temporary workspace overlay',
    }),
    restoration: URL_RESTORATION_POLICY,
    safeFallback: 'same-canonical-url',
    scope: 'organization',
    telemetryClass: 'shell_preview',
  }),
  Object.freeze({
    accessPolicy: 'organization-member',
    adapter: Object.freeze({ key: 'terminal-dock', status: 'dedicated-route' }),
    allowedShellModes: Object.freeze(['dedicated'] as const),
    availability: 'legacy-shell',
    canonicalUrl: null,
    deployments: Object.freeze(['self-hosted-web', 'desktop'] as const),
    key: 'terminal-dock',
    kind: 'chrome',
    launchTarget: 'dedicated-route',
    restoration: URL_RESTORATION_POLICY,
    safeFallback: 'same-canonical-url',
    scope: 'organization',
    telemetryClass: 'legacy_chrome',
  }),
] as const satisfies readonly WorkspaceShellAuxiliaryRegistration[]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compileRoutePattern(
  registration: WorkspaceShellRouteRegistration,
): CompiledRouteRegistration {
  if (registration.canonicalUrl === '/') {
    return {
      matcher: /^\/$/,
      parameterNames: [],
      registration,
      specificity: 10_000,
    };
  }

  const parameterNames: string[] = [];
  let staticSegments = 0;
  const matcherSegments = registration.canonicalUrl
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
    registration,
    specificity:
      staticSegments * 1_000 +
      matcherSegments.length * 10 -
      parameterNames.length,
  };
}

const COMPILED_ROUTE_INVENTORY = Object.freeze(
  PROTECTED_ROUTE_INVENTORY.map(compileRoutePattern),
);

function getPathname(value: string): string | null {
  try {
    const url = new URL(value, 'https://workspace.genfeed.invalid');
    if (url.origin !== 'https://workspace.genfeed.invalid') {
      return null;
    }

    return url.pathname;
  } catch {
    return null;
  }
}

function decodeRouteParam(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function hasRequiredPathScope(
  pathname: string,
  scope: WorkspaceShellScopeRequirement,
): boolean {
  const segments = pathname.split('/').filter(Boolean);
  const hasReservedPrefix = RESERVED_SCOPED_ROUTE_PREFIXES.some(
    (prefix) => segments[0] === prefix,
  );

  switch (scope) {
    case 'brand':
      return !hasReservedPrefix && segments.length >= 3 && segments[1] !== '~';
    case 'organization':
      return (
        !hasReservedPrefix && (segments.length === 1 || segments[1] === '~')
      );
    case 'personal':
      return pathname === '/' || pathname.startsWith('/settings');
    case 'platform-admin':
      return pathname === '/admin' || pathname.startsWith('/admin/');
  }
}

export function resolveWorkspaceShellRoute(
  hrefOrPathname: string,
): ResolvedWorkspaceShellRoute | null {
  const pathname = getPathname(hrefOrPathname);
  if (!pathname) {
    return null;
  }

  let bestMatch:
    | (CompiledRouteRegistration & { readonly match: RegExpExecArray })
    | null = null;

  for (const compiled of COMPILED_ROUTE_INVENTORY) {
    if (!hasRequiredPathScope(pathname, compiled.registration.scope)) {
      continue;
    }

    const match = compiled.matcher.exec(pathname);
    if (
      !match ||
      (bestMatch && bestMatch.specificity >= compiled.specificity)
    ) {
      continue;
    }

    bestMatch = { ...compiled, match };
  }

  if (!bestMatch) {
    return null;
  }

  const params = Object.freeze(
    Object.fromEntries(
      bestMatch.parameterNames.map((parameterName, index) => [
        parameterName,
        decodeRouteParam(bestMatch?.match[index + 1] ?? ''),
      ]),
    ),
  );

  return Object.freeze({ ...bestMatch.registration, params });
}

export function getWorkspaceShellOverlayRegistration(
  key: string,
): WorkspaceShellOverlayRegistration | null {
  const registration = WORKSPACE_SHELL_AUXILIARY_REGISTRY.find(
    (candidate) => candidate.kind === 'overlay' && candidate.key === key,
  );

  return registration?.kind === 'overlay' ? registration : null;
}

function interpolateCanonicalPattern(
  pattern: string,
  params: Readonly<Record<string, string>>,
): string | null {
  let isComplete = true;
  const href = pattern.replace(/:([A-Za-z][A-Za-z0-9]*)/g, (_, key: string) => {
    const value = params[key];
    if (!value) {
      isComplete = false;
      return '';
    }

    return encodeURIComponent(value);
  });

  return isComplete ? href : null;
}

export function resolveWorkspaceShellSafeFallback(
  route: ResolvedWorkspaceShellRoute,
): string {
  return (
    interpolateCanonicalPattern(route.safeFallback, route.params) ??
    route.canonicalUrl
  );
}
