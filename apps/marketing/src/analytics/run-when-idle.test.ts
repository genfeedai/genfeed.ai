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
    const ran: string[] = [];
    const task = (): void => {
      ran.push('task');
    };
    const requestIdle = vi.fn((callback: () => void) => {
      callback();
      return 1;
    });
    vi.stubGlobal('requestIdleCallback', requestIdle);
    setReadyState('loading');

    runWhenIdle(task);
    expect(ran).toEqual([]);
    expect(requestIdle).not.toHaveBeenCalled();

    window.dispatchEvent(new Event('load'));
    expect(ran).toEqual(['task']);
    expect(requestIdle).toHaveBeenCalledWith(expect.any(Function), {
      timeout: 3000,
    });
  });

  it('schedules straight away once the page has loaded', () => {
    const ran: string[] = [];
    const task = (): void => {
      ran.push('task');
    };
    const requestIdle = vi.fn((callback: () => void) => {
      callback();
      return 1;
    });
    vi.stubGlobal('requestIdleCallback', requestIdle);
    setReadyState('complete');

    runWhenIdle(task);

    expect(ran).toEqual(['task']);
    expect(requestIdle).toHaveBeenCalledWith(expect.any(Function), {
      timeout: 3000,
    });
  });

  it('falls back to a timer where requestIdleCallback is missing', () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestIdleCallback', undefined);
    setReadyState('complete');
    const ran: string[] = [];
    const task = (): void => {
      ran.push('task');
    };

    runWhenIdle(task);
    vi.advanceTimersByTime(1499);
    expect(ran).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(ran).toEqual(['task']);
  });
});
