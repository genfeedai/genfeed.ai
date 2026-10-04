import type { AgentRoomDocument } from '@api/collections/agent-threads/schemas/agent-thread.schema';
import {
  AGENT_EXTERNAL_RUNTIME_SESSION_ID_PATTERN,
  isAgentExternalRuntimeKey,
} from '@genfeedai/contracts/constants';
import type { IAgentThreadExternalRuntime } from '@genfeedai/contracts/interfaces';
import { readRecordOrNull } from '@genfeedai/utils/data/extract.util';

/** Key inside `AgentThread.config` that stores the external CLI session. */
export const AGENT_THREAD_EXTERNAL_RUNTIME_CONFIG_KEY = 'externalRuntime';

export function readAgentThreadExternalRuntime(
  config: unknown,
): IAgentThreadExternalRuntime | null {
  const stored = readRecordOrNull(
    readRecordOrNull(config)?.[AGENT_THREAD_EXTERNAL_RUNTIME_CONFIG_KEY],
  );

  if (!stored || !isAgentExternalRuntimeKey(stored.runtimeKey)) {
    return null;
  }

  const sessionId =
    typeof stored.sessionId === 'string' &&
    AGENT_EXTERNAL_RUNTIME_SESSION_ID_PATTERN.test(stored.sessionId)
      ? stored.sessionId
      : null;

  return {
    runtimeKey: stored.runtimeKey,
    sessionId,
    updatedAt:
      typeof stored.updatedAt === 'string'
        ? stored.updatedAt
        : new Date(0).toISOString(),
  };
}

/**
 * Surfaces `config.externalRuntime` as a top-level `externalRuntime` field so
 * the thread serializer can expose it without exposing the whole config.
 */
export function withAgentThreadExternalRuntime<T extends AgentRoomDocument>(
  thread: T,
): T & { externalRuntime: IAgentThreadExternalRuntime | null } {
  return {
    ...thread,
    externalRuntime: readAgentThreadExternalRuntime(thread.config),
  };
}
