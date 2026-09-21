import { NullTypedDecisionProvider } from '@api/services/typed-decisions/providers/null-typed-decision.provider';
import { TypedDecisionRateLimitError } from '@api/services/typed-decisions/typed-decision.errors';
import { TypedDecisionService } from '@api/services/typed-decisions/typed-decision.service';
import type { TypedDecisionProviderResolver } from '@api/services/typed-decisions/typed-decision-provider.resolver';
import type { TypedDecisionTelemetryService } from '@api/services/typed-decisions/typed-decision-telemetry.service';
import { TYPED_DECISION_MAX_OPTIONS } from '@api/services/typed-decisions/typed-decisions.constants';
import type {
  TypedDecisionAnswer,
  TypedDecisionCallContext,
  TypedDecisionProvider,
} from '@genfeedai/contracts/interfaces';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const CONTEXT: TypedDecisionCallContext = {
  decisionPoint: 'reply_bot.intent',
  organizationId: 'org_1',
};

const CHOICE_PARAMS = {
  options: ['spam', 'question'] as const,
  question: 'What is this comment?',
  state: { comment: 'buy followers now' },
};

function createProvider(): TypedDecisionProvider {
  return {
    choose: vi.fn(),
    decide: vi.fn(),
    name: 'jev',
    score: vi.fn(),
  };
}

function createHarness(provider: TypedDecisionProvider, timeoutMs = 50) {
  const logger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;
  const telemetry = {
    record: vi.fn(),
  } as unknown as TypedDecisionTelemetryService;
  const configService = {
    get: vi.fn((key: string) =>
      key === 'TYPED_DECISION_TIMEOUT_MS' ? timeoutMs : '',
    ),
  } as unknown as ConfigService;

  const providerResolver = {
    resolve: vi.fn(async () => provider),
  } as unknown as TypedDecisionProviderResolver;

  return {
    logger,
    providerResolver,
    service: new TypedDecisionService(
      providerResolver,
      configService,
      logger,
      telemetry,
    ),
    telemetry,
  };
}

/** Typed access to the doubles without re-casting at every assertion. */
function warnMock(logger: LoggerService) {
  return vi.mocked(logger.warn);
}

function recordMock(telemetry: TypedDecisionTelemetryService) {
  return vi.mocked(telemetry.record);
}

describe('TypedDecisionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('with the null provider', () => {
    it('resolves null on every kind without touching the provider', async () => {
      const provider = new NullTypedDecisionProvider();
      const chooseSpy = vi.spyOn(provider, 'choose');
      const { service, telemetry } = createHarness(provider);

      await expect(service.choose(CHOICE_PARAMS, CONTEXT)).resolves.toBeNull();
      await expect(
        service.score({ question: 'How urgent?', state: {} }, CONTEXT),
      ).resolves.toBeNull();
      await expect(
        service.decide({ question: 'Is it spam?', state: {} }, CONTEXT),
      ).resolves.toBeNull();

      expect(chooseSpy).not.toHaveBeenCalled();
      expect(recordMock(telemetry)).not.toHaveBeenCalled();
    });
  });

  describe('provider binding', () => {
    it('re-resolves per call so an operator kill switch lands mid-process', async () => {
      const provider = createProvider();
      const { providerResolver, service } = createHarness(provider);
      vi.mocked(provider.decide).mockResolvedValue({
        confidence: 0.9,
        value: true,
      });

      const params = { question: 'Is it spam?', state: {} };
      await expect(service.decide(params, CONTEXT)).resolves.not.toBeNull();

      vi.mocked(providerResolver.resolve).mockResolvedValue(
        new NullTypedDecisionProvider(),
      );

      await expect(service.decide(params, CONTEXT)).resolves.toBeNull();
      expect(vi.mocked(provider.decide)).toHaveBeenCalledTimes(1);
    });
  });

  describe('happy paths', () => {
    it('returns a choice answer and records it', async () => {
      const provider = createProvider();
      vi.mocked(provider.choose).mockResolvedValue({
        confidence: 0.91,
        usage: {
          inputTokens: 120,
          model: 'jev-latest',
          outputTokens: 12,
          vendorCostMicros: 400,
        },
        value: 'spam',
      });
      const { service, telemetry } = createHarness(provider);

      await expect(
        service.choose(CHOICE_PARAMS, {
          ...CONTEXT,
          deterministicAnswer: 'spam',
          mode: 'shadow',
        }),
      ).resolves.toMatchObject({
        confidence: 0.91,
        value: 'spam',
      });
      expect(recordMock(telemetry)).toHaveBeenCalledWith(
        expect.objectContaining({
          answer: 'spam',
          confidence: 0.91,
          decisionPoint: 'reply_bot.intent',
          deterministicAnswer: 'spam',
          kind: 'choice',
          mode: 'shadow',
          provider: 'jev',
          usage: expect.objectContaining({ vendorCostMicros: 400 }),
        }),
      );
    });

    it('returns a score answer', async () => {
      const provider = createProvider();
      vi.mocked(provider.score).mockResolvedValue({
        confidence: 0.7,
        value: 0.42,
      });
      const { service, telemetry } = createHarness(provider);

      await expect(
        service.score({ question: 'How urgent?', state: {} }, CONTEXT),
      ).resolves.toEqual({ confidence: 0.7, value: 0.42 });
      expect(recordMock(telemetry)).toHaveBeenCalledWith(
        expect.objectContaining({ answer: 0.42, kind: 'score', mode: 'live' }),
      );
    });

    it('returns a boolean answer', async () => {
      const provider = createProvider();
      vi.mocked(provider.decide).mockResolvedValue({
        confidence: 0.88,
        value: true,
      });
      const { service, telemetry } = createHarness(provider);

      await expect(
        service.decide({ question: 'Is it spam?', state: {} }, CONTEXT),
      ).resolves.toEqual({ confidence: 0.88, value: true });
      expect(recordMock(telemetry)).toHaveBeenCalledWith(
        expect.objectContaining({ answer: true, kind: 'boolean' }),
      );
    });
  });

  describe('failures', () => {
    it('resolves null and warns once when the provider exceeds the budget', async () => {
      const provider = createProvider();
      let abortSignal: AbortSignal | undefined;
      vi.mocked(provider.decide).mockImplementation(
        async (_params, options) => {
          abortSignal = options?.signal;
          return new Promise<never>(() => {});
        },
      );
      const { logger, service, telemetry } = createHarness(provider, 10);

      await expect(
        service.decide({ question: 'Is it spam?', state: {} }, CONTEXT),
      ).resolves.toBeNull();

      expect(warnMock(logger)).toHaveBeenCalledTimes(1);
      expect(abortSignal?.aborted).toBe(true);
      expect(recordMock(telemetry)).toHaveBeenCalledWith(
        expect.objectContaining({ failureReason: 'timeout' }),
      );
    });

    it('resolves null when the provider throws', async () => {
      const provider = createProvider();
      vi.mocked(provider.choose).mockRejectedValue(new Error('socket hang up'));
      const { logger, service, telemetry } = createHarness(provider);

      await expect(service.choose(CHOICE_PARAMS, CONTEXT)).resolves.toBeNull();

      expect(warnMock(logger)).toHaveBeenCalledTimes(1);
      expect(recordMock(telemetry)).toHaveBeenCalledWith(
        expect.objectContaining({ failureReason: 'error' }),
      );
    });

    it('surfaces a 429 cooldown to telemetry', async () => {
      const provider = createProvider();
      vi.mocked(provider.choose).mockRejectedValue(
        new TypedDecisionRateLimitError(30),
      );
      const { service, telemetry } = createHarness(provider);

      await expect(service.choose(CHOICE_PARAMS, CONTEXT)).resolves.toBeNull();

      expect(recordMock(telemetry)).toHaveBeenCalledWith(
        expect.objectContaining({
          failureReason: 'rate_limited',
          retryAfterSeconds: 30,
        }),
      );
    });

    it('rejects a malformed answer rather than passing it on', async () => {
      const provider = createProvider();
      // Off-menu value and an out-of-range confidence: both disqualify it.
      const malformed = {
        confidence: 4.2,
        value: 'not-an-option',
      } as unknown as TypedDecisionAnswer<'spam' | 'question'>;
      vi.mocked(provider.choose).mockResolvedValue(malformed);
      const { logger, service, telemetry } = createHarness(provider);

      await expect(service.choose(CHOICE_PARAMS, CONTEXT)).resolves.toBeNull();

      expect(warnMock(logger)).toHaveBeenCalledTimes(1);
      expect(recordMock(telemetry)).toHaveBeenCalledWith(
        expect.objectContaining({ failureReason: 'malformed' }),
      );
    });

    it('records an unavailable provider without a warn', async () => {
      const provider = createProvider();
      vi.mocked(provider.decide).mockResolvedValue(null);
      const { logger, service, telemetry } = createHarness(provider);

      await expect(
        service.decide({ question: 'Is it spam?', state: {} }, CONTEXT),
      ).resolves.toBeNull();

      expect(warnMock(logger)).not.toHaveBeenCalled();
      expect(recordMock(telemetry)).toHaveBeenCalledWith(
        expect.objectContaining({ failureReason: 'unavailable' }),
      );
    });
  });

  describe('call-site programming errors', () => {
    it('throws when a choice exceeds the option ceiling', async () => {
      const provider = createProvider();
      const { service } = createHarness(provider);
      const options = Array.from(
        { length: TYPED_DECISION_MAX_OPTIONS + 1 },
        (_value, index) => `option_${index}`,
      );

      await expect(
        service.choose({ ...CHOICE_PARAMS, options }, CONTEXT),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(provider.choose).not.toHaveBeenCalled();
    });

    it('throws when a choice has no options', async () => {
      const { service } = createHarness(createProvider());

      await expect(
        service.choose({ ...CHOICE_PARAMS, options: [] }, CONTEXT),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts exactly the option ceiling', async () => {
      const provider = createProvider();
      vi.mocked(provider.choose).mockResolvedValue(null);
      const { service } = createHarness(provider);
      const options = Array.from(
        { length: TYPED_DECISION_MAX_OPTIONS },
        (_value, index) => `option_${index}`,
      );

      await expect(
        service.choose({ ...CHOICE_PARAMS, options }, CONTEXT),
      ).resolves.toBeNull();
      expect(provider.choose).toHaveBeenCalledTimes(1);
    });
  });

  it('survives a telemetry recorder that is not wired up', async () => {
    const provider = createProvider();
    vi.mocked(provider.decide).mockResolvedValue({
      confidence: 0.6,
      value: false,
    });
    const configService = {
      get: vi.fn(() => 50),
    } as unknown as ConfigService;
    const logger = { warn: vi.fn() } as unknown as LoggerService;
    const providerResolver = {
      resolve: vi.fn(async () => provider),
    } as unknown as TypedDecisionProviderResolver;
    const service = new TypedDecisionService(
      providerResolver,
      configService,
      logger,
    );

    await expect(
      service.decide({ question: 'Is it spam?', state: {} }, CONTEXT),
    ).resolves.toEqual({ confidence: 0.6, value: false });
  });
});
