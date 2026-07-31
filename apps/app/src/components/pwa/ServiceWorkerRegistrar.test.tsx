import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ServiceWorkerRegistrar from './ServiceWorkerRegistrar';

const mocks = vi.hoisted(() => ({
  serwistProvider: vi.fn(() => null),
}));

vi.mock('@serwist/turbopack/react', () => ({
  SerwistProvider: mocks.serwistProvider,
}));

function getProviderProps(): Record<string, unknown> {
  const firstCall = mocks.serwistProvider.mock.calls[0];
  expect(firstCall).toBeDefined();
  return (firstCall as unknown as [Record<string, unknown>])[0];
}

describe('ServiceWorkerRegistrar', () => {
  it('renders nothing', () => {
    const { container } = render(<ServiceWorkerRegistrar />);

    expect(container).toBeEmptyDOMElement();
  });

  it('points at the route-served worker', () => {
    render(<ServiceWorkerRegistrar />);

    expect(getProviderProps().swUrl).toBe('/serwist/sw.js');
  });

  // Cache Storage is origin-scoped, not session-scoped: anything cached by
  // navigation survives sign-out and is readable by the next account on the
  // same browser. reloadOnOnline would discard in-progress studio edits.
  it('leaves navigation caching and reload-on-online off', () => {
    render(<ServiceWorkerRegistrar />);

    const props = getProviderProps();
    expect(props.cacheOnNavigation).toBe(false);
    expect(props.reloadOnOnline).toBe(false);
  });

  // NODE_ENV is baked in at module load, so this asserts the non-production
  // branch the test run itself is in: no worker registered outside production.
  it('disables registration outside production', () => {
    render(<ServiceWorkerRegistrar />);

    expect(getProviderProps().disable).toBe(true);
  });
});
