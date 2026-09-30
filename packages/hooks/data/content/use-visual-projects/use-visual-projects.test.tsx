import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  identity: {
    isSignedIn: true,
    orgId: 'org-a',
    userId: 'user-a',
    sessionId: 'session-a',
  },
  tokenGate: null as Promise<void> | null,
  catalog: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  quote: vi.fn(),
  create: vi.fn(),
}));
vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => mocks.identity,
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => async () => {
    await mocks.tokenGate;
    return factory('test-token');
  },
}));
vi.mock('@services/content/visual-projects.service', () => ({
  VisualProjectsService: { getInstance: () => mocks },
}));
vi.mock('@services/content/ingredients.service', () => ({
  IngredientsService: { getInstance: () => ({ findAll: async () => [] }) },
}));

import { useVisualProjects } from './use-visual-projects';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tokenGate = null;
  mocks.identity = {
    isSignedIn: true,
    orgId: 'org-a',
    userId: 'user-a',
    sessionId: 'session-a',
  };
  mocks.catalog.mockResolvedValue({ defaultModelKey: 'model' });
  mocks.list.mockResolvedValue({ projects: [], nextCursor: null });
});
const request = {
  operation: 'create' as const,
  input: {
    brandId: 'brand-a',
    requestId: 'original-request',
    label: 'Visual',
    sourceCode: 'retained source',
    settings: { width: 640, height: 360, fps: 30 as const, durationFrames: 30 },
  },
};
describe('visual project query identity scope', () => {
  it('does not expose a previous actor or brand response after scope changes while requests are pending', async () => {
    let oldCatalog: (value: unknown) => void = () => {};
    let oldList: (value: unknown) => void = () => {};
    mocks.catalog
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            oldCatalog = resolve;
          }),
      )
      .mockResolvedValue({ defaultModelKey: 'new-model' });
    mocks.list
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            oldList = resolve;
          }),
      )
      .mockResolvedValue({
        projects: [{ id: 'new-project' }],
        nextCursor: null,
      });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const view = renderHook(({ brandId }) => useVisualProjects({ brandId }), {
      wrapper,
      initialProps: { brandId: 'brand-a' },
    });
    await waitFor(() => expect(mocks.list).toHaveBeenCalledOnce());
    mocks.identity = {
      isSignedIn: true,
      orgId: 'org-b',
      userId: 'user-b',
      sessionId: 'session-b',
    };
    view.rerender({ brandId: 'brand-b' });
    await waitFor(() =>
      expect(view.result.current.catalog.data?.defaultModelKey).toBe(
        'new-model',
      ),
    );
    await act(async () => {
      oldCatalog({ defaultModelKey: 'private-old-model' });
      oldList({ projects: [{ id: 'private-old-project' }], nextCursor: null });
    });
    expect(view.result.current.catalog.data?.defaultModelKey).toBe('new-model');
    expect(view.result.current.projects.data?.pages[0].projects[0].id).toBe(
      'new-project',
    );
    expect(mocks.catalog.mock.calls[0][1].aborted).toBe(true);
    expect(mocks.list.mock.calls[0][2].aborted).toBe(true);
    view.unmount();
    client.clear();
  });
});

it('rejects old callbacks both before and after deferred token resolution when authentication changes', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const view = renderHook(() => useVisualProjects({ brandId: 'brand-a' }), {
    wrapper,
  });
  await waitFor(() => expect(mocks.list).toHaveBeenCalledOnce());
  let release: () => void = () => {};
  mocks.tokenGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const oldSubmit = view.result.current.submit;
  const pending = oldSubmit(request, 10);
  const rejection = expect(pending).rejects.toThrow('visual_scope_changed');
  mocks.identity = {
    isSignedIn: true,
    orgId: 'org-b',
    userId: 'user-b',
    sessionId: 'session-b',
  };
  view.rerender();
  await act(async () => release());
  await rejection;
  await expect(oldSubmit(request, 10)).rejects.toThrow('visual_scope_changed');
  expect(mocks.create).not.toHaveBeenCalled();
  view.unmount();
  client.clear();
});
it('refreshes only the original scoped project list after a failed durable submission', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidation = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const view = renderHook(() => useVisualProjects({ brandId: 'brand-a' }), {
    wrapper,
  });
  mocks.create.mockRejectedValueOnce(
    new Error('visual_dispatch_recovery_required'),
  );
  await expect(view.result.current.submit(request, 10)).rejects.toThrow(
    'visual_dispatch_recovery_required',
  );
  expect(invalidation).toHaveBeenCalledWith({
    queryKey: [
      'visual-code',
      'org-a',
      'user-a',
      'session-a',
      'brand-a',
      'projects',
    ],
  });
  expect(mocks.create).toHaveBeenCalledWith({
    ...request.input,
    maximumCredits: 10,
  });
  expect(request.input.requestId).toBe('original-request');
  expect(request.input.sourceCode).toBe('retained source');
  view.unmount();
  client.clear();
});

it('prevents deferred-token dispatch after the keyed Motion workspace unmounts', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const view = renderHook(() => useVisualProjects({ brandId: 'brand-a' }), {
    wrapper,
  });
  await waitFor(() => expect(mocks.list).toHaveBeenCalledOnce());
  let release: () => void = () => {};
  mocks.tokenGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pending = view.result.current.submit(request, 10);
  const rejection = expect(pending).rejects.toThrow('visual_scope_changed');
  view.unmount();
  release();
  await rejection;
  expect(mocks.create).not.toHaveBeenCalled();
  client.clear();
});
