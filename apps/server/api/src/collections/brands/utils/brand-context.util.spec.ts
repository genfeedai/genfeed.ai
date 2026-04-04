import { describe, expect, it } from 'vitest';

import {
  buildBrandVoiceSummary,
  buildPromptBrandingFromBrand,
} from './brand-context.util';

type AgentVoice = {
  audience?: string[];
  doNotSoundLike?: string[];
  hashtags?: string[];
  messagingPillars?: string[];
  sampleOutput?: string;
  style?: string;
  taglines?: string[];
  tone?: string;
  values?: string[];
};

function makeBrand(voice?: Partial<AgentVoice> | null) {
  if (voice === null) return { agentConfig: null } as never;
  if (voice === undefined) return undefined;
  return { agentConfig: { voice } } as never;
}

describe('buildPromptBrandingFromBrand', () => {
  it('returns undefined when brand is undefined', () => {
    expect(buildPromptBrandingFromBrand(undefined)).toBeUndefined();
  });

  it('returns undefined when brand has no agentConfig', () => {
    expect(
      buildPromptBrandingFromBrand({ agentConfig: undefined } as never),
    ).toBeUndefined();
  });

  it('returns undefined when agentConfig has no voice', () => {
    expect(
      buildPromptBrandingFromBrand({ agentConfig: {} } as never),
    ).toBeUndefined();
  });

  it('returns undefined when voice has no meaningful values', () => {
    const brand = makeBrand({
      audience: [],
      doNotSoundLike: [],
      hashtags: [],
      messagingPillars: [],
      sampleOutput: undefined,
      style: undefined,
      taglines: [],
      tone: undefined,
      values: [],
    });
    // All falsy → should return undefined
    expect(buildPromptBrandingFromBrand(brand)).toBeUndefined();
  });

  it('builds branding with tone set', () => {
    const brand = makeBrand({ tone: 'friendly' });
    const result = buildPromptBrandingFromBrand(brand);
    expect(result).toBeDefined();
    expect(result?.tone).toBe('friendly');
  });

  it('builds branding with audience array joined as string', () => {
    const brand = makeBrand({ audience: ['Gen Z', 'Millennials'] });
    const result = buildPromptBrandingFromBrand(brand);
    expect(result?.audience).toBe('Gen Z, Millennials');
  });

  it('builds branding with hashtags array', () => {
    const brand = makeBrand({ hashtags: ['#AI', '#Content'] });
    const result = buildPromptBrandingFromBrand(brand);
    expect(result?.hashtags).toEqual(['#AI', '#Content']);
  });

  it('builds branding with messaging pillars and exclusions', () => {
    const brand = makeBrand({
      doNotSoundLike: ['corporate jargon'],
      messagingPillars: ['clarity', 'systems'],
      sampleOutput: 'Clear systems create compounding output.',
    });
    const result = buildPromptBrandingFromBrand(brand);
    expect(result?.doNotSoundLike).toEqual(['corporate jargon']);
    expect(result?.messagingPillars).toEqual(['clarity', 'systems']);
    expect(result?.sampleOutput).toBe(
      'Clear systems create compounding output.',
    );
  });

  it('builds branding with voice.style mapped to voice field', () => {
    const brand = makeBrand({ style: 'casual' });
    const result = buildPromptBrandingFromBrand(brand);
    expect(result?.voice).toBe('casual');
  });

  it('omits audience when array is empty', () => {
    const brand = makeBrand({ audience: [], tone: 'bold' });
    const result = buildPromptBrandingFromBrand(brand);
    expect(result?.audience).toBeUndefined();
  });
});

describe('buildBrandVoiceSummary', () => {
  it('returns null when brand has no voice', () => {
    expect(buildBrandVoiceSummary(undefined)).toBeNull();
  });

  it('returns null when voice has no values', () => {
    const brand = makeBrand({ audience: [], hashtags: [] });
    expect(buildBrandVoiceSummary(brand)).toBeNull();
  });

  it('returns a record when voice has values', () => {
    const brand = makeBrand({
      messagingPillars: ['clarity'],
      tone: 'authoritative',
      values: ['quality'],
    });
    const result = buildBrandVoiceSummary(brand);
    expect(result).not.toBeNull();
    expect(result?.messagingPillars).toEqual(['clarity']);
    expect(result?.tone).toBe('authoritative');
  });
});
