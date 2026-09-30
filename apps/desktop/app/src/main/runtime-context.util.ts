import type {
  IDesktopEnvironment,
  IDesktopGenerationProviderPublicConfig,
  IDesktopRuntimeContext,
} from '@genfeedai/contracts/desktop';
import {
  selectDesktopDataService,
  switchDesktopToCloud,
} from './runtime-mode.util';

interface DesktopRuntimeContextInput {
  environment: IDesktopEnvironment;
  runtimeId: string;
  revision: number;
  status: IDesktopRuntimeContext['status'];
  hasSession: boolean;
  isOfflineMode: boolean;
  isLocalInitialized: boolean;
  localProvider: IDesktopRuntimeContext['localProvider'];
}

export function getDesktopProviderContext(
  config: IDesktopGenerationProviderPublicConfig | null,
): IDesktopRuntimeContext['localProvider'] {
  if (!config) return null;
  let networkAccess: 'local' | 'remote' | 'unknown' = 'unknown';
  try {
    const url = new URL(config.baseUrl);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      networkAccess = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(
        url.hostname.toLowerCase(),
      )
        ? 'local'
        : 'remote';
    }
  } catch {
    /* An invalid configured endpoint is not transport proof. */
  }
  return { provider: config.provider, networkAccess };
}

export function createDesktopRuntimeContext(
  input: DesktopRuntimeContextInput,
): IDesktopRuntimeContext {
  const url = new URL(input.environment.apiEndpoint);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('Selected server endpoint is not safe for runtime context');
  const localReady =
    input.isOfflineMode &&
    input.isLocalInitialized &&
    input.localProvider !== null &&
    input.status === 'ready';
  return {
    version: 1,
    runtimeId: input.runtimeId,
    revision: input.revision,
    status: input.status,
    selectedServerId: input.environment.serverId,
    selectedServerKind: input.environment.serverKind,
    selectedApiEndpoint: input.environment.apiEndpoint,
    runtimeMode: input.isOfflineMode ? 'local' : 'cloud',
    generationExecution: localReady
      ? 'local-byok'
      : !input.isOfflineMode && input.hasSession && input.status === 'ready'
        ? 'remote'
        : 'unknown',
    localProvider: input.isOfflineMode ? input.localProvider : null,
  };
}

/** Publish only the still-active environment during the committed relaunch boundary. */
export async function commitDesktopRuntimeSwitch<T>(
  confirmed: boolean,
  select: () => Promise<T>,
  status: (value: 'ready' | 'switching') => void,
): Promise<T> {
  if (!confirmed) throw new Error('Server switch was cancelled.');
  status('switching');
  try {
    return await select();
  } catch (error) {
    status('ready');
    throw error;
  }
}

export interface DesktopRuntimeTransitionState {
  status: IDesktopRuntimeContext['status'];
  isOfflineMode: boolean;
  localProvider: IDesktopRuntimeContext['localProvider'];
}
interface DesktopRuntimeCloudTransition {
  previous: DesktopRuntimeTransitionState;
  publish: (state: DesktopRuntimeTransitionState) => void;
  closeLocalRuntime: () => Promise<void>;
  persistCloudMode: () => void;
  relaunch: () => void;
  exit: () => void;
}
export function assertDesktopRuntimeAvailable(
  status: IDesktopRuntimeContext['status'],
): void {
  if (status === 'unavailable')
    throw new Error('Restart Genfeed Desktop to recover the local workspace.');
  if (status === 'switching')
    throw new Error(
      'Genfeed Desktop is switching servers. Wait for it to restart.',
    );
}
/** The persisted rename is the commit point; attempted teardown requires restart on failure. */
export async function transitionDesktopRuntimeToCloud(
  input: DesktopRuntimeCloudTransition,
): Promise<void> {
  const previous = { ...input.previous };
  let teardownAttempted = false;
  let committed = false;
  try {
    input.publish({ ...previous, status: 'switching' });
    await switchDesktopToCloud({
      closeLocalRuntime: async () => {
        teardownAttempted = true;
        await input.closeLocalRuntime();
      },
      persistCloudMode: () => {
        input.persistCloudMode();
        committed = true;
        input.publish({
          status: 'switching',
          isOfflineMode: false,
          localProvider: null,
        });
      },
      relaunch: input.relaunch,
      exit: input.exit,
    });
  } catch (error) {
    if (!committed)
      input.publish({
        ...previous,
        status: teardownAttempted ? 'unavailable' : previous.status,
      });
    throw error;
  }
}

export function selectDesktopRuntimeDataService<TService>(
  status: IDesktopRuntimeContext['status'],
  selection: Parameters<typeof selectDesktopDataService<TService>>[0],
): TService {
  assertDesktopRuntimeAvailable(status);
  return selectDesktopDataService(selection);
}
