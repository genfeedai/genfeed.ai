import { beforeEach, describe, expect, it } from 'bun:test';
import type { IDesktopUpdaterDeps } from './updater.service';
import { DesktopUpdaterService } from './updater.service';

// Typed fake autoUpdater — cast to AppUpdater via 'as unknown as' only in test context.
type Listener = (arg: unknown) => void;

interface FakeAutoUpdater {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  checkForUpdatesCallCount: number;
  checkForUpdatesShouldReject: boolean;
  emit: (event: string, arg?: unknown) => void;
  listeners: Map<string, Listener>;
  logger: null | unknown;
  checkForUpdates(): Promise<null>;
  on(event: string, listener: Listener): FakeAutoUpdater;
}

function buildFakeAutoUpdater(shouldReject = false): FakeAutoUpdater {
  const listeners = new Map<string, Listener>();
  let checkForUpdatesCallCount = 0;

  const fake: FakeAutoUpdater = {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    checkForUpdatesCallCount: 0,
    checkForUpdatesShouldReject: shouldReject,
    listeners,
    logger: undefined,
    emit(event: string, arg?: unknown) {
      const listener = listeners.get(event);
      if (listener) {
        listener(arg);
      }
    },
    on(event: string, listener: Listener) {
      listeners.set(event, listener);
      return this;
    },
    async checkForUpdates() {
      checkForUpdatesCallCount++;
      fake.checkForUpdatesCallCount = checkForUpdatesCallCount;
      if (fake.checkForUpdatesShouldReject) {
        throw new Error('update check failed');
      }
      return null;
    },
  };

  return fake;
}

interface FakeDeps {
  autoUpdater: FakeAutoUpdater;
  isPackaged: boolean;
  notifyCalls: Array<{ body: string; title: string }>;
  onErrorCalls: Array<{ context?: Record<string, unknown>; error: unknown }>;
  deps: IDesktopUpdaterDeps;
}

function buildDeps(opts: {
  isPackaged: boolean;
  shouldReject?: boolean;
}): FakeDeps {
  const autoUpdater = buildFakeAutoUpdater(opts.shouldReject ?? false);
  const notifyCalls: Array<{ body: string; title: string }> = [];
  const onErrorCalls: Array<{
    context?: Record<string, unknown>;
    error: unknown;
  }> = [];

  const deps: IDesktopUpdaterDeps = {
    // Cast acceptable only in test files — provides a controllable fake without native bindings.
    autoUpdater: autoUpdater as unknown as IDesktopUpdaterDeps['autoUpdater'],
    isPackaged: opts.isPackaged,
    notify: (n) => notifyCalls.push(n),
    onError: (error, context) => onErrorCalls.push({ context, error }),
  };

  return {
    autoUpdater,
    deps,
    isPackaged: opts.isPackaged,
    notifyCalls,
    onErrorCalls,
  };
}

describe('DesktopUpdaterService', () => {
  describe('when isPackaged is false', () => {
    let fake: FakeDeps;

    beforeEach(() => {
      fake = buildDeps({ isPackaged: false });
    });

    it('does not touch autoUpdater on initialize', () => {
      const svc = new DesktopUpdaterService(fake.deps);
      svc.initialize();

      expect(fake.autoUpdater.autoDownload).toBe(false);
      expect(fake.autoUpdater.autoInstallOnAppQuit).toBe(false);
      expect(fake.autoUpdater.logger).toBeUndefined();
      expect(fake.autoUpdater.listeners.size).toBe(0);
    });

    it('does not call checkForUpdates', () => {
      const svc = new DesktopUpdaterService(fake.deps);
      svc.initialize();

      expect(fake.autoUpdater.checkForUpdatesCallCount).toBe(0);
    });
  });

  describe('when isPackaged is true', () => {
    let fake: FakeDeps;
    let svc: DesktopUpdaterService;

    beforeEach(async () => {
      fake = buildDeps({ isPackaged: true });
      svc = new DesktopUpdaterService(fake.deps);
      svc.initialize();
      // Let the async checkForUpdates settle
      await Promise.resolve();
    });

    it('sets autoDownload to true', () => {
      expect(fake.autoUpdater.autoDownload).toBe(true);
    });

    it('sets autoInstallOnAppQuit to true', () => {
      expect(fake.autoUpdater.autoInstallOnAppQuit).toBe(true);
    });

    it('sets logger to null', () => {
      expect(fake.autoUpdater.logger).toBeNull();
    });

    it('registers update-available, update-downloaded, and error listeners', () => {
      expect(fake.autoUpdater.listeners.has('update-available')).toBe(true);
      expect(fake.autoUpdater.listeners.has('update-downloaded')).toBe(true);
      expect(fake.autoUpdater.listeners.has('error')).toBe(true);
    });

    it('calls checkForUpdates exactly once', () => {
      expect(fake.autoUpdater.checkForUpdatesCallCount).toBe(1);
    });

    it('emitting update-available calls notify with correct title and version in body', () => {
      fake.autoUpdater.emit('update-available', { version: '1.2.3' });

      expect(fake.notifyCalls).toHaveLength(1);
      expect(fake.notifyCalls[0].title).toBe('Update available');
      expect(fake.notifyCalls[0].body).toContain('1.2.3');
    });

    it('emitting update-downloaded calls notify with correct title and version in body', () => {
      fake.autoUpdater.emit('update-downloaded', { version: '1.2.3' });

      expect(fake.notifyCalls).toHaveLength(1);
      expect(fake.notifyCalls[0].title).toBe('Update ready');
      expect(fake.notifyCalls[0].body).toContain('1.2.3');
    });

    it('emitting error forwards to onError with source auto-updater', () => {
      const err = new Error('boom');
      fake.autoUpdater.emit('error', err);

      expect(fake.onErrorCalls).toHaveLength(1);
      expect(fake.onErrorCalls[0].error).toBe(err);
      expect(fake.onErrorCalls[0].context).toEqual({ source: 'auto-updater' });
    });

    it('calling initialize twice only initializes once', async () => {
      svc.initialize();
      await Promise.resolve();

      expect(fake.autoUpdater.checkForUpdatesCallCount).toBe(1);
    });
  });

  describe('checkForUpdates rejection handling', () => {
    it('catches rejection and forwards to onError with source auto-updater.check', async () => {
      const fake = buildDeps({ isPackaged: true, shouldReject: true });
      const svc = new DesktopUpdaterService(fake.deps);

      await expect(svc.checkForUpdates()).resolves.toBeUndefined();

      expect(fake.onErrorCalls).toHaveLength(1);
      expect(fake.onErrorCalls[0].context).toEqual({
        source: 'auto-updater.check',
      });
      expect(fake.onErrorCalls[0].error).toBeInstanceOf(Error);
    });

    it('does not throw when checkForUpdates rejects during initialize', async () => {
      const fake = buildDeps({ isPackaged: true, shouldReject: true });
      const svc = new DesktopUpdaterService(fake.deps);

      expect(() => svc.initialize()).not.toThrow();
      // Let async settle
      await Promise.resolve();

      expect(fake.onErrorCalls.length).toBeGreaterThanOrEqual(1);
    });
  });
});
