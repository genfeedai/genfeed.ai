import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onForeground } from './on-foreground';

describe('onForeground', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-19T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs once when focus and visibilitychange fire together', () => {
    const callback = vi.fn();
    const dispose = onForeground(callback);

    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));

    expect(callback).toHaveBeenCalledTimes(1);
    dispose();
  });

  it('runs again once the coalesce window has passed', () => {
    const callback = vi.fn();
    const dispose = onForeground(callback, 1_000);

    window.dispatchEvent(new Event('focus'));
    vi.advanceTimersByTime(1_001);
    window.dispatchEvent(new Event('focus'));

    expect(callback).toHaveBeenCalledTimes(2);
    dispose();
  });

  it('does not run while the document is hidden', () => {
    const callback = vi.fn();
    const dispose = onForeground(callback);
    const visibility = vi
      .spyOn(document, 'visibilityState', 'get')
      .mockReturnValue('hidden');

    document.dispatchEvent(new Event('visibilitychange'));

    expect(callback).not.toHaveBeenCalled();
    visibility.mockRestore();
    dispose();
  });

  it('stops listening after dispose', () => {
    const callback = vi.fn();
    onForeground(callback)();

    window.dispatchEvent(new Event('focus'));

    expect(callback).not.toHaveBeenCalled();
  });
});
