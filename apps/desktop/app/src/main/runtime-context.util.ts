import type {
  IDesktopEnvironment,
  IDesktopGenerationProviderPublicConfig,
  IDesktopRuntimeContext,
} from '@genfeedai/contracts/desktop';

interface DesktopRuntimeContextInput {
  environment: IDesktopEnvironment;
  runtimeId: string;
  revision: number;
  status: 'ready' | 'switching';
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
    localProvider: localReady ? input.localProvider : null,
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
