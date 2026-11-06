import type { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import type { PlatformSettingsService } from '@api/collections/platform-settings/services/platform-settings.service';
import { ThreadContextCompressorService } from '@api/services/agent-threading/services/thread-context-compressor.service';
import type { CacheService } from '@api/services/cache/cache.service';
import type { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { DEFAULT_PLATFORM_FEATURE_SETTINGS } from '@genfeedai/contracts/constants';
import type { LoggerService } from '@libs/logger/logger.service';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import { assertTenantScopedQuery } from '@libs/prisma/tenant-guard';
import { describe, expect, it } from 'vitest';

type Row = Record<string, unknown>;

const compactState = (organizationId: string): Row => ({
  data: {
    currentArtifact: `${organizationId} draft`,
    lastIncorporatedMessageId: 'message-1',
  },
  id: `state-${organizationId}`,
  isDeleted: false,
  organizationId,
  threadId: 'thread-1',
});

/**
 * In-memory thread_context_states behind the CLOUD tenant guard, a cache, and
 * a two-message thread. Message counts the service asks for are recorded.
 */
function buildService(
  isAgentContextCompressionEnabled: boolean,
  states: Row[] = [],
) {
  const countedThreads: string[] = [];
  const cache = new Map<string, unknown>();
  const prisma = {
    threadContextState: {
      findFirst: async (args: { where: Row }) => {
        assertTenantScopedQuery({
          args,
          isCloud: true,
          model: 'ThreadContextState',
          operation: 'findFirst',
          tenantModelNames: new Set(['ThreadContextState']),
        });
        return (
          states.find((row) =>
            Object.entries(args.where).every(
              ([key, value]) => row[key] === value,
            ),
          ) ?? null
        );
      },
    },
  };
  const agentMessagesService = {
    countMessages: async (threadId: string) => {
      countedThreads.push(threadId);
      return 2;
    },
    countMessagesAfter: async () => 0,
  };
  const cacheService = {
    get: async (key: string) => cache.get(key) ?? null,
    set: async (key: string, value: unknown) => {
      cache.set(key, value);
    },
  };
  const platformSettingsService = {
    getFeatureSettings: async () => ({
      ...DEFAULT_PLATFORM_FEATURE_SETTINGS,
      isAgentContextCompressionEnabled,
    }),
  };
  const silent = () => undefined;
  const service = new ThreadContextCompressorService(
    prisma as unknown as PrismaService,
    agentMessagesService as unknown as AgentMessagesService,
    {} as LlmDispatcherService,
    cacheService as unknown as CacheService,
    platformSettingsService as unknown as PlatformSettingsService,
    { error: silent, warn: silent } as unknown as LoggerService,
  );
  return { countedThreads, service };
}

describe('ThreadContextCompressorService switch (#5407)', () => {
  it('does nothing when compression is off in platform settings', async () => {
    const { countedThreads, service } = buildService(false, [
      compactState('org-1'),
    ]);

    await expect(
      service.getStateOrCompact('thread-1', 'org-1'),
    ).resolves.toBeNull();
    await service.compressIfNeeded('thread-1', 'org-1');

    expect(countedThreads).toEqual([]);
  });

  it('checks the thread length when compression is on and nothing is saved', async () => {
    const { countedThreads, service } = buildService(true);

    await expect(
      service.getStateOrCompact('thread-1', 'org-1'),
    ).resolves.toBeNull();

    expect(countedThreads).toEqual(['thread-1']);
  });

  it('reads the compressed state of the caller organization in CLOUD mode', async () => {
    const { service } = buildService(true, [
      compactState('org-2'),
      {
        ...compactState('org-1'),
        data: { currentArtifact: 'deleted draft' },
        isDeleted: true,
      },
      compactState('org-1'),
    ]);

    const state = await runWithTenantContext({ organizationId: 'org-1' }, () =>
      service.getStateOrCompact('thread-1', 'org-1'),
    );

    expect(state).toMatchObject({
      data: { currentArtifact: 'org-1 draft' },
      id: 'state-org-1',
      isDeleted: false,
    });
  });
});
