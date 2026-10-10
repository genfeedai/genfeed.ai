import { HYDRATION_TIME_ZONE } from '@helpers/formatting/timezone/timezone.helper';
import { useViewerTimeZone } from '@hooks/ui/use-viewer-time-zone/use-viewer-time-zone';
import { act, renderHook } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

function mockBrowserTimeZone(timeZone: string | undefined) {
  const resolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;

  return vi
    .spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
    .mockImplementation(function (this: Intl.DateTimeFormat) {
      return Object.assign(resolvedOptions.call(this), { timeZone });
    });
}

function TimeZoneProbe() {
  return <span>{useViewerTimeZone()}</span>;
}

describe('useViewerTimeZone', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('reads the browser time zone on the client', () => {
    mockBrowserTimeZone('Asia/Tokyo');

    const { result } = renderHook(() => useViewerTimeZone());

    expect(result.current).toBe('Asia/Tokyo');
  });

  it('server-renders the fixed hydration zone whatever the host zone is', () => {
    mockBrowserTimeZone('Asia/Tokyo');

    expect(renderToString(<TimeZoneProbe />)).toBe(
      `<span>${HYDRATION_TIME_ZONE}</span>`,
    );
  });

  it('hydrates from the server zone, then switches to the browser zone', async () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(<TimeZoneProbe />);
    document.body.append(container);
    mockBrowserTimeZone('Europe/Paris');

    const onRecoverableError = vi.fn();
    let root!: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, <TimeZoneProbe />, { onRecoverableError });
    });

    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(container.textContent).toBe('Europe/Paris');

    await act(async () => root.unmount());
  });

  it('falls back to the hydration zone when the browser zone is unusable', () => {
    mockBrowserTimeZone('Not/AZone');

    const { result } = renderHook(() => useViewerTimeZone());

    expect(result.current).toBe(HYDRATION_TIME_ZONE);
  });

  it('re-reads the zone when the tab becomes visible again', () => {
    const timeZoneSpy = mockBrowserTimeZone('Europe/London');
    const { result } = renderHook(() => useViewerTimeZone());
    expect(result.current).toBe('Europe/London');

    timeZoneSpy.mockRestore();
    mockBrowserTimeZone('America/Chicago');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(result.current).toBe('America/Chicago');
  });
});
