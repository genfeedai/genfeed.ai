import { describe, expect, it } from 'vitest';
import {
  getWorkspaceShellOverlayRegistration,
  PROTECTED_ROUTE_INVENTORY,
  resolveWorkspaceShellRoute,
  resolveWorkspaceShellSafeFallback,
  WORKSPACE_SHELL_AUXILIARY_REGISTRY,
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
    expect(PROTECTED_ROUTE_INVENTORY).toHaveLength(209);
    expect(
      new Set(PROTECTED_ROUTE_INVENTORY.map((route) => route.canonicalUrl))
        .size,
    ).toBe(209);

    for (const route of PROTECTED_ROUTE_INVENTORY) {
      expect(route.accessPolicy).toMatch(
        /^(authenticated|brand-member|organization-member|platform-admin)$/,
      );
      expect(route.allowedShellModes).toEqual([route.mode]);
      expect(route.availability).toBe(
        route.mode === 'dedicated' ? 'always' : 'conversation-shell',
      );
      expect(route.canonicalUrl).toMatch(/^\//);
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
    }
  });

  it.each([
    ['/:orgSlug/:brandSlug/posts/calendar', 'canvas'],
    ['/:orgSlug/:brandSlug/library/moodboard', 'canvas'],
    ['/:orgSlug/:brandSlug/orchestration/skills', 'canvas'],
    ['/:orgSlug/:brandSlug/studio/batch', 'dedicated'],
    ['/:orgSlug/:brandSlug/studio/clips', 'dedicated'],
    ['/:orgSlug/:brandSlug/studio/fastlane', 'dedicated'],
    ['/:orgSlug/:brandSlug/settings/publishing', 'dedicated'],
    ['/:orgSlug/~/settings/billing', 'dedicated'],
    ['/admin/administration/users', 'dedicated'],
  ] as const)('classifies %s as %s', (pattern, mode) => {
    expect(
      resolveWorkspaceShellRoute(materializeRoutePattern(pattern))?.mode,
    ).toBe(mode);
  });

  it('keeps legacy workflow aliases aligned with their canonical orchestration owners', () => {
    expect(
      resolveWorkspaceShellRoute('/acme/moonrise/workflows/autopilot'),
    ).toMatchObject({ mode: 'canvas', surfaceKey: 'orchestration' });
    expect(
      resolveWorkspaceShellRoute('/acme/moonrise/workflows/configuration'),
    ).toMatchObject({
      mode: 'dedicated',
      surfaceKey: 'orchestration-management',
    });
  });

  it('activates the Studio adapter only for generation and canonical asset editing', () => {
    expect(
      resolveWorkspaceShellRoute('/acme/moonrise/studio/image')?.adapter,
    ).toEqual({ key: 'studio', status: 'ready' });
    expect(
      resolveWorkspaceShellRoute('/acme/moonrise/studio/image/ingredient-1')
        ?.adapter,
    ).toEqual({ key: 'studio', status: 'ready' });
    expect(
      resolveWorkspaceShellRoute('/acme/moonrise/studio/fastlane'),
    ).toMatchObject({
      adapter: { key: 'studio-specialized', status: 'dedicated-route' },
      mode: 'dedicated',
    });
  });

  it('keeps the two accepted hard-cut families outside the registry', () => {
    expect(resolveWorkspaceShellRoute('/acme/~/workspace/overview')).toBeNull();
    expect(
      resolveWorkspaceShellRoute('/acme/~/settings/organization/billing'),
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
      resolveWorkspaceShellRoute('/acme/moonrise/workspace/overview'),
    ).toMatchObject({
      adapter: {
        key: 'brand-workspace-overview',
        status: 'embedded',
      },
      safeFallback: '/:orgSlug/:brandSlug/workspace/overview',
      scope: 'brand',
      surfaceKey: 'workspace-overview',
    });
    expect(
      resolveWorkspaceShellRoute('/acme/~/analytics/overview')?.adapter.status,
    ).toBe('placeholder');
    expect(
      resolveWorkspaceShellRoute('/acme/moonrise/workspace/inbox/all')?.adapter
        .status,
    ).toBe('placeholder');
  });

  it('does not treat reserved application prefixes as scoped routes', () => {
    expect(resolveWorkspaceShellRoute('/settings/~/overview')).toBeNull();
    expect(resolveWorkspaceShellRoute('/settings/example/posts')).toBeNull();
    expect(resolveWorkspaceShellRoute('/admin/~/overview')).toBeNull();
    expect(resolveWorkspaceShellRoute('/admin/example/posts')).toBeNull();
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
      '/acme/moonrise/analytics/overview',
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

  it('marks Analytics canvases ready for the product-owned adapter', () => {
    expect(
      resolveWorkspaceShellRoute('/acme/moonrise/analytics/posts')?.adapter,
    ).toEqual({ key: 'analytics', status: 'ready' });
  });

  it('registers Research as an embedded adapter with its canonical fallback', () => {
    const route = resolveWorkspaceShellRoute(
      '/acme/moonrise/research/ads/google',
    );

    expect(route).toMatchObject({
      adapter: { key: 'research', status: 'embedded' },
      mode: 'canvas',
      safeFallback: '/:orgSlug/:brandSlug/research/discovery',
      surfaceKey: 'research',
    });
    expect(route && resolveWorkspaceShellSafeFallback(route)).toBe(
      '/acme/moonrise/research/discovery',
    );
  });

  it('keeps notifications and deployment-specific dock chrome explicit', () => {
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
    expect(
      WORKSPACE_SHELL_AUXILIARY_REGISTRY.find(
        (registration) => registration.key === 'terminal-dock',
      ),
    ).toMatchObject({
      deployments: ['self-hosted-web', 'desktop'],
      kind: 'chrome',
    });
  });

  it('is immutable and rejects untrusted registry keys', () => {
    expect(Object.isFrozen(PROTECTED_ROUTE_INVENTORY)).toBe(true);
    expect(Object.isFrozen(PROTECTED_ROUTE_INVENTORY[0])).toBe(true);
    expect(Object.isFrozen(PROTECTED_ROUTE_INVENTORY[0]?.adapter)).toBe(true);
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
