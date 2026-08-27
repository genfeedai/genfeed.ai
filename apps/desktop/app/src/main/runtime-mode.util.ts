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
): Promise<void> {
  await withTimeout(
    initializeLocalRuntime(),
    timeoutMs,
    LOCAL_RUNTIME_INIT_TIMEOUT_ERROR,
    invalidateAttempt,
  );
  persistLocalMode();
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
  terminalService: null;
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
    terminalService: null,
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
