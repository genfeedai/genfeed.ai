import { describe, expect, it } from 'vitest';
import {
  getWorkspaceShellOverlayRegistration,
  PROTECTED_ROUTE_INVENTORY,
  resolveWorkspaceShellRoute,
} from './workspace-shell-registry';

const ROUTE_PARAM_FIXTURES: Readonly<Record<string, string>> = {
  agentId: 'agent-1',
  brandSlug: 'moonrise',
  filter: 'all',
  id: 'resource-1',
  orgSlug: 'acme',
  platform: 'instagram',
  runId: 'run-1',
  segment: 'post',
  slug: 'character-1',
  threadId: 'thread-1',
  type: 'image',
  view: 'all',
};

function materializeRoutePattern(pattern: string): string {
  return pattern.replace(
    /:([A-Za-z][A-Za-z0-9]*)/g,
    (_, key: string) => ROUTE_PARAM_FIXTURES[key] ?? `${key}-1`,
  );
}

describe('workspace shell trusted registry', () => {
  it('owns the complete accepted protected-route denominator', () => {
    expect(
      new Set(PROTECTED_ROUTE_INVENTORY.map((route) => route.canonicalUrl))
        .size,
    ).toBe(PROTECTED_ROUTE_INVENTORY.length);

    for (const route of PROTECTED_ROUTE_INVENTORY) {
      expect(route.accessPolicy).toMatch(
        /^(authenticated|brand-member|organization-member|platform-admin)$/,
      );
      expect(route.allowedShellModes).toEqual([route.mode]);
      expect(route.availability).toBe('conversation-shell');
      expect(route.canonicalUrl).toMatch(/^\//);
      expect(route.breadcrumb.rootLabel).not.toHaveLength(0);
      expect(route.breadcrumb.leafLabel).not.toHaveLength(0);
      expect(route.deployments).toEqual([
        'cloud-web',
        'self-hosted-web',
        'desktop',
      ]);
      expect(route.restoration).toEqual({
        history: 'canonical-url',
        invalidShellParams: 'replace',
        searchParams: 'preserve-opaque',
      });
      expect(route.launchTarget).toBe(
        route.mode === 'canvas'
          ? 'focused-canvas'
          : route.mode === 'conversation'
            ? 'inline'
            : 'dedicated-route',
      );
      expect(route.productClass).toMatch(
        /^(contextual-action|control-plane|removable|visual-data)$/,
      );
      expect(route.safeFallback).toMatch(/^\//);
      expect(route.surfaceKey).not.toHaveLength(0);
    }
  });

  it('resolves every canonical inventory pattern to its exact registration', () => {
    for (const registration of PROTECTED_ROUTE_INVENTORY) {
      const route = resolveWorkspaceShellRoute(
        materializeRoutePattern(registration.canonicalUrl),
      );

      expect(route?.key).toBe(registration.key);
      expect(route?.breadcrumb.rootLabel).not.toMatch(/:/);
      expect(route?.breadcrumb.leafLabel).not.toMatch(/:/);
    }
  });

  it.each([
    ['/acme/~/settings/api-keys', 'Settings', 'API Keys'],
    ['/acme/~/automation', 'Automation', 'Overview'],
    ['/acme/moonrise/discovery/overview', 'Discovery', 'Overview'],
    ['/acme/moonrise/discovery/ads', 'Discovery', 'Ads'],
    ['/acme/moonrise/platforms/instagram', 'Platforms', 'Instagram'],
    ['/acme/moonrise', 'Workspace', 'Overview'],
    ['/acme/moonrise/library', 'Library', 'Overview'],
    ['/acme/moonrise/library/videos', 'Library', 'Assets'],
    ['/acme/moonrise/library/voices', 'Library', 'Assets'],
    ['/acme/moonrise/studio/batch', 'Studio', 'Batch'],
    ['/acme/moonrise/studio/batch/new', 'Studio', 'Batch'],
    ['/acme/moonrise/studio/clips', 'Studio', 'Clips'],
    ['/acme/moonrise/studio/clips/new', 'Studio', 'New project'],
    ['/acme/moonrise/studio/clips/project-1', 'Studio', 'Project'],
    ['/acme/moonrise/studio/storyboard', 'Studio', 'Storyboard'],
    ['/acme/moonrise/studio/storyboard/new', 'Studio', 'New storyboard'],
    ['/acme/moonrise/studio/storyboard/run-1', 'Studio', 'Run'],
    ['/acme/moonrise/studio/editor', 'Studio', 'Editor'],
    ['/acme/moonrise/studio/editor/project-1', 'Studio', 'Project'],
    ['/acme/~/studio/editor', 'Studio', 'Editor'],
    ['/acme/moonrise/analytics/trends', 'Analytics', 'Trends'],
    [
      '/acme/moonrise/analytics/trends/detail/trend-1',
      'Analytics',
      'Trend Detail',
    ],
    [
      '/acme/moonrise/analytics/trends/platforms/instagram',
      'Analytics',
      'Instagram Trends',
    ],
    ['/acme/moonrise/automation/templates', 'Automation', 'Workflows'],
    [
      '/acme/moonrise/automation/workflows/templates',
      'Automation',
      'Workflows',
    ],
    ['/acme/moonrise/automation/workflows/new', 'Automation', 'New Workflow'],
    [
      '/acme/moonrise/automation/workflows/workflow-1',
      'Automation',
      'Workflow',
    ],
    ['/acme/moonrise/automation', 'Automation', 'Overview'],
    ['/acme/moonrise/automation/content-runs', 'Automation', 'Content Runs'],
    [
      '/acme/moonrise/automation/content-runs/run-1',
      'Automation',
      'Content Run',
    ],
    ['/acme/moonrise/automation/campaigns/campaign-1', 'Automation', 'Program'],
    ['/acme/moonrise/automation/library/images', 'Automation', 'Images'],
    ['/acme/moonrise/automation/agents', 'Automation', 'Agents'],
    ['/acme/moonrise/edit/article/article-1', 'Edit', 'Article'],
    ['/acme/moonrise/edit/newsletter/newsletter-1', 'Edit', 'Newsletter'],
    // /publishing/posts/:id has its own case below: it carries parent and root
    // hrefs that this flat {leafLabel, rootLabel} shape cannot express.
  ] as const)(
    'resolves canonical breadcrumb metadata for %s',
    (pathname, rootLabel, leafLabel) => {
      expect(resolveWorkspaceShellRoute(pathname)?.breadcrumb).toEqual({
        leafLabel,
        rootLabel,
      });
    },
  );

  it.each([
    ['/:orgSlug/:brandSlug/library/assets', 'canvas'],
    ['/:orgSlug/:brandSlug/settings/skills', 'canvas'],
    ['/:orgSlug/:brandSlug/settings/knowledge', 'canvas'],
    ['/:orgSlug/:brandSlug/settings/characters', 'canvas'],
    ['/:orgSlug/:brandSlug/studio/batch', 'canvas'],
    ['/:orgSlug/:brandSlug/studio/batch/new', 'canvas'],
    ['/:orgSlug/:brandSlug/studio/clips', 'canvas'],
    ['/:orgSlug/:brandSlug/settings/publishing', 'canvas'],
    ['/:orgSlug/:brandSlug/platforms/:platform', 'canvas'],
    ['/:orgSlug/~/settings/subscription', 'canvas'],
    ['/admin/administration/users', 'canvas'],
  ] as const)('classifies %s as %s', (pattern, mode) => {
    expect(
      resolveWorkspaceShellRoute(materializeRoutePattern(pattern))?.mode,
    ).toBe(mode);
  });

  it.each([
    '/acme/moonrise/edit/article/article-1',
    '/acme/moonrise/edit/newsletter/newsletter-1',
  ] as const)(
    'registers the dedicated artifact editor %s as a focused Publishing surface',
    (pathname) => {
      expect(resolveWorkspaceShellRoute(pathname)).toMatchObject({
        mode: 'canvas',
        productClass: 'contextual-action',
        safeFallback: '/:orgSlug/:brandSlug/publishing/posts',
        surfaceKey: 'artifact-editor',
      });
      expect(resolveWorkspaceShellRoute(pathname)?.switcherItems).toEqual([
        'publishing',
      ]);
    },
  );

  it('activates the Studio adapter across production surfaces only', () => {
    for (const surface of ['batch', 'batch/project-1', 'clips', 'storyboard']) {
      expect(
        resolveWorkspaceShellRoute(`/acme/moonrise/studio/${surface}`),
      ).toMatchObject({
        adapter: { key: 'studio-specialized', status: 'ready' },
        mode: 'canvas',
      });
    }

    for (const retired of ['image', 'video', 'avatar', 'music']) {
      expect(
        resolveWorkspaceShellRoute(`/acme/moonrise/studio/${retired}`),
      ).toBeNull();
      expect(
        resolveWorkspaceShellRoute(`/acme/moonrise/studio/${retired}/asset-1`),
      ).toBeNull();
    }
  });

  it('resolves the Editor surface in brand and organization scope', () => {
    expect(
      resolveWorkspaceShellRoute('/acme/moonrise/studio/editor'),
    ).toMatchObject({ mode: 'canvas', surfaceKey: 'studio-editor' });
    expect(
      resolveWorkspaceShellRoute('/acme/moonrise/studio/editor/project-1'),
    ).toMatchObject({ mode: 'canvas', surfaceKey: 'studio-editor' });
    expect(resolveWorkspaceShellRoute('/acme/~/studio/editor')).toMatchObject({
      scope: 'organization',
      surfaceKey: 'studio-editor',
    });
  });

  it('preserves visual-data and control-plane families from route retirement', () => {
    expect(
      resolveWorkspaceShellRoute('/acme/moonrise/discovery/ads'),
    ).toMatchObject({ productClass: 'visual-data' });
    expect(
      resolveWorkspaceShellRoute('/acme/moonrise/analytics/trends'),
    ).toMatchObject({ productClass: 'visual-data' });
    expect(
      resolveWorkspaceShellRoute('/admin/overview/analytics/business'),
    ).toMatchObject({ productClass: 'visual-data' });

    for (const pathname of [
      '/acme/moonrise/library/images',
      '/acme/moonrise/publishing/campaigns',
      '/acme/moonrise/publishing/content',
      '/acme/moonrise/publishing/posts',
      '/acme/moonrise/publishing/review',
      '/acme/~/publishing/posts',
      '/acme/moonrise/automation/runs/run-1',
      '/acme/moonrise/settings/publishing',
      '/acme/moonrise/settings/usage',
      '/acme/moonrise/settings/integrations',
      '/acme/~/settings/api-keys',
      '/acme/~/settings/usage',
      '/acme/~/settings/subscription',
      '/admin/overview',
      '/admin/overview/activities',
    ]) {
      expect(resolveWorkspaceShellRoute(pathname)).toMatchObject({
        productClass: 'control-plane',
      });
    }
  });

  it('keeps evidence-gated candidates out of the removable class', () => {
    expect(
      PROTECTED_ROUTE_INVENTORY.filter(
        (route) => route.productClass === 'removable',
      ),
    ).toEqual([]);
    expect(
      resolveWorkspaceShellRoute('/acme/moonrise/studio/image'),
    ).toBeNull();
    expect(
      resolveWorkspaceShellRoute('/acme/moonrise/automation/autopilot'),
    ).toBeNull();
    expect(
      resolveWorkspaceShellRoute('/acme/moonrise/automation/strategies'),
    ).toBeNull();
    expect(
      resolveWorkspaceShellRoute('/acme/moonrise/automation/configuration'),
    ).toBeNull();
    expect(resolveWorkspaceShellRoute('/acme/~/write')).toBeNull();
    expect(resolveWorkspaceShellRoute('/acme/~/compose')).toBeNull();
    expect(
      resolveWorkspaceShellRoute('/acme/moonrise/compose/article'),
    ).toBeNull();
    expect(
      PROTECTED_ROUTE_INVENTORY.some(
        (route) =>
          route.canonicalUrl === '/:orgSlug/:brandSlug/publishing/composer',
      ),
    ).toBe(false);
  });

  it('registers organization and brand Workspace overviews independently', () => {
    expect(
      resolveWorkspaceShellRoute('/acme/~/workspace/overview'),
    ).toMatchObject({
      adapter: {
        key: 'organization-workspace-overview',
        status: 'embedded',
      },
      safeFallback: '/:orgSlug/~/workspace/overview',
      scope: 'organization',
      surfaceKey: 'organization-overview',
    });
    expect(
      resolveWorkspaceShellRoute('/acme/~/workspace/overview'),
    ).toMatchObject({
      adapter: {
        key: 'organization-workspace-overview',
        status: 'embedded',
      },
      safeFallback: '/:orgSlug/~/workspace/overview',
      scope: 'organization',
      surfaceKey: 'organization-overview',
    });
    expect(
      resolveWorkspaceShellRoute('/acme/~/workspace/activity'),
    ).toMatchObject({
      scope: 'organization',
      surfaceKey: 'workspace',
    });
    expect(
      resolveWorkspaceShellRoute('/acme/moonrise/workspace'),
    ).toMatchObject({
      adapter: {
        key: 'brand-workspace-overview',
        status: 'embedded',
      },
      safeFallback: '/:orgSlug/:brandSlug/workspace',
      scope: 'brand',
      surfaceKey: 'workspace-overview',
    });
    expect(
      resolveWorkspaceShellRoute('/acme/~/analytics')?.adapter.status,
    ).toBe('placeholder');
    expect(
      resolveWorkspaceShellRoute('/acme/moonrise/workspace/inbox/all')?.adapter
        .status,
    ).toBe('placeholder');
  });

  it.each([
    '/acme/~/library/shelf/approved',
    '/acme/~/publishing/content',
    '/acme/~/publishing/review',
    '/acme/~/publishing/posts/post-1',
  ])('registers the organization collection surface %s', (pathname) => {
    expect(resolveWorkspaceShellRoute(pathname)).toMatchObject({
      scope: 'organization',
    });
  });

  it('registers the Connect Genfeed resolver and organization flow explicitly', () => {
    expect(resolveWorkspaceShellRoute('/connect')).toMatchObject({
      accessPolicy: 'authenticated',
      canonicalUrl: '/connect',
      safeFallback: '/connect',
      scope: 'personal',
      surfaceKey: 'connect-genfeed-resolver',
    });
    expect(resolveWorkspaceShellRoute('/acme/~/connect')).toMatchObject({
      accessPolicy: 'organization-member',
      canonicalUrl: '/:orgSlug/~/connect',
      safeFallback: '/:orgSlug/~/connect',
      scope: 'organization',
      surfaceKey: 'connect-genfeed',
    });
    expect(resolveWorkspaceShellRoute('/acme/~/connect/social')).toMatchObject({
      accessPolicy: 'organization-member',
      canonicalUrl: '/:orgSlug/~/connect/social',
      safeFallback: '/:orgSlug/~/connect/social',
      scope: 'organization',
      surfaceKey: 'connect-social',
    });
  });

  it('registers first-login onboarding as a conversation, not a canvas inspector host', () => {
    expect(
      resolveWorkspaceShellRoute('/acme/~/agent/onboarding'),
    ).toMatchObject({
      mode: 'conversation',
      productClass: 'contextual-action',
      surfaceKey: 'agent-onboarding',
      telemetryClass: 'agent',
    });
    expect(
      resolveWorkspaceShellRoute('/acme/moonrise/agent/onboarding/thread-1'),
    ).toMatchObject({
      mode: 'conversation',
      productClass: 'contextual-action',
      surfaceKey: 'agent-onboarding',
      telemetryClass: 'agent',
    });
    expect(resolveWorkspaceShellRoute('/acme/~/agent/journey')).toMatchObject({
      mode: 'canvas',
      productClass: 'control-plane',
      surfaceKey: 'agent-onboarding',
      telemetryClass: 'management',
    });
  });

  it('keeps notifications and trusted overlays explicit', () => {
    expect(
      getWorkspaceShellOverlayRegistration('library-picker'),
    ).toMatchObject({
      adapter: { key: 'library-picker', status: 'ready' },
      presentation: { title: 'Choose from Library' },
      telemetryClass: 'library_picker',
    });
    expect(getWorkspaceShellOverlayRegistration('notifications')).toMatchObject(
      {
        allowedShellModes: ['overlay'],
        canonicalUrl: null,
        kind: 'overlay',
        presentation: { title: 'Notifications' },
      },
    );
    expect(
      getWorkspaceShellOverlayRegistration('workflow-picker'),
    ).toMatchObject({
      presentation: { title: 'Choose a workflow' },
      telemetryClass: 'workflow_picker',
    });
  });

  it('is immutable and rejects untrusted registry keys', () => {
    expect(Object.isFrozen(PROTECTED_ROUTE_INVENTORY)).toBe(true);
    expect(Object.isFrozen(PROTECTED_ROUTE_INVENTORY[0])).toBe(true);
    expect(Object.isFrozen(PROTECTED_ROUTE_INVENTORY[0]?.adapter)).toBe(true);
    expect(Object.isFrozen(PROTECTED_ROUTE_INVENTORY[0]?.breadcrumb)).toBe(
      true,
    );
    expect(
      Reflect.set(PROTECTED_ROUTE_INVENTORY, 0, {
        key: 'model-produced-surface',
      }),
    ).toBe(false);
    expect(
      getWorkspaceShellOverlayRegistration('model-produced-surface'),
    ).toBeNull();
    expect(
      resolveWorkspaceShellRoute('https://untrusted.example/canvas'),
    ).toBeNull();
  });
});
