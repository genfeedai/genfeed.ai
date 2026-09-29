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
  it('builds branding with tone set', () => {
    const brand = makeBrand({ tone: 'friendly' });
    const result = buildPromptBrandingFromBrand(brand);
    expect(result).toBeDefined();
    expect(result?.tone).toBe('friendly');
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

  it('omits audience when array is empty', () => {
    const brand = makeBrand({ audience: [], tone: 'bold' });
    const result = buildPromptBrandingFromBrand(brand);
    expect(result?.audience).toBeUndefined();
    expect(Object.hasOwn(result ?? {}, 'audience')).toBe(false);
  });
});

describe('buildBrandVoiceSummary', () => {
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
