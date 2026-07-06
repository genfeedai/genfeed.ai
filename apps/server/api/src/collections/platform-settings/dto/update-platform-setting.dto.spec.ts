import { UpdatePlatformSettingDto } from '@api/collections/platform-settings/dto/update-platform-setting.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

describe('UpdatePlatformSettingDto', () => {
  function validateDto(payload: Record<string, unknown>) {
    return validate(plainToInstance(UpdatePlatformSettingDto, payload));
  }

  it('accepts a positive margin multiplier', async () => {
    await expect(validateDto({ marginMultiplier: 1.25 })).resolves.toHaveLength(
      0,
    );
  });

  it('accepts an empty payload (all fields optional)', async () => {
    await expect(validateDto({})).resolves.toHaveLength(0);
  });

  it('rejects a negative margin multiplier', async () => {
    const errors = await validateDto({ marginMultiplier: -1 });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a zero margin multiplier', async () => {
    const errors = await validateDto({ marginMultiplier: 0 });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a multiplier above the operator safety cap', async () => {
    const errors = await validateDto({ marginMultiplier: 11 });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a non-numeric margin multiplier', async () => {
    const errors = await validateDto({ marginMultiplier: 'high' });
    expect(errors.length).toBeGreaterThan(0);
  });
});
