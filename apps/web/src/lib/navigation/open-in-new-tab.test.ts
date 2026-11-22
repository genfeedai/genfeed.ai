import { afterEach, describe, expect, it, vi } from 'vitest';
import { openInNewTab } from './open-in-new-tab';

interface FakeTab {
  close: ReturnType<typeof vi.fn>;
  location: { href: string };
  opener: unknown;
}

function fakeTab(): FakeTab {
  return { close: vi.fn(), location: { href: '' }, opener: window };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
}

describe('openInNewTab', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens the tab before the request resolves, then navigates it', async () => {
    const tab = fakeTab();
    const openSpy = vi
      .spyOn(window, 'open')
      .mockReturnValue(tab as unknown as Window);
    const request = deferred<string>();

    const opening = openInNewTab(() => request.promise);

    expect(openSpy).toHaveBeenCalledWith('', '_blank');
    expect(tab.location.href).toBe('');

    request.resolve('https://example.com/portal');
    await opening;

    expect(tab.location.href).toBe('https://example.com/portal');
    expect(tab.opener).toBeNull();
    expect(tab.close).not.toHaveBeenCalled();
  });

  it('closes the tab and rethrows when the request fails', async () => {
    const tab = fakeTab();
    vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);

    await expect(
      openInNewTab(() => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');

    expect(tab.close).toHaveBeenCalledTimes(1);
    expect(tab.location.href).toBe('');
  });

  it.each([
    ['empty', ''],
    ['missing', undefined],
  ])('closes the tab when the request returns an %s URL', async (_, url) => {
    const tab = fakeTab();
    vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);

    await expect(openInNewTab(() => Promise.resolve(url))).rejects.toThrow(
      'No URL to open',
    );

    expect(tab.close).toHaveBeenCalledTimes(1);
    expect(tab.location.href).toBe('');
  });
});
