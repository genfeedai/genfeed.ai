import type { BrandAgentConfig } from '@api/collections/brands/schemas/brand.schema';
import { Platform } from '@genfeedai/enums';
import type { IScrapedBrandData } from '@genfeedai/interfaces';
import { describe, expect, it } from 'vitest';

import {
  buildPersona,
  buildPrefilledAgentConfig,
  DEFAULT_STRATEGY_CONTENT_TYPES,
  DEFAULT_STRATEGY_FREQUENCY,
  derivePlatformsFromSocialLinks,
} from './agent-config-defaults.util';

function buildScrapedData(
  overrides: Partial<IScrapedBrandData> = {},
): IScrapedBrandData {
  return {
    scrapedAt: new Date('2026-01-01T00:00:00.000Z'),
    sourceUrl: 'https://acme.com',
    ...overrides,
  };
}

describe('derivePlatformsFromSocialLinks', () => {
  it('returns the platforms the brand actually links to', () => {
    expect(
      derivePlatformsFromSocialLinks({
        instagram: 'https://instagram.com/acme',
        linkedin: 'https://linkedin.com/company/acme',
      }),
    ).toEqual([Platform.INSTAGRAM, Platform.LINKEDIN]);
  });

  it('never guesses a platform when no links were found', () => {
    expect(derivePlatformsFromSocialLinks(undefined)).toEqual([]);
    expect(derivePlatformsFromSocialLinks({})).toEqual([]);
  });

  it('ignores blank link values', () => {
    expect(derivePlatformsFromSocialLinks({ tiktok: '   ' })).toEqual([]);
  });
});

describe('buildPersona', () => {
  it('states the brand even with no voice signal', () => {
    expect(buildPersona('Acme', undefined)).toBe(
      'You are the content lead for Acme.',
    );
  });

  it('folds every available voice signal into one directive', () => {
    const persona = buildPersona('Acme', {
      audience: ['founders', 'operators'],
      messagingPillars: ['speed', 'craft'],
      style: 'plain and concrete',
      tone: 'direct',
    });

    expect(persona).toContain('Write in a direct tone.');
    expect(persona).toContain('Voice: plain and concrete.');
    expect(persona).toContain('Speak to founders, operators.');
    expect(persona).toContain('anchored to speed, craft');
  });

  it('skips non-string entries instead of rendering undefined', () => {
    const persona = buildPersona('Acme', {
      audience: [42, 'founders'] as unknown as string[],
    });

    expect(persona).toBe(
      'You are the content lead for Acme. Speak to founders.',
    );
  });

  it('trims string lists and filters blank values', () => {
    const persona = buildPersona('Acme', {
      audience: ['  founders  ', '   '],
      messagingPillars: ['  craft  ', ''],
    });

    expect(persona).toBe(
      'You are the content lead for Acme. Speak to founders. Keep every piece anchored to craft.',
    );
  });
});

describe('buildPrefilledAgentConfig', () => {
  it('fills the empty strategy a fresh brand ships with', () => {
    const config = buildPrefilledAgentConfig({
      brandLabel: 'Acme',
      existingConfig: {},
      scrapedData: buildScrapedData({
        socialLinks: { youtube: 'https://youtube.com/@acme' },
      }),
      timezone: 'Europe/Paris',
    });

    expect(config.strategy?.contentTypes).toEqual([
      ...DEFAULT_STRATEGY_CONTENT_TYPES,
    ]);
    expect(config.strategy?.frequency).toBe(DEFAULT_STRATEGY_FREQUENCY);
    expect(config.strategy?.platforms).toEqual([Platform.YOUTUBE]);
    expect(config.schedule?.timezone).toBe('Europe/Paris');
    expect(config.schedule?.activeDays).toHaveLength(5);
    expect(config.persona).toBe('You are the content lead for Acme.');
  });

  it('never overwrites values the AI analysis or the user already set', () => {
    const existingConfig: BrandAgentConfig = {
      persona: 'Hand-written persona',
      schedule: { startTime: '06:00' },
      strategy: {
        contentTypes: ['video'],
        frequency: 'weekly',
        platforms: [Platform.TIKTOK],
      },
    };

    const config = buildPrefilledAgentConfig({
      brandLabel: 'Acme',
      existingConfig,
      scrapedData: buildScrapedData({
        socialLinks: { instagram: 'https://instagram.com/acme' },
      }),
    });

    expect(config.persona).toBe('Hand-written persona');
    expect(config.strategy?.contentTypes).toEqual(['video']);
    expect(config.strategy?.frequency).toBe('weekly');
    expect(config.strategy?.platforms).toEqual([Platform.TIKTOK]);
    expect(config.schedule?.startTime).toBe('06:00');
  });

  it('derives the persona from the voice the analysis produced', () => {
    const config = buildPrefilledAgentConfig({
      brandLabel: 'Acme',
      existingConfig: { voice: { tone: 'warm' } },
      scrapedData: undefined,
    });

    expect(config.persona).toContain('Write in a warm tone.');
  });

  it('leaves platforms empty when nothing was scraped', () => {
    const config = buildPrefilledAgentConfig({
      brandLabel: 'Acme',
      existingConfig: {},
      scrapedData: undefined,
    });

    expect(config.strategy?.platforms).toEqual([]);
  });
});
