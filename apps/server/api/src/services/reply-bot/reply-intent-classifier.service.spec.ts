import { ReplyIntentClassifierService } from '@api/services/reply-bot/reply-intent-classifier.service';
import { REPLY_INTENT_DECISION_POINT } from '@api/services/reply-bot/reply-intent-decision.settings';
import type { TypedDecisionService } from '@api/services/typed-decisions/typed-decision.service';
import { REPLY_INTENT_VALUES } from '@genfeedai/contracts/interfaces';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type EnvOverrides = Record<string, string | number>;

const LIVE_ENV: EnvOverrides = {
  REPLY_BOT_INTENT_DECISION_MODE: 'live',
  REPLY_BOT_INTENT_MIN_CONFIDENCE: 0.85,
};

const COMMENT = {
  authorHandle: '@reader',
  brandId: 'brand-1',
  commentText: 'How do you handle multi-tenant auth?',
  organizationId: 'org-1',
  postCaption: 'Shipping multi-tenant auth this week',
};

function createHarness(env: EnvOverrides) {
  const configService = {
    get: vi.fn((key: string) => env[key] ?? ''),
  } as unknown as ConfigService;
  const logger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;
  const typedDecisionService = {
    choose: vi.fn(),
    isProviderBound: vi.fn(async () => true),
  } as unknown as TypedDecisionService;

  return {
    chooseMock: vi.mocked(typedDecisionService.choose),
    isProviderBoundMock: vi.mocked(typedDecisionService.isProviderBound),
    logger,
    service: new ReplyIntentClassifierService(
      configService,
      logger,
      typedDecisionService,
    ),
  };
}

describe('ReplyIntentClassifierService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('operator override', () => {
    it('wins over the regex and never calls the provider', async () => {
      const { chooseMock, service } = createHarness(LIVE_ENV);

      await expect(
        service.classify({
          ...COMMENT,
          commentText: 'DM me on telegram t.me/scam check my bio',
          override: 'question',
        }),
      ).resolves.toEqual({
        intent: 'question',
        isAutoSkip: false,
        isNeedsReview: false,
        source: 'human',
      });
      expect(chooseMock).not.toHaveBeenCalled();
    });

    it('ignores a value that is not a reply intent', async () => {
      const { chooseMock, service } = createHarness({
        REPLY_BOT_INTENT_DECISION_MODE: 'off',
      });

      const classification = await service.classify({
        ...COMMENT,
        override: null,
      });

      expect(classification.source).toBe('regex');
      expect(chooseMock).not.toHaveBeenCalled();
    });
  });

  describe('off mode', () => {
    it('keeps the regex answer and its persona', async () => {
      const { chooseMock, service } = createHarness({
        ...LIVE_ENV,
        REPLY_BOT_INTENT_DECISION_MODE: 'off',
      });

      await expect(service.classify(COMMENT)).resolves.toEqual({
        intent: 'question',
        isAutoSkip: false,
        isNeedsReview: false,
        source: 'regex',
      });
      expect(chooseMock).not.toHaveBeenCalled();
    });

    it('auto-skips regex spam, exactly as before the decision', async () => {
      const { service } = createHarness({
        REPLY_BOT_INTENT_DECISION_MODE: 'off',
      });

      await expect(
        service.classify({
          ...COMMENT,
          commentText: 'DM me on telegram t.me/scam check my bio',
        }),
      ).resolves.toMatchObject({
        intent: 'spam',
        isAutoSkip: true,
        isNeedsReview: false,
        source: 'regex',
      });
    });

    it('stays off when no provider is bound, whatever the mode says', async () => {
      const { chooseMock, isProviderBoundMock, service } =
        createHarness(LIVE_ENV);
      isProviderBoundMock.mockResolvedValue(false);

      await expect(service.classify(COMMENT)).resolves.toMatchObject({
        isNeedsReview: false,
        source: 'regex',
      });
      expect(chooseMock).not.toHaveBeenCalled();
    });

    it('never consults the provider binding in off mode', async () => {
      const { isProviderBoundMock, service } = createHarness({
        REPLY_BOT_INTENT_DECISION_MODE: 'off',
      });

      await service.classify(COMMENT);

      expect(isProviderBoundMock).not.toHaveBeenCalled();
    });
  });

  describe('shadow mode', () => {
    it('records the decision but acts on the regex answer', async () => {
      const { chooseMock, service } = createHarness({
        ...LIVE_ENV,
        REPLY_BOT_INTENT_DECISION_MODE: 'shadow',
      });
      chooseMock.mockResolvedValue({ confidence: 0.99, value: 'troll' });

      await expect(service.classify(COMMENT)).resolves.toEqual({
        intent: 'question',
        isAutoSkip: false,
        isNeedsReview: false,
        source: 'regex',
      });

      expect(chooseMock).toHaveBeenCalledWith(
        expect.objectContaining({ options: REPLY_INTENT_VALUES }),
        expect.objectContaining({
          decisionPoint: REPLY_INTENT_DECISION_POINT,
          // Agreement is measured from this, and agreement gates `live`.
          deterministicAnswer: 'question',
          mode: 'shadow',
        }),
      );
    });
  });

  describe('live mode', () => {
    it('acts on a decided intent at or above the threshold', async () => {
      const { chooseMock, service } = createHarness(LIVE_ENV);
      chooseMock.mockResolvedValue({ confidence: 0.85, value: 'troll' });

      await expect(service.classify(COMMENT)).resolves.toEqual({
        confidence: 0.85,
        intent: 'troll',
        isAutoSkip: true,
        isNeedsReview: false,
        source: 'decision',
      });
    });

    it('auto-replies to a confident non-skip intent', async () => {
      const { chooseMock, service } = createHarness(LIVE_ENV);
      chooseMock.mockResolvedValue({ confidence: 0.92, value: 'thanks' });

      await expect(service.classify(COMMENT)).resolves.toMatchObject({
        intent: 'thanks',
        isAutoSkip: false,
        isNeedsReview: false,
        source: 'decision',
      });
    });

    it('queues for review below the threshold — no auto-reply, no auto-skip', async () => {
      const { chooseMock, service } = createHarness(LIVE_ENV);
      chooseMock.mockResolvedValue({ confidence: 0.6, value: 'spam' });

      await expect(service.classify(COMMENT)).resolves.toEqual({
        confidence: 0.6,
        intent: 'question',
        isAutoSkip: false,
        isNeedsReview: true,
        source: 'regex',
      });
    });

    it('treats a null answer exactly like a sub-threshold one', async () => {
      const { chooseMock, service } = createHarness(LIVE_ENV);
      chooseMock.mockResolvedValue(null);

      await expect(service.classify(COMMENT)).resolves.toEqual({
        intent: 'question',
        isAutoSkip: false,
        isNeedsReview: true,
        source: 'regex',
      });
    });

    it('does not auto-skip a comment the regex reads as spam while uncertain', async () => {
      const { chooseMock, service } = createHarness(LIVE_ENV);
      chooseMock.mockResolvedValue(null);

      await expect(
        service.classify({
          ...COMMENT,
          commentText: 'DM me on telegram t.me/scam check my bio',
        }),
      ).resolves.toMatchObject({
        intent: 'spam',
        isAutoSkip: false,
        isNeedsReview: true,
      });
    });

    it('falls back to the conservative default threshold on a bad value', async () => {
      const { chooseMock, service } = createHarness({
        ...LIVE_ENV,
        REPLY_BOT_INTENT_MIN_CONFIDENCE: 'not-a-number',
      });
      chooseMock.mockResolvedValue({ confidence: 0.8, value: 'spam' });

      await expect(service.classify(COMMENT)).resolves.toMatchObject({
        isNeedsReview: true,
      });
    });
  });

  describe('decision state', () => {
    it('sends the comment, the handle, a link flag and the caption — and nothing else', async () => {
      const { chooseMock, service } = createHarness(LIVE_ENV);
      chooseMock.mockResolvedValue({ confidence: 0.9, value: 'spam' });

      await service.classify({
        ...COMMENT,
        commentText: 'grab it at https://example.com/deal',
      });

      const [params, context] = chooseMock.mock.calls[0] ?? [];
      expect(params?.state).toEqual({
        authorHandle: 'reader',
        comment: 'grab it at https://example.com/deal',
        hasLinks: true,
        postCaption: 'Shipping multi-tenant auth this week',
      });
      expect(context).toMatchObject({
        brandId: 'brand-1',
        organizationId: 'org-1',
      });
    });

    it('gives the async path its own budget, not the agent turn timeout', async () => {
      const { chooseMock, service } = createHarness(LIVE_ENV);
      chooseMock.mockResolvedValue({ confidence: 0.9, value: 'default' });

      await service.classify(COMMENT);

      expect(chooseMock.mock.calls[0]?.[1]?.timeoutMs).toBe(2_000);
    });
  });
});
