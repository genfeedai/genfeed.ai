import { describe, expect, it } from 'vitest';
import {
  extractBrandFromKey,
  getBrandConfig,
  MODEL_BRANDS,
} from './model-brands.constant';

describe('MODEL_BRANDS', () => {
  it('assigns a local icon key to every catalog brand', () => {
    const missingIconKeys = Object.entries(MODEL_BRANDS)
      .filter(([, config]) => !config.iconKey)
      .map(([slug]) => slug);

    expect(missingIconKeys).toEqual([]);
  });
});

describe('extractBrandFromKey', () => {
  it('maps unsashed catalog keys to a real brand instead of Unknown', () => {
    expect(extractBrandFromKey('runwayml')).toBe('runwayml');
    expect(extractBrandFromKey('klingai-v2')).toBe('kwaivgi');
    expect(extractBrandFromKey('leonardoai')).toBe('leonardoai');
    expect(extractBrandFromKey('sdxl')).toBe('sdxl');
    expect(extractBrandFromKey('sdxl')).not.toBe('unknown');
  });

  it('keeps slashed keys on their provider prefix', () => {
    expect(extractBrandFromKey('genfeed-ai/flux2-dev')).toBe('genfeed-ai');
    expect(extractBrandFromKey('black-forest-labs/flux-schnell')).toBe(
      'black-forest-labs',
    );
  });
});

describe('getBrandConfig', () => {
  it('labels leftover unsashed keys as their product name, not Unknown', () => {
    expect(getBrandConfig(extractBrandFromKey('leonardoai')).label).toBe(
      'Leonardo',
    );
    expect(getBrandConfig(extractBrandFromKey('sdxl')).label).toBe('SDXL');
    expect(getBrandConfig(extractBrandFromKey('runwayml')).label).toBe(
      'Runway',
    );
    expect(getBrandConfig(extractBrandFromKey('klingai-v2')).label).toBe(
      'Kling',
    );
    expect(getBrandConfig(extractBrandFromKey('minimax/h3')).label).toBe(
      'MiniMax',
    );
  });
});
