import { describe, expect, it } from 'vitest';
import {
  getWorkspaceShellOverlayRegistration,
  PROTECTED_ROUTE_INVENTORY,
  resolveWorkspaceShellRoute,
  resolveWorkspaceShellSafeFallback,
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
    ['/acme/~/automate', 'Automate', 'Overview'],
    ['/acme/moonrise/discover/following', 'Discover', 'Following'],
    ['/acme/moonrise/discover/instagram', 'Discover', 'Instagram'],
    ['/acme/moonrise/library', 'Library', 'Overview'],
    ['/acme/moonrise/library/videos', 'Library', 'Assets'],
    ['/acme/moonrise/library/voices', 'Library', 'Assets'],
    ['/acme/moonrise/library/moodboard', 'Library', 'Moodboard'],
    ['/acme/moonrise/studio/clips', 'Studio', 'Clips'],
    ['/acme/moonrise/studio/storyboard', 'Studio', 'Storyboard'],
    ['/acme/moonrise/studio/edit', 'Studio', 'Edit'],
    ['/acme/moonrise/studio/edit/project-1', 'Studio', 'Project'],
    ['/acme/~/studio/edit', 'Studio', 'Edit'],
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
    ['/acme/moonrise/automate/workflows/templates', 'Automate', 'Templates'],
    ['/acme/moonrise/automate/workflows/new', 'Automate', 'New Workflow'],
    ['/acme/moonrise/automate/workflows/workflow-1', 'Automate', 'Workflow'],
    ['/acme/moonrise/automate', 'Automate', 'Overview'],
    ['/acme/moonrise/automate/content-runs', 'Automate', 'Content Runs'],
    ['/acme/moonrise/automate/content-runs/run-1', 'Automate', 'Content Run'],
    ['/acme/moonrise/automate/campaigns/campaign-1', 'Automate', 'Campaign'],
    ['/acme/moonrise/automate/library/images', 'Automate', 'Images'],
    ['/acme/moonrise/edit/article/article-1', 'Edit', 'Article'],
    ['/acme/moonrise/edit/newsletter/newsletter-1', 'Edit', 'Newsletter'],
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
    ['/acme/moonrise/discover/ads/google', 'Google'],
    ['/acme/moonrise/discover/ads/meta', 'Meta'],
  ] as const)(
    'keeps Ads in the breadcrumb hierarchy for %s',
    (pathname, leafLabel) => {
      expect(resolveWorkspaceShellRoute(pathname)?.breadcrumb).toEqual({
        leafLabel,
        parentLabel: 'Ads',
        rootLabel: 'Discover',
      });
    },
  );

  it('keeps the content desk breadcrumb nested under Posts for /acme/moonrise/publish/posts/post-1', () => {
    expect(
      resolveWorkspaceShellRoute('/acme/moonrise/publish/posts/post-1')
        ?.breadcrumb,
    ).toEqual({
      leafLabel: 'Post',
      parentHref: '/publish/posts',
      parentLabel: 'Posts',
      rootHref: '/publish/overview',
      rootLabel: 'Publish',
    });
  });

  it.each([
    ['/:orgSlug/:brandSlug/publish/calendar', 'canvas'],
    ['/:orgSlug/:brandSlug/library/moodboard', 'canvas'],
    ['/:orgSlug/:brandSlug/automate/skills', 'canvas'],
    ['/:orgSlug/:brandSlug/studio/batch', 'canvas'],
    ['/:orgSlug/:brandSlug/studio/clips', 'canvas'],
    ['/:orgSlug/:brandSlug/studio/fastlane', 'canvas'],
    ['/:orgSlug/:brandSlug/settings/publishing', 'canvas'],
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
    'registers the dedicated artifact editor %s as a focused Publish surface',
    (pathname) => {
      expect(resolveWorkspaceShellRoute(pathname)).toMatchObject({
        mode: 'canvas',
        productClass: 'contextual-action',
        safeFallback: '/:orgSlug/:brandSlug/publish/posts',
        surfaceKey: 'artifact-editor',
      });
      expect(resolveWorkspaceShellRoute(pathname)?.switcherItems).toEqual([
        'publish',
      ]);
    },
  );

  it('registers /acme/moonrise/publish/posts/post-1 as the publish control-plane surface, not the artifact editor', () => {
    expect(
      resolveWorkspaceShellRoute('/acme/moonrise/publish/posts/post-1'),
    ).toMatchObject({
      mode: 'canvas',
      productClass: 'control-plane',
      safeFallback: '/:orgSlug/:brandSlug/publish/overview',
      surfaceKey: 'publish',
    });
  });

  it('keeps legacy workflow aliases aligned with their canonical automate owners', () => {
    expect(
      resolveWorkspaceShellRoute('/acme/moonrise/automate/autopilot'),
    ).toMatchObject({ mode: 'canvas', surfaceKey: 'automate' });
    expect(
      resolveWorkspaceShellRoute('/acme/moonrise/automate/configuration'),
    ).toMatchObject({
      mode: 'canvas',
      surfaceKey: 'automate-management',
    });
  });

  it('activates the Studio adapter across production surfaces only', () => {
    for (const surface of ['batch', 'clips', 'fastlane', 'storyboard']) {
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

  it('resolves the merged edit surface in brand and organization scope', () => {
    expect(
      resolveWorkspaceShellRoute('/acme/moonrise/studio/edit'),
    ).toMatchObject({ mode: 'canvas', surfaceKey: 'studio-edit' });
    expect(
      resolveWorkspaceShellRoute('/acme/moonrise/studio/edit/project-1'),
    ).toMatchObject({ mode: 'canvas', surfaceKey: 'studio-edit' });
    expect(resolveWorkspaceShellRoute('/acme/~/studio/edit')).toMatchObject({
      scope: 'organization',
      surfaceKey: 'studio-edit',
    });
  });

  it('has no standalone editor route left in the inventory', () => {
    expect(resolveWorkspaceShellRoute('/acme/moonrise/editor')).toBeNull();
    expect(resolveWorkspaceShellRoute('/acme/moonrise/editor/new')).toBeNull();
    expect(resolveWorkspaceShellRoute('/acme/~/editor')).toBeNull();
  });

  it('keeps contextual Remix as an action deep-link (Discover + Publish switcher)', () => {
    expect(
      resolveWorkspaceShellRoute('/acme/moonrise/publish/remix'),
    ).toMatchObject({
      productClass: 'contextual-action',
      surfaceKey: 'publish',
      switcherItems: ['discover', 'publish'],
    });
  });

  it('preserves visual-data and control-plane families from route retirement', () => {
    expect(
      resolveWorkspaceShellRoute('/acme/moonrise/discover/ads/meta'),
    ).toMatchObject({ productClass: 'visual-data' });
    expect(
      resolveWorkspaceShellRoute('/acme/moonrise/analytics/trends'),
    ).toMatchObject({ productClass: 'visual-data' });
    expect(
      resolveWorkspaceShellRoute('/admin/overview/analytics/business'),
    ).toMatchObject({ productClass: 'visual-data' });

    for (const pathname of [
      '/acme/moonrise/library/images',
      '/acme/moonrise/publish/calendar',
      '/acme/moonrise/publish/posts',
      '/acme/moonrise/publish/review',
      '/acme/moonrise/automate/workflows/executions/run-1',
      '/acme/moonrise/settings/publishing',
      '/acme/moonrise/settings/organization/credentials',
      '/acme/~/settings/api-keys',
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
    // The Automate hard-cut folded autopilot and configuration into the
    // first-class automate family. Compose's `/write` alias retired with it.
    expect(
      resolveWorkspaceShellRoute('/acme/moonrise/automate/autopilot'),
    ).toMatchObject({ productClass: 'control-plane' });
    expect(
      resolveWorkspaceShellRoute('/acme/moonrise/automate/configuration'),
    ).toMatchObject({ productClass: 'control-plane' });
    expect(resolveWorkspaceShellRoute('/acme/~/write')).toBeNull();
    expect(resolveWorkspaceShellRoute('/acme/~/compose')).toBeNull();
    expect(
      resolveWorkspaceShellRoute('/acme/moonrise/compose/article'),
    ).toBeNull();
    expect(
      PROTECTED_ROUTE_INVENTORY.some(
        (route) =>
          route.canonicalUrl === '/:orgSlug/:brandSlug/publish/composer',
      ),
    ).toBe(false);
  });

  it('keeps the two accepted hard-cut families outside the registry', () => {
    expect(resolveWorkspaceShellRoute('/acme/~/workspace')).toBeNull();
    expect(
      resolveWorkspaceShellRoute('/acme/~/settings/organization'),
    ).toBeNull();
  });

  it('registers organization and brand Workspace overviews independently', () => {
    expect(resolveWorkspaceShellRoute('/acme/~/overview')).toMatchObject({
      adapter: {
        key: 'organization-workspace-overview',
        status: 'embedded',
      },
      safeFallback: '/:orgSlug/~/overview',
      scope: 'organization',
      surfaceKey: 'organization-overview',
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
  });

  it('does not treat reserved application prefixes as scoped routes', () => {
    expect(resolveWorkspaceShellRoute('/connect/~/overview')).toBeNull();
    expect(resolveWorkspaceShellRoute('/connect/example/publish')).toBeNull();
    expect(resolveWorkspaceShellRoute('/settings/~/overview')).toBeNull();
    expect(resolveWorkspaceShellRoute('/settings/example/publish')).toBeNull();
    expect(resolveWorkspaceShellRoute('/admin/~/overview')).toBeNull();
    expect(resolveWorkspaceShellRoute('/admin/example/publish')).toBeNull();
  });

  it('interpolates a safe fallback without widening scope', () => {
    const route = resolveWorkspaceShellRoute(
      '/acme/moonrise/analytics/trends/detail/trend-1',
    );

    expect(route).not.toBeNull();
    if (!route) {
      throw new Error('Expected analytics detail route to be registered.');
    }
    expect(resolveWorkspaceShellSafeFallback(route)).toBe(
      '/acme/moonrise/analytics',
    );
  });

  it('registers Messages as embedded with its canonical route as fallback', () => {
    const route = resolveWorkspaceShellRoute('/acme/moonrise/messages');

    expect(route).toMatchObject({
      adapter: { status: 'embedded' },
      canonicalUrl: '/:orgSlug/:brandSlug/messages',
      safeFallback: '/:orgSlug/:brandSlug/messages',
      surfaceKey: 'messages',
    });
    expect(route && resolveWorkspaceShellSafeFallback(route)).toBe(
      '/acme/moonrise/messages',
    );
  });

  it('registers organization-scoped Messages as an embedded surface', () => {
    const route = resolveWorkspaceShellRoute('/acme/~/messages');

    expect(route).toMatchObject({
      adapter: { key: 'messages', status: 'embedded' },
      canonicalUrl: '/:orgSlug/~/messages',
      safeFallback: '/:orgSlug/~/messages',
      scope: 'organization',
      surfaceKey: 'messages',
    });
    expect(route && resolveWorkspaceShellSafeFallback(route)).toBe(
      '/acme/~/messages',
    );
  });

  it('registers organization-scoped Discover as an embedded surface', () => {
    const route = resolveWorkspaceShellRoute('/acme/~/discover/overview');

    expect(route).toMatchObject({
      adapter: { key: 'discover', status: 'embedded' },
      canonicalUrl: '/:orgSlug/~/discover/overview',
      safeFallback: '/:orgSlug/~/discover/overview',
      scope: 'organization',
      surfaceKey: 'discover',
    });
    expect(route && resolveWorkspaceShellSafeFallback(route)).toBe(
      '/acme/~/discover/overview',
    );
  });

  it('marks Analytics canvases ready for the product-owned adapter', () => {
    expect(
      resolveWorkspaceShellRoute('/acme/moonrise/analytics/posts')?.adapter,
    ).toEqual({ key: 'analytics', status: 'ready' });
  });

  it('registers Discover as an embedded adapter with its canonical fallback', () => {
    const route = resolveWorkspaceShellRoute(
      '/acme/moonrise/discover/ads/google',
    );

    expect(route).toMatchObject({
      adapter: { key: 'discover', status: 'embedded' },
      mode: 'canvas',
      safeFallback: '/:orgSlug/:brandSlug/discover/overview',
      surfaceKey: 'discover',
    });
    expect(route && resolveWorkspaceShellSafeFallback(route)).toBe(
      '/acme/moonrise/discover/overview',
    );
  });

  it('keeps notifications and trusted overlays explicit', () => {
    expect(
      getWorkspaceShellOverlayRegistration('library-picker'),
    ).toMatchObject({
      adapter: { key: 'library-picker', status: 'ready' },
      parameterContract: { kind: 'none' },
      presentation: { title: 'Choose from Library' },
      telemetryClass: 'library_picker',
    });
    expect(getWorkspaceShellOverlayRegistration('notifications')).toMatchObject(
      {
        allowedShellModes: ['overlay'],
        canonicalUrl: null,
        kind: 'overlay',
        parameterContract: { kind: 'none' },
        presentation: { title: 'Notifications' },
      },
    );
    expect(getWorkspaceShellOverlayRegistration('shell-preview')).toMatchObject(
      {
        parameterContract: {
          allowedReferenceKinds: ['asset', 'post'],
          kind: 'optional-reference',
          referenceAccess: 'server-authorized',
        },
        presentation: { title: 'Temporary workspace overlay' },
      },
    );
    expect(
      getWorkspaceShellOverlayRegistration('workflow-picker'),
    ).toMatchObject({
      parameterContract: { kind: 'none' },
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
