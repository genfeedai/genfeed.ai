import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DESKTOP_LOCAL_MODE_TEST_OVERRIDE,
  IS_DESKTOP_LOCAL_MODE_ENABLED,
  isDesktopLocalModeEnabled,
} from '@genfeedai/contracts/desktop';
import {
  activateDesktopLocalMode as activateDesktopLocalModeWithFlag,
  assertDesktopLocalModeEnabled,
  createLocalRuntimeCleanupBarrier,
  createUnwoundLocalRuntimeState,
  DESKTOP_LOCAL_MODE_DISABLED_MESSAGE,
  restoreDesktopRuntimeMode,
  selectDesktopDataService,
  switchDesktopToCloud,
  unwindFailedLocalRuntimeAfterClose,
} from './runtime-mode.util';

// The shipped flag is off; these cases exercise the local runtime itself.
const activateDesktopLocalMode = (
  initializeLocalRuntime: () => Promise<void>,
  persistLocalMode: () => void,
  timeoutMs?: number,
  invalidateAttempt?: () => void,
) =>
  activateDesktopLocalModeWithFlag(
    initializeLocalRuntime,
    persistLocalMode,
    timeoutMs,
    invalidateAttempt,
    true,
  );

describe('desktop runtime mode transitions', () => {
  it('falls back to cloud when a remembered local runtime cannot start', async () => {
    const error = new Error('database unavailable');
    const reportedErrors: unknown[] = [];
    let persistedMode: 'cloud' | null = null;

    const isOfflineMode = await restoreDesktopRuntimeMode({
      initializeLocalRuntime: async () => {
        throw error;
      },
      isLocalModeEnabled: true,
      isLocalModeRequested: true,
      onLocalRuntimeError: (runtimeError) => {
        reportedErrors.push(runtimeError);
      },
      persistCloudMode: () => {
        persistedMode = 'cloud';
      },
    });

    expect(isOfflineMode).toBe(false);
    expect(persistedMode).toBe('cloud');
    expect(reportedErrors).toEqual([error]);
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

  it('fails local mode when initialization never finishes', async () => {
    let persisted = false;

    await expect(
      activateDesktopLocalMode(
        async () => new Promise(() => undefined),
        () => {
          persisted = true;
        },
        20,
      ),
    ).rejects.toThrow('Local workspace did not finish starting');

    expect(persisted).toBe(false);
  });

  it('invalidates a timed-out attempt and lets a fresh retry persist', async () => {
    let resolveFirstAttempt: (() => void) | undefined;
    const firstAttempt = new Promise<void>((resolve) => {
      resolveFirstAttempt = resolve;
    });
    let invalidated = false;
    let persisted = 0;

    await expect(
      activateDesktopLocalMode(
        async () => firstAttempt,
        () => {
          persisted += 1;
        },
        20,
        () => {
          invalidated = true;
        },
      ),
    ).rejects.toThrow('Local workspace did not finish starting');

    expect(invalidated).toBe(true);
    await activateDesktopLocalMode(
      async () => undefined,
      () => {
        persisted += 1;
      },
    );
    resolveFirstAttempt?.();
    await firstAttempt;

    expect(persisted).toBe(1);
  });

  it('waits for invalidated runtime cleanup before starting a retry', async () => {
    const events: string[] = [];
    let releaseAttempt: (() => void) | undefined;
    const attempt = (async () => {
      await new Promise<void>((resolve) => {
        releaseAttempt = resolve;
      });
      events.push('close');
      throw new Error('timed out');
    })();
    const cleanupBarrier = createLocalRuntimeCleanupBarrier(attempt);
    const retry = (async () => {
      await cleanupBarrier;
      events.push('retry');
    })();

    await Promise.resolve();
    expect(events).toEqual([]);
    releaseAttempt?.();
    await retry;

    expect(events).toEqual(['close', 'retry']);
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
    expect(source).toContain('attemptId !== localRuntimeAttemptId');
    expect(source).toContain('invalidateLocalRuntimeAttempt');
  });
});

describe('desktop cloud-only local mode flag', () => {
  it('ships with local mode disabled', () => {
    expect(IS_DESKTOP_LOCAL_MODE_ENABLED).toBe(false);
  });

  it('stays disabled without the acceptance launcher override', () => {
    const overrides = globalThis as { [key: symbol]: unknown };
    expect(overrides[DESKTOP_LOCAL_MODE_TEST_OVERRIDE]).toBeUndefined();
    expect(isDesktopLocalModeEnabled()).toBe(false);
    expect(() => assertDesktopLocalModeEnabled()).toThrow(
      'Local mode is not available',
    );
  });

  it('only honours an explicit true override and never reads env or the packaged app', () => {
    const overrides = globalThis as { [key: symbol]: unknown };
    try {
      overrides[DESKTOP_LOCAL_MODE_TEST_OVERRIDE] = 'true';
      expect(isDesktopLocalModeEnabled()).toBe(false);
      overrides[DESKTOP_LOCAL_MODE_TEST_OVERRIDE] = true;
      expect(isDesktopLocalModeEnabled()).toBe(true);
      expect(() => assertDesktopLocalModeEnabled()).not.toThrow();
    } finally {
      delete overrides[DESKTOP_LOCAL_MODE_TEST_OVERRIDE];
    }
    const mainSource = readFileSync(
      join(import.meta.dir, '../main.ts'),
      'utf8',
    );
    const contractSource = readFileSync(
      join(
        import.meta.dir,
        '../../../../../packages/contracts/src/desktop/index.ts',
      ),
      'utf8',
    );
    expect(mainSource).not.toContain('DESKTOP_LOCAL_MODE_TEST_OVERRIDE');
    expect(contractSource).not.toMatch(/process\.env[^;]*LOCAL_MODE/);
  });

  it('ignores a persisted local mode on startup without touching local data', async () => {
    let initialized = false;
    let persistedMode: 'cloud' | null = null;
    const reportedErrors: unknown[] = [];

    const isOfflineMode = await restoreDesktopRuntimeMode({
      initializeLocalRuntime: async () => {
        initialized = true;
      },
      isLocalModeEnabled: false,
      isLocalModeRequested: true,
      onLocalRuntimeError: (error) => {
        reportedErrors.push(error);
      },
      persistCloudMode: () => {
        persistedMode = 'cloud';
      },
    });

    expect(isOfflineMode).toBe(false);
    expect(initialized).toBe(false);
    expect(persistedMode).toBeNull();
    expect(reportedErrors).toEqual([]);
  });

  it('ignores a persisted local mode by default while the shipped flag is off', async () => {
    let initialized = false;

    const isOfflineMode = await restoreDesktopRuntimeMode({
      initializeLocalRuntime: async () => {
        initialized = true;
      },
      isLocalModeRequested: true,
      onLocalRuntimeError: () => undefined,
      persistCloudMode: () => undefined,
    });

    expect(isOfflineMode).toBe(false);
    expect(initialized).toBe(false);
  });

  it('still restores a persisted local mode when the flag is on', async () => {
    let initialized = false;

    const isOfflineMode = await restoreDesktopRuntimeMode({
      initializeLocalRuntime: async () => {
        initialized = true;
      },
      isLocalModeEnabled: true,
      isLocalModeRequested: true,
      onLocalRuntimeError: () => undefined,
      persistCloudMode: () => undefined,
    });

    expect(isOfflineMode).toBe(true);
    expect(initialized).toBe(true);
  });

  it('refuses to enter local mode without initializing or persisting anything', async () => {
    let initialized = false;
    let persisted = false;

    await expect(
      activateDesktopLocalModeWithFlag(
        async () => {
          initialized = true;
        },
        () => {
          persisted = true;
        },
        undefined,
        undefined,
        false,
      ),
    ).rejects.toThrow(DESKTOP_LOCAL_MODE_DISABLED_MESSAGE);

    expect(initialized).toBe(false);
    expect(persisted).toBe(false);
  });

  it('refuses with a clear error by default while the shipped flag is off', () => {
    expect(() => assertDesktopLocalModeEnabled()).toThrow(
      'Local mode is not available in this version of Genfeed Desktop.',
    );
    expect(() => assertDesktopLocalModeEnabled(true)).not.toThrow();
  });

  it('guards the enable-offline IPC handler and hides the menu entry in main.ts', () => {
    const source = readFileSync(join(import.meta.dir, '../main.ts'), 'utf8');

    expect(source).toMatch(
      /DESKTOP_IPC_CHANNELS\.appEnableOfflineMode,\s*async \(\) => \{\s*assertDesktopLocalModeEnabled\(\);/,
    );
    expect(source).toContain(
      'isDesktopLocalModeEnabled() ? openLocalWorkspaceFromMenu : null',
    );
  });
});
