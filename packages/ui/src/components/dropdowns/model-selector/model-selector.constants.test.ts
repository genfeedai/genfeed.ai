import { RouterPriority } from '@genfeedai/contracts';
import {
  AUTO_MODEL_OPTION_VALUE,
  getAutoModelLabel,
  isAutoGenerationModelKey,
  toGenerationSetupModelKey,
  toStudioSettingsModelKey,
} from '@ui/dropdowns/model-selector/model-selector.constants';
import { describe, expect, it } from 'vitest';

describe('auto generation model keys', () => {
  it('treats empty, sentinel, and legacy auto spellings as Auto', () => {
    expect(isAutoGenerationModelKey('')).toBe(true);
    expect(isAutoGenerationModelKey(AUTO_MODEL_OPTION_VALUE)).toBe(true);
    expect(isAutoGenerationModelKey('auto')).toBe(true);
    expect(isAutoGenerationModelKey(undefined)).toBe(true);
    expect(isAutoGenerationModelKey('google/nano-banana-pro')).toBe(false);
  });

  it('maps Auto to the generation-setup empty sentinel and Studio persist token', () => {
    expect(toGenerationSetupModelKey(AUTO_MODEL_OPTION_VALUE)).toBe('');
    expect(toGenerationSetupModelKey('auto')).toBe('');
    expect(toStudioSettingsModelKey('')).toBe(AUTO_MODEL_OPTION_VALUE);
    expect(toStudioSettingsModelKey(undefined)).toBe(AUTO_MODEL_OPTION_VALUE);
    expect(toStudioSettingsModelKey('google/nano-banana-pro')).toBe(
      'google/nano-banana-pro',
    );
  });

  it('keeps the Auto priority label for the model picker', () => {
    expect(getAutoModelLabel(RouterPriority.BALANCED)).toBe('Auto · Balanced');
  });
});
