import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PLATFORM_FEATURE_SETTINGS,
  PLATFORM_FEATURE_FLAG_KEYS,
  parseModerationThresholdOverrides,
  parsePlatformFeatureSettings,
  platformFeatureSettingsFromFlags,
  SAAS_UNRESOLVED_PLATFORM_FEATURE_SETTINGS,
} from './platform-feature-settings.constant';

describe('parsePlatformFeatureSettings', () => {
  it('resolves an empty row to the retired env defaults', () => {
    expect(parsePlatformFeatureSettings({})).toEqual(
      DEFAULT_PLATFORM_FEATURE_SETTINGS,
    );
  });

  it('keeps valid stored values', () => {
    const settings = parsePlatformFeatureSettings({
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

describe('platformFeatureSettingsFromFlags (#5468)', () => {
  it('treats every omitted flag as off, because PostHog omits inactive flags', () => {
    expect(platformFeatureSettingsFromFlags({})).toMatchObject({
      agentAutoRoutingDecisionMode: 'off',
      isAgentContextCompressionEnabled: false,
      isEmailVerificationRequired: false,
      isMediaPerceptionEnabled: false,
      moderationMode: 'off',
      patternAnalyzerDecisionMode: 'off',
      systemEventsEnabledAt: null,
      taskRoutingDecisionMode: 'off',
    });
  });

  it('keeps payload defaults for an enabled flag without a payload', () => {
    expect(
      platformFeatureSettingsFromFlags({ media_perception: { enabled: true } }),
    ).toMatchObject({
      isMediaPerceptionEnabled: true,
      mediaPerceptionFrameCount: 6,
      mediaPerceptionLookbackHours: 24,
    });
  });

  it('maps booleans, variants and payloads', () => {
    const settings = platformFeatureSettingsFromFlags({
      agent_token_streaming: { enabled: true },
      media_perception: {
        enabled: true,
        payload: '{"frameCount":12,"lookbackHours":48,"visionModel":"x/y"}',
      },
      media_text_gate: {
        enabled: true,
        payload: { minConfidence: 0.9 },
        variant: 'live',
      },
      moderation: {
        enabled: true,
        payload: { provider: 'openai', thresholds: { sexual: 0.4 } },
        variant: 'live',
      },
      require_email_verification: { enabled: true },
      system_events_recording: {
        enabled: true,
        payload: { since: '2026-09-20T10:00:00.000Z' },
      },
    });

    expect(settings).toMatchObject({
      isAgentTokenStreamingEnabled: true,
      isEmailVerificationRequired: true,
      isMediaPerceptionEnabled: true,
      mediaPerceptionFrameCount: 12,
      mediaPerceptionLookbackHours: 48,
      mediaPerceptionVisionModel: 'x/y',
      mediaTextGateDecisionMode: 'live',
      mediaTextGateMinConfidence: 0.9,
      moderationMode: 'live',
      moderationProvider: 'openai',
      moderationThresholds: { sexual: 0.4 },
      systemEventsEnabledAt: '2026-09-20T10:00:00.000Z',
    });
  });

  it('turns a disabled mode flag off rather than keeping its default', () => {
    const settings = platformFeatureSettingsFromFlags({
      moderation: { enabled: false },
      task_routing_decision: { enabled: false },
    });

    expect(settings.moderationMode).toBe('off');
    expect(settings.taskRoutingDecisionMode).toBe('off');
  });

  it('never goes live on a shadow-capped decision point', () => {
    const settings = platformFeatureSettingsFromFlags({
      pattern_analyzer_decision: { enabled: true, variant: 'live' },
      task_routing_decision: { enabled: true, variant: 'live' },
      untrusted_content_decision: { enabled: true, variant: 'live' },
    });

    expect(settings.patternAnalyzerDecisionMode).toBe('shadow');
    expect(settings.taskRoutingDecisionMode).toBe('shadow');
    expect(settings.untrustedContentDecisionMode).toBe('off');
  });

  it('keeps system events off when enabled without a start time', () => {
    expect(
      platformFeatureSettingsFromFlags({
        system_events_recording: { enabled: true, payload: 'not json' },
      }).systemEventsEnabledAt,
    ).toBeNull();
  });

  it('fails closed on an unknown variant or a malformed payload', () => {
    const settings = platformFeatureSettingsFromFlags({
      media_gate_vision: { enabled: true, variant: 'loud' },
      media_perception: { enabled: true, payload: '{"frameCount":99}' },
    });

    expect(settings.mediaGateVisionMode).toBe('off');
    expect(settings.mediaPerceptionFrameCount).toBe(6);
  });

  it('uses distinct PostHog keys for every switch', () => {
    const keys = Object.values(PLATFORM_FEATURE_FLAG_KEYS);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('keeps production posture in the unresolved SaaS profile', () => {
    expect(SAAS_UNRESOLVED_PLATFORM_FEATURE_SETTINGS).toMatchObject({
      isEmailVerificationRequired: true,
      isMediaPerceptionEnabled: false,
    });
  });
});
