import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  identity: {
    isSignedIn: true,
    orgId: 'org-a',
    userId: 'user-a',
    sessionId: 'session-a',
  },
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
  useAuthedService: (factory: (token: string) => unknown) => async () =>
    factory('test-token'),
}));
vi.mock('@services/content/visual-projects.service', () => ({
  VisualProjectsService: { getInstance: () => mocks },
}));
vi.mock('@services/content/ingredients.service', () => ({
  IngredientsService: { getInstance: () => ({ findAll: async () => [] }) },
}));

import { useVisualProjects } from './use-visual-projects';

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
