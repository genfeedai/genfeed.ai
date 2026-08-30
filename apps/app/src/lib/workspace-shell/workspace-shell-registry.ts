import type {
  ResolvedWorkspaceShellRoute,
  WorkspaceShellAccessPolicy,
  WorkspaceShellAdapterSeam,
  WorkspaceShellBreadcrumbMetadata,
  WorkspaceShellDeployment,
  WorkspaceShellOverlayRegistration,
  WorkspaceShellProductClass,
  WorkspaceShellRestorationPolicy,
  WorkspaceShellRouteMode,
  WorkspaceShellRouteRegistration,
  WorkspaceShellScopeRequirement,
  WorkspaceShellSurfaceKey,
} from '@genfeedai/interfaces/ui/workspace-shell.interface';

export type {
  ResolvedWorkspaceShellRoute,
  WorkspaceShellAccessPolicy,
  WorkspaceShellAdapterSeam,
  WorkspaceShellAvailability,
  WorkspaceShellBreadcrumbMetadata,
  WorkspaceShellDeployment,
  WorkspaceShellLaunchTarget,
  WorkspaceShellOverlayRegistration,
  WorkspaceShellProductClass,
  WorkspaceShellReferenceKind,
  WorkspaceShellRestorationPolicy,
  WorkspaceShellRouteMode,
  WorkspaceShellRouteRegistration,
  WorkspaceShellScopeRequirement,
  WorkspaceShellSurfaceKey,
  WorkspaceShellSurfaceMode,
} from '@genfeedai/interfaces/ui/workspace-shell.interface';

type RouteGroupConfig = {
  readonly adapterStatus?: WorkspaceShellRouteRegistration['adapter']['status'];
  readonly adapter?: WorkspaceShellAdapterSeam;
  readonly fallback: string;
  readonly mode: WorkspaceShellRouteMode;
  readonly productClass: WorkspaceShellProductClass;
  readonly scope: WorkspaceShellScopeRequirement;
  readonly surfaceKey: WorkspaceShellSurfaceKey;
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

const RESERVED_SCOPED_ROUTE_PREFIXES = Object.freeze([
  'admin',
  'connect',
  'settings',
]);

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

const BREADCRUMB_ROOT_LABELS = Object.freeze({
  admin: 'Admin',
  agent: 'Agent',
  analytics: 'Analytics',
  automate: 'Automate',
  edit: 'Edit',
  lab: 'Lab',
  library: 'Library',
  messages: 'Messages',
  overview: 'Workspace',
  platforms: 'Platforms',
  publish: 'Publish',
  discover: 'Discover',
  settings: 'Settings',
  studio: 'Studio',
  workspace: 'Workspace',
} as const satisfies Readonly<Record<string, string>>);

const BREADCRUMB_WORD_LABELS = Object.freeze({
  api: 'API',
  gifs: 'GIFs',
  id: 'ID',
} as const satisfies Readonly<Record<string, string>>);

const BREADCRUMB_LEAF_OVERRIDES = Object.freeze({
  '/': 'Workspace',
  '/:orgSlug': 'Overview',
  '/:orgSlug/:brandSlug': 'Overview',
  '/:orgSlug/:brandSlug/agent': 'New Conversation',
  '/:orgSlug/:brandSlug/agent/:id': 'Conversation',
  '/:orgSlug/:brandSlug/agent/new': 'New Conversation',
  '/:orgSlug/:brandSlug/agent/onboarding/:threadId': 'Onboarding',
  '/:orgSlug/:brandSlug/analytics/brands/:id': 'Brand Details',
  '/:orgSlug/:brandSlug/analytics/brands/:id/platforms/:platform': ':platform',
  '/:orgSlug/:brandSlug/analytics/trends/detail/:id': 'Trend Detail',
  '/:orgSlug/:brandSlug/analytics/trends/platforms/:platform':
    ':platform Trends',
  '/:orgSlug/:brandSlug/analytics': 'Overview',
  '/:orgSlug/:brandSlug/edit/article/:id': 'Article',
  '/:orgSlug/:brandSlug/edit/newsletter/:id': 'Newsletter',
  '/:orgSlug/:brandSlug/library': 'Overview',
  '/:orgSlug/:brandSlug/library/assets': 'All assets',
  '/:orgSlug/:brandSlug/library/avatars': 'Assets',
  '/:orgSlug/:brandSlug/library/captions': 'Assets',
  '/:orgSlug/:brandSlug/library/gifs': 'Assets',
  '/:orgSlug/:brandSlug/library/images': 'Assets',
  '/:orgSlug/:brandSlug/library/music': 'Assets',
  '/:orgSlug/:brandSlug/library/recent': 'Recent',
  '/:orgSlug/:brandSlug/library/shelf/:shelf': ':shelf',
  '/:orgSlug/:brandSlug/library/starred': 'Starred',
  '/:orgSlug/:brandSlug/library/trash': 'Trash',
  '/:orgSlug/:brandSlug/library/videos': 'Assets',
  '/:orgSlug/:brandSlug/library/voices': 'Assets',
  '/:orgSlug/:brandSlug/automate': 'Overview',
  '/:orgSlug/:brandSlug/workspace': 'Overview',
  '/:orgSlug/~/workspace': 'Overview',
  '/:orgSlug/~/workspace/overview': 'Overview',
  '/:orgSlug/~/overview': 'Overview',
  '/:orgSlug/~/analytics': 'Overview',
  '/:orgSlug/~/automate': 'Overview',
  '/:orgSlug/:brandSlug/automate/:agentId': 'Agent',
  '/:orgSlug/:brandSlug/automate/agents': 'Agents',
  '/:orgSlug/:brandSlug/automate/agents/:agentId': 'Agent',
  '/:orgSlug/:brandSlug/automate/content-runs/:runId': 'Content Run',
  '/:orgSlug/:brandSlug/automate/library/:type': ':type',
  '/:orgSlug/:brandSlug/publish/posts': 'Posts',
  '/:orgSlug/:brandSlug/publish/posts/:id': 'Content',
  '/:orgSlug/:brandSlug/automate/campaigns': 'Programs',
  '/:orgSlug/:brandSlug/automate/campaigns/new': 'New Program',
  '/:orgSlug/:brandSlug/automate/campaigns/:id': 'Program',
  '/:orgSlug/:brandSlug/messages/outreach': 'Outreach sequences',
  '/:orgSlug/:brandSlug/messages/outreach/new': 'New outreach sequence',
  '/:orgSlug/:brandSlug/messages/outreach/:id': 'Outreach sequence',
  '/:orgSlug/:brandSlug/discover/:platform': ':platform',
  '/:orgSlug/~/discover/:platform': ':platform',
  '/:orgSlug/:brandSlug/platforms/:platform': ':platform',
  '/:orgSlug/:brandSlug/settings': 'General',
  '/:orgSlug/:brandSlug/settings/usage': 'Cost & Usage',
  '/:orgSlug/:brandSlug/studio/clips/:projectId': 'Project',
  '/:orgSlug/:brandSlug/studio/edit': 'Edit',
  '/:orgSlug/:brandSlug/studio/edit/:id': 'Project',
  '/:orgSlug/:brandSlug/workspace/tasks/:id': 'Task',
  '/:orgSlug/:brandSlug/automate/workflows/:id': 'Workflow',
  '/:orgSlug/:brandSlug/automate/workflows/executions/:id': 'Run',
  '/:orgSlug/:brandSlug/automate/workflows/new': 'New Workflow',
  '/:orgSlug/:brandSlug/automate/workflows': 'Workflows',
  '/:orgSlug/:brandSlug/messages/reply-drip': 'Reply drip',
  '/:orgSlug/:brandSlug/messages/replies': 'Replies',
  '/:orgSlug/:brandSlug/automate/workflows/templates': 'Templates',
  '/:orgSlug/:brandSlug/automate/workflows/executions': 'Runs',
  '/:orgSlug/~/agent': 'New Conversation',
  '/:orgSlug/~/agent/:id': 'Conversation',
  '/:orgSlug/~/agent/new': 'New Conversation',
  '/:orgSlug/~/agent/onboarding/:threadId': 'Onboarding',
  '/:orgSlug/~/library/:type': ':type',
  '/:orgSlug/~/settings': 'Settings',
  '/:orgSlug/~/settings/general': 'General',
  '/:orgSlug/~/settings/credits': 'Credits',
  '/:orgSlug/~/settings/subscription': 'Subscription',
  '/:orgSlug/~/settings/usage': 'Cost & Usage',
  '/:orgSlug/~/settings/api-keys': 'API Keys',
  '/:orgSlug/~/settings/integrations': 'Integrations',
  '/:orgSlug/~/settings/models/:type': ':type',
  '/:orgSlug/~/studio/edit': 'Edit',
  '/:orgSlug/~/studio/edit/:id': 'Project',

  '/admin': 'Dashboard',
  '/admin/automation/models/:type': ':type Models',
  '/admin/automation/trainings/:id/images': 'Training Images',
  '/admin/automation/trainings/:id/sources': 'Training Sources',
  '/admin/configuration/tags/:filter': ':filter Tags',
  '/admin/content/ingredients/:type': ':type Ingredients',
  '/admin/content/posts/:id': 'Post',
  '/admin/content/templates/:id': 'Template',
  '/admin/fleet/characters/:slug': 'Character',
  '/admin/images/:id': 'Image',
  '/admin/overview/analytics/brands/:id': 'Brand Details',
  '/admin/overview/analytics/brands/:id/platforms/:platform': ':platform',
  '/admin/overview/analytics/organizations/:id': 'Organization Details',
  '/admin/videos/:id': 'Video',
  '/settings': 'Settings',
  '/settings/personal': 'Personal',
  '/settings/help': 'Help',
  '/settings/notifications': 'Notifications',
  '/settings/progress': 'Progress',
} as const satisfies Readonly<Record<string, string>>);

const BREADCRUMB_PARENT_OVERRIDES = Object.freeze({
  '/:orgSlug/:brandSlug/discover/ads/google': 'Ads',
  '/:orgSlug/:brandSlug/discover/ads/meta': 'Ads',
  '/:orgSlug/:brandSlug/discover/ads/tiktok': 'Ads',
  '/:orgSlug/:brandSlug/discover/ads/x': 'Ads',
  '/:orgSlug/~/discover/ads/google': 'Ads',
  '/:orgSlug/~/discover/ads/meta': 'Ads',
  '/:orgSlug/~/discover/ads/tiktok': 'Ads',
  '/:orgSlug/~/discover/ads/x': 'Ads',
  // Content desk lives under Posts, not Overview.
  '/:orgSlug/:brandSlug/publish/posts/:id': 'Posts',
  '/:orgSlug/:brandSlug/automate/agents/:agentId': 'Team',
  '/:orgSlug/:brandSlug/automate/agents/new': 'Team',
} as const satisfies Readonly<Record<string, string>>);

const BREADCRUMB_ROOT_HREF_OVERRIDES = Object.freeze({
  '/:orgSlug/:brandSlug/publish/posts/:id': '/publish/overview',
} as const satisfies Readonly<Record<string, string>>);

const BREADCRUMB_PARENT_HREF_OVERRIDES = Object.freeze({
  '/:orgSlug/:brandSlug/publish/posts/:id': '/publish/posts',
  '/:orgSlug/:brandSlug/automate/agents/:agentId': '/automate/agents',
  '/:orgSlug/:brandSlug/automate/agents/new': '/automate/agents',
} as const satisfies Readonly<Record<string, string>>);

function humanizeBreadcrumbLabel(value: string): string {
  return value
    .split('-')
    .filter(Boolean)
    .map((word) => {
      const normalizedWord = word.toLowerCase();
      return (
        BREADCRUMB_WORD_LABELS[
          normalizedWord as keyof typeof BREADCRUMB_WORD_LABELS
        ] ??
        `${normalizedWord.charAt(0).toUpperCase()}${normalizedWord.slice(1)}`
      );
    })
    .join(' ');
}

function getCanonicalAppSegment(canonicalUrl: string): string {
  if (canonicalUrl === '/') {
    return 'workspace';
  }

  const segments = canonicalUrl.split('/').filter(Boolean);
  if (segments[0] === 'admin' || segments[0] === 'settings') {
    return segments[0];
  }

  if (segments[0] === ':orgSlug') {
    if (segments.length === 1) {
      return 'workspace';
    }

    return segments[1] === '~'
      ? (segments[2] ?? 'overview')
      : (segments[2] ?? 'workspace');
  }

  return segments[0] ?? 'workspace';
}

function getDefaultBreadcrumbLeafLabel(canonicalUrl: string): string {
  const segments = canonicalUrl.split('/').filter(Boolean);
  const lastStaticSegment = [...segments]
    .reverse()
    .find((segment) => !segment.startsWith(':') && segment !== '~');

  return humanizeBreadcrumbLabel(lastStaticSegment ?? 'overview');
}

function getRouteBreadcrumbMetadata(
  canonicalUrl: string,
): WorkspaceShellBreadcrumbMetadata {
  const appSegment = getCanonicalAppSegment(canonicalUrl);
  const rootLabel =
    BREADCRUMB_ROOT_LABELS[appSegment as keyof typeof BREADCRUMB_ROOT_LABELS] ??
    humanizeBreadcrumbLabel(appSegment);
  const leafLabel =
    BREADCRUMB_LEAF_OVERRIDES[
      canonicalUrl as keyof typeof BREADCRUMB_LEAF_OVERRIDES
    ] ?? getDefaultBreadcrumbLeafLabel(canonicalUrl);
  const parentLabel =
    BREADCRUMB_PARENT_OVERRIDES[
      canonicalUrl as keyof typeof BREADCRUMB_PARENT_OVERRIDES
    ];
  const rootHref =
    BREADCRUMB_ROOT_HREF_OVERRIDES[
      canonicalUrl as keyof typeof BREADCRUMB_ROOT_HREF_OVERRIDES
    ];
  const parentHref =
    BREADCRUMB_PARENT_HREF_OVERRIDES[
      canonicalUrl as keyof typeof BREADCRUMB_PARENT_HREF_OVERRIDES
    ];

  return Object.freeze({
    leafLabel,
    ...(parentLabel ? { parentLabel } : {}),
    ...(parentHref ? { parentHref } : {}),
    rootLabel,
    ...(rootHref ? { rootHref } : {}),
  });
}

function resolveBreadcrumbMetadata(
  breadcrumb: WorkspaceShellBreadcrumbMetadata,
  params: Readonly<Record<string, string>>,
): WorkspaceShellBreadcrumbMetadata {
  const leafLabel = breadcrumb.leafLabel.replace(
    /:([A-Za-z][A-Za-z0-9]*)/g,
    (_, parameterName: string) =>
      humanizeBreadcrumbLabel(params[parameterName] ?? parameterName),
  );
  const parentLabel = breadcrumb.parentLabel?.replace(
    /:([A-Za-z][A-Za-z0-9]*)/g,
    (_, parameterName: string) =>
      humanizeBreadcrumbLabel(params[parameterName] ?? parameterName),
  );

  return Object.freeze({
    ...breadcrumb,
    leafLabel,
    ...(parentLabel ? { parentLabel } : {}),
  });
}

function freezeRouteRegistration(
  canonicalUrl: string,
  config: RouteGroupConfig,
): WorkspaceShellRouteRegistration {
  return Object.freeze({
    accessPolicy: ACCESS_POLICY_BY_SCOPE[config.scope],
    adapter: Object.freeze(
      config.adapter ?? {
        key: config.surfaceKey,
        status: config.adapterStatus ?? ADAPTER_STATUS_BY_MODE[config.mode],
      },
    ),
    allowedShellModes: Object.freeze([config.mode] as const),
    availability: AVAILABILITY_BY_MODE[config.mode],
    breadcrumb: getRouteBreadcrumbMetadata(canonicalUrl),
    canonicalUrl,
    deployments: ALL_DEPLOYMENTS,
    key: `route:${canonicalUrl}`,
    kind: 'route',
    launchTarget: LAUNCH_TARGET_BY_MODE[config.mode],
    mode: config.mode,
    productClass: config.productClass,
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
    mode: 'canvas',
    productClass: 'control-plane',
    scope: 'personal',
    surfaceKey: 'protected-bootstrap',
    telemetryClass: 'management',
  }),
  ...registerRoutes(['/connect'], {
    fallback: '/connect',
    mode: 'canvas',
    productClass: 'control-plane',
    scope: 'personal',
    surfaceKey: 'connect-genfeed-resolver',
    telemetryClass: 'management',
  }),
  ...registerRoutes(
    [
      '/settings',
      '/settings/personal',
      '/settings/help',
      '/settings/notifications',
      '/settings/progress',
    ],
    {
      fallback: '/settings/personal',
      mode: 'canvas',
      productClass: 'control-plane',
      scope: 'personal',
      surfaceKey: 'personal-settings',
      telemetryClass: 'management',
    },
  ),
] as const;

const ORGANIZATION_ROUTE_REGISTRATIONS = [
  ...registerRoutes(['/:orgSlug/~/connect'], {
    fallback: '/:orgSlug/~/connect',
    mode: 'canvas',
    productClass: 'control-plane',
    scope: 'organization',
    surfaceKey: 'connect-genfeed',
    telemetryClass: 'management',
  }),
  ...registerRoutes(
    [
      '/:orgSlug/~/overview',
      '/:orgSlug/~/workspace',
      '/:orgSlug/~/workspace/overview',
    ],
    {
      adapter: {
        key: 'organization-workspace-overview',
        status: 'embedded',
      },
      fallback: '/:orgSlug/~/workspace/overview',
      mode: 'canvas',
      productClass: 'control-plane',
      scope: 'organization',
      surfaceKey: 'organization-overview',
      switcherItems: ['workspace'],
      telemetryClass: 'product',
    },
  ),
  ...registerRoutes(
    [
      '/:orgSlug/~/workspace/inbox/:view',
      '/:orgSlug/~/workspace/activity',
      '/:orgSlug/~/workspace/tasks',
      '/:orgSlug/~/workspace/tasks/:id',
    ],
    {
      fallback: '/:orgSlug/~/workspace/overview',
      mode: 'canvas',
      productClass: 'control-plane',
      scope: 'organization',
      surfaceKey: 'workspace',
      switcherItems: ['workspace'],
      telemetryClass: 'product',
    },
  ),
  ...registerRoutes(['/:orgSlug/~/automate'], {
    fallback: '/:orgSlug/~/automate',
    mode: 'canvas',
    productClass: 'control-plane',
    scope: 'organization',
    surfaceKey: 'automate',
    switcherItems: ['automate'],
    telemetryClass: 'product',
  }),
  ...registerRoutes(['/:orgSlug'], {
    fallback: '/:orgSlug/~/workspace/overview',
    mode: 'canvas',
    productClass: 'control-plane',
    scope: 'organization',
    surfaceKey: 'organization-landing',
    telemetryClass: 'product',
  }),
  ...registerRoutes(
    ['/:orgSlug/~/analytics', '/:orgSlug/~/analytics/overview'],
    {
      fallback: '/:orgSlug/~/analytics',
      mode: 'canvas',
      productClass: 'visual-data',
      scope: 'organization',
      surfaceKey: 'analytics',
      telemetryClass: 'product',
    },
  ),
  ...registerRoutes(['/:orgSlug/~/messages'], {
    adapter: {
      key: 'messages',
      status: 'embedded',
    },
    fallback: '/:orgSlug/~/messages',
    mode: 'canvas',
    productClass: 'control-plane',
    scope: 'organization',
    surfaceKey: 'messages',
    switcherItems: ['messages'],
    telemetryClass: 'product',
  }),
  ...registerRoutes(
    [
      '/:orgSlug/~/discover/overview',
      '/:orgSlug/~/discover/discovery',
      '/:orgSlug/~/discover/following',
      '/:orgSlug/~/discover/socials',
      '/:orgSlug/~/discover/ads',
      '/:orgSlug/~/discover/ads/google',
      '/:orgSlug/~/discover/ads/meta',
      '/:orgSlug/~/discover/ads/tiktok',
      '/:orgSlug/~/discover/ads/x',
      '/:orgSlug/~/discover/:platform',
    ],
    {
      adapter: { key: 'discover', status: 'embedded' },
      fallback: '/:orgSlug/~/discover/overview',
      mode: 'canvas',
      productClass: 'visual-data',
      scope: 'organization',
      surfaceKey: 'discover',
      switcherItems: ['discover'],
      telemetryClass: 'product',
    },
  ),
  ...registerRoutes(
    ['/:orgSlug/~/agent', '/:orgSlug/~/agent/new', '/:orgSlug/~/agent/:id'],
    {
      fallback: '/:orgSlug/~/agent',
      mode: 'conversation',
      productClass: 'contextual-action',
      scope: 'organization',
      surfaceKey: 'agent-conversation',
      switcherItems: ['agent'],
      telemetryClass: 'agent',
    },
  ),
  ...registerRoutes(
    ['/:orgSlug/~/agent/onboarding', '/:orgSlug/~/agent/onboarding/:threadId'],
    {
      fallback: '/:orgSlug/~/agent',
      mode: 'conversation',
      productClass: 'contextual-action',
      scope: 'organization',
      surfaceKey: 'agent-onboarding',
      switcherItems: ['agent'],
      telemetryClass: 'agent',
    },
  ),
  ...registerRoutes(['/:orgSlug/~/agent/journey'], {
    fallback: '/:orgSlug/~/agent',
    mode: 'canvas',
    productClass: 'control-plane',
    scope: 'organization',
    surfaceKey: 'agent-onboarding',
    telemetryClass: 'management',
  }),
  ...registerRoutes(
    [
      '/:orgSlug/~/settings',
      '/:orgSlug/~/settings/general',
      '/:orgSlug/~/settings/personal',
      '/:orgSlug/~/settings/help',
      '/:orgSlug/~/settings/notifications',
      '/:orgSlug/~/settings/progress',
      '/:orgSlug/~/settings/members',
      '/:orgSlug/~/settings/credits',
      '/:orgSlug/~/settings/subscription',
      '/:orgSlug/~/settings/api-keys',
      '/:orgSlug/~/settings/integrations',
      '/:orgSlug/~/settings/webhooks',
      '/:orgSlug/~/settings/agents',
      '/:orgSlug/~/settings/usage',
      '/:orgSlug/~/settings/brands',
      '/:orgSlug/~/settings/models',
      '/:orgSlug/~/settings/models/:type',
      '/:orgSlug/~/settings/elements/scenes',
    ],
    {
      fallback: '/:orgSlug/~/settings/general',
      mode: 'canvas',
      productClass: 'control-plane',
      scope: 'organization',
      surfaceKey: 'organization-settings',
      telemetryClass: 'management',
    },
  ),
  ...registerRoutes(['/:orgSlug/~/library', '/:orgSlug/~/library/:type'], {
    fallback: '/:orgSlug/~/library',
    mode: 'canvas',
    productClass: 'control-plane',
    scope: 'organization',
    surfaceKey: 'library',
    switcherItems: ['library'],
    telemetryClass: 'product',
  }),
  ...registerRoutes(
    [
      '/:orgSlug/~/publish',
      '/:orgSlug/~/publish/overview',
      '/:orgSlug/~/publish/pending',
      '/:orgSlug/~/publish/processing',
      '/:orgSlug/~/publish/published',
      '/:orgSlug/~/publish/scheduled',
    ],
    {
      fallback: '/:orgSlug/~/publish/overview',
      mode: 'canvas',
      productClass: 'control-plane',
      scope: 'organization',
      surfaceKey: 'publish',
      switcherItems: ['publish'],
      telemetryClass: 'product',
    },
  ),
  ...registerRoutes(
    [
      '/:orgSlug/~/studio/edit',
      '/:orgSlug/~/studio/edit/projects',
      '/:orgSlug/~/studio/edit/new',
      '/:orgSlug/~/studio/edit/:id',
    ],
    {
      fallback: '/:orgSlug/~/studio/edit',
      mode: 'canvas',
      productClass: 'contextual-action',
      scope: 'organization',
      surfaceKey: 'studio-edit',
      switcherItems: ['studio'],
      telemetryClass: 'management',
    },
  ),
] as const;

const BRAND_ROUTE_REGISTRATIONS = [
  ...registerRoutes(['/:orgSlug/:brandSlug'], {
    fallback: '/:orgSlug/:brandSlug/workspace',
    mode: 'canvas',
    productClass: 'control-plane',
    scope: 'brand',
    surfaceKey: 'workspace-overview',
    telemetryClass: 'product',
  }),
  ...registerRoutes(
    [
      '/:orgSlug/:brandSlug/workspace',
      '/:orgSlug/:brandSlug/workspace/overview',
    ],
    {
      adapter: {
        key: 'brand-workspace-overview',
        status: 'embedded',
      },
      fallback: '/:orgSlug/:brandSlug/workspace',
      mode: 'canvas',
      productClass: 'control-plane',
      scope: 'brand',
      surfaceKey: 'workspace-overview',
      switcherItems: ['workspace'],
      telemetryClass: 'product',
    },
  ),
  ...registerRoutes(
    [
      '/:orgSlug/:brandSlug/workspace/inbox/:view',
      '/:orgSlug/:brandSlug/workspace/activity',
      '/:orgSlug/:brandSlug/workspace/tasks',
      '/:orgSlug/:brandSlug/workspace/tasks/:id',
      '/:orgSlug/:brandSlug/overview/activities',
    ],
    {
      fallback: '/:orgSlug/:brandSlug/workspace',
      mode: 'canvas',
      productClass: 'control-plane',
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
      productClass: 'contextual-action',
      scope: 'brand',
      surfaceKey: 'agent-conversation',
      switcherItems: ['agent'],
      telemetryClass: 'agent',
    },
  ),
  ...registerRoutes(
    [
      '/:orgSlug/:brandSlug/agent/onboarding',
      '/:orgSlug/:brandSlug/agent/onboarding/:threadId',
    ],
    {
      fallback: '/:orgSlug/:brandSlug/agent',
      mode: 'conversation',
      productClass: 'contextual-action',
      scope: 'brand',
      surfaceKey: 'agent-onboarding',
      switcherItems: ['agent'],
      telemetryClass: 'agent',
    },
  ),
  ...registerRoutes(['/:orgSlug/:brandSlug/agent/journey'], {
    fallback: '/:orgSlug/:brandSlug/agent',
    mode: 'canvas',
    productClass: 'control-plane',
    scope: 'brand',
    surfaceKey: 'agent-onboarding',
    telemetryClass: 'management',
  }),
  ...registerRoutes(
    [
      '/:orgSlug/:brandSlug/discover/overview',
      '/:orgSlug/:brandSlug/discover/discovery',
      '/:orgSlug/:brandSlug/discover/following',
      '/:orgSlug/:brandSlug/discover/socials',
      '/:orgSlug/:brandSlug/discover/ads',
      '/:orgSlug/:brandSlug/discover/ads/google',
      '/:orgSlug/:brandSlug/discover/ads/meta',
      '/:orgSlug/:brandSlug/discover/ads/tiktok',
      '/:orgSlug/:brandSlug/discover/ads/x',
      '/:orgSlug/:brandSlug/discover/:platform',
    ],
    {
      adapter: { key: 'discover', status: 'embedded' },
      fallback: '/:orgSlug/:brandSlug/discover/overview',
      mode: 'canvas',
      productClass: 'visual-data',
      scope: 'brand',
      surfaceKey: 'discover',
      switcherItems: ['discover'],
      telemetryClass: 'product',
    },
  ),
  ...registerRoutes(
    [
      '/:orgSlug/:brandSlug/studio/batch',
      '/:orgSlug/:brandSlug/studio/clips',
      '/:orgSlug/:brandSlug/studio/clips/:projectId',
      '/:orgSlug/:brandSlug/studio/fastlane',
      '/:orgSlug/:brandSlug/studio/generate',
      '/:orgSlug/:brandSlug/studio/storyboard',
    ],
    {
      adapterStatus: 'ready',
      fallback: '/:orgSlug/:brandSlug/studio/generate',
      mode: 'canvas',
      productClass: 'contextual-action',
      scope: 'brand',
      surfaceKey: 'studio-specialized',
      switcherItems: ['studio'],
      telemetryClass: 'product',
    },
  ),
  ...registerRoutes(
    [
      '/:orgSlug/:brandSlug/edit/article/:id',
      '/:orgSlug/:brandSlug/edit/newsletter/:id',
    ],
    {
      fallback: '/:orgSlug/:brandSlug/publish/posts',
      mode: 'canvas',
      productClass: 'contextual-action',
      scope: 'brand',
      surfaceKey: 'artifact-editor',
      switcherItems: ['publish'],
      telemetryClass: 'product',
    },
  ),
  ...registerRoutes(
    [
      '/:orgSlug/:brandSlug/studio/edit',
      '/:orgSlug/:brandSlug/studio/edit/new',
      '/:orgSlug/:brandSlug/studio/edit/:id',
    ],
    {
      fallback: '/:orgSlug/:brandSlug/studio/edit',
      mode: 'canvas',
      productClass: 'contextual-action',
      scope: 'brand',
      surfaceKey: 'studio-edit',
      switcherItems: ['studio'],
      telemetryClass: 'management',
    },
  ),
  ...registerRoutes(
    [
      '/:orgSlug/:brandSlug/library',
      '/:orgSlug/:brandSlug/library/assets',
      '/:orgSlug/:brandSlug/library/recent',
      '/:orgSlug/:brandSlug/library/starred',
      '/:orgSlug/:brandSlug/library/trash',
      '/:orgSlug/:brandSlug/library/shelf/:shelf',
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
      fallback: '/:orgSlug/:brandSlug/library',
      mode: 'canvas',
      productClass: 'control-plane',
      scope: 'brand',
      surfaceKey: 'library',
      switcherItems: ['library'],
      telemetryClass: 'product',
    },
  ),
  ...registerRoutes(
    [
      '/:orgSlug/:brandSlug/publish',
      '/:orgSlug/:brandSlug/publish/overview',
      '/:orgSlug/:brandSlug/publish/posts',
      '/:orgSlug/:brandSlug/publish/posts/:id',
      '/:orgSlug/:brandSlug/publish/calendar',
      '/:orgSlug/:brandSlug/publish/failed',
      '/:orgSlug/:brandSlug/publish/pending',
      '/:orgSlug/:brandSlug/publish/processing',
      '/:orgSlug/:brandSlug/publish/published',
      '/:orgSlug/:brandSlug/publish/review',
      '/:orgSlug/:brandSlug/publish/scheduled',
    ],
    {
      fallback: '/:orgSlug/:brandSlug/publish/overview',
      mode: 'canvas',
      productClass: 'control-plane',
      scope: 'brand',
      surfaceKey: 'publish',
      switcherItems: ['publish'],
      telemetryClass: 'product',
    },
  ),
  // Remix is a Discover/Library action deep-link, not a Publish nav surface.
  ...registerRoutes(['/:orgSlug/:brandSlug/publish/remix'], {
    fallback: '/:orgSlug/:brandSlug/discover/overview',
    mode: 'canvas',
    productClass: 'contextual-action',
    scope: 'brand',
    surfaceKey: 'publish',
    switcherItems: ['discover', 'publish'],
    telemetryClass: 'product',
  }),
  ...registerRoutes(
    [
      '/:orgSlug/:brandSlug/analytics',
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
      adapter: {
        key: 'analytics',
        status: 'ready',
      },
      fallback: '/:orgSlug/:brandSlug/analytics',
      mode: 'canvas',
      productClass: 'visual-data',
      scope: 'brand',
      surfaceKey: 'analytics',
      switcherItems: ['analytics'],
      telemetryClass: 'product',
    },
  ),
  ...registerRoutes(
    [
      '/:orgSlug/:brandSlug/automate',
      '/:orgSlug/:brandSlug/automate/:agentId',
      '/:orgSlug/:brandSlug/automate/agents/:agentId',
      '/:orgSlug/:brandSlug/automate/overview',
      // /automate/analytics permanently redirects to Analytics Overview
      '/:orgSlug/:brandSlug/automate/analytics',
      '/:orgSlug/:brandSlug/automate/autopilot',
      '/:orgSlug/:brandSlug/automate/runs',
      '/:orgSlug/:brandSlug/automate/campaigns',
      '/:orgSlug/:brandSlug/automate/campaigns/new',
      '/:orgSlug/:brandSlug/automate/campaigns/:id',
      '/:orgSlug/:brandSlug/automate/orchestrator',
      '/:orgSlug/:brandSlug/automate/content-runs',
      '/:orgSlug/:brandSlug/automate/content-runs/:runId',
      '/:orgSlug/:brandSlug/automate/workflows',
      '/:orgSlug/:brandSlug/automate/workflows/templates',
      '/:orgSlug/:brandSlug/automate/workflows/executions',
      '/:orgSlug/:brandSlug/automate/workflows/executions/:id',
    ],
    {
      fallback: '/:orgSlug/:brandSlug/automate',
      mode: 'canvas',
      productClass: 'control-plane',
      scope: 'brand',
      surfaceKey: 'automate',
      switcherItems: ['automate'],
      telemetryClass: 'product',
    },
  ),
  ...registerRoutes(
    [
      '/:orgSlug/:brandSlug/messages',
      '/:orgSlug/:brandSlug/messages/outreach',
      '/:orgSlug/:brandSlug/messages/outreach/new',
      '/:orgSlug/:brandSlug/messages/outreach/:id',
      '/:orgSlug/:brandSlug/messages/replies',
      '/:orgSlug/:brandSlug/messages/reply-drip',
    ],
    {
      adapter: {
        key: 'messages',
        status: 'embedded',
      },
      fallback: '/:orgSlug/:brandSlug/messages',
      mode: 'canvas',
      productClass: 'control-plane',
      scope: 'brand',
      surfaceKey: 'messages',
      switcherItems: ['messages'],
      telemetryClass: 'product',
    },
  ),
  ...registerRoutes(
    [
      '/:orgSlug/:brandSlug/automate/workflows/new',
      '/:orgSlug/:brandSlug/automate/workflows/:id',
    ],
    {
      fallback: '/:orgSlug/:brandSlug/automate/workflows',
      mode: 'canvas',
      productClass: 'control-plane',
      scope: 'brand',
      surfaceKey: 'automate-workflows-editor',
      switcherItems: ['automate'],
      telemetryClass: 'product',
    },
  ),
  ...registerRoutes(
    [
      '/:orgSlug/:brandSlug/automate/new',
      '/:orgSlug/:brandSlug/automate/agents',
      '/:orgSlug/:brandSlug/automate/agents/new',
      '/:orgSlug/:brandSlug/automate/hire',
      '/:orgSlug/:brandSlug/automate/library',
      '/:orgSlug/:brandSlug/automate/library/:type',
    ],
    {
      fallback: '/:orgSlug/:brandSlug/automate',
      mode: 'canvas',
      productClass: 'control-plane',
      scope: 'brand',
      surfaceKey: 'automate-management',
      switcherItems: ['automate'],
      telemetryClass: 'management',
    },
  ),
  ...registerRoutes(
    [
      '/:orgSlug/:brandSlug/settings',
      '/:orgSlug/:brandSlug/settings/kit',
      '/:orgSlug/:brandSlug/settings/characters',
      '/:orgSlug/:brandSlug/settings/social',
      '/:orgSlug/:brandSlug/settings/links',
      '/:orgSlug/:brandSlug/settings/voice',
      '/:orgSlug/:brandSlug/settings/harness',
      '/:orgSlug/:brandSlug/settings/interview',
      '/:orgSlug/:brandSlug/settings/organization/credentials',
      '/:orgSlug/:brandSlug/settings/publishing',
      '/:orgSlug/:brandSlug/settings/agent-defaults',
      '/:orgSlug/:brandSlug/settings/skills',
      '/:orgSlug/:brandSlug/settings/usage',
      // Legacy Automate settings aliases permanently redirect into this surface.
      '/:orgSlug/:brandSlug/automate/configuration',
      '/:orgSlug/:brandSlug/automate/skills',
    ],
    {
      fallback: '/:orgSlug/:brandSlug/settings',
      mode: 'canvas',
      productClass: 'control-plane',
      scope: 'brand',
      surfaceKey: 'brand-settings',
      telemetryClass: 'management',
    },
  ),
  ...registerRoutes(['/:orgSlug/:brandSlug/platforms/:platform'], {
    fallback: '/:orgSlug/:brandSlug/settings/social',
    mode: 'canvas',
    productClass: 'control-plane',
    scope: 'brand',
    surfaceKey: 'platforms',
    switcherItems: ['publish', 'messages'],
    telemetryClass: 'product',
  }),
  ...registerRoutes(
    [
      '/:orgSlug/:brandSlug/lab/library-preview',
      '/:orgSlug/:brandSlug/lab/twitter-engage',
    ],
    {
      fallback: '/:orgSlug/:brandSlug/workspace',
      mode: 'canvas',
      productClass: 'control-plane',
      scope: 'brand',
      surfaceKey: 'lab',
      telemetryClass: 'management',
    },
  ),
] as const;

const ADMIN_CONTROL_PLANE_ROUTE_PATTERNS = [
  '/admin',
  '/admin/overview',
  '/admin/overview/dashboard',
  '/admin/overview/activities',
  '/admin/content/posts',
  '/admin/content/posts/:id',
  '/admin/content/templates',
  '/admin/content/templates/:id',
  '/admin/content/prompts/list',
  '/admin/content/ingredients',
  '/admin/content/ingredients/:type',
  '/admin/folders',
  '/admin/images/:id',
  '/admin/videos/:id',
  '/admin/automation/bots',
  '/admin/automation/models',
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
  '/admin/administration/referrals',
  '/admin/administration/announcements',
  '/admin/administration/system-emails',
  '/admin/administration/platform-settings',
] as const;

const ADMIN_ANALYTICS_ROUTE_PATTERNS = [
  '/admin/overview/analytics/all',
  '/admin/overview/analytics/brands',
  '/admin/overview/analytics/brands/:id',
  '/admin/overview/analytics/brands/:id/platforms/:platform',
  '/admin/overview/analytics/business',
  '/admin/overview/analytics/organizations',
  '/admin/overview/analytics/organizations/:id',
] as const;

const ADMIN_ROUTE_REGISTRATIONS = [
  ...registerRoutes(ADMIN_CONTROL_PLANE_ROUTE_PATTERNS, {
    fallback: '/admin/overview/dashboard',
    mode: 'canvas',
    productClass: 'control-plane',
    scope: 'platform-admin',
    surfaceKey: 'platform-admin',
    switcherItems: ['admin'],
    telemetryClass: 'management',
  }),
  ...registerRoutes(ADMIN_ANALYTICS_ROUTE_PATTERNS, {
    fallback: '/admin/overview/dashboard',
    mode: 'canvas',
    productClass: 'visual-data',
    scope: 'platform-admin',
    surfaceKey: 'platform-admin',
    switcherItems: ['admin'],
    telemetryClass: 'management',
  }),
] as const;

/**
 * Canonical application-owned inventory for the protected route patterns
 * accepted in ADR-CONVERSATION-SHELL-CONTRACTS v1.0.0 plus routes added after
 * its 206-route snapshot. The inventory hard cut
 * (`/:orgSlug/~/settings/organization/*`) is deliberately absent. Retired
 * `/automate/strategies` is a third hard cut: the `:agentId` pattern must not
 * treat that slug as a live agent. Org Workspace lives at
 * `/:orgSlug/~/workspace/*` (legacy `/:orgSlug/~/overview` redirects there).
 */
export const PROTECTED_ROUTE_INVENTORY = Object.freeze([
  ...PERSONAL_ROUTE_REGISTRATIONS,
  ...ORGANIZATION_ROUTE_REGISTRATIONS,
  ...BRAND_ROUTE_REGISTRATIONS,
  ...ADMIN_ROUTE_REGISTRATIONS,
]);

export const WORKSPACE_SHELL_OVERLAY_REGISTRY = Object.freeze([
  Object.freeze({
    accessPolicy: 'organization-member',
    adapter: Object.freeze({ key: 'library-picker', status: 'ready' }),
    allowedShellModes: Object.freeze(['overlay'] as const),
    availability: 'conversation-shell',
    canonicalUrl: null,
    deployments: ALL_DEPLOYMENTS,
    key: 'library-picker',
    kind: 'overlay',
    launchTarget: 'overlay',
    parameterContract: Object.freeze({ kind: 'none' } as const),
    presentation: Object.freeze({
      description:
        'Choose an authorized media source without leaving the active conversation.',
      openAnnouncement: 'Library picker opened.',
      title: 'Choose from Library',
    }),
    restoration: URL_RESTORATION_POLICY,
    safeFallback: 'same-canonical-url',
    scope: 'organization',
    telemetryClass: 'library_picker',
  }),
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
    adapter: Object.freeze({ key: 'workflow-picker', status: 'placeholder' }),
    allowedShellModes: Object.freeze(['overlay'] as const),
    availability: 'conversation-shell',
    canonicalUrl: null,
    deployments: ALL_DEPLOYMENTS,
    key: 'workflow-picker',
    kind: 'overlay',
    launchTarget: 'overlay',
    parameterContract: Object.freeze({ kind: 'none' } as const),
    presentation: Object.freeze({
      description:
        'Choose an authorized deterministic workflow without leaving the active conversation or canvas.',
      openAnnouncement: 'Workflow picker opened.',
      title: 'Choose a workflow',
    }),
    restoration: URL_RESTORATION_POLICY,
    safeFallback: 'same-canonical-url',
    scope: 'organization',
    telemetryClass: 'workflow_picker',
  }),
] as const satisfies readonly WorkspaceShellOverlayRegistration[]);

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

function isWorkspaceShellHardCut(pathname: string): boolean {
  const segments = pathname.split('/').filter(Boolean);
  return (
    segments.length === 4 &&
    segments[1] !== '~' &&
    segments[2] === 'automate' &&
    segments[3] === 'strategies'
  );
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
      return !hasReservedPrefix && segments.length >= 2 && segments[1] !== '~';
    case 'organization':
      return (
        !hasReservedPrefix && (segments.length === 1 || segments[1] === '~')
      );
    case 'personal':
      return (
        pathname === '/' ||
        pathname === '/connect' ||
        pathname.startsWith('/settings')
      );
    case 'platform-admin':
      return pathname === '/admin' || pathname.startsWith('/admin/');
  }
}

export function resolveWorkspaceShellRoute(
  hrefOrPathname: string,
): ResolvedWorkspaceShellRoute | null {
  const pathname = getPathname(hrefOrPathname);
  if (!pathname || isWorkspaceShellHardCut(pathname)) {
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

  return Object.freeze({
    ...bestMatch.registration,
    breadcrumb: resolveBreadcrumbMetadata(
      bestMatch.registration.breadcrumb,
      params,
    ),
    params,
  });
}

export function getWorkspaceShellOverlayRegistration(
  key: string,
): WorkspaceShellOverlayRegistration | null {
  return (
    WORKSPACE_SHELL_OVERLAY_REGISTRY.find(
      (registration) => registration.key === key,
    ) ?? null
  );
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
