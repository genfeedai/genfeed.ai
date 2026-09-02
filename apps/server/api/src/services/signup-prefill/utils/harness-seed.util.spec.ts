import type { IScrapedBrandData } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';

import { buildSignupHarnessProfile } from './harness-seed.util';

function buildScrapedData(
  overrides: Partial<IScrapedBrandData> = {},
): IScrapedBrandData {
  return {
    scrapedAt: new Date('2026-01-01T00:00:00.000Z'),
    sourceUrl: 'https://acme.com',
    ...overrides,
  };
}

describe('buildSignupHarnessProfile', () => {
  it('produces an active default brand profile', () => {
    const dto = buildSignupHarnessProfile({
      agentConfig: {},
      brandId: 'b_1',
      brandLabel: 'Acme',
    });

    expect(dto.brandId).toBe('b_1');
    expect(dto.label).toBe('Acme — starter harness');
    expect(dto.scope).toBe('brand');
    expect(dto.status).toBe('active');
    expect(dto.isDefault).toBe(true);
    expect(dto.metadata?.source).toBe('signup-prefill');
  });

  it('always carries the baseline guardrails', () => {
    const dto = buildSignupHarnessProfile({
      agentConfig: {},
      brandId: 'b_1',
      brandLabel: 'Acme',
    });

    expect(dto.guardrails).toHaveLength(3);
    expect(dto.guardrails?.[0]).toContain('Never invent statistics');
    expect(dto.structure?.post).toContain('Hook');
  });

  it('turns brand voice constraints into explicit guardrails', () => {
    const dto = buildSignupHarnessProfile({
      agentConfig: {
        voice: {
          bannedPhrases: ['game-changer'],
          doNotSoundLike: ['a press release'],
        },
      },
      brandId: 'b_1',
      brandLabel: 'Acme',
    });

    expect(dto.guardrails).toContain('Do not sound like: a press release.');
    expect(dto.guardrails).toContain('Never use the phrase "game-changer".');
  });

  it('builds the thesis from the scrape and the strategy', () => {
    const dto = buildSignupHarnessProfile({
      agentConfig: {
        strategy: { goals: ['pipeline'], topics: ['automation'] },
        voice: { messagingPillars: ['speed'] },
      },
      brandId: 'b_1',
      brandLabel: 'Acme',
      scrapedData: buildScrapedData({
        description: 'Automation for operators.',
        tagline: 'Ship faster.',
        valuePropositions: ['No setup'],
      }),
    });

    expect(dto.thesis?.positioning).toEqual([
      'Ship faster.',
      'Automation for operators.',
      'No setup',
    ]);
    expect(dto.thesis?.messagingPillars).toEqual(['speed']);
    expect(dto.thesis?.goals).toEqual(['pipeline']);
    expect(dto.thesis?.topics).toEqual(['automation']);
  });

  it('omits sections it has no signal for rather than seeding empties', () => {
    const dto = buildSignupHarnessProfile({
      agentConfig: {},
      brandId: 'b_1',
      brandLabel: 'Acme',
    });

    expect(dto.thesis).toBeUndefined();
    expect(dto.voice).toBeUndefined();
    expect(dto.examples).toBeUndefined();
    expect(dto.platforms).toEqual([]);
    expect(dto.audience).toEqual([]);
  });

  it('carries the voice and example output the analysis produced', () => {
    const dto = buildSignupHarnessProfile({
      agentConfig: {
        strategy: { platforms: ['linkedin'] },
        voice: {
          audience: ['founders'],
          sampleOutput: 'A short, concrete post.',
          style: 'plain',
          taglines: ['Ship faster.'],
          tone: 'direct',
          values: ['craft'],
        },
      },
      brandId: 'b_1',
      brandLabel: 'Acme',
    });

    expect(dto.platforms).toEqual(['linkedin']);
    expect(dto.audience).toEqual(['founders']);
    expect(dto.voice).toEqual({
      style: 'plain',
      tone: 'direct',
      values: ['craft'],
    });
    expect(dto.examples?.good).toEqual([
      'A short, concrete post.',
      'Ship faster.',
    ]);
  });

  it('trims string lists and filters blank values', () => {
    const dto = buildSignupHarnessProfile({
      agentConfig: {
        strategy: { goals: ['  pipeline  ', '   '] },
        voice: {
          audience: ['  founders  ', ''],
          values: ['  craft  ', '   '],
        },
      },
      brandId: 'b_1',
      brandLabel: 'Acme',
    });

    expect(dto.audience).toEqual(['founders']);
    expect(dto.thesis?.goals).toEqual(['pipeline']);
    expect(dto.voice?.values).toEqual(['craft']);
  });
});
