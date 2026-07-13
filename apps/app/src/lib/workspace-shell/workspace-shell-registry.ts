export type WorkspaceShellBaseState = 'canvas' | 'conversation';

export type WorkspaceShellRouteMode = WorkspaceShellBaseState | 'dedicated';

export type WorkspaceShellRouteRegistration = {
  readonly key: string;
  readonly mode: WorkspaceShellRouteMode;
  readonly telemetryClass: 'agent' | 'management' | 'product';
};

export type WorkspaceShellOverlayRegistration = {
  readonly allowedReferenceKinds: readonly WorkspaceShellReferenceKind[];
  readonly key: string;
  readonly telemetryClass: 'shell_preview';
};

export type WorkspaceShellReferenceKind = 'asset' | 'post';

const PRODUCT_CANVAS_PREFIXES = [
  '/analytics',
  '/compose',
  '/editor',
  '/library',
  '/messages',
  '/orchestration',
  '/overview',
  '/posts',
  '/research',
  '/studio',
  '/tasks',
  '/workflows',
  '/workspace',
  '/write',
] as const;

const DEDICATED_PREFIXES = [
  '/admin',
  '/agent/journey',
  '/agent/onboarding',
  '/lab',
  '/settings',
] as const;

export const WORKSPACE_SHELL_OVERLAY_REGISTRY = new Map<
  string,
  WorkspaceShellOverlayRegistration
>([
  [
    'shell-preview',
    {
      allowedReferenceKinds: ['asset', 'post'],
      key: 'shell-preview',
      telemetryClass: 'shell_preview',
    },
  ],
]);

function matchesRoutePrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function resolveWorkspaceShellRoute(
  normalizedPathname: string,
): WorkspaceShellRouteRegistration | null {
  const dedicatedPrefix = DEDICATED_PREFIXES.find((prefix) =>
    matchesRoutePrefix(normalizedPathname, prefix),
  );
  if (dedicatedPrefix) {
    return {
      key: `dedicated:${dedicatedPrefix.slice(1)}`,
      mode: 'dedicated',
      telemetryClass: 'management',
    };
  }

  if (
    normalizedPathname === '/agent' ||
    normalizedPathname === '/agent/new' ||
    /^\/agent\/[^/]+$/.test(normalizedPathname)
  ) {
    return {
      key: 'agent-conversation',
      mode: 'conversation',
      telemetryClass: 'agent',
    };
  }

  const canvasPrefix = PRODUCT_CANVAS_PREFIXES.find((prefix) =>
    matchesRoutePrefix(normalizedPathname, prefix),
  );
  if (canvasPrefix) {
    return {
      key: `canvas:${canvasPrefix.slice(1)}`,
      mode: 'canvas',
      telemetryClass: 'product',
    };
  }

  return null;
}
