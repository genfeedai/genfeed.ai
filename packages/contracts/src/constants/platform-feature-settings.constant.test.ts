import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PLATFORM_FEATURE_SETTINGS,
  parseModerationThresholdOverrides,
  parsePlatformFeatureSettings,
} from './platform-feature-settings.constant';

describe('parsePlatformFeatureSettings', () => {
  it('resolves an empty row to the retired env defaults', () => {
    expect(parsePlatformFeatureSettings({})).toEqual(
      DEFAULT_PLATFORM_FEATURE_SETTINGS,
    );
  });

  it('keeps valid stored values', () => {
    const settings = parsePlatformFeatureSettings({
      flags: { studio: false },
      isEmailVerificationRequired: true,
      isMediaPerceptionEnabled: false,
      mediaPerceptionFrameCount: 12,
      mediaPerceptionVisionModel: ' google/gemini ',
      moderationMode: 'live',
      moderationProvider: 'openai',
      replyBotIntentMinConfidence: 0,
      systemEventsEnabledAt: new Date('2026-09-20T10:00:00.000Z'),
    });

    expect(settings).toMatchObject({
      flags: { agent: true, studio: false },
      isEmailVerificationRequired: true,
      isMediaPerceptionEnabled: false,
      mediaPerceptionFrameCount: 12,
      mediaPerceptionVisionModel: 'google/gemini',
      moderationMode: 'live',
      moderationProvider: 'openai',
      replyBotIntentMinConfidence: 0,
      systemEventsEnabledAt: '2026-09-20T10:00:00.000Z',
    });
  });

  it('never resolves live on a shadow-capped decision point', () => {
    const settings = parsePlatformFeatureSettings({
      patternAnalyzerDecisionMode: 'live',
      taskRoutingDecisionMode: 'live',
      untrustedContentDecisionMode: 'live',
    });

    expect(settings.patternAnalyzerDecisionMode).toBe('shadow');
    expect(settings.taskRoutingDecisionMode).toBe('shadow');
    expect(settings.untrustedContentDecisionMode).toBe('off');
  });

  it('fails closed on out-of-range or unknown values', () => {
    const settings = parsePlatformFeatureSettings({
      isAgentTokenStreamingEnabled: 'true',
      mediaGateVisionMode: 'LIVE',
      mediaPerceptionFrameCount: 2.5,
      mediaPerceptionLookbackHours: 721,
      mediaPerceptionVisionModel: '   ',
      moderationProvider: 'acme',
      systemEventsEnabledAt: 'not-a-date',
      untrustedContentMinConfidence: 1.2,
    });

    expect(settings).toMatchObject({
      isAgentTokenStreamingEnabled: false,
      mediaGateVisionMode: 'off',
      mediaPerceptionFrameCount: 6,
      mediaPerceptionLookbackHours: 24,
      mediaPerceptionVisionModel: null,
      moderationProvider: 'none',
      systemEventsEnabledAt: null,
      untrustedContentMinConfidence: 0.95,
    });
  });
});

describe('parseModerationThresholdOverrides', () => {
  it('keeps known categories in range and drops everything else', () => {
    expect(
      parseModerationThresholdOverrides({
        nudity: 0.3,
        sexual: 0.5,
        spam: 2,
        violence: 0,
      }),
    ).toEqual({ sexual: 0.5, violence: 0 });
  });

  it('treats non-objects as no overrides', () => {
    expect(parseModerationThresholdOverrides('sexual=0.5')).toEqual({});
    expect(parseModerationThresholdOverrides([0.5])).toEqual({});
    expect(parseModerationThresholdOverrides(null)).toEqual({});
  });
});
