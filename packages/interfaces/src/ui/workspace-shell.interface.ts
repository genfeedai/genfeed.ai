/**
 * Route classification owned by the registry.
 *
 * `conversation` no longer selects a renderer. It marks the agent routes, whose
 * thread lives in the path (`/agent/:id`) and where `?thread=` is therefore
 * never canonical. Every non-dedicated route frames the same canvas.
 */
export type WorkspaceShellRouteMode = 'canvas' | 'conversation' | 'dedicated';

export type WorkspaceShellSurfaceMode = WorkspaceShellRouteMode | 'overlay';

/**
 * The shell's runtime state. The conversation is not a state: it is a surface,
 * rendered by its own route under `/agent` and by the context inspector on
 * every other surface. The shell frames a canvas and may raise an overlay.
 */
export type WorkspaceShellState = 'canvas' | 'overlay';

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

export type WorkspaceShellProductClass =
  | 'contextual-action'
  | 'control-plane'
  | 'removable'
  | 'visual-data';

export type WorkspaceShellAvailability = 'always' | 'conversation-shell';

export type WorkspaceShellLaunchTarget =
  | 'dedicated-route'
  | 'focused-canvas'
  | 'inline'
  | 'inspector'
  | 'overlay';

export type WorkspaceShellReferenceKind = 'asset' | 'post';

export interface WorkspaceShellTypedReference {
  readonly id: string;
  readonly kind: WorkspaceShellReferenceKind;
}

export type WorkspaceShellOverlayKey =
  | 'library-picker'
  | 'notifications'
  | 'shell-preview'
  | 'workflow-picker';

/**
 * Canonical product-surface identifiers owned by the workspace-shell registry.
 * Route renames and dead keys fail at compile time when registrations or
 * adapters drift from this inventory.
 */
export type WorkspaceShellSurfaceKey =
  | 'agent-conversation'
  | 'agent-onboarding'
  | 'analytics'
  | 'artifact-editor'
  | 'automation'
  | 'automation-management'
  | 'automation-workflows-editor'
  | 'brand-settings'
  | 'connect-genfeed'
  | 'connect-genfeed-resolver'
  | 'discovery'
  | 'lab'
  | 'library'
  | 'messages'
  | 'organization-landing'
  | 'organization-overview'
  | 'organization-settings'
  | 'personal-settings'
  | 'platform-admin'
  | 'platforms'
  | 'protected-bootstrap'
  | 'publishing'
  | 'studio-edit'
  | 'studio-specialized'
  | 'workspace'
  | 'workspace-overview';

export interface WorkspaceShellOverlayParameterMap {
  readonly 'library-picker': Readonly<Record<string, never>>;
  readonly notifications: Readonly<Record<string, never>>;
  readonly 'shell-preview': {
    readonly reference: WorkspaceShellTypedReference | null;
  };
  readonly 'workflow-picker': Readonly<Record<string, never>>;
}

export type WorkspaceShellOverlayRequest = {
  readonly [Key in WorkspaceShellOverlayKey]: {
    readonly key: Key;
    readonly parameters: WorkspaceShellOverlayParameterMap[Key];
  };
}[WorkspaceShellOverlayKey];

export type WorkspaceShellOverlayReferenceAccess =
  | 'authorized'
  | 'stale'
  | 'unauthorized';

export interface WorkspaceShellOverlayReferenceAccessRequest {
  readonly overlayKey: WorkspaceShellOverlayKey;
  readonly reference: WorkspaceShellTypedReference;
}

export type WorkspaceShellOverlayReferenceAccessResolver = (
  request: WorkspaceShellOverlayReferenceAccessRequest,
) => WorkspaceShellOverlayReferenceAccess;

export type WorkspaceShellOverlayParameterContract =
  | {
      readonly kind: 'none';
    }
  | {
      readonly allowedReferenceKinds: readonly WorkspaceShellReferenceKind[];
      readonly kind: 'optional-reference';
      readonly referenceAccess: 'server-authorized';
    };

export interface WorkspaceShellOverlayPresentation {
  readonly description: string;
  readonly openAnnouncement: string;
  readonly title: string;
}

export interface WorkspaceShellRestorationPolicy {
  readonly history: 'canonical-url';
  readonly invalidShellParams: 'replace';
  readonly searchParams: 'preserve-opaque';
}

export interface WorkspaceShellAdapterSeam {
  readonly key: string;
  readonly status: 'dedicated-route' | 'embedded' | 'placeholder' | 'ready';
}

export interface WorkspaceShellBreadcrumbMetadata {
  readonly leafLabel: string;
  readonly parentLabel?: string;
  /** App-relative href for the parent segment (e.g. `/publishing/scheduled`). */
  readonly parentHref?: string;
  readonly rootLabel: string;
  /** App-relative href for the root segment (e.g. `/publishing/overview`). */
  readonly rootHref?: string;
}

export interface WorkspaceShellRouteRegistration {
  readonly accessPolicy: WorkspaceShellAccessPolicy;
  readonly adapter: WorkspaceShellAdapterSeam;
  readonly allowedShellModes: readonly [WorkspaceShellRouteMode];
  readonly availability: WorkspaceShellAvailability;
  readonly breadcrumb: WorkspaceShellBreadcrumbMetadata;
  readonly canonicalUrl: string;
  readonly deployments: readonly WorkspaceShellDeployment[];
  readonly key: string;
  readonly kind: 'route';
  readonly launchTarget: Extract<
    WorkspaceShellLaunchTarget,
    'dedicated-route' | 'focused-canvas' | 'inline'
  >;
  readonly mode: WorkspaceShellRouteMode;
  readonly productClass: WorkspaceShellProductClass;
  readonly restoration: WorkspaceShellRestorationPolicy;
  readonly safeFallback: string;
  readonly scope: WorkspaceShellScopeRequirement;
  readonly surfaceKey: WorkspaceShellSurfaceKey;
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
  readonly allowedShellModes: readonly ['overlay'];
  readonly availability: 'conversation-shell';
  readonly canonicalUrl: null;
  readonly deployments: readonly WorkspaceShellDeployment[];
  readonly key: WorkspaceShellOverlayKey;
  readonly kind: 'overlay';
  readonly launchTarget: 'overlay';
  readonly parameterContract: WorkspaceShellOverlayParameterContract;
  readonly presentation: WorkspaceShellOverlayPresentation;
  readonly restoration: WorkspaceShellRestorationPolicy;
  readonly safeFallback: 'same-canonical-url';
  readonly scope: 'organization';
  readonly telemetryClass:
    | 'library_picker'
    | 'notifications'
    | 'shell_preview'
    | 'workflow_picker';
}

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

export type WorkspaceShellRestorationFailure =
  | 'invalid_overlay'
  | 'invalid_overlay_reference'
  | 'stale_overlay_reference'
  | 'unauthorized_overlay_reference'
  | 'invalid_thread';

export interface WorkspaceShellLocation {
  readonly canonicalSearchParams: URLSearchParams;
  readonly isCanonical: boolean;
  readonly overlay: WorkspaceShellOverlayRequest | null;
  readonly restorationFailure: WorkspaceShellRestorationFailure | null;
  readonly routeKey: string;
  readonly safeFallbackHref: string;
  readonly state: WorkspaceShellState;
  readonly surfaceKey: WorkspaceShellSurfaceKey;
  readonly threadId: string | null;
}

export interface RestoreWorkspaceShellLocationParams {
  /**
   * The raw protected pathname. Route identity — including thread identity —
   * is resolved from the registry, so no pre-normalized variant is needed.
   */
  readonly pathname: string;
  readonly resolveOverlayReferenceAccess?: WorkspaceShellOverlayReferenceAccessResolver;
  readonly searchParams: URLSearchParams;
}

export interface WorkspaceShellOverlayResolution {
  readonly failure: Extract<
    WorkspaceShellRestorationFailure,
    | 'invalid_overlay_reference'
    | 'stale_overlay_reference'
    | 'unauthorized_overlay_reference'
  > | null;
  readonly overlay: WorkspaceShellOverlayRequest | null;
}

export type WorkspaceShellOverlayInvocation = 'model' | 'user';

export interface ResolveWorkspaceOverlayLaunchParams {
  readonly currentHref: string;
  readonly invocation: WorkspaceShellOverlayInvocation;
  readonly overlay: WorkspaceShellOverlayRequest;
  readonly resolveOverlayReferenceAccess?: WorkspaceShellOverlayReferenceAccessResolver;
}

export interface WorkspaceOverlayLaunch {
  readonly announcement: string;
  readonly history: 'none' | 'push' | 'replace';
  readonly href: string;
  readonly overlay: WorkspaceShellOverlayRequest | null;
}
