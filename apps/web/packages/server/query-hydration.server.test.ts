import type { DehydratedState } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// React's client build does not memoize cache(); emulate the request-scoped
// memoization RSC provides so every helper sees one query client per module
// instance (vi.resetModules gives each test a fresh "request").
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    cache: <TArgs extends unknown[], TResult>(
      fn: (...args: TArgs) => TResult,
    ) => {
      let hasValue = false;
      let value: TResult;
      return (...args: TArgs): TResult => {
        if (!hasValue) {
          value = fn(...args);
          hasValue = true;
        }
        return value;
      };
    },
  };
});

type HydrationModule = typeof import('./query-hydration.server');

async function importFreshModule(): Promise<HydrationModule> {
  vi.resetModules();
  return import('./query-hydration.server');
}

function dehydratedState(module: HydrationModule): DehydratedState {
  const element = module.ServerQueryHydrationBoundary({
    children: null,
  }) as ReactElement<{ state: DehydratedState }>;
  return element.props.state;
}

describe('query-hydration.server', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('dehydrates a pending prefetch with a live promise that resolves with the data', async () => {
    const module = await importFreshModule();
    let resolveFetch: (value: { rows: number[] }) => void = () => {};
    const queryFn = vi.fn(
      () =>
        new Promise<{ rows: number[] }>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    module.prefetchServerQuery({ queryFn, queryKey: ['releases', 'page-1'] });
    const state = dehydratedState(module);
    const entry = state.queries.find(
      (query) => query.queryKey[0] === 'releases',
    );

    expect(entry?.state.status).toBe('pending');
    expect(typeof entry?.promise?.then).toBe('function');

    resolveFetch({ rows: [1, 2, 3] });
    await expect(entry?.promise).resolves.toEqual({ rows: [1, 2, 3] });
  });

  it('dehydrates a failing prefetch as a rejecting promise without retrying or throwing', async () => {
    const module = await importFreshModule();
    const queryFn = vi.fn(() => Promise.reject(new Error('upstream down')));

    module.prefetchServerQuery({ queryFn, queryKey: ['releases', 'failing'] });
    const state = dehydratedState(module);
    const entry = state.queries.find(
      (query) => query.queryKey[1] === 'failing',
    );

    expect(entry?.state.status).toBe('pending');
    const settled = await entry?.promise?.then(
      () => 'resolved',
      () => 'rejected',
    );
    expect(settled).toBe('rejected');
    // retry: false — one attempt only, so a failed fetch never holds the
    // stream open while it retries.
    expect(queryFn).toHaveBeenCalledTimes(1);

    // Once the failure settles, the entry stops dehydrating: the client
    // discarded the rejected promise and refetches on its own.
    expect(
      dehydratedState(module).queries.find(
        (query) => query.queryKey[1] === 'failing',
      ),
    ).toBeUndefined();
  });

  it('shares one request-scoped client between setServerQueryData and the boundary', async () => {
    const module = await importFreshModule();

    module.setServerQueryData(['bootstrap'], { brandId: 'brand-1' });
    const entry = dehydratedState(module).queries.find(
      (query) => query.queryKey[0] === 'bootstrap',
    );

    expect(entry?.state.status).toBe('success');
    expect(entry?.state.data).toEqual({ brandId: 'brand-1' });
  });
});
