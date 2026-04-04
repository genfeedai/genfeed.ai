import { BotPlatform } from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';

import {
  BotsLivestreamRuntimeService,
  type LivestreamPlatformState,
} from './bots-livestream-runtime.service';

describe('BotsLivestreamRuntimeService', () => {
  const service = new BotsLivestreamRuntimeService();

  describe('resolveContextState', () => {
    it('prefers transcript context when no override is active', () => {
      const now = new Date('2026-03-11T12:00:00.000Z');

      const result = service.resolveContextState(
        {
          currentTopic: 'agent reliability',
          transcriptConfidence: 0.88,
          transcriptSummary: 'The hosts are debating agent reliability.',
        },
        now,
      );

      expect(result.currentTopic).toBe('agent reliability');
      expect(result.source).toBe('transcript');
    });

    it('uses manual override when it has not expired', () => {
      const now = new Date('2026-03-11T12:00:00.000Z');

      const result = service.resolveContextState(
        {
          currentTopic: 'agent reliability',
          manualOverride: {
            expiresAt: new Date('2026-03-11T12:10:00.000Z'),
            promotionAngle: 'promote the live workshop',
            topic: 'voice agents',
          },
          transcriptConfidence: 0.92,
          transcriptSummary: 'Hosts are talking about agent reliability.',
        },
        now,
      );

      expect(result.currentTopic).toBe('voice agents');
      expect(result.promotionAngle).toBe('promote the live workshop');
      expect(result.source).toBe('manual_override');
    });

    it('falls back to manual override when transcript confidence is too low', () => {
      const now = new Date('2026-03-11T12:00:00.000Z');

      const result = service.resolveContextState(
        {
          manualOverride: {
            expiresAt: new Date('2026-03-11T12:10:00.000Z'),
            topic: 'open-source AI',
          },
          transcriptConfidence: 0.22,
          transcriptSummary: 'inaudible noise',
        },
        now,
      );

      expect(result.currentTopic).toBe('open-source AI');
      expect(result.source).toBe('manual_override');
    });
  });

  describe('getDeliveryEligibility', () => {
    const settings = {
      maxAutoPostsPerHour: 6,
      minimumMessageGapSeconds: 90,
    };

    it('blocks a delivery when the minimum gap has not elapsed', () => {
      const now = new Date('2026-03-11T12:01:00.000Z');
      const state: LivestreamPlatformState = {
        hourlyPostCount: 1,
        lastPostedAt: new Date('2026-03-11T12:00:15.000Z'),
        platform: BotPlatform.YOUTUBE,
      };

      const result = service.getDeliveryEligibility(state, settings, now);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('cooldown');
    });

    it('blocks a delivery when the hourly cap has been reached', () => {
      const now = new Date('2026-03-11T12:45:00.000Z');
      const state: LivestreamPlatformState = {
        hourlyPostCount: 6,
        hourWindowStartedAt: new Date('2026-03-11T12:00:00.000Z'),
        lastPostedAt: new Date('2026-03-11T12:20:00.000Z'),
        platform: BotPlatform.TWITCH,
      };

      const result = service.getDeliveryEligibility(state, settings, now);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('hourly_cap');
    });
  });

  describe('buildContextAwareQuestion', () => {
    it('renders a context-aware question from the active topic', () => {
      const result = service.buildContextAwareQuestion(
        {
          currentTopic: 'AI coding copilots',
          source: 'manual_override',
        },
        [
          {
            enabled: true,
            id: 'context-template',
            text: 'What are you seeing with {{topic}} right now?',
            type: 'context_aware_question',
          },
        ],
      );

      expect(result).toBe(
        'What are you seeing with AI coding copilots right now?',
      );
    });

    it('skips context-aware generation when no reliable topic exists', () => {
      const result = service.buildContextAwareQuestion(
        {
          source: 'none',
        },
        [
          {
            enabled: true,
            id: 'context-template',
            text: 'What are you seeing with {{topic}} right now?',
            type: 'context_aware_question',
          },
        ],
      );

      expect(result).toBeNull();
    });
  });
});
