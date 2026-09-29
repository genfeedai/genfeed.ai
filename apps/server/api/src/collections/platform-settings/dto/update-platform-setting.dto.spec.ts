import { UpdatePlatformSettingDto } from '@api/collections/platform-settings/dto/update-platform-setting.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

describe('UpdatePlatformSettingDto', () => {
  function validateDto(payload: Record<string, unknown>) {
    return validate(plainToInstance(UpdatePlatformSettingDto, payload));
  }

  it('rejects a negative margin multiplier', async () => {
    const generation = await validateDto({ marginMultiplierGeneration: -1 });
    expect(generation.length).toBeGreaterThan(0);

    const agentChat = await validateDto({ marginMultiplierAgentChat: -1 });
    expect(agentChat.length).toBeGreaterThan(0);
  });

  it('rejects a zero margin multiplier', async () => {
    const generation = await validateDto({ marginMultiplierGeneration: 0 });
    expect(generation.length).toBeGreaterThan(0);

    const agentChat = await validateDto({ marginMultiplierAgentChat: 0 });
    expect(agentChat.length).toBeGreaterThan(0);
  });

  it('rejects a multiplier above the operator safety cap', async () => {
    const generation = await validateDto({ marginMultiplierGeneration: 11 });
    expect(generation.length).toBeGreaterThan(0);

    const agentChat = await validateDto({ marginMultiplierAgentChat: 11 });
    expect(agentChat.length).toBeGreaterThan(0);
  });

  it('rejects a non-numeric margin multiplier', async () => {
    const generation = await validateDto({
      marginMultiplierGeneration: 'high',
    });
    expect(generation.length).toBeGreaterThan(0);

    const agentChat = await validateDto({ marginMultiplierAgentChat: 'high' });
    expect(agentChat.length).toBeGreaterThan(0);
  });

  it('accepts every known margin input mode', async () => {
    await expect(
      validateDto({ marginInputMode: 'MARKUP' }),
    ).resolves.toHaveLength(0);
    await expect(
      validateDto({ marginInputMode: 'MARGIN' }),
    ).resolves.toHaveLength(0);
  });

  it('accepts every known typed-decision provider', async () => {
    await expect(
      validateDto({ typedDecisionProvider: 'none' }),
    ).resolves.toHaveLength(0);
    await expect(
      validateDto({ typedDecisionProvider: 'jev' }),
    ).resolves.toHaveLength(0);
  });

  describe('feature switches (#5407)', () => {
    it.each([
      { taskRoutingDecisionMode: 'live' },
      { patternAnalyzerDecisionMode: 'live' },
      { untrustedContentDecisionMode: 'live' },
    ])(
      'refuses live on a shadow-capped decision point: %o',
      async (payload) => {
        expect((await validateDto(payload)).length).toBeGreaterThan(0);
      },
    );

    it.each([
      { mediaGateVisionMode: 'loud' },
      { moderationProvider: 'acme' },
      { replyBotIntentMinConfidence: 1.2 },
      { modelDiscoveryMinConfidence: -0.1 },
      { mediaPerceptionFrameCount: 25 },
      { mediaPerceptionFrameCount: 2.5 },
      { mediaPerceptionLookbackHours: 0 },
      { isAgentTokenStreamingEnabled: 'true' },
      { systemEventsEnabledAt: 'yesterday' },
      { moderationThresholds: { nudity: 0.5 } },
      { moderationThresholds: { sexual: 1.5 } },
      { moderationThresholds: 'sexual=0.5' },
    ])('rejects %o', async (payload) => {
      expect((await validateDto(payload)).length).toBeGreaterThan(0);
    });
  });

  it.each([[{ app_switcher_studio: false }], [{ studio: 'false' }], [[false]]])(
    'rejects an unregistered key or a non-boolean flag (%j)',
    async (flags) => {
      await expect(validateDto({ flags })).resolves.not.toHaveLength(0);
    },
  );
});
