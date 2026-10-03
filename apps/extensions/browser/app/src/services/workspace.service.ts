import { ORGANIZATION_CONTEXT_HEADER } from '@genfeedai/contracts/constants/organization-context.constant';
import type {
  ExtensionWorkspaceBootstrap,
  ExtensionWorkspaceListener,
  ExtensionWorkspaceLoadOptions,
  ExtensionWorkspaceSnapshot,
  ExtensionWorkspaceState,
  OrganizationOption,
} from '@genfeedai/contracts/interfaces';
import { Storage } from '@plasmohq/storage';
import { authService } from '~services/auth.service';
import { apiEndpoint } from '~services/environment.service';
import { ServiceInstanceManager } from '~utils/service-instance-manager.util';

const storage = new Storage({ area: 'local' });
const listeners = new Set<ExtensionWorkspaceListener>();
let state: ExtensionWorkspaceState = { status: 'loading' };
let revision = 0;
let controller = new AbortController();
let queue: Promise<unknown> = Promise.resolve();
let lastVerified: ExtensionWorkspaceSnapshot | null = null;
let validation = 0;
let pending: Promise<ExtensionWorkspaceSnapshot> | null = null;
const selectionKey = (user: string, organization: string) =>
  `extension_workspace:${user}:${organization}`;

export function getWorkspaceState(): ExtensionWorkspaceState {
  return state;
}
export function subscribeWorkspace(
  listener: ExtensionWorkspaceListener,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function publish(next: ExtensionWorkspaceState): void {
  state = next;
  for (const listener of listeners) listener(next);
}
function reset(): number {
  ServiceInstanceManager.clearAll();
  controller.abort();
  controller = new AbortController();
  revision += 1;
  publish({ status: 'loading' });
  return revision;
}
export function assertWorkspace(expected: ExtensionWorkspaceSnapshot): void {
  if (
    state.status !== 'ready' ||
    state.snapshot.revision !== expected.revision ||
    state.snapshot.userId !== expected.userId ||
    state.snapshot.organizationId !== expected.organizationId ||
    state.snapshot.brandId !== expected.brandId
  ) {
    throw new Error('Your workspace changed. Retry in the selected workspace.');
  }
}
async function unscoped(path: string, options: RequestInit): Promise<Response> {
  const response = await authService.makeAuthenticatedRequest(
    `${apiEndpoint}${path}`,
    options,
  );
  if (!response.ok)
    throw new Error(
      response.status === 403
        ? 'This credential does not have access to this workspace. Open Genfeed and check your access.'
        : `Could not load your Genfeed workspace (HTTP ${response.status}). Retry in a moment.`,
    );
  return response;
}
async function reconcile(
  options: ExtensionWorkspaceLoadOptions,
  requested?: string,
): Promise<ExtensionWorkspaceSnapshot> {
  const previous = lastVerified;
  const attempt = ++validation;
  let generation = revision;
  if (previous) publish({ status: 'refreshing', snapshot: previous });
  else reset();
  generation = revision;
  const signal = options.signal
    ? AbortSignal.any([options.signal, controller.signal])
    : controller.signal;
  try {
    if (
      options.forceRefresh &&
      !(await authService.refreshSessionToken(signal))
    )
      throw new Error(
        'Your Genfeed session expired. Sign in in the web app, then retry.',
      );
    authService.invalidateAuthContext();
    const identity = await authService.getAuthContext(true, signal);
    if (!identity)
      throw new Error('Sign in to Genfeed in the web app, then retry.');
    const bootstrap = (await (
      await unscoped('/auth/bootstrap', { method: 'GET', signal })
    ).json()) as ExtensionWorkspaceBootstrap;
    const organizations = (await (
      await unscoped('/organizations?mine=true', { method: 'GET', signal })
    ).json()) as OrganizationOption[];
    if (
      !bootstrap?.access ||
      typeof bootstrap.access.userId !== 'string' ||
      typeof bootstrap.access.organizationId !== 'string' ||
      !Array.isArray(bootstrap.brands) ||
      !Array.isArray(organizations) ||
      organizations.some(
        (organization) =>
          typeof organization.id !== 'string' ||
          typeof organization.label !== 'string',
      )
    )
      throw new Error(
        'Genfeed returned an incomplete workspace. Retry in a moment.',
      );
    const { userId, organizationId } = bootstrap.access;
    if (
      userId !== identity.user.id ||
      organizationId !== identity.organization.id ||
      (requested &&
        (organizationId !== requested ||
          !organizations.some(
            (organization) =>
              organization.id === requested && organization.isActive,
          )))
    )
      throw new Error(
        'Genfeed has not confirmed the selected workspace. Open Genfeed, then retry.',
      );
    if (
      !organizations.some((organization) => organization.id === organizationId)
    )
      throw new Error(
        'Your active workspace is no longer accessible. Open Genfeed, then retry.',
      );
    const brands = bootstrap.brands.filter(
      (brand) =>
        typeof brand.id === 'string' &&
        !brand.isDeleted &&
        (brand.organizationId ?? brand.organization?.id) === organizationId,
    );
    const stored = await storage.get<string>(
      selectionKey(userId, organizationId),
    );
    const accessible = (id: string | null | undefined) =>
      Boolean(id && brands.some((brand) => brand.id === id));
    if (stored && !accessible(stored))
      await storage.remove(selectionKey(userId, organizationId));
    const selected =
      previous?.userId === userId && previous.organizationId === organizationId
        ? previous.brandId
        : null;
    const brandId =
      options.isStoredSelectionPreferred && accessible(stored)
        ? (stored ?? null)
        : accessible(selected)
          ? selected
          : accessible(stored)
            ? (stored ?? null)
            : accessible(bootstrap.access.brandId)
              ? bootstrap.access.brandId
              : brands.length === 1
                ? brands[0].id
                : null;
    signal.throwIfAborted();
    if (attempt !== validation || generation !== revision)
      throw new Error('Your workspace changed. Retry.');
    if (
      previous &&
      (previous.userId !== userId ||
        previous.organizationId !== organizationId ||
        previous.brandId !== brandId)
    )
      generation = reset();
    const snapshot: ExtensionWorkspaceSnapshot = {
      userId,
      organizationId,
      organizationLabel:
        organizations.find((organization) => organization.id === organizationId)
          ?.label ??
        identity.organization.name ??
        organizationId,
      brandId,
      brands,
      organizations,
      revision: generation,
      isApiKey: identity.isApiKey,
    };
    if (brandId && stored !== brandId)
      await storage.set(selectionKey(userId, organizationId), brandId);
    lastVerified = snapshot;
    publish({ status: 'ready', snapshot });
    if (
      previous &&
      (previous.userId !== userId || previous.organizationId !== organizationId)
    )
      await storage.set('extension_workspace_changed', {
        timestamp: Date.now(),
      });
    return snapshot;
  } catch (error) {
    if (attempt === validation && generation === revision) {
      if (
        error instanceof Error &&
        /expired|rejected|Sign in|no longer accessible/.test(error.message)
      ) {
        reset();
        lastVerified = null;
      }
      publish({
        status: 'blocked',
        error:
          error instanceof Error &&
          !(error instanceof TypeError) &&
          error.name !== 'TimeoutError'
            ? error.message
            : 'Could not connect to Genfeed. Retry.',
      });
    }
    throw error;
  }
}
export function loadWorkspace(
  options: ExtensionWorkspaceLoadOptions = {},
): Promise<ExtensionWorkspaceSnapshot> {
  if (pending && !options.forceRefresh) return pending;
  const operation = queue.then(() => reconcile(options));
  queue = operation.catch(() => undefined);
  pending = operation;
  void operation
    .finally(() => {
      if (pending === operation) pending = null;
    })
    .catch(() => undefined);
  return operation;
}
export function activateWorkspace(
  organizationId: string,
  signal?: AbortSignal,
): Promise<ExtensionWorkspaceSnapshot> {
  const operation = queue.then(async () => {
    const current = state.status === 'ready' ? state.snapshot : null;
    if (!current || current.isApiKey)
      throw new Error('API keys are pinned to their verified workspace.');
    if (
      !current.organizations.some(
        (organization) => organization.id === organizationId,
      )
    )
      throw new Error('This workspace is not accessible.');
    const generation = reset();
    lastVerified = null;
    try {
      await unscoped(
        `/organizations/${encodeURIComponent(organizationId)}/activate`,
        { method: 'PATCH', signal },
      );
      return await reconcile({ forceRefresh: true, signal }, organizationId);
    } catch (error) {
      if (generation === revision)
        publish({
          status: 'blocked',
          error:
            error instanceof Error
              ? error.message
              : 'Could not switch workspace. Retry.',
        });
      throw error;
    }
  });
  queue = operation.catch(() => undefined);
  return operation;
}
export async function selectWorkspaceBrand(
  brandId: string | null,
): Promise<ExtensionWorkspaceSnapshot> {
  if (state.status !== 'ready')
    throw new Error('Wait for your workspace to load.');
  const previous = state.snapshot;
  if (brandId && !previous.brands.some((brand) => brand.id === brandId))
    throw new Error('This brand is not accessible in the selected workspace.');
  if (brandId === previous.brandId) return previous;
  const generation = reset();
  const snapshot = { ...previous, brandId, revision: generation };
  if (brandId)
    await storage.set(
      selectionKey(previous.userId, previous.organizationId),
      brandId,
    );
  else
    await storage.remove(
      selectionKey(previous.userId, previous.organizationId),
    );
  if (generation !== revision)
    throw new Error('Your workspace changed. Retry.');
  lastVerified = snapshot;
  publish({ status: 'ready', snapshot });
  await storage.set('extension_workspace_changed', {
    revision: generation,
    timestamp: Date.now(),
  });
  return snapshot;
}
export async function scopedWorkspaceRequest(
  path: string,
  options: RequestInit,
  expected: ExtensionWorkspaceSnapshot,
): Promise<Response> {
  assertWorkspace(expected);
  const headers = new Headers(options.headers);
  headers.set(ORGANIZATION_CONTEXT_HEADER, expected.organizationId);
  const signal = options.signal
    ? AbortSignal.any([options.signal, controller.signal])
    : controller.signal;
  const url = path.startsWith('http') ? path : `${apiEndpoint}${path}`;
  const target = new URL(url);
  const base = new URL(apiEndpoint);
  if (
    target.origin !== base.origin ||
    !(
      target.pathname === base.pathname ||
      target.pathname.startsWith(`${base.pathname.replace(/\/$/, '')}/`)
    )
  )
    throw new Error('Authenticated requests must target the Genfeed API.');
  const response = await authService.makeAuthenticatedRequest(
    url,
    {
      ...options,
      headers,
      signal,
      redirect: 'error',
    },
    (context) => {
      assertWorkspace(expected);
      if (
        context.user.id !== expected.userId ||
        context.organization.id !== expected.organizationId
      )
        throw new Error(
          'Your account or workspace changed. Retry after workspace synchronization.',
        );
    },
  );
  assertWorkspace(expected);
  return response;
}
export async function requireWorkspace(): Promise<ExtensionWorkspaceSnapshot> {
  if (state.status === 'ready') return state.snapshot;
  if (state.status === 'blocked') throw new Error(state.error);
  if (state.status === 'refreshing')
    throw new Error(
      'Your workspace is being verified. Retry when it finishes.',
    );
  return loadWorkspace({});
}
