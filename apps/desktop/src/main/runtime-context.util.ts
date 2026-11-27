import type {
  IDesktopEnvironment,
  IDesktopRuntimeContext,
} from '@genfeedai/contracts/desktop';

interface DesktopRuntimeContextInput {
  environment: IDesktopEnvironment;
  runtimeId: string;
  revision: number;
  status: IDesktopRuntimeContext['status'];
  hasSession: boolean;
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
  return {
    version: 1,
    runtimeId: input.runtimeId,
    revision: input.revision,
    status: input.status,
    selectedServerId: input.environment.serverId,
    selectedServerKind: input.environment.serverKind,
    selectedApiEndpoint: input.environment.apiEndpoint,
    generationExecution:
      input.hasSession && input.status === 'ready' ? 'remote' : 'unknown',
  };
}

/** Publish only the still-active environment during the committed relaunch boundary. */
export async function commitDesktopRuntimeSwitch<T>(
  currentStatus: () => IDesktopRuntimeContext['status'],
  confirmed: boolean,
  select: () => Promise<T>,
  status: (value: IDesktopRuntimeContext['status']) => void,
): Promise<T> {
  const previousStatus = currentStatus();
  assertDesktopRuntimeAvailable(previousStatus);
  if (!confirmed) throw new Error('Server switch was cancelled.');
  status('switching');
  try {
    return await select();
  } catch (error) {
    if (currentStatus() === 'switching') status(previousStatus);
    throw error;
  }
}

export function assertDesktopRuntimeAvailable(
  status: IDesktopRuntimeContext['status'],
): void {
  if (status === 'switching')
    throw new Error(
      'Genfeed Desktop is switching servers. Wait for it to restart.',
    );
}

export function assertDesktopServerSwitchAvailable(
  status: IDesktopRuntimeContext['status'],
  isPending: boolean,
): void {
  assertDesktopRuntimeAvailable(status);
  if (isPending)
    throw new Error('A desktop server selection is already pending.');
}
