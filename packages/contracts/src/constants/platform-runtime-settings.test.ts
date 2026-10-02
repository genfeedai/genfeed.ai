import { describe, expect, it } from 'vitest';
import { parsePlatformFeatureSettings } from './platform-feature-settings.constant';

describe('admin runtime product settings', () => {
  it('uses bounded typed defaults rather than deployment env', () => {
    const settings = parsePlatformFeatureSettings({});
    expect(settings.agentContextWindowSize).toBe(5);
    expect(settings.generationMaxTokens).toBe(4000);
    expect(settings.trainingCreditsCost).toBe(500);
    expect(settings.customModelCreditsCost).toBe(5);
    expect(settings.murekaModel).toBe('mureka-9');
    expect(settings.discordChannelIdUsers).toBeNull();
    expect(settings.emailFromAddress).toBeNull();
  });

  it('reads valid operator changes and rejects corrupted persisted values', () => {
    const settings = parsePlatformFeatureSettings({
      agentContextWindowSize: 12,
      generationMaxTokens: -1,
      trainingCreditsCost: 0,
      customModelCreditsCost: Number.NaN,
      discordChannelIdUsers: '123456789012345678',
      emailFromAddress: 'Operator <notifications@example.com>',
    });
    expect(settings.agentContextWindowSize).toBe(12);
    expect(settings.generationMaxTokens).toBe(4000);
    expect(settings.trainingCreditsCost).toBe(0);
    expect(settings.customModelCreditsCost).toBe(5);
    expect(settings.discordChannelIdUsers).toBe('123456789012345678');
    expect(settings.emailFromAddress).toBe(
      'Operator <notifications@example.com>',
    );
  });
});
