import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsNavigation } from './use-settings-navigation';

const navigation = vi.hoisted(() => ({
  pathname: '/workspace',
  router: { push: vi.fn() },
}));
vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => navigation.router,
}));

function mountAnchor(id: string) {
  const element = document.createElement('section');
  element.id = id;
  element.scrollIntoView = vi.fn();
  document.body.appendChild(element);
  return element;
}

function moveTo(pathname: string) {
  navigation.pathname = pathname;
  window.history.replaceState({}, '', pathname);
}

describe('useSettingsNavigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    moveTo('/workspace');
  });
  afterEach(() => {
    cleanup();
    document.body.replaceChildren();
    vi.useRealTimers();
  });

  it.each(['appearance', 'language', 'features'])(
    'reveals delayed %s only on the committed destination',
    async (anchor) => {
      const source = mountAnchor(anchor);
      const { result, rerender } = renderHook(() => useSettingsNavigation());
      act(() => result.current(`/settings/personal#${anchor}`));
      expect(source.scrollIntoView).not.toHaveBeenCalled();
      source.remove();
      navigation.pathname = '/settings/personal';
      rerender();
      const premature = mountAnchor(anchor);
      await act(async () => {});
      expect(premature.scrollIntoView).not.toHaveBeenCalled();
      premature.remove();
      moveTo('/settings/personal');
      const target = mountAnchor(anchor);
      await act(async () => {});
      expect(target.scrollIntoView).toHaveBeenCalledExactlyOnceWith({
        behavior: 'smooth',
        block: 'start',
      });
      mountAnchor('other');
      await act(async () => {});
      expect(target.scrollIntoView).toHaveBeenCalledTimes(1);
    },
  );

  it('waits when the browser reaches the destination before the React pathname', async () => {
    const { result, rerender } = renderHook(() => useSettingsNavigation());
    act(() => result.current('/settings/personal#appearance'));
    window.history.replaceState({}, '', '/settings/personal#appearance');
    const target = mountAnchor('appearance');
    await act(async () => {});
    expect(target.scrollIntoView).not.toHaveBeenCalled();
    navigation.pathname = '/settings/personal';
    rerender();
    expect(target.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('reveals an id added after mount and releases the observer and deadline on success', async () => {
    vi.useFakeTimers();
    moveTo('/settings/personal');
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');
    const target = mountAnchor('pending-section');
    const { result } = renderHook(() => useSettingsNavigation());
    act(() => result.current('/settings/personal#features'));
    target.id = 'features';
    await act(async () => {});
    expect(target.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    disconnect.mockRestore();
  });

  it('restarts repeated selections on the same route', () => {
    moveTo('/settings/personal');
    const target = mountAnchor('appearance');
    const { result } = renderHook(() => useSettingsNavigation());
    act(() => result.current('/settings/personal#appearance'));
    act(() => result.current('/settings/personal#appearance'));
    expect(target.scrollIntoView).toHaveBeenCalledTimes(2);
    expect(navigation.router.push).toHaveBeenCalledWith(
      '/settings/personal#appearance',
      { scroll: false },
    );
  });

  it('replaces abandoned anchors and preserves ordinary router scrolling', async () => {
    moveTo('/settings/personal');
    const { result } = renderHook(() => useSettingsNavigation());
    act(() => result.current('/settings/personal#appearance'));
    act(() => result.current('/settings/personal#language'));
    const old = mountAnchor('appearance');
    const target = mountAnchor('language');
    await act(async () => {});
    expect(old.scrollIntoView).not.toHaveBeenCalled();
    expect(target.scrollIntoView).toHaveBeenCalledTimes(1);
    act(() => result.current('/settings/help'));
    expect(navigation.router.push).toHaveBeenLastCalledWith('/settings/help');
  });

  it.each([
    'popstate',
    'hashchange',
    'departure',
    'unmount',
    'timeout',
    'replacement',
  ])('cancels pending work on %s', async (reason) => {
    vi.useFakeTimers();
    moveTo('/settings/personal');
    const { result, rerender, unmount } = renderHook(() =>
      useSettingsNavigation(),
    );
    act(() => result.current('/settings/personal#appearance'));
    if (reason === 'departure') {
      moveTo('/settings/help');
      rerender();
      moveTo('/settings/personal');
      rerender();
    } else if (reason === 'unmount') unmount();
    else if (reason === 'timeout') act(() => vi.advanceTimersByTime(10_000));
    else if (reason === 'replacement')
      act(() => result.current('/settings/help'));
    else window.dispatchEvent(new Event(reason));
    const target = mountAnchor('appearance');
    await act(async () => {});
    expect(target.scrollIntoView).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
