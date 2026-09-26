import { UpdatePlatformSettingDto } from '@api/collections/platform-settings/dto/update-platform-setting.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

describe('UpdatePlatformSettingDto', () => {
  function validateDto(payload: Record<string, unknown>) {
    return validate(plainToInstance(UpdatePlatformSettingDto, payload));
  }

  it('accepts a positive generation margin multiplier', async () => {
    await expect(
      validateDto({ marginMultiplierGeneration: 3.5 }),
    ).resolves.toHaveLength(0);
  });

  it('accepts a positive agent-chat margin multiplier', async () => {
    await expect(
      validateDto({ marginMultiplierAgentChat: 1.25 }),
    ).resolves.toHaveLength(0);
  });

  it('accepts an empty payload (all fields optional)', async () => {
    await expect(validateDto({})).resolves.toHaveLength(0);
  });

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

  it('rejects a margin input mode this deployment does not know', async () => {
    const errors = await validateDto({ marginInputMode: 'discount' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('accepts every known typed-decision provider', async () => {
    await expect(
      validateDto({ typedDecisionProvider: 'none' }),
    ).resolves.toHaveLength(0);
    await expect(
      validateDto({ typedDecisionProvider: 'jev' }),
    ).resolves.toHaveLength(0);
  });

  it('rejects a typed-decision provider this deployment does not know', async () => {
    const errors = await validateDto({
      typedDecisionProvider: 'some-future-vendor',
    });
    expect(errors.length).toBeGreaterThan(0);
  });
});
