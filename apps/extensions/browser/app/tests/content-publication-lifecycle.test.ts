// @vitest-environment-options {"url":"https://x.com/home"}
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from 'vitest';

const mocks = vi.hoisted(() => ({
  attach: vi.fn(),
  cleanups: [] as ReturnType<typeof vi.fn>[],
  detected: vi.fn(),
}));
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
    const cleanup = vi.fn();
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
  it('disposes exactly once on departure and attaches anew only on return', async () => {
    await import('../src/content');
    await navigate('/author/status/123');
    expect(mocks.cleanups[0]).toHaveBeenCalledTimes(1);
    await navigate('/notifications', true);
    window.dispatchEvent(new PopStateEvent('popstate'));
    await vi.advanceTimersByTimeAsync(100);
    expect(mocks.attach).toHaveBeenCalledTimes(1);
    expect(mocks.cleanups[0]).toHaveBeenCalledTimes(1);
    await navigate('/home');
    expect(mocks.attach).toHaveBeenCalledTimes(2);
    expect(mocks.cleanups[1]).not.toHaveBeenCalled();
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
  it.each([
    'https://evil.example/home',
    'https://x.com/compose/post',
    'https://x.com/author/status/123',
    'http://x.com/home',
  ])('never attaches outside the approved home predicate: %s', async (href) => {
    vi.stubGlobal('location', new URL(href));
    await import('../src/content');
    expect(mocks.attach).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('pagehide'));
    expect(mocks.cleanups).toEqual([]);
  });
});
