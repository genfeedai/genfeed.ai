import { isDesktopLocalModeEnabled } from '@genfeedai/contracts/desktop';

interface DesktopDataServiceSelection<TService> {
  cloudService: TService;
  hasCloudSession: boolean;
  isOfflineMode: boolean;
  localService: TService | null;
}

interface DesktopCloudModeTransition {
  closeLocalRuntime: () => Promise<void>;
  exit: () => void;
  persistCloudMode: () => void;
  relaunch: () => void;
}

interface DesktopRuntimeRestore {
  initializeLocalRuntime: () => Promise<void>;
  isLocalModeEnabled?: boolean;
  isLocalModeRequested: boolean;
  onLocalRuntimeError: (error: unknown) => void;
  persistCloudMode: () => void;
}

export function selectDesktopDataService<TService>({
  cloudService,
  hasCloudSession,
  isOfflineMode,
  localService,
}: DesktopDataServiceSelection<TService>): TService {
  if (isOfflineMode) {
    if (!localService) {
      throw new Error(
        'The local runtime is not ready. Retry local initialization or switch to cloud mode.',
      );
    }

    return localService;
  }

  if (hasCloudSession) {
    return cloudService;
  }

  if (!localService) {
    throw new Error('Select local mode before using local generation.');
  }

  return localService;
}

export const DESKTOP_LOCAL_MODE_DISABLED_MESSAGE =
  'Local mode is not available in this version of Genfeed Desktop. Sign in to use cloud mode.';

export function assertDesktopLocalModeEnabled(
  isLocalModeEnabled: boolean = isDesktopLocalModeEnabled(),
): void {
  if (!isLocalModeEnabled) {
    throw new Error(DESKTOP_LOCAL_MODE_DISABLED_MESSAGE);
  }
}

const LOCAL_RUNTIME_INIT_TIMEOUT_MS = 20_000;
const LOCAL_RUNTIME_INIT_TIMEOUT_ERROR =
  'Local workspace did not finish starting. Retry or switch back to cloud.';

export function createLocalRuntimeCleanupBarrier(
  attempt: Promise<void> | null,
): Promise<void> {
  return (
    attempt?.then(
      () => undefined,
      () => undefined,
    ) ?? Promise.resolve()
  );
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
  onTimeout: () => void,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          onTimeout();
          reject(new Error(message));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export async function activateDesktopLocalMode(
  initializeLocalRuntime: () => Promise<void>,
  persistLocalMode: () => void,
  timeoutMs = LOCAL_RUNTIME_INIT_TIMEOUT_MS,
  invalidateAttempt: () => void = () => undefined,
  isLocalModeEnabled: boolean = isDesktopLocalModeEnabled(),
): Promise<void> {
  assertDesktopLocalModeEnabled(isLocalModeEnabled);
  await withTimeout(
    initializeLocalRuntime(),
    timeoutMs,
    LOCAL_RUNTIME_INIT_TIMEOUT_ERROR,
    invalidateAttempt,
  );
  persistLocalMode();
}

export async function restoreDesktopRuntimeMode({
  initializeLocalRuntime,
  isLocalModeEnabled = isDesktopLocalModeEnabled(),
  isLocalModeRequested,
  onLocalRuntimeError,
  persistCloudMode,
}: DesktopRuntimeRestore): Promise<boolean> {
  // Cloud-only builds start in cloud even when local mode was persisted. The
  // stored choice and the local database are left untouched so re-enabling
  // the flag restores them.
  if (!isLocalModeEnabled || !isLocalModeRequested) {
    return false;
  }

  try {
    await initializeLocalRuntime();
    return true;
  } catch (error) {
    persistCloudMode();
    onLocalRuntimeError(error);
    return false;
  }
}

export async function switchDesktopToCloud({
  closeLocalRuntime,
  exit,
  persistCloudMode,
  relaunch,
}: DesktopCloudModeTransition): Promise<void> {
  await closeLocalRuntime();
  persistCloudMode();
  relaunch();
  exit();
}

export interface UnwoundLocalRuntimeState {
  bootstrapCache: null;
  draftsService: null;
  filesService: null;
  generationService: null;
  isOfflineMode: false;
  kvService: null;
  localIdentityService: null;
  localRuntimePromise: null;
  localService: null;
  pgliteService: null;
  prismaService: null;
  syncService: null;
  workspaceService: null;
}

interface UnwindFailedLocalRuntimeAfterClose {
  applyReset: (reset: UnwoundLocalRuntimeState) => void;
  closeDatabase: () => Promise<void>;
}

export function createUnwoundLocalRuntimeState(): UnwoundLocalRuntimeState {
  return {
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
  };
}

export async function unwindFailedLocalRuntimeAfterClose({
  applyReset,
  closeDatabase,
}: UnwindFailedLocalRuntimeAfterClose): Promise<void> {
  try {
    await closeDatabase();
  } finally {
    applyReset(createUnwoundLocalRuntimeState());
  }
}
