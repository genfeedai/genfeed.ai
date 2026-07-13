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
    expect(PROTECTED_ROUTE_INVENTORY).toHaveLength(207);
    expect(
      new Set(PROTECTED_ROUTE_INVENTORY.map((route) => route.canonicalUrl))
        .size,
    ).toBe(207);

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
    ['/:orgSlug/:brandSlug/studio/batch', 'canvas'],
    ['/:orgSlug/:brandSlug/studio/clips', 'canvas'],
    ['/:orgSlug/:brandSlug/studio/fastlane', 'canvas'],
    ['/:orgSlug/:brandSlug/settings/publishing', 'dedicated'],
    ['/:orgSlug/~/settings/billing', 'dedicated'],
    ['/admin/administration/users', 'dedicated'],
  ] as const)('classifies %s as %s', (pattern, mode) => {
    expect(
      resolveWorkspaceShellRoute(materializeRoutePattern(pattern))?.mode,
    ).toBe(mode);
  });

  it('keeps the two accepted hard-cut families outside the registry', () => {
    expect(resolveWorkspaceShellRoute('/acme/~/workspace/overview')).toBeNull();
    expect(
      resolveWorkspaceShellRoute('/acme/~/settings/organization/billing'),
    ).toBeNull();
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

  it('keeps notifications and deployment-specific dock chrome explicit', () => {
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
