export type WorkspaceShellBaseState = 'canvas' | 'conversation';

export type WorkspaceShellRouteMode = WorkspaceShellBaseState | 'dedicated';

export type WorkspaceShellSurfaceMode = WorkspaceShellRouteMode | 'overlay';

export type WorkspaceShellState = WorkspaceShellBaseState | 'overlay';

export type WorkspaceShellScopeRequirement =
  | 'brand'
  | 'organization'
  | 'personal'
  | 'platform-admin';

export type WorkspaceShellDeployment =
  | 'cloud-web'
  | 'desktop'
  | 'self-hosted-web';

export type WorkspaceShellAccessPolicy =
  | 'authenticated'
  | 'brand-member'
  | 'organization-member'
  | 'platform-admin';

export type WorkspaceShellAvailability =
  | 'always'
  | 'conversation-shell'
  | 'legacy-shell';

export type WorkspaceShellLaunchTarget =
  | 'dedicated-route'
  | 'focused-canvas'
  | 'inline'
  | 'inspector'
  | 'overlay';

export type WorkspaceShellReferenceKind = 'asset' | 'post';

export interface WorkspaceShellRestorationPolicy {
  readonly history: 'canonical-url';
  readonly invalidShellParams: 'replace';
  readonly searchParams: 'preserve-opaque';
}

export interface WorkspaceShellAdapterSeam {
  readonly key: string;
  readonly status: 'dedicated-route' | 'placeholder';
}

export interface WorkspaceShellRouteRegistration {
  readonly accessPolicy: WorkspaceShellAccessPolicy;
  readonly adapter: WorkspaceShellAdapterSeam;
  readonly allowedShellModes: readonly [WorkspaceShellRouteMode];
  readonly availability: Exclude<WorkspaceShellAvailability, 'legacy-shell'>;
  readonly canonicalUrl: string;
  readonly deployments: readonly WorkspaceShellDeployment[];
  readonly key: string;
  readonly kind: 'route';
  readonly launchTarget: Extract<
    WorkspaceShellLaunchTarget,
    'dedicated-route' | 'focused-canvas' | 'inline'
  >;
  readonly mode: WorkspaceShellRouteMode;
  readonly restoration: WorkspaceShellRestorationPolicy;
  readonly safeFallback: string;
  readonly scope: WorkspaceShellScopeRequirement;
  readonly surfaceKey: string;
  readonly switcherItems: readonly string[];
  readonly telemetryClass: 'agent' | 'management' | 'product';
}

export interface ResolvedWorkspaceShellRoute
  extends WorkspaceShellRouteRegistration {
  readonly params: Readonly<Record<string, string>>;
}

export interface WorkspaceShellOverlayRegistration {
  readonly accessPolicy: 'organization-member';
  readonly adapter: WorkspaceShellAdapterSeam;
  readonly allowedReferenceKinds: readonly WorkspaceShellReferenceKind[];
  readonly allowedShellModes: readonly ['overlay'];
  readonly availability: 'conversation-shell';
  readonly canonicalUrl: null;
  readonly deployments: readonly WorkspaceShellDeployment[];
  readonly key: string;
  readonly kind: 'overlay';
  readonly launchTarget: 'overlay';
  readonly restoration: WorkspaceShellRestorationPolicy;
  readonly safeFallback: 'same-canonical-url';
  readonly scope: 'organization';
  readonly telemetryClass: 'notifications' | 'shell_preview';
}

export interface WorkspaceShellChromeRegistration {
  readonly accessPolicy: 'organization-member';
  readonly adapter: WorkspaceShellAdapterSeam;
  readonly allowedShellModes: readonly ['dedicated'];
  readonly availability: 'legacy-shell';
  readonly canonicalUrl: null;
  readonly deployments: readonly WorkspaceShellDeployment[];
  readonly key: 'terminal-dock';
  readonly kind: 'chrome';
  readonly launchTarget: 'dedicated-route';
  readonly restoration: WorkspaceShellRestorationPolicy;
  readonly safeFallback: 'same-canonical-url';
  readonly scope: 'organization';
  readonly telemetryClass: 'legacy_chrome';
}

export type WorkspaceShellAuxiliaryRegistration =
  | WorkspaceShellChromeRegistration
  | WorkspaceShellOverlayRegistration;

export interface WorkspaceSurfaceLaunch {
  readonly adapter: WorkspaceShellAdapterSeam | null;
  readonly announcement: string;
  readonly history: 'none' | 'push';
  readonly href: string;
  readonly mode: WorkspaceShellRouteMode;
  readonly registryKey: string | null;
}

export interface ResolveWorkspaceSurfaceLaunchParams {
  readonly currentHref: string;
  readonly destinationHref: string;
  readonly threadId?: string | null;
}

export interface WorkspaceShellTypedReference {
  readonly id: string;
  readonly kind: WorkspaceShellReferenceKind;
}

export type WorkspaceShellRestorationFailure =
  | 'invalid_overlay'
  | 'invalid_overlay_reference'
  | 'invalid_thread';

export interface WorkspaceShellLocation {
  readonly baseState: WorkspaceShellBaseState;
  readonly canonicalSearchParams: URLSearchParams;
  readonly isCanonical: boolean;
  readonly overlayKey: string | null;
  readonly overlayReference: WorkspaceShellTypedReference | null;
  readonly restorationFailure: WorkspaceShellRestorationFailure | null;
  readonly routeKey: string;
  readonly safeFallbackHref: string;
  readonly state: WorkspaceShellState;
  readonly surfaceKey: string;
  readonly threadId: string | null;
}

export interface RestoreWorkspaceShellLocationParams {
  readonly normalizedPathname: string;
  readonly pathname: string;
  readonly searchParams: URLSearchParams;
}
