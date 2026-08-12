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

export async function activateDesktopLocalMode(
  initializeLocalRuntime: () => Promise<void>,
  persistLocalMode: () => void,
): Promise<void> {
  await initializeLocalRuntime();
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
