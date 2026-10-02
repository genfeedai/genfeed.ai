// @vitest-environment-options {"url":"https://x.com/home"}
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from 'vitest';

const mocks = vi.hoisted(() => {
  const cleanups: Array<ReturnType<typeof vi.fn<() => void>>> = [];
  return { attach: vi.fn(), cleanups, detected: vi.fn() };
});
vi.mock('~platforms/x-publication-observer', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('~platforms/x-publication-observer')>();
  return { ...actual, attachXPublicationObserver: mocks.attach };
});
vi.mock('~platforms/config', () => ({
  getCurrentPlatform: () => null,
  getPlatformName: () => null,
}));
vi.mock('~platforms/composer-helpers', () => ({
  getComposerState: () => ({ composeBoxAvailable: false }),
  insertContentIntoComposer: vi.fn(),
}));
vi.mock('~platforms/import-post-control', () => ({
  attachImportMenuItem: vi.fn(),
  attachViewedPostImport: vi.fn(),
}));
vi.mock('~platforms/ui-helpers', () => ({
  createButtonContainer: vi.fn(),
  createGenFeedDropdown: vi.fn(),
  injectGlobalStyles: vi.fn(),
  watchContentTheme: vi.fn(),
}));
vi.mock('~services/error-tracking.service', () => ({
  initializeErrorTracking: vi.fn(),
}));
let originalPush: History['pushState'];
let originalReplace: History['replaceState'];
let windowListeners: MockInstance<typeof window.addEventListener>;
let documentListeners: MockInstance<typeof document.addEventListener>;
let originalSend: typeof chrome.runtime.sendMessage;
beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.cleanups = [];
  history.replaceState(null, '', '/home');
  originalPush = history.pushState;
  originalReplace = history.replaceState;
  windowListeners = vi.spyOn(window, 'addEventListener');
  documentListeners = vi.spyOn(document, 'addEventListener');
  mocks.attach.mockImplementation(() => {
    const cleanup = vi.fn<() => void>();
    mocks.cleanups.push(cleanup);
    return cleanup;
  });
  originalSend = chrome.runtime.sendMessage;
  chrome.runtime.sendMessage = mocks.detected;
});
afterEach(() => {
  for (const [event, listener, options] of windowListeners.mock.calls)
    window.removeEventListener(event, listener, options);
  for (const [event, listener, options] of documentListeners.mock.calls)
    document.removeEventListener(event, listener, options);
  chrome.runtime.sendMessage = originalSend;
  history.pushState = originalPush;
  history.replaceState = originalReplace;
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const navigate = async (path: string, replace = false) => {
  if (replace) history.replaceState(null, '', path);
  else history.pushState(null, '', path);
  await vi.advanceTimersByTimeAsync(100);
};
describe('real content module publication observer ownership', () => {
  it('replaces the real self-disposed observer on rapid popstate departure and return', async () => {
    const actual = await vi.importActual<
      typeof import('~platforms/x-publication-observer')
    >('~platforms/x-publication-observer');
    document.body.innerHTML = readFileSync(
      resolve(process.cwd(), 'tests/fixtures/publication-capture/x-home.html'),
      'utf8',
    );
    const removed = vi.spyOn(document, 'removeEventListener');
    mocks.detected.mockResolvedValue({
      success: true,
      data: {
        kind: 'context',
        enabled: false,
        scope: null,
        pending: null,
        confirmed: null,
      },
    });
    mocks.attach.mockImplementation(() => {
      const stop = actual.attachXPublicationObserver();
      const cleanup = vi.fn<() => void>(() => stop());
      mocks.cleanups.push(cleanup);
      return cleanup;
    });
    const contextRequests = () =>
      mocks.detected.mock.calls.filter(
        ([request]) => request?.event === 'publicationCaptureContext',
      ).length;
    try {
      await import('../src/content');
      for (let index = 0; index < 12; index++) await Promise.resolve();
      expect(mocks.attach).toHaveBeenCalledTimes(1);
      expect(contextRequests()).toBe(1);
      const oldClick = documentListeners.mock.calls.find(
        ([event]) => event === 'click',
      )?.[1];
      expect(oldClick).toBeDefined();
      originalPush.call(history, null, '', '/home?tab=following#compose');
      window.dispatchEvent(new PopStateEvent('popstate'));
      expect(mocks.attach).toHaveBeenCalledTimes(1);
      expect(mocks.cleanups[0]).not.toHaveBeenCalled();
      const savedLocation = location;
      vi.stubGlobal('location', new URL('https://example.invalid/home'));
      window.dispatchEvent(new PopStateEvent('popstate'));
      expect(removed).toHaveBeenCalledWith('click', oldClick, true);
      expect(mocks.cleanups[0]).toHaveBeenCalledTimes(1);
      vi.stubGlobal('location', savedLocation);
      window.dispatchEvent(new PopStateEvent('popstate'));
      for (let index = 0; index < 12; index++) await Promise.resolve();
      expect(mocks.attach).toHaveBeenCalledTimes(2);
      expect(contextRequests()).toBe(2);
      const replacementClick = documentListeners.mock.calls.filter(
        ([event]) => event === 'click',
      )[1]?.[1];
      expect(replacementClick).toBeDefined();
      expect(replacementClick).not.toBe(oldClick);
      await vi.advanceTimersByTimeAsync(100);
      expect(mocks.attach).toHaveBeenCalledTimes(2);
      expect(mocks.cleanups[0]).toHaveBeenCalledTimes(1);
      expect(mocks.cleanups[1]).not.toHaveBeenCalled();
      expect(removed).not.toHaveBeenCalledWith('click', replacementClick, true);
      window.dispatchEvent(new Event('pagehide'));
      expect(mocks.cleanups[1]).toHaveBeenCalledTimes(1);
      expect(removed).toHaveBeenCalledWith('click', replacementClick, true);
    } finally {
      window.dispatchEvent(new Event('pagehide'));
      for (const cleanup of mocks.cleanups) cleanup();
      document.body.innerHTML = '';
    }
  });

  it('keeps the real dormant observer and click listener during rapid same-X departure and return', async () => {
    const actual = await vi.importActual<
      typeof import('~platforms/x-publication-observer')
    >('~platforms/x-publication-observer');
    document.body.innerHTML = readFileSync(
      resolve(process.cwd(), 'tests/fixtures/publication-capture/x-home.html'),
      'utf8',
    );
    const removed = vi.spyOn(document, 'removeEventListener');
    mocks.detected.mockResolvedValue({
      success: true,
      data: {
        kind: 'context',
        enabled: false,
        scope: null,
        pending: null,
        confirmed: null,
      },
    });
    mocks.attach.mockImplementation(() => {
      const stop = actual.attachXPublicationObserver();
      const cleanup = vi.fn<() => void>(() => stop());
      mocks.cleanups.push(cleanup);
      return cleanup;
    });
    try {
      await import('../src/content');
      for (let index = 0; index < 12; index++) await Promise.resolve();
      const click = documentListeners.mock.calls.find(
        ([event]) => event === 'click',
      )?.[1];
      expect(click).toBeDefined();
      originalPush.call(history, null, '', '/notifications');
      window.dispatchEvent(new PopStateEvent('popstate'));
      originalPush.call(history, null, '', '/home');
      window.dispatchEvent(new PopStateEvent('popstate'));
      await vi.advanceTimersByTimeAsync(100);
      expect(mocks.attach).toHaveBeenCalledTimes(1);
      expect(mocks.cleanups[0]).not.toHaveBeenCalled();
      expect(removed).not.toHaveBeenCalledWith('click', click, true);
      expect(
        mocks.detected.mock.calls.filter(
          ([request]) => request?.event === 'publicationCaptureContext',
        ),
      ).toHaveLength(1);
      window.dispatchEvent(new Event('pagehide'));
      expect(removed).toHaveBeenCalledWith('click', click, true);
    } finally {
      window.dispatchEvent(new Event('pagehide'));
      for (const cleanup of mocks.cleanups) cleanup();
      document.body.innerHTML = '';
    }
  });
  it('retains one observer across same-home pushState, replaceState and popstate', async () => {
    await import('../src/content');
    expect(mocks.attach).toHaveBeenCalledTimes(1);
    await navigate('/home?tab=following');
    await navigate('/home/#compose', true);
    window.dispatchEvent(new PopStateEvent('popstate'));
    await vi.advanceTimersByTimeAsync(100);
    expect(mocks.attach).toHaveBeenCalledTimes(1);
    expect(mocks.cleanups[0]).not.toHaveBeenCalled();
    expect(mocks.detected).toHaveBeenCalledTimes(4);
  });
  it('retains the dormant observer across all same-X history routes', async () => {
    await import('../src/content');
    await navigate('/author/status/123');
    expect(mocks.cleanups[0]).not.toHaveBeenCalled();
    await navigate('/notifications', true);
    window.dispatchEvent(new PopStateEvent('popstate'));
    await vi.advanceTimersByTimeAsync(100);
    expect(mocks.attach).toHaveBeenCalledTimes(1);
    expect(mocks.cleanups[0]).not.toHaveBeenCalled();
    await navigate('/home');
    expect(mocks.attach).toHaveBeenCalledTimes(1);
    expect(mocks.cleanups[0]).not.toHaveBeenCalled();
  });
  it('pagehide disposes and clears its reference only once', async () => {
    await import('../src/content');
    window.dispatchEvent(new Event('pagehide'));
    window.dispatchEvent(new Event('pagehide'));
    expect(mocks.cleanups[0]).toHaveBeenCalledTimes(1);
    await navigate('/notifications');
    expect(mocks.cleanups[0]).toHaveBeenCalledTimes(1);
    await navigate('/home');
    expect(mocks.attach).toHaveBeenCalledTimes(2);
  });
  it.each(['https://evil.example/home', 'http://x.com/home'])(
    'never attaches outside the approved home predicate: %s',
    async (href) => {
      vi.stubGlobal('location', new URL(href));
      await import('../src/content');
      expect(mocks.attach).not.toHaveBeenCalled();
      window.dispatchEvent(new Event('pagehide'));
      expect(mocks.cleanups).toEqual([]);
    },
  );
});
