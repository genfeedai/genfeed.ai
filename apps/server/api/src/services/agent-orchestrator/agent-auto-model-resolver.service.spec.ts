import { AgentAutoModelResolverService } from '@api/services/agent-orchestrator/agent-auto-model-resolver.service';
import type { AgentChatModelRegistryService } from '@api/services/agent-orchestrator/agent-chat-model-registry.service';
import type { AgentAutoRoutingResolveParams } from '@api/services/agent-orchestrator/interfaces/agent-auto-routing.interface';
import { RouterPriority } from '@genfeedai/contracts';
import { AGENT_CHAT_MODEL_KEYS } from '@genfeedai/contracts/constants';
import { testId } from '@helpers/testing/test-id.helper';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Release-blocker follow-up to #4865 (epic #4863): auto-model routing is now
 * a deterministic read of the Admin-configured model registry. No
 * typed-decision provider (Jev) is involved, so there is nothing to mock
 * here beyond the registry itself.
 */

const DEFAULT_MODEL_KEY = AGENT_CHAT_MODEL_KEYS.OPENROUTER_AUTO;

type Harness = {
  configService: { get: ReturnType<typeof vi.fn> };
  logger: { log: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> };
  registry: {
    getAutoAllowedModelKeys: ReturnType<typeof vi.fn>;
    getCheapestSelectableKey: ReturnType<typeof vi.fn>;
    getDefaultModelKey: ReturnType<typeof vi.fn>;
  };
  service: AgentAutoModelResolverService;
};

function createHarness(
  env: Record<string, unknown> = { AGENT_AUTO_ROUTING_DECISION_MODE: 'live' },
): Harness {
  const registry = {
    getAutoAllowedModelKeys: vi
      .fn()
      .mockResolvedValue(['vendor/default', 'vendor/cheap']),
    getCheapestSelectableKey: vi.fn().mockResolvedValue('vendor/cheap'),
    getDefaultModelKey: vi.fn().mockResolvedValue('vendor/default'),
  };
  const configService = { get: vi.fn((key: string) => env[key]) };
  const logger = { log: vi.fn(), warn: vi.fn() };

  return {
    configService,
    logger,
    registry,
    service: new AgentAutoModelResolverService(
      registry as unknown as AgentChatModelRegistryService,
      configService as unknown as ConfigService,
      logger as unknown as LoggerService,
    ),
  };
}

function resolveParams(
  overrides: Partial<AgentAutoRoutingResolveParams> = {},
): AgentAutoRoutingResolveParams {
  return {
    defaultModelKey: DEFAULT_MODEL_KEY,
    hasPreviousRoundUsedTools: false,
    hasToolsAvailable: true,
    latestUserMessage: 'Draft three hooks for the launch post.',
    model: AGENT_CHAT_MODEL_KEYS.OPENROUTER_AUTO,
    organizationId: testId('org'),
    roundNumber: 1,
    threadId: testId('thread'),
    userId: testId('user'),
    ...overrides,
  };
}

describe('AgentAutoModelResolverService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('off mode', () => {
    it('emits the request unchanged without reading the registry default', async () => {
      const harness = createHarness({
        AGENT_AUTO_ROUTING_DECISION_MODE: 'off',
      });

      await expect(harness.service.resolve(resolveParams())).resolves.toEqual({
        mode: 'off',
      });
      expect(harness.registry.getDefaultModelKey).not.toHaveBeenCalled();
    });

    it('is the default when the env var is unset', async () => {
      const harness = createHarness({});

      await expect(harness.service.resolve(resolveParams())).resolves.toEqual({
        mode: 'off',
      });
    });
  });

  describe('shadow mode', () => {
    it('logs the candidate but dispatches nothing', async () => {
      const harness = createHarness({
        AGENT_AUTO_ROUTING_DECISION_MODE: 'shadow',
      });

      const resolution = await harness.service.resolve(resolveParams());

      expect(resolution).toEqual({
        candidateModelKey: 'vendor/default',
        mode: 'shadow',
      });
      expect(resolution.dispatchModelKey).toBeUndefined();
      expect(harness.logger.log).toHaveBeenCalledWith(
        expect.stringContaining('shadow auto-routing decision'),
        expect.objectContaining({ candidateModelKey: 'vendor/default' }),
      );
    });
  });

  describe('live mode', () => {
    it('dispatches the Admin-configured default model', async () => {
      const harness = createHarness();

      await expect(harness.service.resolve(resolveParams())).resolves.toEqual({
        candidateModelKey: 'vendor/default',
        dispatchModelKey: 'vendor/default',
        mode: 'live',
      });
    });

    it('dispatches the cheapest selectable model when prioritizing cost', async () => {
      const harness = createHarness();

      await expect(
        harness.service.resolve(
          resolveParams({ prioritize: RouterPriority.COST }),
        ),
      ).resolves.toMatchObject({
        candidateModelKey: 'vendor/cheap',
        dispatchModelKey: 'vendor/cheap',
      });
      expect(harness.registry.getDefaultModelKey).not.toHaveBeenCalled();
    });

    it('dispatches the cheapest selectable model when prioritizing speed', async () => {
      const harness = createHarness();

      await expect(
        harness.service.resolve(
          resolveParams({ prioritize: RouterPriority.SPEED }),
        ),
      ).resolves.toMatchObject({ dispatchModelKey: 'vendor/cheap' });
    });

    it('falls back when the Admin default left the allow-list', async () => {
      const harness = createHarness();
      harness.registry.getAutoAllowedModelKeys.mockResolvedValue([
        'vendor/cheap',
      ]);

      const resolution = await harness.service.resolve(resolveParams());

      expect(resolution.candidateModelKey).toBe('vendor/default');
      expect(resolution.dispatchModelKey).toBeUndefined();
      expect(harness.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('left the auto allow-list'),
        expect.objectContaining({ modelKey: 'vendor/default' }),
      );
    });

    it('never throws when the registry read fails', async () => {
      const harness = createHarness();
      harness.registry.getDefaultModelKey.mockRejectedValue(
        new Error('registry unavailable'),
      );

      await expect(harness.service.resolve(resolveParams())).resolves.toEqual({
        mode: 'live',
      });
      expect(harness.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('auto-routing resolution failed'),
        expect.objectContaining({ error: 'registry unavailable' }),
      );
    });
  });

  describe('eligibility', () => {
    it('does nothing for an explicitly chosen model', async () => {
      const harness = createHarness();

      await expect(
        harness.service.resolve(
          resolveParams({
            defaultModelKey: AGENT_CHAT_MODEL_KEYS.OPENROUTER_AUTO,
            model: 'vendor/mid',
          }),
        ),
      ).resolves.toEqual({ mode: 'live' });
      expect(harness.registry.getDefaultModelKey).not.toHaveBeenCalled();
    });
  });
});
