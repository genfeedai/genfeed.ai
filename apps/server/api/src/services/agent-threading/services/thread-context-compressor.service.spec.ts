import type { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import type { PlatformFeatureSettingsService } from '@api/feature-flag/platform-feature-settings.service';
import { ThreadContextCompressorService } from '@api/services/agent-threading/services/thread-context-compressor.service';
import type { CacheService } from '@api/services/cache/cache.service';
import type { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { DEFAULT_PLATFORM_FEATURE_SETTINGS } from '@genfeedai/contracts/constants';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { describe, expect, it, vi } from 'vitest';

function buildService(isAgentContextCompressionEnabled: boolean) {
  const agentMessagesService = {
    countMessages: vi.fn(async () => 2),
  };
  const cacheService = { get: vi.fn(async () => null) };
  const prisma = {
    threadContextState: { findFirst: vi.fn(async () => null) },
  };
  const featureSettingsService = {
    getFeatureSettings: vi.fn(async () => ({
      ...DEFAULT_PLATFORM_FEATURE_SETTINGS,
      isAgentContextCompressionEnabled,
    })),
  };
  const service = new ThreadContextCompressorService(
    prisma as unknown as PrismaService,
    agentMessagesService as unknown as AgentMessagesService,
    {} as LlmDispatcherService,
    cacheService as unknown as CacheService,
    { get: vi.fn(() => undefined) } as unknown as ConfigService,
    featureSettingsService as unknown as PlatformFeatureSettingsService,
    { error: vi.fn(), warn: vi.fn() } as unknown as LoggerService,
  );
  return { agentMessagesService, featureSettingsService, service };
}

describe('ThreadContextCompressorService switch (#5407)', () => {
  it('does nothing when compression is off in platform settings', async () => {
    const { agentMessagesService, featureSettingsService, service } =
      buildService(false);

    await expect(
      service.getStateOrCompact('thread-1', 'org-1'),
    ).resolves.toBeNull();
    await service.compressIfNeeded('thread-1', 'org-1');

    expect(featureSettingsService.getFeatureSettings).toHaveBeenCalledTimes(2);
    expect(agentMessagesService.countMessages).not.toHaveBeenCalled();
  });

  it('checks the thread when compression is on', async () => {
    const { agentMessagesService, service } = buildService(true);

    await expect(
      service.getStateOrCompact('thread-1', 'org-1'),
    ).resolves.toBeNull();

    expect(agentMessagesService.countMessages).toHaveBeenCalledWith('thread-1');
  });
});
