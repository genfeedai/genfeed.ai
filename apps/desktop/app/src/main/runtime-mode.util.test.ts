import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  activateDesktopLocalMode,
  createUnwoundLocalRuntimeState,
  selectDesktopDataService,
  shouldOpenDesktopLocalWorkspace,
  switchDesktopToCloud,
  unwindFailedLocalRuntimeAfterClose,
} from './runtime-mode.util';

describe('desktop runtime mode transitions', () => {
  it('does not reopen a persisted local workspace while the feature is disabled', () => {
    expect(shouldOpenDesktopLocalWorkspace('local')).toBe(false);
    expect(shouldOpenDesktopLocalWorkspace('cloud')).toBe(false);
    expect(shouldOpenDesktopLocalWorkspace(undefined)).toBe(false);
  });

  it('does not persist local mode when runtime initialization fails', async () => {
    let persisted = false;

    await expect(
      activateDesktopLocalMode(
        async () => {
          throw new Error('database unavailable');
        },
        () => {
          persisted = true;
        },
      ),
    ).rejects.toThrow('database unavailable');

    expect(persisted).toBe(false);
  });

  it('never falls back to cloud while local mode is active', () => {
    const cloudService = { mode: 'cloud' };

    expect(() =>
      selectDesktopDataService({
        cloudService,
        hasCloudSession: true,
        isOfflineMode: true,
        localService: null,
      }),
    ).toThrow('The local runtime is not ready.');
  });

  it('closes the local runtime before relaunching in cloud mode', async () => {
    const events: string[] = [];

    await switchDesktopToCloud({
      closeLocalRuntime: async () => {
        events.push('close');
      },
      exit: () => {
        events.push('exit');
      },
      persistCloudMode: () => {
        events.push('persist');
      },
      relaunch: () => {
        events.push('relaunch');
      },
    });

    expect(events).toEqual(['close', 'persist', 'relaunch', 'exit']);
  });
});

describe('desktop local runtime unwind', () => {
  it('resets every local service and mode flag after a failed initialization', () => {
    const reset = createUnwoundLocalRuntimeState();

    expect(reset).toEqual({
      bootstrapCache: null,
      draftsService: null,
      filesService: null,
      generationService: null,
      isOfflineMode: false,
      kvService: null,
      localIdentityService: null,
      localRuntimePromise: null,
      localService: null,
      pgliteService: null,
      prismaService: null,
      syncService: null,
      terminalService: null,
      workspaceService: null,
    });
  });

  it('closes the database before resetting mode and service globals', async () => {
    const events: string[] = [];
    let appliedIsOfflineMode = true;
    let appliedLocalService: unknown = { id: 'stale' };
    let appliedKvService: unknown = { id: 'stale-kv' };
    let appliedDraftsService: unknown = { id: 'stale-drafts' };
    let appliedRuntimePromise: Promise<void> | null = Promise.resolve();

    await unwindFailedLocalRuntimeAfterClose({
      applyReset: (reset) => {
        events.push('reset');
        appliedIsOfflineMode = reset.isOfflineMode;
        appliedLocalService = reset.localService;
        appliedKvService = reset.kvService;
        appliedDraftsService = reset.draftsService;
        appliedRuntimePromise = reset.localRuntimePromise;
      },
      closeDatabase: async () => {
        events.push('close');
      },
    });

    expect(events).toEqual(['close', 'reset']);
    expect(appliedIsOfflineMode).toBe(false);
    expect(appliedRuntimePromise).toBeNull();
    expect(appliedLocalService).toBeNull();
    expect(appliedKvService).toBeNull();
    expect(appliedDraftsService).toBeNull();
  });

  it('still resets services when closing the database fails', async () => {
    const events: string[] = [];

    await expect(
      unwindFailedLocalRuntimeAfterClose({
        applyReset: () => {
          events.push('reset');
        },
        closeDatabase: async () => {
          events.push('close');
          throw new Error('close failed');
        },
      }),
    ).rejects.toThrow('close failed');

    expect(events).toEqual(['close', 'reset']);
  });

  it('wires both initialization failure catches to the unwind helper', () => {
    const source = readFileSync(join(import.meta.dir, '../main.ts'), 'utf8');

    expect(source).toContain('unwindFailedLocalRuntimeAfterClose');
    expect(source).toMatch(
      /catch \(error\) \{\s*await unwindFailedLocalRuntimeAfterClose/,
    );
    expect(source).toMatch(
      /local runtime could not start[\s\S]*applyUnwoundLocalRuntime/,
    );
    expect(source).toContain('let kvService: DesktopKvService | null = null');
    expect(source).toContain(
      'let draftsService: DesktopDraftsService | null = null',
    );
  });
});
