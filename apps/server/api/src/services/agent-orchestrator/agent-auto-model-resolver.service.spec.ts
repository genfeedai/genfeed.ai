import {
  AGENT_AUTO_ROUTING_TIER_DECISION_POINT,
  AGENT_WEB_SEARCH_DECISION_POINT,
  AgentAutoModelResolverService,
} from '@api/services/agent-orchestrator/agent-auto-model-resolver.service';
import type {
  AgentChatModelRegistryService,
  AgentChatRegistryRow,
} from '@api/services/agent-orchestrator/agent-chat-model-registry.service';
import type { AgentAutoRoutingResolveParams } from '@api/services/agent-orchestrator/interfaces/agent-auto-routing.interface';
import type { TypedDecisionService } from '@api/services/typed-decisions/typed-decision.service';
import {
  AgentChatRoutingTier,
  ModelLifecycle,
  ModelProvider,
} from '@genfeedai/contracts';
import { AGENT_CHAT_MODEL_KEYS } from '@genfeedai/contracts/constants';
import { testId } from '@helpers/testing/test-id.helper';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * #4865. The Jev adapter is not exercised here on purpose: `TypedDecisionService`
 * is the contract these call sites depend on, and it already guarantees `null`
 * for every provider failure.
 */

const DEFAULT_MODEL_KEY = AGENT_CHAT_MODEL_KEYS.OPENROUTER_AUTO;

function candidate(
  key: string,
  cost: number,
  isReasoning = false,
): AgentChatRegistryRow {
  return {
    cost,
    isActive: true,
    isDefault: false,
    isDiscovered: false,
    isFree: false,
    isReasoning,
    key,
    label: key,
    lifecycle: ModelLifecycle.RECOMMENDED,
    pricing: null,
    provider: ModelProvider.OPENROUTER,
    reviewStatus: null,
    succeededBy: null,
  };
}

const CANDIDATES = [
  candidate('vendor/cheap', 1),
  candidate('vendor/mid', 5),
  candidate('vendor/reasoner', 9, true),
];

type Harness = {
  configService: { get: ReturnType<typeof vi.fn> };
  logger: { log: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> };
  registry: {
    getAutoAllowedModelKeys: ReturnType<typeof vi.fn>;
    listAutoCandidates: ReturnType<typeof vi.fn>;
  };
  service: AgentAutoModelResolverService;
  typedDecisions: {
    choose: ReturnType<typeof vi.fn>;
    decide: ReturnType<typeof vi.fn>;
  };
};

function createHarness(
  env: Record<string, unknown> = { AGENT_AUTO_ROUTING_DECISION_MODE: 'live' },
): Harness {
  const typedDecisions = {
    choose: vi.fn().mockResolvedValue(null),
    decide: vi.fn().mockResolvedValue(null),
  };
  const registry = {
    getAutoAllowedModelKeys: vi
      .fn()
      .mockResolvedValue(CANDIDATES.map((row) => row.key)),
    listAutoCandidates: vi.fn().mockResolvedValue(CANDIDATES),
  };
  const configService = { get: vi.fn((key: string) => env[key]) };
  const logger = { log: vi.fn(), warn: vi.fn() };

  return {
    configService,
    logger,
    registry,
    service: new AgentAutoModelResolverService(
      typedDecisions as unknown as TypedDecisionService,
      registry as unknown as AgentChatModelRegistryService,
      configService as unknown as ConfigService,
      logger as unknown as LoggerService,
    ),
    typedDecisions,
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
    it('emits the request unchanged without calling the provider', async () => {
      const harness = createHarness({
        AGENT_AUTO_ROUTING_DECISION_MODE: 'off',
      });

      await expect(harness.service.resolve(resolveParams())).resolves.toEqual({
        mode: 'off',
      });
      expect(harness.typedDecisions.choose).not.toHaveBeenCalled();
      expect(harness.typedDecisions.decide).not.toHaveBeenCalled();
    });

    it('is the default when the env var is unset', async () => {
      const harness = createHarness({});

      await expect(harness.service.resolve(resolveParams())).resolves.toEqual({
        mode: 'off',
      });
      expect(harness.typedDecisions.choose).not.toHaveBeenCalled();
    });
  });

  describe('shadow mode', () => {
    it('logs the tier and the would-be key but dispatches nothing', async () => {
      const harness = createHarness({
        AGENT_AUTO_ROUTING_DECISION_MODE: 'shadow',
      });
      harness.typedDecisions.choose.mockResolvedValue({
        confidence: 0.97,
        value: AgentChatRoutingTier.SIMPLE,
      });
      harness.typedDecisions.decide.mockResolvedValue({
        confidence: 0.99,
        value: true,
      });

      const resolution = await harness.service.resolve(resolveParams());

      expect(resolution).toEqual({
        candidateModelKey: 'vendor/cheap',
        mode: 'shadow',
        tier: AgentChatRoutingTier.SIMPLE,
        tierConfidence: 0.97,
      });
      expect(resolution.dispatchModelKey).toBeUndefined();
      expect(resolution.isWebSearchNeeded).toBeUndefined();
      expect(harness.logger.log).toHaveBeenCalledWith(
        expect.stringContaining('shadow auto-routing decision'),
        expect.objectContaining({
          candidateModelKey: 'vendor/cheap',
          tier: AgentChatRoutingTier.SIMPLE,
          tierConfidence: 0.97,
        }),
      );
    });

    it('sends the mode and the stable decision points to telemetry', async () => {
      const harness = createHarness({
        AGENT_AUTO_ROUTING_DECISION_MODE: 'shadow',
      });

      await harness.service.resolve(
        resolveParams({ latestUserMessage: 'what is trending today' }),
      );

      expect(harness.typedDecisions.choose).toHaveBeenCalledWith(
        expect.objectContaining({
          options: [
            AgentChatRoutingTier.SIMPLE,
            AgentChatRoutingTier.STANDARD,
            AgentChatRoutingTier.COMPLEX,
          ],
        }),
        expect.objectContaining({
          decisionPoint: AGENT_AUTO_ROUTING_TIER_DECISION_POINT,
          mode: 'shadow',
        }),
      );
      // The keyword answer is the shadow report's comparison baseline.
      expect(harness.typedDecisions.decide).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          decisionPoint: AGENT_WEB_SEARCH_DECISION_POINT,
          deterministicAnswer: true,
          mode: 'shadow',
        }),
      );
    });
  });

  describe('live mode', () => {
    it('dispatches the concrete key the tier mapped to, above the threshold', async () => {
      const harness = createHarness();
      harness.typedDecisions.choose.mockResolvedValue({
        confidence: 0.92,
        value: AgentChatRoutingTier.COMPLEX,
      });

      await expect(
        harness.service.resolve(resolveParams()),
      ).resolves.toMatchObject({
        candidateModelKey: 'vendor/reasoner',
        dispatchModelKey: 'vendor/reasoner',
        mode: 'live',
        tier: AgentChatRoutingTier.COMPLEX,
      });
    });

    it('replaces the keyword outcome with a confident web-search answer', async () => {
      const harness = createHarness();
      harness.typedDecisions.decide.mockResolvedValue({
        confidence: 0.9,
        value: true,
      });

      await expect(
        harness.service.resolve(
          resolveParams({ latestUserMessage: 'rewrite this paragraph' }),
        ),
      ).resolves.toMatchObject({ isWebSearchNeeded: true });
    });

    it('falls back when the provider is unavailable', async () => {
      const harness = createHarness();

      await expect(harness.service.resolve(resolveParams())).resolves.toEqual({
        mode: 'live',
      });
    });

    it('falls back below the confidence threshold', async () => {
      const harness = createHarness();
      harness.typedDecisions.choose.mockResolvedValue({
        confidence: 0.6,
        value: AgentChatRoutingTier.COMPLEX,
      });
      harness.typedDecisions.decide.mockResolvedValue({
        confidence: 0.6,
        value: true,
      });

      const resolution = await harness.service.resolve(resolveParams());

      expect(resolution.dispatchModelKey).toBeUndefined();
      expect(resolution.isWebSearchNeeded).toBeUndefined();
      // Still recorded, so the threshold can be tuned from telemetry.
      expect(resolution.tierConfidence).toBe(0.6);
    });

    it('honours a configured threshold that the answer clears', async () => {
      const harness = createHarness({
        AGENT_AUTO_ROUTING_DECISION_MODE: 'live',
        AGENT_AUTO_ROUTING_MIN_CONFIDENCE: 0.5,
      });
      harness.typedDecisions.choose.mockResolvedValue({
        confidence: 0.6,
        value: AgentChatRoutingTier.SIMPLE,
      });

      await expect(
        harness.service.resolve(resolveParams()),
      ).resolves.toMatchObject({ dispatchModelKey: 'vendor/cheap' });
    });

    it('falls back when the chosen key left the allow-list mid-turn', async () => {
      const harness = createHarness();
      harness.typedDecisions.choose.mockResolvedValue({
        confidence: 0.99,
        value: AgentChatRoutingTier.COMPLEX,
      });
      harness.registry.getAutoAllowedModelKeys.mockResolvedValue([
        'vendor/cheap',
      ]);

      const resolution = await harness.service.resolve(resolveParams());

      expect(resolution.candidateModelKey).toBe('vendor/reasoner');
      expect(resolution.dispatchModelKey).toBeUndefined();
      expect(harness.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('left the auto allow-list'),
        expect.objectContaining({ modelKey: 'vendor/reasoner' }),
      );
    });

    it('never throws when the registry read fails', async () => {
      const harness = createHarness();
      harness.typedDecisions.choose.mockResolvedValue({
        confidence: 0.99,
        value: AgentChatRoutingTier.SIMPLE,
      });
      harness.registry.listAutoCandidates.mockRejectedValue(
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
    it('asks nothing for an explicitly chosen model', async () => {
      const harness = createHarness();

      await expect(
        harness.service.resolve(
          resolveParams({
            defaultModelKey: AGENT_CHAT_MODEL_KEYS.OPENROUTER_AUTO,
            model: 'vendor/mid',
          }),
        ),
      ).resolves.toEqual({ mode: 'live' });
      expect(harness.typedDecisions.choose).not.toHaveBeenCalled();
      expect(harness.typedDecisions.decide).not.toHaveBeenCalled();
    });

    it('skips the web-search question on onboarding turns', async () => {
      const harness = createHarness();

      await harness.service.resolve(resolveParams({ source: 'onboarding' }));

      expect(harness.typedDecisions.choose).toHaveBeenCalledTimes(1);
      expect(harness.typedDecisions.decide).not.toHaveBeenCalled();
    });

    it('bounds the user message before it leaves the app', async () => {
      const harness = createHarness();

      await harness.service.resolve(
        resolveParams({ latestUserMessage: 'x'.repeat(5_000) }),
      );

      const [choiceParams] = harness.typedDecisions.choose.mock.calls[0] as [
        { state: { latestUserMessage: string } },
      ];
      expect(choiceParams.state.latestUserMessage).toHaveLength(2_000);
    });
  });
});
