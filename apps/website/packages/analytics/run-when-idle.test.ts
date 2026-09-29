import { afterEach, describe, expect, it, vi } from 'vitest';

import { runWhenIdle } from './run-when-idle';

function setReadyState(state: DocumentReadyState) {
  Object.defineProperty(document, 'readyState', {
    configurable: true,
    value: state,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  setReadyState('complete');
});

describe('runWhenIdle', () => {
  it('waits for the load event before asking for an idle slot', () => {
    const requestIdle = vi.fn();
    vi.stubGlobal('requestIdleCallback', requestIdle);
    setReadyState('loading');
    const task = vi.fn();

    runWhenIdle(task);
    expect(requestIdle).not.toHaveBeenCalled();

    window.dispatchEvent(new Event('load'));
    expect(requestIdle).toHaveBeenCalledWith(task, { timeout: 3000 });
  });

  it('falls back to a timer where requestIdleCallback is missing', () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestIdleCallback', undefined);
    setReadyState('complete');
    const task = vi.fn();

    runWhenIdle(task);
    vi.advanceTimersByTime(1499);
    expect(task).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(task).toHaveBeenCalledTimes(1);
  });
});
