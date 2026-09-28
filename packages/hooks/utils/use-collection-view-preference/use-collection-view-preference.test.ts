import { ViewType } from '@genfeedai/contracts';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  getCollectionViewStorageKey,
  useCollectionViewPreference,
} from './use-collection-view-preference';

function installInMemoryLocalStorage(): void {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    value: {
      clear: () => store.clear(),
      getItem: (key: string) => store.get(key) ?? null,
      removeItem: (key: string) => {
        store.delete(key);
      },
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    },
    configurable: true,
    writable: true,
  });
}

describe('useCollectionViewPreference', () => {
  beforeEach(() => {
    installInMemoryLocalStorage();
  });

  it('uses the surface default when nothing is stored', () => {
    const { result } = renderHook(() =>
      useCollectionViewPreference({
        defaultView: ViewType.LIST,
        surface: 'automation.agents',
      }),
    );

    expect(result.current.view).toBe(ViewType.LIST);
  });

  it('persists the chosen view for the surface', () => {
    const { result } = renderHook(() =>
      useCollectionViewPreference({
        defaultView: ViewType.LIST,
        surface: 'automation.agents',
      }),
    );

    act(() => result.current.setView(ViewType.GRID));

    expect(result.current.view).toBe(ViewType.GRID);
    expect(
      window.localStorage.getItem(
        getCollectionViewStorageKey('automation.agents'),
      ),
    ).toBe(ViewType.GRID);
  });

  it('restores a stored view on mount', () => {
    window.localStorage.setItem(
      getCollectionViewStorageKey('automation.workflows'),
      ViewType.GRID,
    );

    const { result } = renderHook(() =>
      useCollectionViewPreference({
        defaultView: ViewType.LIST,
        surface: 'automation.workflows',
      }),
    );

    expect(result.current.view).toBe(ViewType.GRID);
  });

  it('scopes the preference per surface', () => {
    window.localStorage.setItem(
      getCollectionViewStorageKey('automation.workflows'),
      ViewType.GRID,
    );

    const { result } = renderHook(() =>
      useCollectionViewPreference({
        defaultView: ViewType.LIST,
        surface: 'automation.agents',
      }),
    );

    expect(result.current.view).toBe(ViewType.LIST);
  });

  it('ignores a stored value that is not a collection view', () => {
    window.localStorage.setItem(
      getCollectionViewStorageKey('automation.agents'),
      ViewType.KANBAN,
    );

    const { result } = renderHook(() =>
      useCollectionViewPreference({
        defaultView: ViewType.LIST,
        surface: 'automation.agents',
      }),
    );

    expect(result.current.view).toBe(ViewType.LIST);
  });

  it('keeps working when the browser blocks storage', () => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('blocked', 'SecurityError');
      },
      configurable: true,
    });

    const { result } = renderHook(() =>
      useCollectionViewPreference({
        defaultView: ViewType.LIST,
        surface: 'automation.agents',
      }),
    );

    expect(result.current.view).toBe(ViewType.LIST);
    act(() => result.current.setView(ViewType.GRID));
    expect(result.current.view).toBe(ViewType.GRID);
  });
});
